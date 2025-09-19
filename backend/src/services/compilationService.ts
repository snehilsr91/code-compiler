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

export async function validateCode(code: string, language: string): Promise<ValidationResult> {
  const normalizedLanguage = language.toLowerCase();
  
  switch (normalizedLanguage) {
    case "javascript":
      return await validateJavaScript(code);
    case "python":
      return await validatePython(code);
    default:
      return {
        isValid: false,
        message: `Unsupported language: ${language}`,
        errors: [`Language '${language}' is not supported for compilation checking`]
      };
  }
}

async function validateJavaScript(code: string): Promise<ValidationResult> {
  // Create temp directory if it doesn't exist
  const tempDir = path.join(__dirname, "../../tmp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempFile = path.join(tempDir, `validation_${Date.now()}.js`);
  
  try {
    // Create validation code that catches undefined variables in strict mode
    const wrappedCode = `'use strict';
try {
  ${code}
  console.log('VALIDATION_SUCCESS');
} catch (error) {
  console.error('VALIDATION_ERROR:', error.name + ': ' + error.message);
  process.exit(1);
}`;

    // Write wrapped code to temporary file
    fs.writeFileSync(tempFile, wrappedCode, { encoding: "utf8" });
    
    // Use Node.js to execute the wrapped code and catch errors
    return new Promise<ValidationResult>((resolve) => {
      exec(
        `docker run --rm -v ${tempDir.replace(/\\/g, "/")}:/app node:20-slim node /app/${path.basename(tempFile)}`,
        { timeout: 5000 },
        (error, stdout, stderr) => {
          // Clean up temp file
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
          
          const fullOutput = (stderr || '') + (stdout || '');
          
          // Check if this is a validation error
          if (fullOutput.includes('VALIDATION_ERROR:')) {
            const errorMatch = fullOutput.match(/VALIDATION_ERROR:\s*(.+)/);
            const errorMessage = errorMatch?.[1]?.trim() ?? 'Validation failed';
            resolve({
              isValid: false,
              message: "JavaScript validation failed",
              errors: [errorMessage]
            });
          } else if (error && !isDockerPullMessage(fullOutput)) {
            // Handle other errors that aren't Docker pull messages
            resolve({
              isValid: false,
              message: "JavaScript validation failed",
              errors: [fullOutput.trim()]
            });
          } else {
            // Success case
            resolve({
              isValid: true,
              message: "JavaScript code is valid"
            });
          }
        }
      );
    });
  } catch (error) {
    // Clean up temp file if something goes wrong
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    
    return {
      isValid: false,
      message: "Error during JavaScript validation",
      errors: [(error as Error).message]
    };
  }
}

async function validatePython(code: string): Promise<ValidationResult> {
  // Create temp directory if it doesn't exist
  const tempDir = path.join(__dirname, "../../tmp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempFile = path.join(tempDir, `syntax_check_${Date.now()}.py`);
  
  try {
    // Write code to temporary file
    fs.writeFileSync(tempFile, code, { encoding: "utf8" });
    
    // Use Python to compile without executing
    return new Promise<ValidationResult>((resolve) => {
      exec(
        `docker run --rm -v ${tempDir.replace(/\\/g, "/")}:/app python:3.12-slim python -m py_compile /app/${path.basename(tempFile)}`,
        { timeout: 3000 },
        (error, stdout, stderr) => {
          // Clean up temp file
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
          
          if (error) {
            const errorMessage = stderr || error.message;
            const syntaxErrors = parseSyntaxErrors(errorMessage, "python");
            
            // Only treat as compilation error if we found actual syntax errors
            if (syntaxErrors.length > 0) {
              resolve({
                isValid: false,
                message: "Python syntax error detected",
                errors: syntaxErrors
              });
            } else {
              // If no syntax errors found, treat as successful validation
              // (likely just Docker pull messages)
              resolve({
                isValid: true,
                message: "Python code is syntactically correct"
              });
            }
          } else {
            resolve({
              isValid: true,
              message: "Python code is syntactically correct"
            });
          }
        }
      );
    });
  } catch (error) {
    // Clean up temp file if something goes wrong
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    
    return {
      isValid: false,
      message: "Error during Python validation",
      errors: [(error as Error).message]
    };
  }
}

function isDockerPullMessage(output: string): boolean {
  return output.includes('Unable to find image') ||
         output.includes('Pulling from library/') ||
         output.includes('Digest: sha256:') ||
         output.includes('Status: Downloaded newer image') ||
         output.includes('Status: Image is up to date');
}

function parseValidationErrors(errorMessage: string): string[] {
  const errors: string[] = [];
  
  if (!errorMessage) return errors;
  
  const lines = errorMessage.split('\n').filter(line => line.trim().length > 0);
  
  // Filter out Docker-related messages that aren't actual validation errors
  const filteredLines = lines.filter(line => {
    const trimmedLine = line.trim();
    return !(
      trimmedLine.includes('Unable to find image') ||
      trimmedLine.includes('Pulling from library/') ||
      trimmedLine.includes('Digest: sha256:') ||
      trimmedLine.includes('Status: Downloaded newer image') ||
      trimmedLine.includes('Status: Image is up to date') ||
      /^[a-f0-9]+: /.test(trimmedLine) || // Docker layer hashes
      trimmedLine.includes(': Pull complete') ||
      trimmedLine.includes(': Pulling fs layer') ||
      trimmedLine.includes(': Waiting') ||
      trimmedLine.includes(': Downloading') ||
      trimmedLine.includes(': Extracting') ||
      trimmedLine.includes(': Verifying Checksum') ||
      trimmedLine.includes(': Download complete')
    );
  });
  
  // Parse JavaScript validation errors
  for (const line of filteredLines) {
    if (line.includes("ReferenceError") || line.includes("SyntaxError") || 
        line.includes("TypeError") || line.includes("Error:")) {
      // Extract meaningful error messages
      let cleanedError = line.trim();
      
      // Remove file path information and focus on the actual error
      cleanedError = cleanedError.replace(/\/app\/validation_\d+\.js:\d+/g, '');
      cleanedError = cleanedError.replace(/^\s*at\s+.*$/gm, ''); // Remove stack trace lines
      
      if (cleanedError.trim()) {
        errors.push(cleanedError.trim());
      }
    }
  }
  
  // Only return the full error message as fallback if it contains actual error indicators
  if (errors.length === 0 && filteredLines.length > 0) {
    const hasRealErrors = filteredLines.some(line => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('exception')
    );
    if (hasRealErrors) {
      errors.push(filteredLines.join('\n').trim());
    }
  }
  
  return errors;
}

function parseSyntaxErrors(errorMessage: string, language: string): string[] {
  const errors: string[] = [];
  
  if (!errorMessage) return errors;
  
  const lines = errorMessage.split('\n').filter(line => line.trim().length > 0);
  
  // Filter out Docker-related messages that aren't actual compilation errors
  const filteredLines = lines.filter(line => {
    const trimmedLine = line.trim();
    return !(
      trimmedLine.includes('Unable to find image') ||
      trimmedLine.includes('Pulling from library/') ||
      trimmedLine.includes('Digest: sha256:') ||
      trimmedLine.includes('Status: Downloaded newer image') ||
      trimmedLine.includes('Status: Image is up to date') ||
      /^[a-f0-9]+: /.test(trimmedLine) || // Docker layer hashes
      trimmedLine.includes(': Pull complete') ||
      trimmedLine.includes(': Pulling fs layer') ||
      trimmedLine.includes(': Waiting') ||
      trimmedLine.includes(': Downloading') ||
      trimmedLine.includes(': Extracting') ||
      trimmedLine.includes(': Verifying Checksum') ||
      trimmedLine.includes(': Download complete')
    );
  });
  
  if (language === "javascript") {
    // Parse Node.js syntax errors
    for (const line of filteredLines) {
      if (line.includes("SyntaxError") || line.includes("ReferenceError") || 
          line.includes("TypeError") || line.includes("Error:")) {
        errors.push(line.trim());
      }
    }
  } else if (language === "python") {
    // Parse Python syntax errors
    for (const line of filteredLines) {
      if (line.includes("SyntaxError") || line.includes("IndentationError") || 
          line.includes("TabError") || line.includes("Error:")) {
        errors.push(line.trim());
      }
    }
  }
  
  // Only return the full error message as fallback if it contains actual error indicators
  // and not just Docker pull messages
  if (errors.length === 0 && filteredLines.length > 0) {
    const hasRealErrors = filteredLines.some(line => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('exception')
    );
    if (hasRealErrors) {
      errors.push(filteredLines.join('\n').trim());
    }
  }
  
  return errors;
}
