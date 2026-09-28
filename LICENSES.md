# Licenses & Open Source Compliance

Loom is committed to clean, transparent open-source license compliance.

---

## 1. Engine License Matrix

| Engine | Upstream License | Loom License Tier | Packaging Policy | Invocation Model |
|---|---|---|---|---|
| **Locust** | `MIT` | `Core` | Bundled adapter code; user or system Python/locust binary | Subprocess only |
| **Goose** | `MIT OR Apache-2.0` | `Core` | Bundled adapter code; pre-compiled or user cargo binary | Subprocess only |
| **k6** | `AGPL-3.0-only` | `Plugin` | **Never bundled**. Optional direct upstream download only after separate user consent, or user-provided binary | Subprocess only |

---

## 2. Copyleft Isolation & The Subprocess Rule

- **No Linking**: Loom never links against k6 or any other AGPL/GPL library either statically or dynamically.
- **Strict Process Boundary**: All interaction occurs strictly across the operating system process boundary via command-line arguments, environment variables, stdout/stderr pipes, and filesystem output files.
- **Explicit k6 Consent**: Loom does not bundle k6. An optional install downloads only the pinned official upstream artifact after the user separately accepts the AGPL-3.0 terms; Loom does not accept that license on the user's behalf. Users can also install and resolve k6 independently.
- **Adapter Exemption**: The `engine-k6` Rust adapter crate contains original interface code written for Loom and is licensed permissively. It does not contain code derived from k6.
