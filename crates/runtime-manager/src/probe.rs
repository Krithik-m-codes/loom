/// Match a reported version as a complete token rather than a prefix.
/// Upstream tools commonly prefix their version with `v`, which is normalized.
pub fn version_matches(output: &str, expected: &str) -> bool {
    let expected = expected.trim_start_matches('v');
    output
        .split_whitespace()
        .map(|token| {
            token
                .trim_matches(|ch: char| !ch.is_ascii_alphanumeric() && ch != '.' && ch != '-')
                .trim_start_matches('v')
        })
        .any(|token| token == expected)
}
