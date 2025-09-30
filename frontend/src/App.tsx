import { useState } from "react";
import axios from "axios";
import CodeEditor from "./components/Editor";

const base_url = import.meta.env.VITE_BASE_URL || "http://localhost:4000";

interface CompilationResult {
  success: boolean;
  message: string;
  errors?: string[];
  output?: string;
  executionTime?: number;
  memoryUsed?: number;
  verdict?: "ACCEPTED" | "RUNTIME_ERROR";
}

const STARTER_CODE: Record<string, string> = {
  javascript: "console.log('Hello World');",
  python: "print('Hello World')",
  java: 'class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}',
  c: '#include <stdio.h>\nint main() {\n    printf("Hello World\\n");\n    return 0;\n}',
  cpp: '#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello World" << endl;\n    return 0;\n}',
};

// Verdict color mapping
const VERDICT_STYLES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  ACCEPTED: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  RUNTIME_ERROR: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
};

function App() {
  const [code, setCode] = useState(STARTER_CODE.javascript);
  const [language, setLanguage] = useState("javascript");
  const [compilationStatus, setCompilationStatus] = useState<
    "idle" | "checking" | "running" | "success" | "error"
  >("idle");
  const [compilationErrors, setCompilationErrors] = useState<string[]>([]);
  const [output, setOutput] = useState<string>("");
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const handleCompileAndRun = async () => {
    try {
      setCompilationStatus("running");
      setCompilationErrors([]);
      setOutput("");
      setExecutionTime(null);
      setVerdict(null);

      const res = await axios.post<CompilationResult>(
        `${base_url}/api/compile/run`,
        {
          code,
          language: language.toUpperCase(),
        }
      );

      if (res.data.success) {
        setCompilationStatus("success");
        setOutput(res.data.output || "");
        setExecutionTime(res.data.executionTime || null);
        setVerdict(res.data.verdict || "ACCEPTED");
      } else {
        setCompilationStatus("error");
        setCompilationErrors(res.data.errors || [res.data.message]);
        setVerdict(res.data.verdict || "RUNTIME_ERROR");
        setExecutionTime(res.data.executionTime || null);
        if (res.data.output) {
          setOutput(res.data.output);
        }
      }
    } catch (err: unknown) {
      setCompilationStatus("error");
      setCompilationErrors([
        err instanceof Error ? err.message : "Unknown error",
      ]);
      setVerdict("RUNTIME_ERROR");
    }
  };

  const handleSubmit = async () => {
    // First check if code compiles
    try {
      setStatus("Checking compilation...");
      const compileRes = await axios.post<CompilationResult>(
        `${base_url}/api/compile`,
        {
          code,
          language: language.toUpperCase(),
        }
      );

      if (!compileRes.data.success) {
        setStatus("Cannot submit: Fix compilation errors first.");
        setCompilationStatus("error");
        setCompilationErrors(
          compileRes.data.errors || [compileRes.data.message]
        );
        return;
      }

      // If compilation successful, submit
      setStatus("Submitting...");
      const res = await axios.post(`${base_url}/api/submit`, {
        problemId: 1,
        userId: 1,
        language: language.toUpperCase(),
        code,
      });
      setStatus(`✅ Submission created with ID: ${res.data.submissionId}`);
    } catch (err: unknown) {
      setStatus("❌ " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const verdictStyle = verdict
    ? VERDICT_STYLES[verdict]
    : VERDICT_STYLES.ACCEPTED;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">
            Code Compiler
          </h1>
          <p className="text-gray-600">
            Write, compile, and run code with real-time execution limits
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Editor Section */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2 text-gray-700">
                Language
              </label>
              <select
                className="p-2 border border-gray-300 rounded-md w-48 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={language}
                onChange={(e) => {
                  const lang = e.target.value;
                  setLanguage(lang);
                  setCode(STARTER_CODE[lang]);
                  setCompilationStatus("idle");
                  setCompilationErrors([]);
                  setOutput("");
                  setVerdict(null);
                  setExecutionTime(null);
                }}
              >
                {Object.keys(STARTER_CODE).map((lang) => (
                  <option key={lang} value={lang}>
                    {lang.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <CodeEditor
              language={language}
              value={code}
              onChange={(value) => setCode(value ?? "")}
            />

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleCompileAndRun}
                disabled={compilationStatus === "running"}
                className="px-5 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
              >
                {compilationStatus === "running" ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Running...
                  </>
                ) : (
                  <>▶ Compile & Run</>
                )}
              </button>
              <button
                onClick={handleSubmit}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors"
              >
                Submit Code
              </button>
            </div>

            {verdict && (
              <div
                className={`mt-4 p-4 rounded-lg border-2 ${verdictStyle.border} ${verdictStyle.bg}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {verdict === "ACCEPTED" ? (
                    <span className="text-2xl">✓</span>
                  ) : (
                    <span className="text-2xl">✗</span>
                  )}
                  <span className={`font-bold ${verdictStyle.text}`}>
                    {verdict.replace(/_/g, " ")}
                  </span>
                </div>
                {executionTime !== null && (
                  <div className="text-sm text-gray-600 mt-2">
                    Execution Time:{" "}
                    <span className="font-semibold">{executionTime}ms</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Output Section */}
        {compilationStatus === "success" && output && (
          <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Output</h3>
              <span className="text-sm text-gray-500">
                {output.split("\n").length} lines
              </span>
            </div>
            <div className="p-4 bg-gray-900 text-green-400 rounded-md font-mono text-sm whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
              {output}
            </div>
          </div>
        )}

        {/* Error Section */}
        {compilationStatus === "error" && compilationErrors.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-3 text-red-600 flex items-center gap-2">
              <span className="text-xl">⚠</span>
              Errors
            </h3>
            <div className="p-4 bg-red-50 text-red-800 rounded-md border border-red-200">
              <ul className="space-y-2">
                {compilationErrors.map((e, i) => (
                  <li key={i} className="font-mono text-sm whitespace-pre-wrap">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
            {output && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2 text-gray-700">
                  Partial Output:
                </h4>
                <div className="p-3 bg-gray-900 text-green-400 rounded-md font-mono text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {output}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status Message */}
        {status && (
          <div className="mt-6 bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-700">
              <span>{status}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
