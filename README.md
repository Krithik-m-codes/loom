# Loom

Loom is a local-first desktop workspace for authoring, running, and inspecting load tests across Locust, Goose, and k6. Its dark engineering-console interface keeps the workflow close to the code: choose an engine, configure a target, run a scenario, and inspect normalized telemetry in one place.

![Loom visual system](public/logo-icon.png)

## What it provides

- A Tauri 2 desktop application built with React and TypeScript.
- A project and scenario workspace, script editor, visual flow authoring, run history, and export controls.
- Engine adapters for Locust, Goose, and k6 that normalize telemetry for a shared Runner view.
- A visual flow builder that produces Locust Python or k6 JavaScript source and sends it to the existing Runner workflow.
- A tokenized, reduced-motion-aware design system protected by `pnpm run audit:design`.

## Engine and license boundary

Loom adapters always invoke engines through a subprocess boundary. Loom does not link an engine into its desktop binary.

| Engine | Script language | Runtime prerequisite |
| --- | --- | --- |
| Locust | Python | Loom can provision pinned Python + Locust in user data, or use an existing PATH install |
| Goose | Rust | Loom can provision a pinned Rust toolchain; native linker/build prerequisites may still be OS-provided |
| k6 | JavaScript | Optional official runtime download after separate AGPL consent, or a user-provided k6 binary |

k6 is an AGPL-licensed plugin-tier engine. Loom never bundles it in the desktop package; a user may choose to download it from its official upstream release after separate AGPL acceptance. See [LICENSES.md](LICENSES.md) for attribution details.

On first launch, accept Loom's terms, then choose Locust and Goose (selected by default) and optionally k6. Runtime installation is separate from the desktop installer so the same user-scope flow works on Windows, macOS, and Linux. A failed or skipped engine does not block creating projects or suites. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for desktop/WebView, project-data, and runtime boundaries.

## Local development

Prerequisites: Node.js 18+, pnpm, Rust 1.80+, and the platform prerequisites required by Tauri.

```bash
pnpm install
pnpm run build
cargo check --workspace
cargo test --workspace
pnpm tauri dev
```

Build a native installer for the current platform with:

```bash
pnpm tauri build
```

Artifacts are emitted below `target/release/bundle/` unless `CARGO_TARGET_DIR` is configured.

## Design verification

```bash
pnpm run audit:design
pnpm test
pnpm run build
```

The audit rejects literal hexadecimal colors in production TSX components, verifies the required Loom design tokens, and requires the reduced-motion guard.

## Container status

The repository includes a Docker-based engine environment under `docker/` and `docker-compose.yml`. It provisions Locust and the Rust toolchain for Cargo-based Goose scenarios. k6 remains a bring-your-own plugin binary: mount it in `./engines` and the container resolves it from `/opt/loom/engines`. The image stays running as an engine environment so a scenario can be launched with `docker compose exec loom ...`; it is not a replacement for the Tauri desktop application and does not expose a supported Loom web API or dashboard service. A self-hosted service should be added as a dedicated headless process with authenticated job, artifact, and telemetry endpoints rather than by packaging the desktop shell into a container.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and contribution guidance. New engines belong in their own `crates/engine-<name>` adapter crate, must implement `engine_core::LoadEngine`, and must preserve the subprocess-only invocation rule.

## License

Loom is dual-licensed under [MIT](LICENSE) or [Apache-2.0](LICENSE-APACHE), at your option.
