use rusqlite::{Connection, Result};

/// Initialize the database schema. Idempotent — safe to call on every launch.
pub fn initialize(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS runs (
            id          TEXT PRIMARY KEY,
            engine      TEXT NOT NULL,
            project     TEXT NOT NULL,
            config_json TEXT NOT NULL,
            started_at  TEXT NOT NULL,
            finished_at TEXT,
            status      TEXT NOT NULL DEFAULT 'pending',
            summary_json TEXT
        );

        CREATE TABLE IF NOT EXISTS metrics (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id      TEXT NOT NULL REFERENCES runs(id),
            timestamp   TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            value       REAL NOT NULL,
            labels_json TEXT,
            FOREIGN KEY (run_id) REFERENCES runs(id)
        );

        CREATE INDEX IF NOT EXISTS idx_metrics_run_id ON metrics(run_id);
        CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(run_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_runs_engine ON runs(engine);
        "
    )
}
