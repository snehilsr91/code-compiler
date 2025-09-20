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
    const lang = language.toLowerCase();

    const tempDir = path.join(__dirname, "../../tmp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    let ext = "txt";
    let dockerImage = "";
    let compileCmd = "";
    let runCmd = "";

    if (lang === "javascript") {
      ext = "js";
      dockerImage = "node:20-slim";
      runCmd = `node /app/${submissionId}.${ext}`;
    } else if (lang === "python") {
      ext = "py";
      dockerImage = "python:3.12-slim";
      runCmd = `python /app/${submissionId}.${ext}`;
    } else if (lang === "java") {
      ext = "java";
      dockerImage = "openjdk:17";
      compileCmd = `javac /app/${submissionId}.${ext}`;
      runCmd = `java -cp /app Main`;
    } else if (lang === "c") {
      ext = "c";
      dockerImage = "gcc:latest";
      compileCmd = `gcc /app/${submissionId}.${ext} -o /app/${submissionId}`;
      runCmd = `/app/${submissionId}`;
    } else if (lang === "cpp") {
      ext = "cpp";
      dockerImage = "gcc:latest";
      compileCmd = `g++ /app/${submissionId}.${ext} -o /app/${submissionId}`;
      runCmd = `/app/${submissionId}`;
    }

    const filePath = path.join(tempDir, `${submissionId}.${ext}`);
    fs.writeFileSync(filePath, code, "utf8");

    return new Promise<void>((resolve) => {
      const dockerCmd = compileCmd
        ? `docker run --rm -v ${tempDir.replace(
            /\\/g,
            "/"
          )}:/app ${dockerImage} /bin/sh -c "${compileCmd} && ${runCmd}"`
        : `docker run --rm -v ${tempDir.replace(
            /\\/g,
            "/"
          )}:/app ${dockerImage} ${runCmd}`;

      exec(dockerCmd, { timeout: 10000 }, async (error, stdout, stderr) => {
        let status: SubmissionStatus = SubmissionStatus.ACCEPTED;
        let output = stdout || "";

        if (error) {
          status = SubmissionStatus.RUNTIME_ERROR;
          output = stderr || error.message;
        }

        await prisma.submission.update({
          where: { id: submissionId },
          data: { status, code: `${code}\n\n// Output:\n${output}` },
        });

        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        resolve();
      });
    });
  },
  { connection }
);

worker.on("completed", (job) => console.log(`Submission ${job.id} completed`));
worker.on("failed", (job, err) =>
  console.error(`Submission ${job?.id} failed`, err)
);
