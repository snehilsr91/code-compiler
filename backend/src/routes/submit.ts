import express from "express";
import submissionQueue from "../queues/submissionQueue.js";
import prisma from "../prismaClient.js";
import { SubmissionStatus } from "@prisma/client";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    console.log("Received request body:", req.body);
    const { code, language, problemId, userId } = req.body;

    if (!code || !language || !problemId || !userId) {
      console.log(
        "Missing fields - code:",
        !!code,
        "language:",
        !!language,
        "problemId:",
        !!problemId,
        "userId:",
        !!userId
      );
      return res.status(400).json({
        message: "Missing fields",
        received: {
          code: !!code,
          language: !!language,
          problemId: !!problemId,
          userId: !!userId,
        },
      });
    }

    console.log("Creating submission with data:", {
      code,
      language,
      problemId,
      userId,
    });

    // Create submission in DB
    const submission = await prisma.submission.create({
      data: {
        code,
        language,
        status: SubmissionStatus.PENDING,
        problemId,
        userId,
      },
    });

    console.log("Created submission:", submission.id);

    // Add job to Redis queue
    await submissionQueue.add("executeSubmission", {
      submissionId: submission.id,
      code,
      language,
    });

    console.log("Added job to queue for submission:", submission.id);

    res.json({ submissionId: submission.id });
  } catch (error) {
    console.error("Error in submit route:", error);
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    res
      .status(500)
      .json({ message: "Internal server error", error: errorMessage });
  }
});

export default router;
