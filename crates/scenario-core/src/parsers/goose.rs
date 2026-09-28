use serde_json::{Map, Value};

use crate::{EngineConfigFile, ScenarioDiagnostic};

use super::{config_result, error, info, warning};

const PROFILE_KEYS: &[&str] = &["users", "hatch_rate", "duration", "host"];

pub(super) fn parse_config(source: &EngineConfigFile) -> crate::ConfigParseResult {
    let mut diagnostics = Vec::<ScenarioDiagnostic>::new();
    let mut recognized = Map::new();
    if source.format != "loom-goose-toml" {
        diagnostics.push(error(
            "GOOSE_PROFILE_FORMAT_INVALID",
            "Goose run settings are Loom-owned profiles, not a native Goose config file.",
        ));
        return config_result(source, Value::Null, diagnostics);
    }
    match toml::from_str::<toml::Value>(&source.content) {
        Ok(toml) => {
            if let Some(table) = toml.as_table() {
                for (key, value) in table {
                    if PROFILE_KEYS.contains(&key.as_str()) {
                        recognized.insert(key.clone(), toml_to_json(value));
                    } else {
                        diagnostics.push(warning("CONFIG_UNKNOWN_KEY", format!("Unknown Loom Goose profile key '{key}' is retained in the original file.")));
                    }
                }
            }
        }
        Err(parse_error) => diagnostics.push(error("CONFIG_PARSE_ERROR", parse_error.to_string())),
    }
    diagnostics.push(warning("GOOSE_PROFILE_NOT_NATIVE_CONFIG", "This Loom-owned profile maps settings to Goose CLI arguments; it is not a Goose-native config file."));
    if !recognized.is_empty() {
        diagnostics.push(info("ENGINE_OPTION_PRECEDENCE", "Explicit Goose CLI arguments supplied by Loom take precedence over defaults in the scenario source."));
    }
    config_result(source, Value::Object(recognized), diagnostics)
}

fn toml_to_json(value: &toml::Value) -> Value {
    match value {
        toml::Value::String(value) => Value::String(value.clone()),
        toml::Value::Integer(value) => Value::Number((*value).into()),
        toml::Value::Float(value) => serde_json::Number::from_f64(*value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        toml::Value::Boolean(value) => Value::Bool(*value),
        toml::Value::Datetime(value) => Value::String(value.to_string()),
        toml::Value::Array(values) => Value::Array(values.iter().map(toml_to_json).collect()),
        toml::Value::Table(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (key.clone(), toml_to_json(value)))
                .collect(),
        ),
    }
}
