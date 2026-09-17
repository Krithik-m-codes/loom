export type LicenseTier = "Core" | "Plugin";

export type EngineAvailability =
  | { Ready: { version?: string | null } }
  | { NotInstalled: { install_hint: string } };

export interface EngineInfo {
  id: string;
  display_name: string;
  engine_language: string;
  license: string;
  license_tier: LicenseTier;
  supported_script_languages: string[];
  availability: EngineAvailability;
}

export interface LoadProfile {
  users: number;
  spawn_rate: number;
  duration: string;
}

export interface TargetConfig {
  host: string;
  headers?: Record<string, string>;
}

export interface TestConfig {
  project_name: string;
  engine: string;
  script_path: string;
  load_profile: LoadProfile;
  target: TargetConfig;
}

export type MetricKind =
  | "RequestsTotal"
  | "RequestsPerSecond"
  | "LatencyMs"
  | "ErrorRate"
  | "ActiveUsers"
  | "FailedRequests";

export interface NormalizedMetric {
  timestamp: string;
  engine: string;
  run_id: string;
  metric: MetricKind;
  value: number;
  labels: Record<string, string>;
}

export interface RunLog {
  run_id: string;
  stream: "stdout" | "stderr";
  message: string;
  timestamp: string;
}

export interface RunRecord {
  id: string;
  engine: string;
  project: string;
  config: string;
  started_at: string;
  finished_at?: string | null;
  status: "running" | "finished" | "stopped" | "failed";
  summary?: string | null;
}

export interface TelemetryPoint {
  time: string;
  seconds: number;
  rps: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  users: number;
  errorRate: number;
  failuresPerSec: number;
  totalRequests: number;
}

export interface EndpointStat {
  method: string;
  name: string;
  numRequests: number;
  numFailures: number;
  medianResponseTime: number; // p50
  p90ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  currentRps: number;
  currentFailRps: number;
}

export interface FailureRecord {
  id: string;
  timestamp: string;
  method: string;
  name: string;
  error: string;
  occurrences: number;
}

export interface TestSuite {
  id: string;
  name: string;
  engine: string;
  scriptPath: string;
  config: TestConfig;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  targetHost: string;
  defaultEngine: string;
  createdAt: string;
  suites: TestSuite[];
}
