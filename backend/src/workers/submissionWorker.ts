import { Worker, Job } from "bullmq";
import prisma from "../prismaClient.js";
import { SubmissionStatus } from "@prisma/client";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

const worker = new Worker(
  "submissions",
  async (job: Job) => {
    const { submissionId, code, language } = job.data;

    // Temp directory
    const tempDir = path.join(__dirname, "../../tmp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const ext = language.toLowerCase() === "javascript" ? "js" : "py"; // extendable
    const filePath = path.join(tempDir, `${submissionId}.${ext}`);

    // Write code to temp file
    fs.writeFileSync(filePath, code, { encoding: "utf8" });

    // Docker image selection
    const dockerImage =
      language.toLowerCase() === "javascript"
        ? "node:20-slim"
        : "python:3.12-slim";

    // Execute inside Docker
    return new Promise<void>((resolve) => {
      exec(
        `docker run --rm -v ${tempDir.replace(
          /\\/g,
          "/"
        )}:/app ${dockerImage} ${
          language.toLowerCase() === "javascript" ? "node" : "python3"
        } /app/${submissionId}.${ext}`,
        { timeout: 5000 },
        async (error, stdout, stderr) => {
          let status: SubmissionStatus = SubmissionStatus.ACCEPTED;
          let output = stdout;

          if (error) {
            status = SubmissionStatus.RUNTIME_ERROR;
            output = stderr || error.message;
          }

          // Update submission in DB
          await prisma.submission.update({
            where: { id: submissionId },
            data: { status, code: `${code}\n\n// Output:\n${output}` },
          });

          // Delete temp file
          fs.unlinkSync(filePath);
          resolve();
        }
      );
    });
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`Submission ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Submission ${job?.id} failed`, err);
});
