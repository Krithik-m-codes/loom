//! Shared schema and adapter contracts for source-preserving load scenarios.

mod migrate;
mod model;
mod registry;
mod validate;

pub use migrate::{migrate_scenario_document, migrate_visual_nodes};
pub use model::*;
pub use registry::{ScenarioEngineAdapter, ScenarioRegistry};
pub use validate::validate_scenario_document;
