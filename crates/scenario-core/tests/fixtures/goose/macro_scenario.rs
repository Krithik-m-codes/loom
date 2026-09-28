use goose::prelude::*;

async fn browse(user: &mut GooseUser) -> TransactionResult {
    let account = user.get("/health").await?;
    get!("/accounts/42", account);
    transaction_end!("custom_macro_flow");
    Ok(())
}

fn register() -> GooseAttack {
    GooseAttack::initialize()?
        .register_scenario(scenario!(browse).set_weight(3))
        .register_transaction(transaction!(dynamic_transaction))
}
