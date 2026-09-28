use runtime_manager::probe::version_matches;

#[test]
fn exact_version_probe_does_not_accept_a_longer_prefix_match() {
    assert!(!version_matches("locust 2.46.60", "2.46.6"));
    assert!(version_matches("locust 2.46.6", "2.46.6"));
    assert!(version_matches("k6 v2.3.0", "v2.3.0"));
}
