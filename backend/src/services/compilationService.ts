// This file re-exports functions from codeExecutor for use in routes
import {
  validateCode as validate,
  executeCode as execute,
} from "./codeExecutor.js";

export const validateCode = validate;
export const executeCode = execute;
