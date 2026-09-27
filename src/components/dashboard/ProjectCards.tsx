import type { EngineInfo, Project } from "../../types";

interface ProjectCardsProps {
  projects: Project[];
  engines: EngineInfo[];
  onSelectProject: (id: string) => void;
  runCounts?: Record<string, number>;
  lastStatus?: Record<string, string>;
}

export const ProjectCards = ({ projects, engines, onSelectProject, runCounts = {}, lastStatus = {} }: ProjectCardsProps) => {
  return (
    <div className="loom-project-cards">
      {projects.map((project) => {
        const engine = engines.find((entry) => entry.id === project.defaultEngine);
        const ready = engine ? "Ready" in engine.availability : false;
        const runCount = runCounts[project.id] ?? 0;
        const status = lastStatus[project.id] ?? "never ran";
        const suiteCount = project.suites.length;
        return (
          <article
            key={project.id}
            className="loom-project-card"
            onClick={() => onSelectProject(project.id)}
          >
            <span className="loom-project-card__header">
              <strong className="loom-truncate">{project.name}</strong>
              <span
                className="loom-project-card__engine-dot"
                data-ready={ready}
                title={ready ? "Engine ready" : "Engine not installed"}
                aria-label={ready ? "Engine ready" : "Engine not installed"}
              />
            </span>
            <span className="loom-project-card__meta">
              {suiteCount} suite{suiteCount === 1 ? "" : "s"} · {runCount} run{runCount === 1 ? "" : "s"}
            </span>
            <span className="loom-project-card__badge">{status}</span>
            <button
              type="button"
              className="loom-project-card__open"
              aria-label="Open project"
              onClick={(event) => { event.stopPropagation(); onSelectProject(project.id); }}
            >
              Open
            </button>
          </article>
        );
      })}
    </div>
  );
};
