# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineers and performance-test practitioners who need to author, run, and inspect load simulations locally without switching among separate engine-specific tools.

## Product Purpose

Loom is a local-first desktop application for creating projects, configuring, running, and inspecting load tests with Locust, Goose, and k6. It should make an active test easy to understand and control while keeping the underlying scripts and engine behavior intact.

## Positioning

One desktop workspace presents multiple load-testing engines through a consistent project, runner, history, editor, and visual-flow experience while invoking each engine across a subprocess boundary.

## Operating Context

Users work with Python Locust scripts, JavaScript/TypeScript k6 scripts, and Rust Cargo-based Goose workspaces. They configure hosts and load profiles, follow real-time telemetry and logs, rerun past simulations, and create projects from desktop operating systems. The requested product direction includes Windows, macOS, and Linux support, with later runtime-management and self-hosting work planned separately from the present visual migration.

## Capabilities and Constraints

- Existing desktop stack: Tauri 2, React, TypeScript, Rust, SQLite, and engine adapter crates.
- Existing flows to preserve: project and script selection, project creation, engine selection, script editing, visual-flow export, test start/stop, history reruns, command palette, and onboarding.
- Engines must always be invoked as subprocesses; no engine is linked or embedded in Loom's binary.
- The current scope is branding and visual UX only. Runtime provisioning, installer choices, Docker control-plane architecture, and release hardening are deliberately deferred follow-on projects.

## Brand Commitments

- Product name: Loom.
- Use the user-provided `public/logo-icon.png` as the canonical brand mark.
- The user-approved brand direction is a dark, precise engineering-console experience for multi-engine load testing.

## Evidence on Hand

- Product source, existing engine adapters, user workflows, and examples are in this repository.
- The supplied logo asset is `public/logo-icon.png`.
- No customer testimonials, commercial metrics, or external proof claims were supplied; future work must not fabricate them.

## Product Principles

1. Preserve real engine and project behavior while making complex test state legible at a glance.
2. Keep the core path local, fast, and useful without requiring a cloud service.
3. Make engine-specific differences explicit instead of flattening their configuration models.
4. Favor an accessible, keyboard-capable engineering workspace over decorative novelty.
5. Retain strict process boundaries around external load engines and user projects.

## Accessibility & Inclusion

The application must remain keyboard-operable, communicate state with text and icons as well as color, preserve visible focus, support reduced-motion preferences, and remain legible across the supported desktop window sizes.
