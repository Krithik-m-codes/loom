import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { RuntimeId, RuntimeProgress, RuntimeStatus } from "../types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface RuntimeSelection {
  locust: boolean;
  goose: boolean;
  k6: boolean;
}

export interface K6Consent {
  acceptedAt: string;
  license: "AGPL-3.0-only";
}

export async function getRuntimeStatus(): Promise<RuntimeStatus[]> {
  if (!isTauri) return [{ status: "missing" }, { status: "missing" }, { status: "missing" }];
  return invoke<RuntimeStatus[]>("get_runtime_status");
}

export async function installRuntimes(selection: RuntimeSelection, k6Consent?: K6Consent): Promise<void> {
  if (!isTauri) throw new Error("Runtime installation is available in the Loom desktop app.");
  return invoke("install_runtimes", { selection, k6Consent: k6Consent ?? null });
}

export async function cancelRuntimeInstallation(): Promise<void> {
  if (!isTauri) return;
  return invoke("cancel_runtime_installation");
}

export async function subscribeToRuntimeProgress(callback: (progress: RuntimeProgress) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<RuntimeProgress>("runtime-progress", ({ payload }) => callback(payload));
}

export async function subscribeToRuntimeReady(callback: (event: { runtime: RuntimeId; state: RuntimeStatus }) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<{ runtime: RuntimeId; state: RuntimeStatus }>("runtime-ready", ({ payload }) => callback(payload));
}

export async function subscribeToRuntimeError(callback: (error: { runtime: RuntimeId; message?: string }) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<{ runtime: RuntimeId; error?: string }>("runtime-error", ({ payload }) => callback({ runtime: payload.runtime, message: payload.error }));
}
