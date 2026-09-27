import templates from "./templates.json";

export interface StarterTemplate {
  id: string; name: string; description: string;
  script: string; config: { users: number; spawn_rate: number; duration: string };
}

export function getTemplatesForEngine(engine: string): StarterTemplate[] {
  const all = templates as Record<string, StarterTemplate[]>;
  return all[engine] ?? [];
}
