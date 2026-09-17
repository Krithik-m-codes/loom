//! Loom Goose Example — High-Throughput Native Rust Load Test

use goose::prelude::*;

#[tokio::main]
async fn main() -> Result<(), GooseError> {
    GooseAttack::initialize()?
        .register_scenario(
            scenario!("BrowseUsers")
                .register_transaction(transaction!(loadtest_index))
                .register_transaction(transaction!(loadtest_api)),
        )
        .execute()
        .await?;

    Ok(())
}

async fn loadtest_index(user: &mut GooseUser) -> TransactionResult {
    let _ = user.get("/").await?;
    Ok(())
}

async fn loadtest_api(user: &mut GooseUser) -> TransactionResult {
    let _ = user.get("/api/v1/status").await?;
    Ok(())
}
