# Multi-stage Dockerfile for Loom Self-Hosted Runner & Engine Stack
# Includes Python 3.12 (Locust), Rust toolchain (Goose), and k6 (Plugin tier)

# Stage 1: Build Frontend Assets
FROM node:22-slim AS frontend-builder
WORKDIR /app
RUN npm install -g pnpm@11.22.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Stage 2: Production Engine Runner
FROM debian:bookworm-slim

LABEL maintainer="Loom Team <support@loom-loadtest.dev>"
LABEL description="Self-hosted Loom load testing container with Locust, Goose, and k6 pre-installed"

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PATH="/root/.cargo/bin:/root/.local/bin:${PATH}"

# Install core runtime dependencies, Python, curl, build essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
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

# Install k6 (Plugin tier - BYO binary in container)
RUN gpg -k && \
    gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 && \
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | tee /etc/apt/sources.list.d/k6.list && \
    apt-get update && apt-get install -y k6 && \
    rm -rf /var/lib/apt/lists/*

# Install Rust & Goose CLI (Core tier)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal && \
    /root/.cargo/bin/cargo install goose && \
    rm -rf /root/.cargo/registry /root/.cargo/git

WORKDIR /opt/loom

# Copy example scripts and frontend dist
COPY examples/ /opt/loom/examples/
COPY --from=frontend-builder /app/dist /opt/loom/dist/

# Create data directories for SQLite database and runs
RUN mkdir -p /opt/loom/data /opt/loom/runs

EXPOSE 8080 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD locust --version && k6 version || exit 1

CMD ["locust", "--version"]
