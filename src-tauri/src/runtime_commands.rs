use engine_core::{EngineRuntime, RuntimeContext};
use runtime_manager::{
    runtime_name, InstallSelection, InstallState, K6Consent, RuntimeId, RuntimeManager,
};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct RuntimeCommandState {
    pub manager: Option<Arc<RuntimeManager>>,
    pub init_error: Option<String>,
    active: Arc<Mutex<Option<CancellationToken>>>,
    pub runtime_context: Arc<std::sync::RwLock<RuntimeContext>>,
}

impl RuntimeCommandState {
    pub fn new(
        root: Result<std::path::PathBuf, String>,
        runtime_context: Arc<std::sync::RwLock<RuntimeContext>>,
    ) -> Self {
        let state = match root {
            Ok(root) => Self {
                manager: Some(Arc::new(RuntimeManager::new(root))),
                init_error: None,
                active: Arc::new(Mutex::new(None)),
                runtime_context,
            },
            Err(error) => Self {
                manager: None,
                init_error: Some(error),
                active: Arc::new(Mutex::new(None)),
                runtime_context,
            },
        };
        state.refresh_runtime_context();
        state
    }

    fn refresh_runtime_context(&self) {
        let Some(manager) = &self.manager else { return };
        let Ok(mut context) = self.runtime_context.write() else {
            return;
        };
        context.clear();
        for runtime in [RuntimeId::Locust, RuntimeId::Goose, RuntimeId::K6] {
            if let Ok(resolved) = manager.resolve(runtime) {
                context.set(
                    runtime_name(runtime),
                    EngineRuntime {
                        executable: resolved.executable,
                        env: resolved.env.into_iter().collect(),
                    },
                );
            }
        }
    }

    fn start(&self, token: CancellationToken) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Runtime state is unavailable")?;
        if active.is_some() {
            return Err("A runtime installation is already running".into());
        }
        *active = Some(token);
        Ok(())
    }

    fn finish(&self) {
        if let Ok(mut active) = self.active.lock() {
            *active = None;
        }
    }

    fn cancel(&self) -> Result<(), String> {
        let active = self
            .active
            .lock()
            .map_err(|_| "Runtime state is unavailable")?;
        let token = active
            .as_ref()
            .ok_or("No runtime installation is running")?;
        token.cancel();
        Ok(())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEvent {
    runtime: RuntimeId,
    state: InstallState,
    error: Option<String>,
}

#[tauri::command]
pub fn get_runtime_status(state: tauri::State<'_, RuntimeCommandState>) -> Vec<InstallState> {
    [RuntimeId::Locust, RuntimeId::Goose, RuntimeId::K6]
        .into_iter()
        .map(|runtime| match &state.manager {
            Some(manager) => manager
                .status(runtime)
                .unwrap_or_else(|error| InstallState::Failed {
                    stage: "status".into(),
                    message: error.to_string(),
                }),
            None => InstallState::Failed {
                stage: "initialize".into(),
                message: state
                    .init_error
                    .clone()
                    .unwrap_or_else(|| "Runtime manager unavailable".into()),
            },
        })
        .collect()
}

#[tauri::command]
pub fn install_runtimes(
    app: AppHandle,
    state: tauri::State<'_, RuntimeCommandState>,
    selection: InstallSelection,
    k6_consent: Option<K6Consent>,
) -> Result<(), String> {
    let manager = state.manager.clone().ok_or_else(|| {
        state
            .init_error
            .clone()
            .unwrap_or_else(|| "Runtime manager unavailable".into())
    })?;
    let token = CancellationToken::new();
    state.start(token.clone())?;
    let command_state = state.inner().clone();
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel();
    tauri::async_runtime::spawn(async move {
        let progress_app = app.clone();
        let progress_task = tokio::spawn(async move {
            while let Some(update) = progress_rx.recv().await {
                let _ = progress_app.emit("runtime-progress", update);
            }
        });
        let summary = manager
            .install_with_progress(selection, k6_consent, Some(progress_tx), token)
            .await;
        command_state.refresh_runtime_context();
        for (runtime, result) in summary.results {
            let event = match result {
                Ok(state) => RuntimeEvent {
                    runtime,
                    state,
                    error: None,
                },
                Err(error) => RuntimeEvent {
                    runtime,
                    state: manager.status(runtime).unwrap_or(InstallState::Missing),
                    error: Some(error.to_string()),
                },
            };
            let event_name = if event.error.is_some() {
                "runtime-error"
            } else {
                "runtime-ready"
            };
            let _ = app.emit(event_name, event);
        }
        let _ = progress_task.await;
        command_state.finish();
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_runtime_installation(
    state: tauri::State<'_, RuntimeCommandState>,
) -> Result<(), String> {
    state.cancel()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn unavailable_runtime_manager_is_a_non_panicking_failed_status() {
        let state = RuntimeCommandState::new(
            Err("app data unavailable".into()),
            Arc::new(std::sync::RwLock::new(RuntimeContext::default())),
        );
        assert!(state.manager.is_none());
        assert_eq!(state.init_error.as_deref(), Some("app data unavailable"));
    }

    #[test]
    fn installation_state_rejects_duplicates_and_cancels_active_token() {
        let root = tempdir().unwrap();
        let state = RuntimeCommandState::new(
            Ok(root.path().to_path_buf()),
            Arc::new(std::sync::RwLock::new(RuntimeContext::default())),
        );
        let token = CancellationToken::new();
        state.start(token.clone()).unwrap();
        assert!(state.start(CancellationToken::new()).is_err());
        state.cancel().unwrap();
        assert!(token.is_cancelled());
        state.finish();
        assert!(state.start(CancellationToken::new()).is_ok());
    }
}
