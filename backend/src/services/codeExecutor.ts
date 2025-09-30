import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

export const LANGUAGES = {
  JAVASCRIPT: "javascript",
  PYTHON: "python",
  JAVA: "java",
  C: "c",
  CPP: "cpp",
};

// Execution limits (similar to LeetCode/CodeForces)
const EXECUTION_LIMITS = {
  TIME_LIMIT_MS: 5000, // 5 seconds max execution
  MEMORY_LIMIT_MB: 128, // 128 MB memory limit
  OUTPUT_LIMIT_BYTES: 1048576, // 1 MB max output (1024 * 1024)
  MAX_OUTPUT_LINES: 10000, // Maximum 10k lines of output
};

export interface ValidationResult {
  isValid: boolean;
  message: string;
  errors?: string[] | undefined;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string | undefined;
  errors?: string[] | undefined;
  executionTime?: number | undefined;
  memoryUsed?: number | undefined;
  verdict?:
    | "ACCEPTED"
    | "TIME_LIMIT_EXCEEDED"
    | "MEMORY_LIMIT_EXCEEDED"
    | "RUNTIME_ERROR"
    | "OUTPUT_LIMIT_EXCEEDED"
    | undefined;
}

// Helper function to enforce output limits
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

// Execute with proper resource limits and timeout handling
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

    // **Write stdin input if provided**
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

      if (exitCode !== 0 && !killed) {
        resolve({
          success: false,
          message: "Runtime Error",
          errors: [stderr.trim() || "Program terminated with errors"],
          executionTime,
          verdict: "RUNTIME_ERROR",
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
        return await executeJava(code, input);
      case "c":
        return await executeC(code, input);
      case "cpp":
        return await executeCpp(code, input);
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

// ---------------- JavaScript ----------------
async function executeJavaScript(
  code: string,
  input?: string | undefined
): Promise<ExecutionResult> {
  return executeWithLimits("node", ["-e", code], input);
}

// ---------------- Python ----------------
async function executePython(
  code: string,
  input?: string
): Promise<ExecutionResult> {
  return executeWithLimits("python3", ["-c", code], input);
}

// ---------------- Java ----------------
async function executeJava(
  code: string,
  input?: string | undefined
): Promise<ExecutionResult> {
  const classNameMatch = code.match(/public\s+class\s+([^{\s]+)/);
  const className = classNameMatch?.[1] || "Main";

  const tempDir: string = path.join(__dirname, "../../tmp");
  await mkdir(tempDir, { recursive: true });

  const timestamp = Date.now();
  const uniqueFile = path.join(tempDir, `${className}_${timestamp}.java`);

  try {
    await writeFile(uniqueFile, code);

    // Compile
    const compileResult = await new Promise<{
      success: boolean;
      error?: string | undefined;
    }>((resolve) => {
      const child: ChildProcess = spawn("javac", [uniqueFile], {
        cwd: tempDir,
      });
      let stderr = "";

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      child.on("close", (code) => {
        if (code !== 0) {
          resolve({ success: false, error: stderr });
        } else {
          resolve({ success: true });
        }
      });

      child.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    if (!compileResult.success) {
      return {
        success: false,
        message: "Compilation Error",
        errors: [compileResult.error || "Compilation failed"],
        verdict: "RUNTIME_ERROR",
      };
    }

    // Execute
    const result = await executeWithLimits(
      "java",
      [
        `-Xss8m`,
        `-Xmx${EXECUTION_LIMITS.MEMORY_LIMIT_MB}m`,
        "-cp",
        tempDir,
        className,
      ],
      input,
      tempDir
    );

    // Cleanup
    try {
      await unlink(uniqueFile);
      await unlink(path.join(tempDir, `${className}.class`));
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  } catch (error: any) {
    return {
      success: false,
      message: "Execution failed",
      errors: [error.message],
      verdict: "RUNTIME_ERROR",
    };
  }
}

// ---------------- C ----------------
async function executeC(
  code: string,
  input?: string | undefined
): Promise<ExecutionResult> {
  const tempDir: string = path.join(__dirname, "../../tmp");
  await mkdir(tempDir, { recursive: true });

  const timestamp = Date.now();
  const sourceFile = path.join(tempDir, `program_${timestamp}.c`);
  const outputFile = path.join(tempDir, `program_${timestamp}`);

  try {
    await writeFile(sourceFile, code);

    // Compile
    const compileResult = await new Promise<{
      success: boolean;
      error?: string;
    }>((resolve) => {
      const child: ChildProcess = spawn("gcc", [sourceFile, "-o", outputFile]);
      let stderr = "";

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      child.on("close", (code) => {
        if (code !== 0) {
          resolve({ success: false, error: stderr });
        } else {
          resolve({ success: true });
        }
      });

      child.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    if (!compileResult.success) {
      return {
        success: false,
        message: "Compilation Error",
        errors: [compileResult.error || "Compilation failed"],
        verdict: "RUNTIME_ERROR",
      };
    }

    // Execute
    const result = await executeWithLimits(outputFile, [], input);

    // Cleanup
    try {
      await unlink(sourceFile);
      await unlink(outputFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  } catch (error: any) {
    return {
      success: false,
      message: "Execution failed",
      errors: [error.message],
      verdict: "RUNTIME_ERROR",
    };
  }
}

// ---------------- C++ ----------------
async function executeCpp(
  code: string,
  input?: string | undefined
): Promise<ExecutionResult> {
  const tempDir: string = path.join(__dirname, "../../tmp");
  await mkdir(tempDir, { recursive: true });

  const timestamp = Date.now();
  const sourceFile = path.join(tempDir, `program_${timestamp}.cpp`);
  const outputFile = path.join(tempDir, `program_${timestamp}`);

  try {
    await writeFile(sourceFile, code);

    // Compile
    const compileResult = await new Promise<{
      success: boolean;
      error?: string;
    }>((resolve) => {
      const child: ChildProcess = spawn("g++", [sourceFile, "-o", outputFile]);
      let stderr = "";

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      child.on("close", (code) => {
        if (code !== 0) {
          resolve({ success: false, error: stderr });
        } else {
          resolve({ success: true });
        }
      });

      child.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    if (!compileResult.success) {
      return {
        success: false,
        message: "Compilation Error",
        errors: [compileResult.error || "Compilation failed"],
        verdict: "RUNTIME_ERROR",
      };
    }

    // Execute
    const result = await executeWithLimits(outputFile, [], input);

    // Cleanup
    try {
      await unlink(sourceFile);
      await unlink(outputFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  } catch (error: any) {
    return {
      success: false,
      message: "Execution failed",
      errors: [error.message],
      verdict: "RUNTIME_ERROR",
    };
  }
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
