# Loom End User License Agreement & Terms of Service

**Effective Date:** September 17, 2026

PLEASE READ THIS AGREEMENT CAREFULLY BEFORE INSTALLING OR USING LOOM.

## 1. Acceptance of Terms
By downloading, installing, or using Loom ("Software"), you agree to be bound by the terms of this Agreement. If you do not agree with the terms, do not install or use the Software.

## 2. Permitted Use & Responsible Load Testing
Loom is a local-first load testing orchestration platform. You agree to:
- Only perform load tests against systems, APIs, and servers that you own, operate, or have explicit written permission to test.
- Not use Loom to initiate unauthorized Denial of Service (DoS) attacks or degrade third-party infrastructure.
- Comply with all local, state, and international laws regarding cybersecurity and computer misuse.

## 3. Subprocess-Only Engine License Policy
- **Permissive Core Engines (Locust, Goose)**: Core adapters are licensed under MIT / Apache-2.0.
- **Copyleft Plugin Engines (k6)**: k6 is licensed under AGPL-3.0-only. Loom communicates with k6 strictly across standard operating system process boundaries. Loom does not bundle, distribute, or link against k6 binaries. Users provide their own binary installations.

## 4. Local-First & Privacy Guarantee
Loom operates strictly on your local machine. All test configurations, scripts, and performance telemetry are stored locally in your SQLite database. Loom transmits zero telemetry or user data to external servers.

## 5. Disclaimer of Warranty
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES, OR SYSTEM OUTAGES ARISING FROM THE USE OF THIS SOFTWARE.
