import { useState } from "react";
import axios from "axios";
import CodeEditor from "./components/Editor";

interface CompilationResult {
  success: boolean;
  message: string;
  errors?: string[];
}

function App() {
  const [code, setCode] = useState("// write your code here");
  const [status, setStatus] = useState("");
  const [compilationStatus, setCompilationStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [compilationErrors, setCompilationErrors] = useState<string[]>([]);

  const checkCompilation = async (): Promise<boolean> => {
    try {
      setCompilationStatus('checking');
      setCompilationErrors([]);
      
      const res = await axios.post<CompilationResult>("http://localhost:4000/api/compile", {
        code,
        language: "JAVASCRIPT",
      });
      
      if (res.data.success) {
        setCompilationStatus('success');
        return true;
      } else {
        setCompilationStatus('error');
        setCompilationErrors(res.data.errors || [res.data.message]);
        return false;
      }
    } catch (err: unknown) {
      setCompilationStatus('error');
      if (err instanceof Error) {
        setCompilationErrors(["Compilation check failed: " + err.message]);
      } else {
        setCompilationErrors(["An unknown error occurred during compilation check."]);
      }
      return false;
    }
  };

  const handleSubmit = async () => {
    // First check compilation
    const isValidCode = await checkCompilation();
    if (!isValidCode) {
      setStatus("Cannot submit: Code has compilation errors. Please fix them first.");
      return;
    }

    try {
      setStatus("Submitting...");
      const res = await axios.post("http://localhost:4000/api/submit", {
        problemId: 1, // hardcoded for now
        userId: 1, // hardcoded test user
        language: "JAVASCRIPT",
        code,
      });
      setStatus(`Submission created with ID: ${res.data.submissionId}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setStatus("Error: " + err.message);
      } else {
        setStatus("An unknown error occurred.");
      }
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Code Compiler Playground</h1>

      <CodeEditor
        language="javascript"
        value={code}
        onChange={(value) => setCode(value ?? "")}
      />

      <div className="mt-4 flex gap-2">
        <button
          onClick={checkCompilation}
          disabled={compilationStatus === 'checking'}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400"
        >
          {compilationStatus === 'checking' ? 'Checking...' : 'Check Compilation'}
        </button>
        
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Submit Code
        </button>
      </div>

      {/* Compilation Status */}
      {compilationStatus === 'success' && (
        <div className="mt-2 p-2 bg-green-100 border border-green-400 text-green-700 rounded">
          ✅ Code compilation successful!
        </div>
      )}
      
      {compilationStatus === 'error' && compilationErrors.length > 0 && (
        <div className="mt-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          <div className="font-semibold mb-1">❌ Compilation Errors:</div>
          <ul className="list-disc list-inside text-sm">
            {compilationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {status && <p className="mt-2 text-gray-700">{status}</p>}
    </div>
  );
}

export default App;
