# Licenses & Open Source Compliance

Loom is committed to clean, transparent open-source license compliance.

---

## 1. Engine License Matrix

| Engine | Upstream License | Loom License Tier | Packaging Policy | Invocation Model |
|---|---|---|---|---|
| **Locust** | `MIT` | `Core` | Bundled adapter code; user or system Python/locust binary | Subprocess only |
| **Goose** | `MIT OR Apache-2.0` | `Core` | Bundled adapter code; pre-compiled or user cargo binary | Subprocess only |
| **k6** | `AGPL-3.0-only` | `Plugin` | **Never bundled**. User brings their own binary (BYO binary) | Subprocess only |

---

## 2. Copyleft Isolation & The Subprocess Rule

- **No Linking**: Loom never links against k6 or any other AGPL/GPL library either statically or dynamically.
- **Strict Process Boundary**: All interaction occurs strictly across the operating system process boundary via command-line arguments, environment variables, stdout/stderr pipes, and filesystem output files.
- **No Automatic Downloading**: Loom never automatically downloads or installs copyleft binaries behind the user's back. Users are provided with clear, manual installation commands (e.g. `winget install k6.k6` or `brew install k6`).
- **Adapter Exemption**: The `engine-k6` Rust adapter crate contains original interface code written for Loom and is licensed permissively. It does not contain code derived from k6.
