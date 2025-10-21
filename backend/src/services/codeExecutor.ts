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
  hits: number; // Track usage frequency
}

const compilationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (increased from 5)
const MAX_CACHE_SIZE = 500; // Increased from 100
const MIN_HITS_TO_KEEP = 2; // Keep frequently used binaries longer

// Clean up old cache entries with smarter eviction
function cleanupCache() {
  const now = Date.now();
  const entriesToDelete: string[] = [];

  for (const [hash, entry] of compilationCache.entries()) {
    // Keep frequently used entries longer
    const effectiveTTL =
      entry.hits >= MIN_HITS_TO_KEEP ? CACHE_TTL_MS * 2 : CACHE_TTL_MS;

    if (now - entry.timestamp > effectiveTTL) {
      entriesToDelete.push(hash);
      fs.unlink(entry.binaryPath, () => {});
    }
  }

  entriesToDelete.forEach((hash) => compilationCache.delete(hash));

  // If cache is still too large, remove least frequently used entries
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

setInterval(cleanupCache, 60000);

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

async function startJavaRunner() {
  if (javaRunnerProcess && javaRunnerReady) {
    return;
  }

  const javaRunnerPath = path.join(__dirname, "../../java-runner");

  javaRunnerProcess = spawn(
    "java",
    [
      "-XX:+TieredCompilation",
      "-XX:TieredStopAtLevel=1",
      "-Xms64m",
      "-Xmx256m",
      "-XX:+UseSerialGC",
      "-XX:+UseStringDeduplication",
      "-cp",
      javaRunnerPath,
      "JavaRunner",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  javaRunnerReady = true;

  javaRunnerProcess.stderr?.on("data", (data) => {
    console.log("[JavaRunner]", data.toString());
  });

  javaRunnerProcess.on("close", () => {
    console.log("JavaRunner process closed");
    javaRunnerReady = false;
    javaRunnerProcess = null;
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
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
        resolve({
          success: false,
          message: "Execution timeout",
          verdict: "TIME_LIMIT_EXCEEDED",
          errors: ["Overall execution timeout"],
        });
      }, EXECUTION_LIMITS.TIME_LIMIT_MS + 2000);

      let outputBuffer = "";
      let errorBuffer = "";

      const dataHandler = (data: Buffer) => {
        const chunk = data.toString();
        outputBuffer += chunk;

        if (outputBuffer.includes("\n")) {
          clearTimeout(timeout);
          javaRunnerProcess?.stdout?.removeListener("data", dataHandler);
          javaRunnerProcess?.stderr?.removeListener("data", errorHandler);

          const jsonLine = outputBuffer.trim();

          try {
            const result = JSON.parse(jsonLine);

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
          } catch (e) {
            console.error("[Java] Failed to parse JSON:", e);
            resolve({
              success: false,
              message: "Invalid response from JavaRunner",
              errors: [`Parse error: ${jsonLine}`],
              verdict: "RUNTIME_ERROR",
            });
          }
        }
      };

      const errorHandler = (data: Buffer) => {
        errorBuffer += data.toString();
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
      // Allow non-zero exit codes if the program produced output and no errors
      const hasErrorOutput = stderr.trim().length > 0;
      const wasSignaled = exitCode !== null && exitCode > 128; // Signal termination (e.g., segfault)

      if (exitCode !== 0 && !killed && (hasErrorOutput || wasSignaled)) {
        resolve({
          success: false,
          message: "Runtime Error",
          errors: [stderr.trim() || "Program terminated with errors"],
          executionTime,
          verdict: "RUNTIME_ERROR",
        });
        return;
      }

      // If program completed (even with non-zero exit) and produced output, consider it success
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
// OPTIMIZED: Much faster compilation with minimal overhead
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
      // Update cache metadata
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
      // OPTIMIZED FLAGS FOR SPEED:
      // -O0: No optimization (fastest compile)
      // -pipe: Use pipes instead of temp files
      // -fno-diagnostics-color: Faster output processing
      const baseFlags = [
        sourceFile,
        "-o",
        outputFile,
        "-O0", // Changed from -O2 - no optimization for instant compile
        "-pipe",
        "-fno-diagnostics-color",
        "-w", // Suppress warnings for faster compilation
      ];

      // Add language-specific flags
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

    // Add to cache with initial metadata
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
