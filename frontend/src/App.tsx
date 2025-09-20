import { useState } from "react";
import axios from "axios";
import CodeEditor from "./components/Editor";

interface CompilationResult {
  success: boolean;
  message: string;
  errors?: string[];
}

const STARTER_CODE: Record<string, string> = {
  javascript: "console.log('Hello World');",
  python: "print('Hello World')",
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}',
  c: '#include <stdio.h>\nint main() {\n    printf("Hello World\\n");\n    return 0;\n}',
  cpp: '#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello World" << endl;\n    return 0;\n}',
};

function App() {
  const [code, setCode] = useState(STARTER_CODE.javascript);
  const [language, setLanguage] = useState("javascript");
  const [compilationStatus, setCompilationStatus] = useState<
    "idle" | "checking" | "success" | "error"
  >("idle");
  const [compilationErrors, setCompilationErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");

  const checkCompilation = async (): Promise<boolean> => {
    try {
      setCompilationStatus("checking");
      setCompilationErrors([]);

      const res = await axios.post<CompilationResult>(
        "http://localhost:4000/api/compile",
        {
          code,
          language: language.toUpperCase(),
        }
      );

      if (res.data.success) {
        setCompilationStatus("success");
        return true;
      } else {
        setCompilationStatus("error");
        setCompilationErrors(res.data.errors || [res.data.message]);
        return false;
      }
    } catch (err: unknown) {
      setCompilationStatus("error");
      setCompilationErrors([
        err instanceof Error ? err.message : "Unknown error",
      ]);
      return false;
    }
  };

  const handleSubmit = async () => {
    const isValid = await checkCompilation();
    if (!isValid) {
      setStatus("Cannot submit: Fix compilation errors first.");
      return;
    }

    try {
      setStatus("Submitting...");
      const res = await axios.post("http://localhost:4000/api/submit", {
        problemId: 1,
        userId: 1,
        language: language.toUpperCase(),
        code,
      });
      setStatus(`Submission created with ID: ${res.data.submissionId}`);
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Code Compiler Playground</h1>

      <select
        className="mb-2 p-2 border rounded"
        value={language}
        onChange={(e) => {
          const lang = e.target.value;
          setLanguage(lang);
          setCode(STARTER_CODE[lang]);
        }}
      >
        {Object.keys(STARTER_CODE).map((lang) => (
          <option key={lang} value={lang}>
            {lang.toUpperCase()}
          </option>
        ))}
      </select>

      <CodeEditor
        language={language}
        value={code}
        onChange={(value) => setCode(value ?? "")}
      />

      <div className="mt-4 flex gap-2">
        <button
          onClick={checkCompilation}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          Check Compilation
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Submit Code
        </button>
      </div>

      {compilationStatus === "success" && (
        <div className="mt-2 p-2 bg-green-100 text-green-700 rounded">
          ✅ Compilation Successful!
        </div>
      )}
      {compilationStatus === "error" && compilationErrors.length > 0 && (
        <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">
          <div className="font-semibold">❌ Errors:</div>
          <ul className="list-disc list-inside text-sm">
            {compilationErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {status && <p className="mt-2 text-gray-700">{status}</p>}
    </div>
  );
}

export default App;
