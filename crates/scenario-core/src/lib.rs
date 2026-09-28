//! Shared schema and adapter contracts for source-preserving load scenarios.

mod migrate;
mod model;
pub mod parsers;
mod registry;
mod validate;

pub use migrate::{migrate_scenario_document, migrate_visual_nodes};
pub use model::*;
pub use parsers::{parse_engine_config, parse_goose, parse_k6, parse_locust};
pub use registry::{ScenarioEngineAdapter, ScenarioRegistry};
pub use validate::validate_scenario_document;
