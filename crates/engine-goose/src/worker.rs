use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

/// Embedded native load generation engine for Goose mode.
/// Runs as a subprocess of Loom when invoked with `--loom-worker goose`.
pub fn run_worker(args: &[String]) {
    let mut host = "http://localhost:8080".to_string();
    let mut users: usize = 10;
    let mut spawn_rate: usize = 2;
    let mut duration_secs: u64 = 30;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--host" => {
                if i + 1 < args.len() {
                    host = args[i + 1].clone();
                    i += 1;
                }
            }
            "--users" => {
                if i + 1 < args.len() {
                    if let Ok(u) = args[i + 1].parse() {
                        users = u;
                    }
                    i += 1;
                }
            }
            "--spawn-rate" | "--hatch-rate" => {
                if i + 1 < args.len() {
                    if let Ok(r) = args[i + 1].parse() {
                        spawn_rate = r;
                    }
                    i += 1;
                }
            }
            "--duration" | "--run-time" => {
                if i + 1 < args.len() {
                    let d_str = args[i + 1].trim_end_matches('s');
                    if let Ok(d) = d_str.parse() {
                        duration_secs = d;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to build Tokio runtime for Goose worker");

    rt.block_on(async move {
        execute_load_test(host, users, spawn_rate, duration_secs).await;
    });
}

async fn execute_load_test(host: String, users: usize, spawn_rate: usize, duration_secs: u64) {
    println!(
        "[Loom Goose Native Engine] Starting embedded load test for {}s targeting {}",
        duration_secs, host
    );
    std::io::Write::flush(&mut std::io::stdout()).ok();

    // Parse host URL into address and path
    let (addr, request_path, host_header) = parse_url_target(&host);

    let running = Arc::new(AtomicBool::new(true));
    let total_requests = Arc::new(AtomicU64::new(0));
    let total_failures = Arc::new(AtomicU64::new(0));
    let active_users = Arc::new(AtomicU64::new(0));
    let recent_latencies = Arc::new(Mutex::new(Vec::<f64>::new()));

    // Spawn stats reporter loop (every 1 second)
    let rep_running = Arc::clone(&running);
    let rep_reqs = Arc::clone(&total_requests);
    let rep_fails = Arc::clone(&total_failures);
    let rep_users = Arc::clone(&active_users);
    let rep_lats = Arc::clone(&recent_latencies);

    let reporter_handle = tokio::spawn(async move {
        let mut last_reqs: u64 = 0;
        let mut last_fails: u64 = 0;
        let mut interval = tokio::time::interval(Duration::from_secs(1));

        while rep_running.load(Ordering::Relaxed) {
            interval.tick().await;

            let cur_reqs = rep_reqs.load(Ordering::Relaxed);
            let cur_fails = rep_fails.load(Ordering::Relaxed);
            let cur_users = rep_users.load(Ordering::Relaxed);

            let rps = (cur_reqs.saturating_sub(last_reqs)) as f64;
            let errors = (cur_fails.saturating_sub(last_fails)) as f64;
            last_reqs = cur_reqs;
            last_fails = cur_fails;

            // Calculate P95 latency
            let mut lats = {
                let mut guard = rep_lats.lock().await;
                let copy = guard.clone();
                guard.clear();
                copy
            };

            let p95 = if !lats.is_empty() {
                lats.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let idx = ((lats.len() as f64) * 0.95).floor() as usize;
                lats[idx.min(lats.len() - 1)]
            } else {
                15.0
            };

            // Format standard Goose output line
            println!(
                "Users: {} | RPS: {:.1} | Failures: {} | P95: {:.1}ms",
                cur_users, rps, errors, p95
            );
            std::io::Write::flush(&mut std::io::stdout()).ok();
        }
    });

    // Spawn workers with spawn rate
    let spawn_delay_ms = if spawn_rate > 0 {
        1000 / spawn_rate as u64
    } else {
        100
    };

    for _ in 0..users {
        if !running.load(Ordering::Relaxed) {
            break;
        }

        active_users.fetch_add(1, Ordering::Relaxed);
        let u_running = Arc::clone(&running);
        let u_reqs = Arc::clone(&total_requests);
        let u_fails = Arc::clone(&total_failures);
        let u_lats = Arc::clone(&recent_latencies);
        let u_addr = addr.clone();
        let u_path = request_path.clone();
        let u_host_header = host_header.clone();

        tokio::spawn(async move {
            while u_running.load(Ordering::Relaxed) {
                let start = Instant::now();
                let success = make_request(&u_addr, &u_path, &u_host_header).await;
                let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

                u_reqs.fetch_add(1, Ordering::Relaxed);
                if !success {
                    u_fails.fetch_add(1, Ordering::Relaxed);
                }

                {
                    let mut guard = u_lats.lock().await;
                    if guard.len() < 500 {
                        guard.push(elapsed_ms);
                    }
                }

                // Fast load interval
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        });

        tokio::time::sleep(Duration::from_millis(spawn_delay_ms)).await;
    }

    // Wait for duration to complete
    tokio::time::sleep(Duration::from_secs(duration_secs)).await;
    running.store(false, Ordering::Relaxed);

    let _ = reporter_handle.await;
    let final_reqs = total_requests.load(Ordering::Relaxed);
    let final_fails = total_failures.load(Ordering::Relaxed);

    println!(
        "[Loom Goose Native Engine] Run complete. Total requests: {}, Failures: {}",
        final_reqs, final_fails
    );
    std::io::Write::flush(&mut std::io::stdout()).ok();
}

fn parse_url_target(url: &str) -> (String, String, String) {
    let clean = url
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let parts: Vec<&str> = clean.splitn(2, '/').collect();
    let host_and_port = parts[0];
    let path = if parts.len() > 1 && !parts[1].is_empty() {
        format!("/{}", parts[1])
    } else {
        "/".to_string()
    };

    let addr = if host_and_port.contains(':') {
        host_and_port.to_string()
    } else {
        format!("{}:80", host_and_port)
    };

    let host_header = host_and_port
        .split(':')
        .next()
        .unwrap_or("localhost")
        .to_string();
    (addr, path, host_header)
}

async fn make_request(addr: &str, path: &str, host_header: &str) -> bool {
    // Attempt TCP connect and HTTP/1.1 request
    match tokio::time::timeout(Duration::from_millis(800), TcpStream::connect(addr)).await {
        Ok(Ok(mut stream)) => {
            let req = format!(
                "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\nUser-Agent: LoomGoose/0.1\r\n\r\n",
                path, host_header
            );
            if stream.write_all(req.as_bytes()).await.is_err() {
                return false;
            }
            let mut buf = [0u8; 128];
            stream.read(&mut buf).await.is_ok()
        }
        _ => false, // Connection refused or timeout
    }
}
