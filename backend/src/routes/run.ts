import express from "express";
import { executeCode, executeCodeBatch } from "../services/codeExecutor.js";

const router = express.Router();

const SUPPORTED_LANGUAGES = ["javascript", "python", "java", "c", "cpp"];

// ── Stdin format parser ───────────────────────────────────────────────────────
// Expected format (Codeforces-style):
//   Line 1 : N  (non-negative integer — number of test cases)
//   Lines 2…N+1: one test case per line; multiple values are space-separated
//
// Returns { testcases } on success or { error } on bad format.
function parseStdin(
  stdin: string
): { testcases: string[] } | { error: string } {
  const lines = stdin.split("\n");
  const firstLine = (lines[0] ?? "").trim();
  const N = parseInt(firstLine, 10);

  // Validate first line is a clean non-negative integer (no trailing junk)
  if (isNaN(N) || N < 0 || String(N) !== firstLine) {
    return {
      error: `First line of stdin must be a non-negative integer (number of test cases), got: "${firstLine}"`,
    };
  }

  if (N === 0) {
    return { testcases: [] };
  }

  const remaining = lines.slice(1);

  if (remaining.length < N) {
    return {
      error: `stdin declares ${N} test case(s) but only ${remaining.length} line(s) follow`,
    };
  }

  // Take exactly N lines; ignore any trailing newline at the end
  const testcases = remaining.slice(0, N);
  return { testcases };
}

// ── NO_STDIN_HANDLER detection ────────────────────────────────────────────────
// Lightweight static scan. Intentionally conservative — only flags when none of
// the known read-from-stdin patterns are present.
const INPUT_PATTERNS: Record<string, RegExp[]> = {
  c: [/scanf\s*\(/, /gets\s*\(/, /fgets\s*\(/, /getchar\s*\(/, /fscanf\s*\(/],
  cpp: [
    /cin\s*>>/,
    /scanf\s*\(/,
    /gets\s*\(/,
    /fgets\s*\(/,
    /getchar\s*\(/,
    /getline\s*\(/,
  ],
  python: [/input\s*\(/, /sys\.stdin/, /raw_input\s*\(/],
  java: [/Scanner/, /BufferedReader/, /System\.in/, /Console/],
  javascript: [/readline/, /process\.stdin/],
};

const INPUT_KEYWORDS: Record<string, string> = {
  c: "scanf / gets / getchar / fgets",
  cpp: "cin / scanf / getline / getchar",
  python: "input() / sys.stdin",
  java: "Scanner / BufferedReader / System.in",
  javascript: "readline / process.stdin",
};

function hasInputHandling(code: string, lang: string): boolean {
  const patterns = INPUT_PATTERNS[lang] ?? [];
  return patterns.some((p) => p.test(code));
}

// ── Verdict mapping helper ────────────────────────────────────────────────────
// OUTPUT_LIMIT_EXCEEDED is not exposed in this API — fold it into RUNTIME_ERROR.
type PublicVerdict =
  | "ACCEPTED"
  | "COMPILATION_ERROR"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT_EXCEEDED"
  | "NO_STDIN_HANDLER";

function mapVerdict(raw: string | undefined, success: boolean): PublicVerdict {
  switch (raw) {
    case "ACCEPTED":
      return "ACCEPTED";
    case "COMPILATION_ERROR":
      return "COMPILATION_ERROR";
    case "TIME_LIMIT_EXCEEDED":
      return "TIME_LIMIT_EXCEEDED";
    case "OUTPUT_LIMIT_EXCEEDED":
    case "RUNTIME_ERROR":
    case "MEMORY_LIMIT_EXCEEDED":
    default:
      return success ? "ACCEPTED" : "RUNTIME_ERROR";
  }
}

// ── POST /api/run ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { code, language, stdin } = req.body;

    // ── Field presence validation ──────────────────────────────────────────
    if (!code || !language || stdin === undefined || stdin === null) {
      return res.status(400).json({
        status: 400,
        message:
          "Missing required fields: code, language, and stdin are all required.",
      });
    }

    if (
      typeof code !== "string" ||
      typeof language !== "string" ||
      typeof stdin !== "string"
    ) {
      return res.status(400).json({
        status: 400,
        message: "Fields code, language, and stdin must be strings.",
      });
    }

    if (code.trim() === "") {
      return res.status(400).json({
        status: 400,
        message: "code must not be empty.",
      });
    }

    // ── Language validation ────────────────────────────────────────────────
    const lang = language.toLowerCase();
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return res.status(400).json({
        status: 400,
        message: `Unsupported language: "${language}". Supported: ${SUPPORTED_LANGUAGES.join(", ")}.`,
      });
    }

    // ── stdin format validation ────────────────────────────────────────────
    const parsed = parseStdin(stdin);
    if ("error" in parsed) {
      return res.status(400).json({
        status: 400,
        message: `Invalid stdin format — ${parsed.error}`,
      });
    }

    const { testcases } = parsed;

    // ── Zero test cases ────────────────────────────────────────────────────
    if (testcases.length === 0) {
      return res.json({
        status: 200,
        message: "0 test cases provided — nothing to execute.",
        results: [],
      });
    }

    // ── NO_STDIN_HANDLER pre-check ─────────────────────────────────────────
    const codeReadsInput = hasInputHandling(code, lang);
    const inputKeywords = INPUT_KEYWORDS[lang] ?? "stdin reading functions";

    // Partition test cases into runnable vs. blocked (NO_STDIN_HANDLER)
    // Rule: blocked only when input is non-empty AND code has no input handling.
    //   - Empty input + no handler  → still runs (e.g. "Hello World" programs)
    //   - Non-empty input + handler → runs normally
    //   - Non-empty input + no handler → NO_STDIN_HANDLER, skipped
    const blockedIndices = new Set<number>();
    const runnableTestcases: string[] = [];
    // Maps original-index → exec-results-index (for non-blocked test cases)
    const originalToExecIdx = new Map<number, number>();

    testcases.forEach((input, i) => {
      if (!codeReadsInput && input.trim().length > 0) {
        blockedIndices.add(i);
      } else {
        originalToExecIdx.set(i, runnableTestcases.length);
        runnableTestcases.push(input);
      }
    });

    // ── Execute runnable test cases ────────────────────────────────────────
    let execResults: Awaited<ReturnType<typeof executeCodeBatch>> = [];
    let compilationError: any = null;

    if (runnableTestcases.length > 0) {
      execResults = await executeCodeBatch(code, lang, runnableTestcases);
      compilationError = execResults.find(
        (r) => r.verdict === "COMPILATION_ERROR"
      );
    } else {
      // All test cases were blocked (no stdin handler found + inputs provided).
      // Verify if the code compiles/parses first!
      // A COMPILATION_ERROR takes priority over NO_STDIN_HANDLER.
      const check = await executeCode(code, lang, "");
      if (check.verdict === "COMPILATION_ERROR") {
        compilationError = check;
      }
    }

    // ── Build per-test-case response ───────────────────────────────────────
    const results = testcases.map((input, i) => {
      // COMPILATION_ERROR takes priority over everything
      if (compilationError) {
        return {
          testcase: i + 1,
          input,
          verdict: "COMPILATION_ERROR" as PublicVerdict,
          output: null,
          executionTime: null,
          error: compilationError.errors?.join("\n") ?? "Compilation failed",
        };
      }

      // Blocked: code cannot read the provided input
      if (blockedIndices.has(i)) {
        return {
          testcase: i + 1,
          input,
          verdict: "NO_STDIN_HANDLER" as PublicVerdict,
          output: null,
          executionTime: null,
          error: `Code has no input handling (no ${inputKeywords} found) but this test case has a non-empty input. The code cannot consume the provided input.`,
        };
      }

      // Normal executed result
      const execIdx = originalToExecIdx.get(i);
      const raw = execIdx !== undefined ? execResults[execIdx] : undefined;

      if (!raw) {
        // Shouldn't happen — safety fallback
        return {
          testcase: i + 1,
          input,
          verdict: "RUNTIME_ERROR" as PublicVerdict,
          output: null,
          executionTime: null,
          error: "Internal error: missing execution result for this test case.",
        };
      }

      return {
        testcase: i + 1,
        input,
        verdict: mapVerdict(raw.verdict, raw.success),
        output: raw.output?.trim() ?? null,
        executionTime: raw.executionTime ?? null,
        error: raw.errors && raw.errors.length > 0
          ? raw.errors.join("\n")
          : null,
      };
    });

    // ── Determine top-level message ────────────────────────────────────────
    const hasCompilationError = results.some(
      (r) => r.verdict === "COMPILATION_ERROR"
    );
    const hasNoStdinHandler = results.some(
      (r) => r.verdict === "NO_STDIN_HANDLER"
    );

    let message: string;
    if (hasCompilationError) {
      message = "Compilation failed — test cases were not executed.";
    } else if (hasNoStdinHandler) {
      message = `Executed ${results.filter((r) => r.verdict !== "NO_STDIN_HANDLER").length} of ${testcases.length} test case(s) — some skipped due to missing input handling.`;
    } else {
      message = `Executed ${testcases.length} test case(s).`;
    }

    return res.json({
      status: 200,
      message,
      results,
    });
  } catch (error) {
    console.error("Error in /api/run route:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error.",
      error:
        error instanceof Error ? error.message : "Unknown error occurred.",
    });
  }
});

export default router;
