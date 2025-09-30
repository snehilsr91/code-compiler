import express from "express";
import { validateCode, executeCode } from "../services/compilationService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: code and language",
      });
    }

    const validationResult = await validateCode(code, language);

    res.json({
      success: validationResult.isValid,
      message: validationResult.message,
      errors: validationResult.errors || [],
    });
  } catch (error) {
    console.error("Error in compile route:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during compilation check",
      errors: [],
    });
  }
});

// New route for compile and run
router.post("/run", async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: code and language",
      });
    }

    // First validate
    const validationResult = await validateCode(code, language);

    if (!validationResult.isValid) {
      return res.json({
        success: false,
        message: validationResult.message,
        errors: validationResult.errors || [],
      });
    }

    // Then execute
    const executionResult = await executeCode(code, language);

    res.json({
      success: executionResult.success,
      message: executionResult.message,
      output: executionResult.output,
      errors: executionResult.errors || [],
    });
  } catch (error) {
    console.error("Error in compile/run route:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during execution",
      errors: [error instanceof Error ? error.message : "Unknown error"],
    });
  }
});

export default router;
