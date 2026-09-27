import { useEffect } from "react";
import { Command } from "cmdk";
import {
  Activity,
  FileCode2,
  FolderOpen,
  History,
  LayoutDashboard,
  Play,
  Plus,
  Search,
  Square,
  Workflow,
  Zap,
} from "lucide-react";
import type { Project } from "../types";

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTest: () => void;
  onStopTest: () => void;
  isRunning: boolean;
  onSelectTab: (tab: string) => void;
  onSelectEngine: (engine: string) => void;
  onSelectScript: (script: string, engine: string) => void;
  projects?: Project[];
  onSelectProject?: (projectId: string) => void;
  onOpenNewSuite?: () => void;
  onOpenSuite?: (script: string, engine: string) => void;
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
  projects = [],
  onSelectProject,
  onOpenNewSuite,
  onOpenSuite,
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Escape" && isOpen) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="loom-modal-backdrop" onClick={onClose}>
      <div
        className="loom-modal loom-command-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        onClick={(event) => event.stopPropagation()}
      >
        <Command label="Quick actions" className="loom-command">
          <div className="loom-command__search">
            <Search aria-hidden="true" size={17} />
            <Command.Input
              placeholder="Type a command or search actions..."
              className="loom-command__input"
              autoFocus
            />
          </div>

          <Command.List className="loom-command__list">
            <Command.Empty className="loom-command__empty">No matching actions found.</Command.Empty>

            <Command.Group heading="Execution" className="loom-command__group">
              {!isRunning ? (
                <Command.Item
                  onSelect={() => {
                    onRunTest();
                    onClose();
                  }}
                  className="loom-command-item"
                >
                  <Play aria-hidden="true" size={16} fill="currentColor" />
                  <span>Start load test</span>
                </Command.Item>
              ) : (
                <Command.Item
                  onSelect={() => {
                    onStopTest();
                    onClose();
                  }}
                  className="loom-command-item loom-command-item--danger"
                >
                  <Square aria-hidden="true" size={16} fill="currentColor" />
                  <span>Stop active test</span>
                </Command.Item>
              )}
            </Command.Group>

            <Command.Group heading="Navigate" className="loom-command__group">
              <Command.Item onSelect={() => { onSelectTab("dashboard"); onClose(); }} className="loom-command-item">
                <LayoutDashboard aria-hidden="true" size={16} />
                <span>Go to dashboard</span>
              </Command.Item>
              <Command.Item onSelect={() => { onSelectTab("flowchart"); onClose(); }} className="loom-command-item">
                <Workflow aria-hidden="true" size={16} />
                <span>Go to visual flow</span>
              </Command.Item>
              <Command.Item onSelect={() => { onSelectTab("runner"); onClose(); }} className="loom-command-item">
                <Zap aria-hidden="true" size={16} />
                <span>Go to test runner</span>
              </Command.Item>
              <Command.Item onSelect={() => { onSelectTab("editor"); onClose(); }} className="loom-command-item">
                <FileCode2 aria-hidden="true" size={16} />
                <span>Go to script editor</span>
              </Command.Item>
              <Command.Item onSelect={() => { onSelectTab("history"); onClose(); }} className="loom-command-item">
                <History aria-hidden="true" size={16} />
                <span>Go to run history</span>
              </Command.Item>
              <Command.Item onSelect={() => { onSelectTab("engines"); onClose(); }} className="loom-command-item">
                <Activity aria-hidden="true" size={16} />
                <span>View engine availability</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Engines" className="loom-command__group">
              <Command.Item onSelect={() => { onSelectEngine("locust"); onClose(); }} className="loom-command-item">
                <span className="loom-command__status" data-status="ready" aria-hidden="true" />
                <span>Select Locust engine</span>
              </Command.Item>
              <Command.Item onSelect={() => { onSelectEngine("goose"); onClose(); }} className="loom-command-item">
                <span className="loom-command__status" data-status="ready" aria-hidden="true" />
                <span>Select Goose engine</span>
              </Command.Item>
              <Command.Item onSelect={() => { onSelectEngine("k6"); onClose(); }} className="loom-command-item">
                <span className="loom-command__status" data-status="warning" aria-hidden="true" />
                <span>Select k6 engine</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Example suites" className="loom-command__group">
              <Command.Item
                onSelect={() => {
                  onSelectScript("examples/locust/basic_test.py", "locust");
                  onSelectTab("runner");
                  onClose();
                }}
                className="loom-command-item"
              >
                <Zap aria-hidden="true" size={16} />
                <span>Load Locust example</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectScript("examples/k6/basic_test.js", "k6");
                  onSelectTab("runner");
                  onClose();
                }}
                className="loom-command-item"
              >
                <Zap aria-hidden="true" size={16} />
                <span>Load k6 example</span>
              </Command.Item>
            </Command.Group>

            {(onOpenNewSuite || projects.length > 0) && (
              <Command.Group heading="Projects" className="loom-command__group">
                {onOpenNewSuite && (
                  <Command.Item
                    onSelect={() => {
                      onOpenNewSuite();
                      onClose();
                    }}
                    className="loom-command-item"
                  >
                    <Plus aria-hidden="true" size={16} />
                    <span>New suite from template</span>
                  </Command.Item>
                )}
                {projects.map((project) => (
                  <Command.Item
                    key={project.id}
                    onSelect={() => {
                      onSelectProject?.(project.id);
                      onClose();
                    }}
                    className="loom-command-item"
                  >
                    <FolderOpen aria-hidden="true" size={16} />
                    <span>Go to project: {project.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {projects.some((project) => project.suites.length > 0) && (
              <Command.Group heading="Suites" className="loom-command__group">
                {projects.flatMap((project) => project.suites).map((suite) => (
                  <Command.Item
                    key={suite.id}
                    onSelect={() => {
                      (onOpenSuite ?? onSelectScript)(suite.scriptPath, suite.engine);
                      onSelectTab("editor");
                      onClose();
                    }}
                    className="loom-command-item"
                  >
                    <FileCode2 aria-hidden="true" size={16} />
                    <span>Open suite: {suite.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <footer className="loom-command-footer">
            <span>Navigate with ↑ ↓ and Enter</span>
            <span>Esc to close</span>
          </footer>
        </Command>
      </div>
    </div>
  );
};
