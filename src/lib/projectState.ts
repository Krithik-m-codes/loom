import type { Project, TestConfig, TestSuite } from "../types";

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
