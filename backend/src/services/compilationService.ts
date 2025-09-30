import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  CPU_QUOTA: 100000, // 100% of one CPU core (in microseconds per 100ms)
  PIDS_LIMIT: 50, // Max processes/threads
};

export interface ValidationResult {
  isValid: boolean;
  message: string;
  errors?: string[];
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  output?: string;
  errors?: string[];
  executionTime?: number;
  memoryUsed?: number;
  verdict?:
    | "ACCEPTED"
    | "TIME_LIMIT_EXCEEDED"
    | "MEMORY_LIMIT_EXCEEDED"
    | "RUNTIME_ERROR"
    | "OUTPUT_LIMIT_EXCEEDED";
}

export async function validateCode(
  code: string,
  language: string
): Promise<ValidationResult> {
  const lang = language.toLowerCase();
  switch (lang) {
    case "javascript":
      return validateJavaScript(code);
    case "python":
      return validatePython(code);
    case "java":
      return validateJava(code);
    case "c":
      return validateC(code);
    case "cpp":
      return validateCpp(code);
    default:
      return {
        isValid: false,
        message: `Unsupported language: ${language}`,
        errors: [`Language '${language}' is not supported`],
      };
  }
}

export async function executeCode(
  code: string,
  language: string
): Promise<ExecutionResult> {
  const lang = language.toLowerCase();
  switch (lang) {
    case "javascript":
      return executeJavaScript(code);
    case "python":
      return executePython(code);
    case "java":
      return executeJava(code);
    case "c":
      return executeC(code);
    case "cpp":
      return executeCpp(code);
    default:
      return {
        success: false,
        message: `Unsupported language: ${language}`,
        errors: [`Language '${language}' is not supported`],
        verdict: "RUNTIME_ERROR",
      };
  }
}

// Helper function to enforce output limits (like real online judges)
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

      // Check if adding this data would exceed limits
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
    getTotalBytes: () => totalBytes,
  };
}

// Helper to create common Docker arguments with resource limits
function getDockerArgs(image: string, command: string[]): string[] {
  return [
    "run",
    "--rm",
    "-i",
    "--network",
    "none", // No network access
    "--memory",
    `${EXECUTION_LIMITS.MEMORY_LIMIT_MB}m`, // Memory limit
    "--memory-swap",
    `${EXECUTION_LIMITS.MEMORY_LIMIT_MB}m`, // Disable swap
    "--cpus",
    "1", // Max 1 CPU core
    "--pids-limit",
    `${EXECUTION_LIMITS.PIDS_LIMIT}`, // Process limit
    "--ulimit",
    "nproc=50:50", // Thread limit
    "--ulimit",
    "nofile=64:64", // File descriptor limit
    "--read-only", // Read-only filesystem
    "--tmpfs",
    "/tmp:rw,exec,nosuid,size=65536k", // Temp storage with exec (64MB)
    image,
    ...command,
  ];
}

// Execute with proper resource limits and timeout handling
async function executeWithLimits(
  dockerArgs: string[],
  code: string
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn("docker", dockerArgs);

    const stdoutLimiter = createOutputLimiter();
    const stderrLimiter = createOutputLimiter();

    let killed = false;
    let timeLimitExceeded = false;

    // Set timeout to kill process
    const timeout = setTimeout(() => {
      timeLimitExceeded = true;
      killed = true;
      child.kill("SIGKILL");
    }, EXECUTION_LIMITS.TIME_LIMIT_MS);

    child.stdout.on("data", (data) => {
      if (!stdoutLimiter.addData(data.toString())) {
        // Output limit exceeded, kill the process
        killed = true;
        child.kill("SIGKILL");
      }
    });

    child.stderr.on("data", (data) => {
      stderrLimiter.addData(data.toString());
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const executionTime = Date.now() - startTime;

      const stdout = stdoutLimiter.getOutput();
      const stderr = stderrLimiter.getOutput();

      // Time Limit Exceeded
      if (timeLimitExceeded) {
        resolve({
          success: false,
          message: "Runtime Error",
          errors: [
            "Time Limit Exceeded: Program execution exceeded maximum time limit",
          ],
          executionTime,
          verdict: "RUNTIME_ERROR",
        });
        return;
      }

      // Output Limit Exceeded
      if (stdoutLimiter.isLimitExceeded()) {
        resolve({
          success: false,
          message: "Runtime Error",
          output: stdout,
          errors: ["Buffer Overflow: Output buffer exceeded maximum capacity"],
          executionTime,
          verdict: "RUNTIME_ERROR",
        });
        return;
      }

      // Runtime Error
      if (code !== 0 && !killed) {
        // Check if it's a memory limit error
        if (
          stderr.toLowerCase().includes("memory") ||
          stderr.toLowerCase().includes("oom")
        ) {
          resolve({
            success: false,
            message: "Runtime Error",
            errors: [
              "Stack Overflow: Memory limit exceeded or stack overflow detected",
            ],
            executionTime,
            verdict: "RUNTIME_ERROR",
          });
          return;
        }

        resolve({
          success: false,
          message: "Runtime Error",
          errors: [stderr.trim() || "Program terminated with errors"],
          executionTime,
          verdict: "RUNTIME_ERROR",
        });
        return;
      }

      // Accepted
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

    if (code) {
      child.stdin.write(code);
      child.stdin.end();
    }
  });
}

// ---------------- JavaScript ----------------
async function validateJavaScript(code: string): Promise<ValidationResult> {
  const wrappedCode = `'use strict';
try {
  ${code}
  console.log("__VALIDATION_SUCCESS__");
} catch(e) {
  console.error("__VALIDATION_ERROR__", e.name + ": " + e.message);
  process.exit(1);
}`;

  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["run", "--rm", "-i", "node:20-slim", "node"],
      { timeout: 5000 }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const output = stdout + stderr;
      if (output.includes("__VALIDATION_ERROR__") || code !== 0) {
        resolve({
          isValid: false,
          message: "JavaScript validation failed",
          errors: [output.trim()],
        });
      } else {
        resolve({
          isValid: true,
          message: "JavaScript code is valid",
        });
      }
    });

    child.stdin.write(wrappedCode);
    child.stdin.end();
  });
}

async function executeJavaScript(code: string): Promise<ExecutionResult> {
  const dockerArgs = getDockerArgs("node:20-slim", ["node"]);
  return executeWithLimits(dockerArgs, code);
}

// ---------------- Python ----------------
export async function validatePython(code: string): Promise<ValidationResult> {
  const indentedCode = code
    .split("\n")
    .map((line) => "    " + line)
    .join("\n");

  const wrappedCode = `
import sys
try:
${indentedCode}
    print("__VALIDATION_SUCCESS__")
except Exception as e:
    print("__VALIDATION_ERROR__", e, file=sys.stderr)
    sys.exit(1)
`;

  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["run", "--rm", "-i", "python:3.12-slim", "python"],
      { timeout: 5000 }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const output = stdout + stderr;

      if (output.includes("__VALIDATION_ERROR__") || code !== 0) {
        resolve({
          isValid: false,
          message: "Python validation failed",
          errors: [output.trim()],
        });
      } else {
        resolve({
          isValid: true,
          message: "Python code is valid",
        });
      }
    });

    child.stdin.write(wrappedCode);
    child.stdin.end();
  });
}

async function executePython(code: string): Promise<ExecutionResult> {
  const dockerArgs = getDockerArgs("python:3.12-slim", ["python", "-u"]); // -u for unbuffered output
  return executeWithLimits(dockerArgs, code);
}

// ---------------- Java ----------------
async function validateJava(code: string): Promise<ValidationResult> {
  const classNameMatch = code.match(/public\s+class\s+([^{\s]+)/);
  const className = classNameMatch ? classNameMatch[1] : "Main";
  const javaFile = `${className}.java`;
  const escapedCode = code.replace(/'/g, "'\\''");

  const innerCommand = `
    echo '${escapedCode}' > /tmp/${javaFile} && \
    javac /tmp/${javaFile}
  `;

  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["run", "--rm", "-i", "openjdk:17", "sh", "-c", innerCommand],
      { timeout: 5000 }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));

    child.on("close", (code) => {
      if (code !== 0 || stderr) {
        resolve({
          isValid: false,
          message: "Java compilation failed",
          errors: [stderr.trim() || stdout.trim()],
        });
      } else {
        resolve({
          isValid: true,
          message: "Java code compiled successfully",
        });
      }
    });
  });
}

async function executeJava(code: string): Promise<ExecutionResult> {
  const classNameMatch = code.match(/public\s+class\s+([^{\s]+)/);
  const className = classNameMatch ? classNameMatch[1] : "Main";
  const javaFile = `${className}.java`;
  const escapedCode = code.replace(/'/g, "'\\''");

  const innerCommand = `
    echo '${escapedCode}' > /tmp/${javaFile} && \
    javac /tmp/${javaFile} && \
    java -Xss8m -Xmx${EXECUTION_LIMITS.MEMORY_LIMIT_MB}m -cp /tmp ${className}
  `;

  const dockerArgs = getDockerArgs("openjdk:17", ["sh", "-c", innerCommand]);

  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn("docker", dockerArgs);

    const stdoutLimiter = createOutputLimiter();
    const stderrLimiter = createOutputLimiter();

    let killed = false;
    let timeLimitExceeded = false;

    const timeout = setTimeout(() => {
      timeLimitExceeded = true;
      killed = true;
      child.kill("SIGKILL");
    }, EXECUTION_LIMITS.TIME_LIMIT_MS);

    child.stdout.on("data", (data) => {
      if (!stdoutLimiter.addData(data.toString())) {
        killed = true;
        child.kill("SIGKILL");
      }
    });

    child.stderr.on("data", (data) => {
      stderrLimiter.addData(data.toString());
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const executionTime = Date.now() - startTime;

      if (timeLimitExceeded) {
        resolve({
          success: false,
          message: "Runtime Error",
          errors: [
            "Time Limit Exceeded: Program execution exceeded maximum time limit",
          ],
          executionTime,
          verdict: "RUNTIME_ERROR",
        });
        return;
      }

      if (stdoutLimiter.isLimitExceeded()) {
        resolve({
          success: false,
          message: "Runtime Error",
          output: stdoutLimiter.getOutput(),
          errors: ["Buffer Overflow: Output buffer exceeded maximum capacity"],
          executionTime,
          verdict: "RUNTIME_ERROR",
        });
        return;
      }

      if (code !== 0) {
        const stderr = stderrLimiter.getOutput();
        if (
          stderr.toLowerCase().includes("memory") ||
          stderr.toLowerCase().includes("heap")
        ) {
          resolve({
            success: false,
            message: "Runtime Error",
            errors: [
              "Stack Overflow: Memory limit exceeded or stack overflow detected",
            ],
            executionTime,
            verdict: "RUNTIME_ERROR",
          });
          return;
        }

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
        output: stdoutLimiter.getOutput().trim(),
        executionTime,
        verdict: "ACCEPTED",
      });
    });
  });
}

// ---------------- C ----------------
async function validateC(code: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "gcc:latest",
        "sh",
        "-c",
        `gcc -x c -o /tmp/a.out -`,
      ],
      { timeout: 5000 }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));

    child.on("close", (code) => {
      if (code !== 0 || stderr) {
        resolve({
          isValid: false,
          message: "C compilation failed",
          errors: [stderr.trim() || stdout.trim()],
        });
      } else {
        resolve({ isValid: true, message: "C code compiled successfully" });
      }
    });

    child.stdin.write(code);
    child.stdin.end();
  });
}

async function executeC(code: string): Promise<ExecutionResult> {
  const dockerArgs = getDockerArgs("gcc:latest", [
    "sh",
    "-c",
    "gcc -x c -o /tmp/a.out - && /tmp/a.out",
  ]);
  return executeWithLimits(dockerArgs, code);
}

// ---------------- C++ ----------------
async function validateCpp(code: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "gcc:latest",
        "sh",
        "-c",
        `g++ -x c++ -o /tmp/a.out -`,
      ],
      { timeout: 5000 }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));

    child.on("close", (code) => {
      if (code !== 0 || stderr) {
        resolve({
          isValid: false,
          message: "C++ compilation failed",
          errors: [stderr.trim() || stdout.trim()],
        });
      } else {
        resolve({ isValid: true, message: "C++ code compiled successfully" });
      }
    });

    child.stdin.write(code);
    child.stdin.end();
  });
}

async function executeCpp(code: string): Promise<ExecutionResult> {
  const dockerArgs = getDockerArgs("gcc:latest", [
    "sh",
    "-c",
    "g++ -x c++ -o /tmp/a.out - && /tmp/a.out",
  ]);
  return executeWithLimits(dockerArgs, code);
}
