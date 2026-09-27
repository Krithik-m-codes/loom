import type { Project, TestConfig, TestSuite } from "../types";

export interface ProjectState {
  projects: Project[];
  persistedProjects: unknown[];
  activeProjectId: string;
  shouldPersist: boolean;
}

const SHIPPED_DEMO_IDS = new Set(["proj-ecommerce", "proj-gateway"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function isRenderableProject(value: unknown): value is Project {
  if (!isRecord(value) || typeof value.id !== "string" ||
      typeof value.name !== "string" || typeof value.targetHost !== "string" ||
      typeof value.defaultEngine !== "string" || !Array.isArray(value.suites)) return false;

  return value.suites.every((suite: unknown) => {
    if (!isRecord(suite) || typeof suite.id !== "string" ||
        typeof suite.name !== "string" || typeof suite.engine !== "string" ||
        typeof suite.scriptPath !== "string" || !isRecord(suite.config)) return false;
    const config = suite.config;
    return typeof config.project_name === "string" &&
      typeof config.engine === "string" && typeof config.script_path === "string" &&
      isRecord(config.load_profile) &&
      typeof config.load_profile.users === "number" &&
      typeof config.load_profile.spawn_rate === "number" &&
      typeof config.load_profile.duration === "string" &&
      isRecord(config.target) && typeof config.target.host === "string";
  });
}

export function loadProjectState(savedProjects: string | null, savedActiveId: string | null): ProjectState {
  if (savedProjects === null) {
    return { projects: [], persistedProjects: [], activeProjectId: "", shouldPersist: true };
  }

  try {
    const parsed: unknown = JSON.parse(savedProjects);
    if (!Array.isArray(parsed)) {
      return { projects: [], persistedProjects: [], activeProjectId: "", shouldPersist: false };
    }

    const persistedProjects = parsed.filter((value) =>
      !(isRecord(value) && typeof value.id === "string" && SHIPPED_DEMO_IDS.has(value.id)),
    );
    const projects = persistedProjects.filter(isRenderableProject);
    const activeProjectId = projects.some((project) => project.id === savedActiveId)
      ? savedActiveId!
      : (projects[0]?.id ?? "");

    return {
      projects,
      persistedProjects,
      activeProjectId,
      shouldPersist: persistedProjects.length !== parsed.length || activeProjectId !== (savedActiveId ?? ""),
    };
  } catch {
    return { projects: [], persistedProjects: [], activeProjectId: "", shouldPersist: false };
  }
}

export function configForSuite(suite: TestSuite): TestConfig {
  return { ...suite.config, engine: suite.engine, script_path: suite.scriptPath };
}

export function projectConfigForSelection(projects: Project[], activeProjectId: string, engineId?: string): TestConfig {
  const project = projects.find((entry) => entry.id === activeProjectId);
  const suite = engineId
    ? project?.suites.find((entry) => entry.engine === engineId)
    : project?.suites[0];
  if (suite) return configForSuite(suite);

  return {
    project_name: project?.name ?? "",
    engine: engineId ?? project?.defaultEngine ?? "locust",
    script_path: "",
    load_profile: { users: 1, spawn_rate: 1, duration: "30s" },
    target: { host: project?.targetHost ?? "" },
  };
}
