# Docker image for Loom's headless engine environment.
# It provides Locust plus the Rust toolchain needed for Cargo-based Goose scenarios.
# k6 remains a user-supplied plugin binary to preserve its licence boundary.

# Production engine runner
FROM debian:bookworm-slim

LABEL maintainer="Loom Team <support@loom-loadtest.dev>"
LABEL description="Headless Loom engine environment with Locust and Cargo-based Goose support"

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/loom/engines:/root/.cargo/bin:/root/.local/bin:${PATH}"

# Install core runtime dependencies, Python, curl, build essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    sqlite3 \
    pkg-config \
    libssl-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Locust (Core tier)
RUN pip3 install --no-cache-dir --break-system-packages locust

# Install Rust for user-owned Cargo-based Goose scenario projects. Goose is resolved
# into each generated scenario project and run as that project's subprocess.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal && \
    rm -rf /root/.cargo/registry /root/.cargo/git

WORKDIR /opt/loom

# Copy example scripts
COPY examples/ /opt/loom/examples/

# Create data directories for SQLite database, runs, and user-provided plugin binaries.
RUN mkdir -p /opt/loom/data /opt/loom/runs /opt/loom/engines

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD locust --version && cargo --version || exit 1

# This is an engine environment, not a Loom web service. Override the command to
# launch a run, or use Docker Compose and execute a scenario inside the container.
CMD ["sleep", "infinity"]
