import React from "react";
import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  language,
  value,
  onChange,
}) => {
  return (
    <div className="border rounded-md shadow-md">
      <Editor
        height="400px"
        defaultLanguage={language}
        value={value}
        theme="vs-dark"
        onChange={onChange}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
        }}
      />
    </div>
  );
};

export default CodeEditor;
