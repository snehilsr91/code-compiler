import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import * as crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    try {
      await unlink(`${filePath}.exe`);
    } catch {}
  }
}

export const LANGUAGES = {
  JAVASCRIPT: "javascript",
  PYTHON: "python",
  JAVA: "java",
  C: "c",
  CPP: "cpp",
};

const EXECUTION_LIMITS = {
  TIME_LIMIT_MS: 5000,
  MEMORY_LIMIT_MB: 128,
  OUTPUT_LIMIT_BYTES: 1048576,
  MAX_OUTPUT_LINES: 10000,
  COMPILE_TIMEOUT_MS: 10000,
};

export interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string | undefined;
  errors?: string[] | undefined;
  executionTime?: number | undefined;
  compileTime?: number | undefined;
  memoryUsed?: number | undefined;
  verdict?:
    | "ACCEPTED"
    | "TIME_LIMIT_EXCEEDED"
    | "MEMORY_LIMIT_EXCEEDED"
    | "RUNTIME_ERROR"
    | "OUTPUT_LIMIT_EXCEEDED"
    | "COMPILATION_ERROR"
    | undefined;
}

interface CacheEntry {
  binaryPath: string;
  timestamp: number;
  hits: number;
}

const compilationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 500;
const MIN_HITS_TO_KEEP = 2;

// Clean up old cache entries with smarter eviction
function cleanupCache() {
  const now = Date.now();
  const entriesToDelete: string[] = [];

  for (const [hash, entry] of compilationCache.entries()) {
    const effectiveTTL =
      entry.hits >= MIN_HITS_TO_KEEP ? CACHE_TTL_MS * 2 : CACHE_TTL_MS;

    if (now - entry.timestamp > effectiveTTL) {
      entriesToDelete.push(hash);
      fs.unlink(entry.binaryPath, () => {});
    }
  }

  entriesToDelete.forEach((hash) => compilationCache.delete(hash));

  if (compilationCache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(compilationCache.entries()).sort(
      (a, b) => a[1].hits - b[1].hits || a[1].timestamp - b[1].timestamp
    );
    const toRemove = sorted.slice(0, compilationCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([hash, entry]) => {
      compilationCache.delete(hash);
      fs.unlink(entry.binaryPath, () => {});
    });
  }
}

// Cleanup orphaned temp files
function cleanupOrphanedTempFiles() {
  const tempDir = path.join(__dirname, "../../tmp");

  fs.readdir(tempDir, (err, files) => {
    if (err) return;

    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    files.forEach((file) => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;

        if (now - stats.mtimeMs > maxAge) {
          const isInCache = Array.from(compilationCache.values()).some(
            (entry) => entry.binaryPath === filePath
          );

          if (!isInCache) {
            fs.unlink(filePath, () => {
              console.log(`Cleaned up orphaned temp file: ${file}`);
            });
          }
        }
      });
    });
  });
}

setInterval(cleanupCache, 60000);
setInterval(cleanupOrphanedTempFiles, 600000); // Every 10 minutes

function hashCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex")
    .substring(0, 16);
}

// Persistent JavaRunner process
let javaRunnerProcess: ChildProcess | null = null;
let javaRunnerReady = false;
let javaRunnerStartingPromise: Promise<void> | null = null;

async function startJavaRunner(): Promise<void> {
  if (javaRunnerProcess && javaRunnerReady) {
    return;
  }
  if (javaRunnerStartingPromise) {
    return javaRunnerStartingPromise;
  }

  javaRunnerStartingPromise = new Promise<void>((resolve, reject) => {
    const javaRunnerPath = path.join(__dirname, "../../java-runner");

    javaRunnerProcess = spawn(
      "java",
      [
        "-XX:+TieredCompilation",
        "-XX:TieredStopAtLevel=1",
        "-Xms64m",
        "-Xmx256m",
        "-XX:+UseSerialGC",
        "-cp",
        javaRunnerPath,
        "JavaRunner",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let started = false;
    const startTimeout = setTimeout(() => {
      if (!started) {
        console.log("[JavaRunner] Startup ready fallback after timeout");
        javaRunnerReady = true;
        resolve();
      }
    }, 15000);

    javaRunnerProcess.stderr?.on("data", (data) => {
      const msg = data.toString();
      console.log("[JavaRunner]", msg);
      if (!started && msg.includes("JavaRunner service started and ready")) {
        started = true;
        clearTimeout(startTimeout);
        javaRunnerReady = true;
        resolve();
      }
    });

    javaRunnerProcess.on("close", () => {
      console.log("JavaRunner process closed");
      javaRunnerReady = false;
      javaRunnerProcess = null;
    });

    javaRunnerProcess.on("error", (err) => {
      console.error("JavaRunner spawn error:", err);
      javaRunnerReady = false;
      javaRunnerProcess = null;
      clearTimeout(startTimeout);
      reject(err);
    });
  }).finally(() => {
    javaRunnerStartingPromise = null;
  });

  return javaRunnerStartingPromise;
}

async function executeJavaPersistent(
  code: string,
  input?: string
): Promise<ExecutionResult> {
  try {
    await startJavaRunner();

    if (!javaRunnerProcess || !javaRunnerReady) {
      throw new Error("JavaRunner not available");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error("[Java] Timeout - no response from JavaRunner");
        javaRunnerProcess?.stdout?.removeListener("data", dataHandler);
        javaRunnerProcess?.stderr?.removeListener("data", errorHandler);
        if (javaRunnerProcess) {
          try {
            javaRunnerProcess.kill("SIGKILL");
          } catch {}
          javaRunnerProcess = null;
          javaRunnerReady = false;
        }
        resolve({
          success: false,
          message: "Execution timeout",
          verdict: "TIME_LIMIT_EXCEEDED",
          errors: ["Overall execution timeout"],
        });
      }, EXECUTION_LIMITS.TIME_LIMIT_MS + 2000);

      let outputBuffer = "";
      let errorBuffer = "";
      let resultParsed = false;

      const dataHandler = (data: Buffer) => {
        const chunk = data.toString();
        outputBuffer += chunk;

        // Process all complete lines
        const lines = outputBuffer.split("\n");

        // Keep the last incomplete line in the buffer
        outputBuffer = lines.pop() || "";

        // Try to parse each complete line as JSON
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || resultParsed) continue;

          // Skip JVM warnings and other non-JSON output
          if (trimmedLine.startsWith("[") && trimmedLine.includes("][")) {
            // This is a JVM log line like [0.020s][warning][stringdedup]
            console.log("[Java] Skipping JVM log:", trimmedLine);
            continue;
          }

          try {
            const result = JSON.parse(trimmedLine);

            // Validate that this is actually our result object
            if (typeof result === "object" && "success" in result) {
              resultParsed = true;
              clearTimeout(timeout);
              javaRunnerProcess?.stdout?.removeListener("data", dataHandler);
              javaRunnerProcess?.stderr?.removeListener("data", errorHandler);

              resolve({
                success: result.success,
                message: result.verdict || "Execution completed",
                output: result.output,
                errors: result.errors ? [result.errors] : undefined,
                executionTime: result.executionTime,
                verdict:
                  result.verdict ||
                  (result.success ? "ACCEPTED" : "RUNTIME_ERROR"),
              });
              return;
            }
          } catch (e) {
            // Not JSON or invalid JSON - skip this line
            console.log(
              "[Java] Skipping non-JSON line:",
              trimmedLine.substring(0, 100)
            );
            continue;
          }
        }
      };

      const errorHandler = (data: Buffer) => {
        errorBuffer += data.toString();
        // Log stderr but don't treat JVM warnings as errors
        if (!errorBuffer.includes("String Deduplication")) {
          console.error("[Java stderr]", data.toString());
        }
      };

      javaRunnerProcess?.stdout?.on("data", dataHandler);
      javaRunnerProcess?.stderr?.on("data", errorHandler);

      const codeBase64 = Buffer.from(code).toString("base64");
      const inputBase64 = Buffer.from(input || "").toString("base64");
      const payload = `${codeBase64}|||${inputBase64}\n`;

      javaRunnerProcess?.stdin?.write(payload);
    });
  } catch (error: any) {
    console.error("[Java] executeJavaPersistent error:", error);
    return {
      success: false,
      message: "JavaRunner error",
      errors: [error.message],
      verdict: "RUNTIME_ERROR",
    };
  }
}

function createOutputLimiter() {
  let totalBytes = 0;
  let lineCount = 0;
  let outputBuffer = "";
  let limitExceeded = false;

  return {
    addData: (data: string): boolean => {
      if (limitExceeded) return false;

      const newBytes = Buffer.byteLength(data, "utf8");
      const newLines = (data.match(/\n/g) || []).length;

      if (totalBytes + newBytes > EXECUTION_LIMITS.OUTPUT_LIMIT_BYTES) {
        const remaining = EXECUTION_LIMITS.OUTPUT_LIMIT_BYTES - totalBytes;
        if (remaining > 0) {
          outputBuffer += data.substring(0, remaining);
          totalBytes = EXECUTION_LIMITS.OUTPUT_LIMIT_BYTES;
        }
        outputBuffer +=
          "\n\n[Output Limit Exceeded: Maximum 1MB output allowed]";
        limitExceeded = true;
        return false;
      }

      if (lineCount + newLines > EXECUTION_LIMITS.MAX_OUTPUT_LINES) {
        const lines = data.split("\n");
        const remainingLines = EXECUTION_LIMITS.MAX_OUTPUT_LINES - lineCount;
        if (remainingLines > 0) {
          outputBuffer += lines.slice(0, remainingLines).join("\n");
          lineCount = EXECUTION_LIMITS.MAX_OUTPUT_LINES;
        }
        outputBuffer +=
          "\n\n[Output Limit Exceeded: Maximum 10,000 lines allowed]";
        limitExceeded = true;
        return false;
      }

      totalBytes += newBytes;
      lineCount += newLines;
      outputBuffer += data;
      return true;
    },
    getOutput: () => outputBuffer,
    isLimitExceeded: () => limitExceeded,
  };
}

async function executeWithLimits(
  command: string,
  args: string[],
  stdinInput?: string,
  cwd?: string
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn(command, args, { cwd: cwd || process.cwd() });

    const stdoutLimiter = createOutputLimiter();
    const stderrLimiter = createOutputLimiter();

    let killed = false;
    let timeLimitExceeded = false;

    const timeout = setTimeout(() => {
      timeLimitExceeded = true;
      killed = true;
      if (child.pid) child.kill("SIGKILL");
    }, EXECUTION_LIMITS.TIME_LIMIT_MS);

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        if (!stdoutLimiter.addData(data.toString())) {
          killed = true;
          if (child.pid) child.kill("SIGKILL");
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderrLimiter.addData(data.toString());
      });
    }

    if (stdinInput && child.stdin) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      const executionTime = Date.now() - startTime;
      const stdout = stdoutLimiter.getOutput();
      const stderr = stderrLimiter.getOutput();

      if (timeLimitExceeded) {
        resolve({
          success: false,
          message: "Runtime Error",
          errors: ["Time Limit Exceeded"],
          executionTime,
          verdict: "TIME_LIMIT_EXCEEDED",
        });
        return;
      }

      if (stdoutLimiter.isLimitExceeded()) {
        resolve({
          success: false,
          message: "Runtime Error",
          output: stdout,
          errors: ["Output Limit Exceeded"],
          executionTime,
          verdict: "OUTPUT_LIMIT_EXCEEDED",
        });
        return;
      }

      // FIXED: Only treat as error if there's actual error output OR signal termination
      const hasErrorOutput = stderr.trim().length > 0;
      const wasSignaled = exitCode !== null && exitCode > 128;

      if (exitCode !== 0 && !killed && (hasErrorOutput || wasSignaled)) {
        const errContent = stderr.trim() || "Program terminated with errors";
        const isSyntax = errContent.includes("SyntaxError");
        resolve({
          success: false,
          message: isSyntax ? "Compilation Error" : "Runtime Error",
          errors: [errContent],
          executionTime,
          verdict: isSyntax ? "COMPILATION_ERROR" : "RUNTIME_ERROR",
        });
        return;
      }

      resolve({
        success: true,
        message: "Accepted",
        output: stdout.trim(),
        executionTime,
        verdict: "ACCEPTED",
      });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        message: "Execution Error",
        errors: [err.message],
        verdict: "RUNTIME_ERROR",
      });
    });
  });
}

async function compileWithCache(
  code: string,
  language: "c" | "cpp",
  compiler: string,
  extension: string
): Promise<{
  success: boolean;
  binaryPath?: string;
  error?: string;
  compileTime?: number;
}> {
  const compileStartTime = Date.now();
  const codeHash = hashCode(code);
  const cacheKey = `${language}-${codeHash}`;
  const tempDir: string = path.join(__dirname, "../../tmp");
  await mkdir(tempDir, { recursive: true });

  // Check cache
  const cached = compilationCache.get(cacheKey);
  if (cached) {
    try {
      await access(cached.binaryPath, fs.constants.X_OK);
      const cacheHitTime = Date.now() - compileStartTime;
      console.log(`[${language.toUpperCase()}] Cache hit! (${cacheHitTime}ms)`);
      cached.timestamp = Date.now();
      cached.hits += 1;
      return {
        success: true,
        binaryPath: cached.binaryPath,
        compileTime: cacheHitTime,
      };
    } catch (err) {
      compilationCache.delete(cacheKey);
    }
  }

  const sourceFile = path.join(tempDir, `program_${codeHash}.${extension}`);
  const outputFile = path.join(tempDir, `program_${codeHash}`);

  try {
    await writeFile(sourceFile, code);

    const compileResult = await new Promise<{
      success: boolean;
      error?: string;
    }>((resolve) => {
      const baseFlags = [
        sourceFile,
        "-o",
        outputFile,
        "-O0",
        "-pipe",
        "-fno-diagnostics-color",
        "-w",
      ];

      const flags =
        language === "cpp" ? [...baseFlags, "-std=c++17"] : [...baseFlags];

      const child: ChildProcess = spawn(compiler, flags);
      let stderr = "";

      const compileTimeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({
          success: false,
          error: "Compilation timeout exceeded (10 seconds)",
        });
      }, EXECUTION_LIMITS.COMPILE_TIMEOUT_MS);

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      child.on("close", (code) => {
        clearTimeout(compileTimeout);
        if (code !== 0) {
          resolve({ success: false, error: stderr });
        } else {
          resolve({ success: true });
        }
      });

      child.on("error", (err) => {
        clearTimeout(compileTimeout);
        resolve({ success: false, error: err.message });
      });
    });

    if (!compileResult.success) {
      try {
        await unlink(sourceFile);
      } catch {}

      return compileResult.error
        ? { success: false, error: compileResult.error }
        : { success: false };
    }

    const actualCompileTime = Date.now() - compileStartTime;

    compilationCache.set(cacheKey, {
      binaryPath: outputFile,
      timestamp: Date.now(),
      hits: 1,
    });

    // Clean up source file but keep binary
    try {
      await unlink(sourceFile);
    } catch (e) {}

    console.log(
      `[${language.toUpperCase()}] Compiled successfully in ${actualCompileTime}ms`
    );
    return {
      success: true,
      binaryPath: outputFile,
      compileTime: actualCompileTime,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function executeCode(
  code: string,
  language: string,
  input?: string | undefined
): Promise<ExecutionResult> {
  const lang = language.toLowerCase();

  try {
    switch (lang) {
      case "javascript":
        return await executeJavaScript(code, input);
      case "python":
        return await executePython(code, input);
      case "java":
        return await executeJavaPersistent(code, input);
      case "c":
        return await executeCCached(code, input);
      case "cpp":
        return await executeCppCached(code, input);
      default:
        return {
          success: false,
          message: `Unsupported language: ${language}`,
          errors: [`Language '${language}' is not supported`],
          verdict: "RUNTIME_ERROR",
        };
    }
  } catch (error: any) {
    return {
      success: false,
      message: "Execution failed",
      errors: [error.message],
      verdict: "RUNTIME_ERROR",
    };
  }
}

async function executeJavaScript(
  code: string,
  input?: string
): Promise<ExecutionResult> {
  return executeWithLimits("node", ["-e", code], input);
}

async function executePython(
  code: string,
  input?: string
): Promise<ExecutionResult> {
  return executeWithLimits("python3", ["-c", code], input);
}

async function executeCCached(
  code: string,
  input?: string
): Promise<ExecutionResult> {
  const compileResult = await compileWithCache(code, "c", "gcc", "c");

  if (!compileResult.success) {
    return {
      success: false,
      message: "Compilation Error",
      errors: [compileResult.error || "Compilation failed"],
      verdict: "COMPILATION_ERROR",
      compileTime: compileResult.compileTime,
    };
  }

  const execResult = await executeWithLimits(
    compileResult.binaryPath!,
    [],
    input
  );

  // Clean up binary immediately after execution
  try {
    const codeHash = hashCode(code);
    const cacheKey = `c-${codeHash}`;
    compilationCache.delete(cacheKey);
    await safeUnlink(compileResult.binaryPath!);
    console.log(`[C] Cleaned up binary: ${compileResult.binaryPath}`);
  } catch (e) {
    console.error("[C] Failed to delete binary:", e);
  }

  return {
    ...execResult,
    compileTime: compileResult.compileTime,
  };
}

async function executeCppCached(
  code: string,
  input?: string
): Promise<ExecutionResult> {
  const compileResult = await compileWithCache(code, "cpp", "g++", "cpp");

  if (!compileResult.success) {
    return {
      success: false,
      message: "Compilation Error",
      errors: [compileResult.error || "Compilation failed"],
      verdict: "COMPILATION_ERROR",
      compileTime: compileResult.compileTime,
    };
  }

  const execResult = await executeWithLimits(
    compileResult.binaryPath!,
    [],
    input
  );

  // Clean up binary immediately after execution
  try {
    const codeHash = hashCode(code);
    const cacheKey = `cpp-${codeHash}`;
    compilationCache.delete(cacheKey);
    await safeUnlink(compileResult.binaryPath!);
    console.log(`[CPP] Cleaned up binary: ${compileResult.binaryPath}`);
  } catch (e) {
    console.error("[CPP] Failed to delete binary:", e);
  }

  return {
    ...execResult,
    compileTime: compileResult.compileTime,
  };
}

process.on("exit", () => {
  if (javaRunnerProcess) {
    javaRunnerProcess.kill();
  }

  // Clean up all cached binaries
  for (const [hash, entry] of compilationCache.entries()) {
    fs.unlink(entry.binaryPath, () => {});
  }
});

export interface ValidationResult {
  isValid: boolean;
  message: string;
  errors?: string[] | undefined;
}

export async function validateCode(
  code: string,
  language: string,
  input?: string | undefined
): Promise<ValidationResult> {
  const result = await executeCode(code, language, input);
  return {
    isValid: result.success,
    message: result.message,
    ...(result.errors !== undefined && { errors: result.errors }),
  };
}

/**
 * Executes code against multiple test cases efficiently.
 * - C/C++: compile once, run N times, then delete binary.
 * - Java: runs through persistent JavaRunner; short-circuits on COMPILATION_ERROR.
 * - Python/JS: runs each test case independently; short-circuits on COMPILATION_ERROR.
 */
export async function executeCodeBatch(
  code: string,
  language: string,
  testcases: string[]
): Promise<ExecutionResult[]> {
  if (testcases.length === 0) return [];

  const lang = language.toLowerCase();

  // ── Compiled languages: C / C++ ──────────────────────────────────────────
  if (lang === "c" || lang === "cpp") {
    const compiler = lang === "cpp" ? "g++" : "gcc";
    const ext = lang === "cpp" ? "cpp" : "c";
    const compileResult = await compileWithCache(
      code,
      lang as "c" | "cpp",
      compiler,
      ext
    );

    if (!compileResult.success) {
      // Short-circuit: propagate COMPILATION_ERROR to every test case
      return testcases.map(() => ({
        success: false,
        message: "Compilation Error",
        errors: [compileResult.error || "Compilation failed"],
        verdict: "COMPILATION_ERROR" as const,
        compileTime: compileResult.compileTime,
      }));
    }

    // Run each test case against the same binary
    const results: ExecutionResult[] = [];
    for (const input of testcases) {
      const result = await executeWithLimits(
        compileResult.binaryPath!,
        [],
        input
      );
      results.push({ ...result, compileTime: compileResult.compileTime });
    }

    // Clean up binary after all runs are done
    try {
      const codeHash = hashCode(code);
      const cacheKey = `${lang}-${codeHash}`;
      compilationCache.delete(cacheKey);
      await safeUnlink(compileResult.binaryPath!);
      console.log(`[${lang.toUpperCase()}] Batch: cleaned up binary`);
    } catch (e) {
      console.error(`[${lang.toUpperCase()}] Batch: failed to delete binary`, e);
    }

    return results;
  }

  // ── Interpreted / JVM languages: Java, Python, JS ───────────────────────
  // Run test cases sequentially and short-circuit on COMPILATION_ERROR.
  const results: ExecutionResult[] = [];
  let compilationError: ExecutionResult | null = null;

  for (const input of testcases) {
    if (compilationError) {
      // Reuse the same error without re-executing
      results.push(compilationError);
      continue;
    }

    const result = await executeCode(code, language, input);

    if (result.verdict === "COMPILATION_ERROR") {
      compilationError = result;
    }

    results.push(result);
  }

  return results;
}
