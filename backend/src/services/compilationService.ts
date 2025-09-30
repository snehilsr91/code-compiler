import { exec, spawn } from "child_process";
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

export interface ValidationResult {
  isValid: boolean;
  message: string;
  errors?: string[];
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

// ---------------- Python ----------------
export async function validatePython(code: string): Promise<ValidationResult> {
  // Indent user code to fit inside try block
  const indentedCode = code
    .split("\n")
    .map((line) => "    " + line) // 4 spaces indentation
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

// ---------------- Java ----------------
async function validateJava(code: string): Promise<ValidationResult> {
  const classNameMatch = code.match(/public\s+class\s+([^{\s]+)/);
  const className = classNameMatch ? classNameMatch[1] : "Main";
  const javaFile = `${className}.java`;
  const escapedCode = code.replace(/'/g, "'\\''");

  const innerCommand = `
    echo '${escapedCode}' > ${javaFile} && \
    javac ${javaFile} && \
    java -Xss8m -cp . ${className}
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
          message: "Java runtime error",
          errors: [stderr.trim() || stdout.trim()],
        });
      } else {
        resolve({
          isValid: true,
          message: "Java code executed successfully",
        });
      }
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
        "--memory=128m",
        "--ulimit",
        "stack=8388608",
        "gcc:latest",
        "sh",
        "-c",
        `gcc -x c -o /tmp/a.out - && /tmp/a.out`,
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
          message: "C runtime error",
          errors: [stderr.trim() || stdout.trim()],
        });
      } else {
        resolve({ isValid: true, message: "C code executed successfully" });
      }
    });

    child.stdin.write(code);
    child.stdin.end();
  });
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
        "--memory=128m",
        "--ulimit",
        "stack=8388608",
        "gcc:latest",
        "sh",
        "-c",
        `g++ -x c++ -o /tmp/a.out - && /tmp/a.out`,
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
          message: "C runtime error",
          errors: [stderr.trim() || stdout.trim()],
        });
      } else {
        resolve({ isValid: true, message: "C code executed successfully" });
      }
    });

    child.stdin.write(code);
    child.stdin.end();
  });
}
