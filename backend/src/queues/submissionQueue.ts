import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

const submissionQueue = new Queue("submissions", { connection });

export default submissionQueue;
