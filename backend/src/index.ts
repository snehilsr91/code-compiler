import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import submitRouter from "./routes/submit.js";
import compileRouter from "./routes/compile.js";
import runRouter from "./routes/run.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Backend is running" });
});

app.use("/api/submit", submitRouter);
app.use("/api/compile", compileRouter);
app.use("/api/run", runRouter);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
