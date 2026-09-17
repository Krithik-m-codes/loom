# Loom — Command Runner

# Default recipe: build everything
default: build

# Run Loom in desktop development mode
dev:
    cargo tauri dev

# Build production desktop application
build:
    pnpm run build
    cargo build --workspace --release

# Run all unit and integration tests
test:
    cargo test --workspace

# Run TypeScript checks and frontend linting
lint:
    pnpm run build
    cargo check --workspace
