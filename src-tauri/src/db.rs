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

        CREATE TABLE IF NOT EXISTS projects (
            id             TEXT PRIMARY KEY,
            name           TEXT NOT NULL,
            description    TEXT NOT NULL DEFAULT '',
            target_host    TEXT NOT NULL,
            default_engine TEXT NOT NULL,
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS test_suites (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            engine      TEXT NOT NULL,
            script_path TEXT NOT NULL,
            config_json TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS visual_flows (
            suite_id   TEXT PRIMARY KEY REFERENCES test_suites(id) ON DELETE CASCADE,
            nodes_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_suites_project ON test_suites(project_id);
        "
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn creates_project_tables_idempotently() {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn).unwrap();
        initialize(&conn).unwrap();
        for table in ["projects", "test_suites", "visual_flows"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    rusqlite::params![table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
    }

    #[test]
    fn cascade_delete_project_removes_suites_and_flows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        initialize(&conn).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, target_host, default_engine) VALUES ('p1', 'P', 'http://localhost:8080', 'locust')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO test_suites (id, project_id, name, engine, script_path, config_json) VALUES ('s1', 'p1', 'S', 'locust', 'x.py', '{}')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO visual_flows (suite_id, nodes_json) VALUES ('s1', '[]')",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM projects WHERE id = 'p1'", []).unwrap();
        let suites: i64 = conn.query_row("SELECT COUNT(*) FROM test_suites", [], |r| r.get(0)).unwrap();
        let flows: i64 = conn.query_row("SELECT COUNT(*) FROM visual_flows", [], |r| r.get(0)).unwrap();
        assert_eq!(suites, 0);
        assert_eq!(flows, 0);
    }
}
