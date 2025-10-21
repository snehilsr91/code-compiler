import { Worker, Job } from "bullmq";
import prisma from "../prismaClient.js";
import { SubmissionStatus } from "@prisma/client";
import { executeCode } from "../services/codeExecutor.js"; // Fixed path - adjust based on your actual structure
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

const worker = new Worker(
  "submissions",
  async (job: Job) => {
    const { submissionId, code, language, input } = job.data;

    try {
      console.log(`Processing submission ${submissionId} for ${language}`);

      // Execute the code using the codeExecutor service
      const result = await executeCode(code, language, input);

      // Find the verdict mapping section and add:
      let status: SubmissionStatus;
      if (result.success && result.verdict === "ACCEPTED") {
        status = SubmissionStatus.ACCEPTED;
      } else if (result.verdict === "TIME_LIMIT_EXCEEDED") {
        status = SubmissionStatus.TIME_LIMIT_EXCEEDED;
      } else if (result.verdict === "COMPILATION_ERROR") {
        // ← Add this
        status = SubmissionStatus.COMPILATION_ERROR; // ← Add this
      } else if (
        result.verdict === "MEMORY_LIMIT_EXCEEDED" ||
        result.verdict === "OUTPUT_LIMIT_EXCEEDED"
      ) {
        status = SubmissionStatus.RUNTIME_ERROR;
      } else if (result.verdict === "RUNTIME_ERROR") {
        status = SubmissionStatus.RUNTIME_ERROR;
      } else {
        status = SubmissionStatus.RUNTIME_ERROR;
      }

      // Format output with execution details
      let outputText = "";
      if (result.output) {
        outputText += `Output:\n${result.output}\n\n`;
      }
      if (result.errors && result.errors.length > 0) {
        outputText += `Errors:\n${result.errors.join("\n")}\n\n`;
      }
      if (result.executionTime !== undefined) {
        outputText += `Execution Time: ${result.executionTime}ms\n`;
      }
      if (result.verdict) {
        outputText += `Verdict: ${result.verdict}\n`;
      }

      // Update submission in database
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status,
          code: `${code}\n\n// ${result.message}\n${outputText}`,
        },
      });

      console.log(
        `Submission ${submissionId} completed with status: ${status}`
      );
    } catch (error: any) {
      console.error(`Submission ${submissionId} failed:`, error);

      // Update submission with error status
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.RUNTIME_ERROR,
          code: `${code}\n\n// Error: ${error.message}`,
        },
      });
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✓ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`✗ Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

console.log("Submission worker started and waiting for jobs...");

export default worker;
