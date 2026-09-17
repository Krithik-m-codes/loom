import { useEffect } from "react";
import { Command } from "cmdk";
import {
  Play,
  Square,
  Zap,
  FileCode2,
  History,
  Activity,
  Search,
  LayoutDashboard,
  Workflow,
} from "lucide-react";

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTest: () => void;
  onStopTest: () => void;
  isRunning: boolean;
  onSelectTab: (tab: string) => void;
  onSelectEngine: (engine: string) => void;
  onSelectScript: (script: string, engine: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onRunTest,
  onStopTest,
  isRunning,
  onSelectTab,
  onSelectEngine,
  onSelectScript,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/75 backdrop-blur-[3px] z-50 flex items-start justify-center pt-[15vh]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[580px] max-w-[90vw] bg-[#141518] border border-[#26282D] rounded-[8px] shadow-2xl overflow-hidden flex flex-col"
      >
        <Command label="Command Menu" className="w-full flex flex-col">
          <div className="flex items-center px-4 border-b border-[#26282D] bg-[#1C1E22]">
            <Search className="w-4 h-4 text-[#A3E635] shrink-0" />
            <Command.Input
              placeholder="Type a command or search actions..."
              className="w-full px-3.5 py-3.5 bg-transparent text-[#E8E9EB] font-sans text-[13.5px] outline-none placeholder:text-[#5C6068]"
              autoFocus
            />
          </div>

          <Command.List className="max-h-[340px] overflow-y-auto p-2.5">
            <Command.Empty className="p-6 text-center text-[13px] text-[#5C6068]">
              No matching actions found.
            </Command.Empty>

            <Command.Group heading="Execution" className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5C6068] px-3 py-1.5">
              {!isRunning ? (
                <Command.Item
                  onSelect={() => {
                    onRunTest();
                    onClose();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
                >
                  <Play className="w-4 h-4 fill-current text-[#A3E635]" />
                  <span className="font-medium">Start Load Test</span>
                </Command.Item>
              ) : (
                <Command.Item
                  onSelect={() => {
                    onStopTest();
                    onClose();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#F87171] hover:bg-[#1C1E22] cursor-pointer transition-colors"
                >
                  <Square className="w-4 h-4 fill-current text-[#F87171]" />
                  <span className="font-medium">Stop Active Test</span>
                </Command.Item>
              )}
            </Command.Group>

            <Command.Group heading="Navigation" className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5C6068] px-3 py-1.5 mt-2">
              <Command.Item
                onSelect={() => {
                  onSelectTab("dashboard");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-[#A3E635]" />
                <span>Go to Overview Dashboard</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectTab("flowchart");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <Workflow className="w-4 h-4 text-[#A3E635]" />
                <span>Go to Visual Flow Designer</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectTab("runner");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <Zap className="w-4 h-4 text-[#A3E635]" />
                <span>Go to Test Runner</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectTab("editor");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <FileCode2 className="w-4 h-4 text-[#A3E635]" />
                <span>Go to Script Editor</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectTab("history");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <History className="w-4 h-4 text-[#A3E635]" />
                <span>Go to Run History</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectTab("engines");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <Activity className="w-4 h-4 text-[#A3E635]" />
                <span>View Engine Availability</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Engines" className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5C6068] px-3 py-1.5 mt-2">
              <Command.Item
                onSelect={() => {
                  onSelectEngine("locust");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#4ADE80]" />
                <span>Select Locust Engine (Core Tier)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectEngine("goose");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#4ADE80]" />
                <span>Select Goose Engine (Core Tier)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectEngine("k6");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623]" />
                <span>Select k6 Engine (Plugin Tier)</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Example Suites" className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#5C6068] px-3 py-1.5 mt-2">
              <Command.Item
                onSelect={() => {
                  onSelectScript("examples/locust/basic_test.py", "locust");
                  onSelectTab("runner");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <Zap className="w-4 h-4 text-[#A3E635]" />
                <span>Load Locust Example (basic_test.py)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onSelectScript("examples/k6/basic_test.js", "k6");
                  onSelectTab("runner");
                  onClose();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] text-[#E8E9EB] hover:bg-[#1C1E22] hover:text-[#A3E635] cursor-pointer transition-colors"
              >
                <Zap className="w-4 h-4 text-[#C084FC]" />
                <span>Load k6 Example (basic_test.js)</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="p-3 border-t border-[#26282D] bg-[#0A0A0B] flex items-center justify-between text-[11px] font-mono text-[#5C6068]">
            <span>Navigate with ↑ ↓ and Enter</span>
            <span>ESC to close</span>
          </div>
        </Command>
      </div>
    </div>
  );
};
