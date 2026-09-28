use serde_json::{Map, Value};

use crate::{EngineConfigFile, ScenarioDiagnostic};

use super::{config_result, error, info, warning};

const LOCUST_KEYS: &[&str] = &[
    "host",
    "users",
    "spawn-rate",
    "spawn_rate",
    "run-time",
    "run_time",
    "headless",
    "csv",
    "locustfile",
];

pub(super) fn parse_config(source: &EngineConfigFile) -> crate::ConfigParseResult {
    let mut diagnostics = Vec::<ScenarioDiagnostic>::new();
    let mut recognized = Map::new();
    let parsed = match source.format.as_str() {
        "locust-conf" => parse_ini(&source.content),
        "toml" => parse_toml(&source.content),
        _ => Err(format!(
            "Unsupported Locust config format '{}'.",
            source.format
        )),
    };
    match parsed {
        Ok(table) => {
            for (key, value) in table {
                let canonical = key.replace('_', "-");
                if LOCUST_KEYS.contains(&key.as_str()) || LOCUST_KEYS.contains(&canonical.as_str())
                {
                    recognized.insert(canonical, value);
                } else {
                    diagnostics.push(warning(
                        "CONFIG_UNKNOWN_KEY",
                        format!(
                            "Unknown Locust option '{key}' is kept in the original config file."
                        ),
                    ));
                }
            }
        }
        Err(message) => diagnostics.push(error("CONFIG_PARSE_ERROR", message)),
    }
    if !recognized.is_empty() {
        diagnostics.push(info(
            "ENGINE_OPTION_PRECEDENCE",
            "Locust CLI options take precedence over values loaded from a config file.",
        ));
    }
    config_result(source, Value::Object(recognized), diagnostics)
}

fn parse_toml(raw: &str) -> Result<Map<String, Value>, String> {
    let document = toml::from_str::<toml::Value>(raw).map_err(|error| error.to_string())?;
    let table = document
        .get("tool")
        .and_then(|tool| tool.get("locust"))
        .and_then(toml::Value::as_table)
        .ok_or_else(|| "Locust TOML config must define [tool.locust].".to_owned())?;
    Ok(table
        .iter()
        .map(|(key, value)| (key.clone(), toml_json(value)))
        .collect())
}

fn toml_json(value: &toml::Value) -> Value {
    match value {
        toml::Value::String(value) => Value::String(value.clone()),
        toml::Value::Integer(value) => Value::Number((*value).into()),
        toml::Value::Float(value) => serde_json::Number::from_f64(*value)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        toml::Value::Boolean(value) => Value::Bool(*value),
        toml::Value::Datetime(value) => Value::String(value.to_string()),
        toml::Value::Array(values) => Value::Array(values.iter().map(toml_json).collect()),
        toml::Value::Table(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (key.clone(), toml_json(value)))
                .collect(),
        ),
    }
}

fn parse_ini(raw: &str) -> Result<Map<String, Value>, String> {
    let mut table = Map::new();
    for (index, line) in raw.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') {
            return Err(format!(
                "Unexpected section header at line {} in a Locust .conf file.",
                index + 1
            ));
        }
        let Some((key, raw_value)) = line.split_once('=') else {
            return Err(format!("Invalid option at line {}.", index + 1));
        };
        let key = key.trim().to_owned();
        if table.contains_key(&key) {
            return Err(format!(
                "Duplicate Locust option '{key}' at line {}.",
                index + 1
            ));
        }
        let raw_value = raw_value.trim();
        let value = if raw_value.eq_ignore_ascii_case("true") {
            Value::Bool(true)
        } else if raw_value.eq_ignore_ascii_case("false") {
            Value::Bool(false)
        } else if let Ok(number) = raw_value.parse::<i64>() {
            Value::Number(number.into())
        } else if let Ok(number) = raw_value.parse::<f64>() {
            serde_json::Number::from_f64(number)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        } else {
            Value::String(raw_value.trim_matches(['\'', '"']).into())
        };
        table.insert(key, value);
    }
    Ok(table)
}
