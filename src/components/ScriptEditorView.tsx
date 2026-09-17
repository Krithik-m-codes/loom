import { useState, useEffect } from "react";
import { FileCode, Save, Play, Check, RefreshCw } from "lucide-react";
import { readScript, saveScript } from "../lib/ipc";

interface ScriptEditorViewProps {
  scriptPath: string;
  onSelectScript: (path: string, engine: string) => void;
  onRunTest: () => void;
}

export const ScriptEditorView: React.FC<ScriptEditorViewProps> = ({
  scriptPath,
  onSelectScript,
  onRunTest,
}) => {
  const [content, setContent] = useState<string>("");
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<string>("");

  useEffect(() => {
    loadCurrentScript();
  }, [scriptPath]);

  const loadCurrentScript = async () => {
    try {
      const code = await readScript(scriptPath);
      setContent(code);
      setIsSaved(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    try {
      await saveScript(scriptPath, content);
      setIsSaved(true);
      setSaveStatus("Saved successfully!");
      setTimeout(() => setSaveStatus(""), 2500);
    } catch (err: any) {
      setSaveStatus(`Save error: ${err}`);
    }
  };

  const templates = [
    { name: "Locust (Python)", path: "examples/locust/basic_test.py", engine: "locust" },
    { name: "k6 (JavaScript)", path: "examples/k6/basic_test.js", engine: "k6" },
  ];

  const lineCount = content.split("\n").length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-hidden">
      {/* Editor Header Bar */}
      <div className="h-[52px] bg-[#141518] border-b border-[#26282D] px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCode className="w-4 h-4 text-[#A3E635]" />
          <span className="font-mono text-[13px] text-[#E8E9EB] font-semibold">
            {scriptPath}
          </span>
          {!isSaved && (
            <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623] shadow-[0_0_8px_rgba(245,166,35,0.6)]" title="Unsaved changes" />
          )}
          {saveStatus && (
            <span className="text-[12px] text-[#4ADE80] font-mono flex items-center gap-1.5 font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>{saveStatus}</span>
            </span>
          )}
        </div>

        {/* Quick templates + actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="text-[12px] text-[#9CA0A8] mr-1">Templates:</span>
            {templates.map((tpl) => (
              <button
                key={tpl.path}
                onClick={() => onSelectScript(tpl.path, tpl.engine)}
                className={`px-3 py-1 rounded-[4px] text-[12px] font-mono border transition-all ${
                  scriptPath === tpl.path
                    ? "bg-[#A3E635]/15 border-[#A3E635]/40 text-[#A3E635] font-bold"
                    : "bg-[#1C1E22] border-[#26282D] text-[#9CA0A8] hover:text-[#E8E9EB] hover:border-[#3A3D44]"
                }`}
              >
                {tpl.name}
              </button>
            ))}
          </div>

          <button
            onClick={loadCurrentScript}
            className="btn-secondary h-[34px] px-3"
            title="Reload from disk"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#9CA0A8]" />
          </button>

          <button
            onClick={handleSave}
            className="btn-secondary h-[34px] text-[13px] px-4 gap-2 font-medium"
          >
            <Save className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span>Save</span>
          </button>

          <button
            onClick={onRunTest}
            className="btn-primary h-[34px] text-[13px] px-5 gap-2 font-bold tracking-wide"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Code Editor Body with Line Numbers */}
      <div className="flex-1 flex overflow-hidden bg-[#0A0A0B]">
        {/* Line Numbers */}
        <div className="w-[52px] bg-[#141518] border-r border-[#26282D] py-3.5 select-none text-right pr-3.5 font-mono text-[13px] text-[#5C6068] leading-relaxed">
          {Array.from({ length: Math.max(lineCount, 25) }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code Input */}
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setIsSaved(false);
          }}
          spellCheck={false}
          className="flex-1 bg-transparent text-[#E8E9EB] font-mono text-[13.5px] p-3.5 leading-relaxed outline-none resize-none overflow-y-auto selection:bg-[#A3E635]/25"
        />
      </div>

      {/* Editor Footer */}
      <div className="h-[30px] bg-[#141518] border-t border-[#26282D] px-4 flex items-center justify-between text-[11px] font-mono text-[#5C6068]">
        <span>Lines: {lineCount} | Characters: {content.length}</span>
        <span>UTF-8 | LF | {scriptPath.endsWith(".py") ? "Python (Locust)" : scriptPath.endsWith(".js") ? "JavaScript (k6)" : "Rust (Goose)"}</span>
      </div>
    </div>
  );
};
