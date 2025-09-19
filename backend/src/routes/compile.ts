import express from "express";
import { validateCode } from "../services/compilationService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: code and language"
      });
    }

    const validationResult = await validateCode(code, language);

    res.json({
      success: validationResult.isValid,
      message: validationResult.message,
      errors: validationResult.errors || []
    });
  } catch (error) {
    console.error("Error in compile route:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during compilation check",
      errors: []
    });
  }
});

export default router;