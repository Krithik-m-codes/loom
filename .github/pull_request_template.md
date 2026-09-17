## Description
<!-- Provide a clear, concise summary of the changes introduced in this PR. -->

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] ⚡ Performance improvement
- [ ] 📚 Documentation update
- [ ] 🔌 New Engine Adapter (`crates/engine-<name>`)
- [ ] 🎨 UI / Styling enhancement

## Architecture & License Compliance
- [ ] Engines are invoked strictly via subprocess (`tokio::process::Command`).
- [ ] No engine binary or copyleft code (GPL/AGPL) is embedded or linked into the Loom binary.
- [ ] If adding a copyleft engine (e.g. k6), it is designated as `LicenseTier::Plugin`.

## Checklist
- [ ] My code follows the project's coding standards (`cargo fmt` and TypeScript strict mode).
- [ ] I have added unit tests for my changes.
- [ ] All Rust tests pass (`cargo test --workspace`).
- [ ] Frontend builds cleanly with zero errors (`pnpm run build`).
- [ ] I have updated relevant documentation if necessary.
