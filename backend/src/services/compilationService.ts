import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const tempDir = path.join(__dirname, "../../tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `code_${Date.now()}.js`);
  const wrappedCode = `'use strict';
try {
  ${code}
  console.log("__VALIDATION_SUCCESS__");
} catch(e) {
  console.error("__VALIDATION_ERROR__", e.name + ": " + e.message);
  process.exit(1);
}`;
  fs.writeFileSync(tempFile, wrappedCode, "utf8");

  return new Promise((resolve) => {
    exec(
      `docker run --rm -v ${tempDir.replace(
        /\\/g,
        "/"
      )}:/app node:20-slim node /app/${path.basename(tempFile)}`,
      { timeout: 5000 },
      (error, stdout, stderr) => {
        fs.unlinkSync(tempFile);
        const output = stdout + stderr;

        if (output.includes("__VALIDATION_ERROR__") || error) {
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
      }
    );
  });
}

// ---------------- Python ----------------
async function validatePython(code: string): Promise<ValidationResult> {
  const tempDir = path.join(__dirname, "../../tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `code_${Date.now()}.py`);
  const wrappedCode = `
try:
    ${code}
    print("__VALIDATION_SUCCESS__")
except Exception as e:
    print("__VALIDATION_ERROR__", e)
    exit(1)
`;
  fs.writeFileSync(tempFile, wrappedCode, "utf8");

  return new Promise((resolve) => {
    exec(
      `docker run --rm -v ${tempDir.replace(
        /\\/g,
        "/"
      )}:/app python:3.12-slim python /app/${path.basename(tempFile)}`,
      { timeout: 5000 },
      (error, stdout, stderr) => {
        fs.unlinkSync(tempFile);
        const output = stdout + stderr;

        if (output.includes("__VALIDATION_ERROR__") || error) {
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
      }
    );
  });
}

// ---------------- Java ----------------
async function validateJava(code: string): Promise<ValidationResult> {
  const tempDir = path.join(__dirname, "../../tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `Main_${Date.now()}.java`);
  fs.writeFileSync(tempFile, code, "utf8");

  return new Promise((resolve) => {
    exec(
      `docker run --rm -v ${tempDir.replace(
        /\\/g,
        "/"
      )}:/app openjdk:17 javac /app/${path.basename(tempFile)}`,
      { timeout: 5000 },
      (error, stdout, stderr) => {
        fs.unlinkSync(tempFile);

        if (error) {
          resolve({
            isValid: false,
            message: "Java compilation failed",
            errors: [stderr || error.message],
          });
        } else {
          resolve({
            isValid: true,
            message: "Java code compiled successfully",
          });
        }
      }
    );
  });
}

// ---------------- C ----------------
async function validateC(code: string): Promise<ValidationResult> {
  const tempDir = path.join(__dirname, "../../tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `code_${Date.now()}.c`);
  const outputFile = path.join(tempDir, `out_${Date.now()}`);
  fs.writeFileSync(tempFile, code, "utf8");

  return new Promise((resolve) => {
    exec(
      `docker run --rm -v ${tempDir.replace(
        /\\/g,
        "/"
      )}:/app gcc:latest gcc /app/${path.basename(
        tempFile
      )} -o /app/${path.basename(outputFile)}`,
      { timeout: 5000 },
      (error, stdout, stderr) => {
        fs.unlinkSync(tempFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

        if (error) {
          resolve({
            isValid: false,
            message: "C compilation failed",
            errors: [stderr || error.message],
          });
        } else {
          resolve({ isValid: true, message: "C code compiled successfully" });
        }
      }
    );
  });
}

// ---------------- C++ ----------------
async function validateCpp(code: string): Promise<ValidationResult> {
  const tempDir = path.join(__dirname, "../../tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `code_${Date.now()}.cpp`);
  const outputFile = path.join(tempDir, `out_${Date.now()}`);
  fs.writeFileSync(tempFile, code, "utf8");

  return new Promise((resolve) => {
    exec(
      `docker run --rm -v ${tempDir.replace(
        /\\/g,
        "/"
      )}:/app gcc:latest g++ /app/${path.basename(
        tempFile
      )} -o /app/${path.basename(outputFile)}`,
      { timeout: 5000 },
      (error, stdout, stderr) => {
        fs.unlinkSync(tempFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);

        if (error) {
          resolve({
            isValid: false,
            message: "C++ compilation failed",
            errors: [stderr || error.message],
          });
        } else {
          resolve({ isValid: true, message: "C++ code compiled successfully" });
        }
      }
    );
  });
}
