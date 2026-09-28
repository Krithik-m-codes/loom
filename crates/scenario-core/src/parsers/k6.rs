use std::collections::BTreeMap;

use serde::{
    de::{self, MapAccess, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use serde_json::{Map, Number, Value};

use crate::{EngineConfigFile, ScenarioDiagnostic};

use super::{config_result, error, info, warning};

const K6_KEYS: &[&str] = &[
    "vus",
    "duration",
    "iterations",
    "stages",
    "thresholds",
    "scenarios",
    "tags",
    "gracefulStop",
    "gracefulRampDown",
    "noConnectionReuse",
    "batch",
    "batchPerHost",
    "discardResponseBodies",
];

pub(super) fn parse_config(source: &EngineConfigFile) -> crate::ConfigParseResult {
    let mut diagnostics = Vec::<ScenarioDiagnostic>::new();
    if source.format != "json" {
        diagnostics.push(error(
            "CONFIG_FORMAT_INVALID",
            "k6 --config files must be JSON.",
        ));
        return config_result(source, Value::Null, diagnostics);
    }
    let parsed = match serde_json::from_str::<UniqueJson>(&source.content) {
        Ok(value) => value.into_value(),
        Err(parse_error) => {
            diagnostics.push(error("CONFIG_PARSE_ERROR", parse_error.to_string()));
            return config_result(source, Value::Null, diagnostics);
        }
    };
    let Some(values) = parsed.as_object() else {
        diagnostics.push(error(
            "CONFIG_ROOT_INVALID",
            "k6 JSON config must contain an object at the document root.",
        ));
        return config_result(source, Value::Null, diagnostics);
    };
    let mut recognized = Map::new();
    for (key, value) in values {
        if K6_KEYS.contains(&key.as_str()) {
            recognized.insert(key.clone(), value.clone());
        } else {
            diagnostics.push(warning(
                "CONFIG_UNKNOWN_KEY",
                format!("Unknown k6 option '{key}' is kept in the original config file."),
            ));
        }
    }
    if !recognized.is_empty() {
        diagnostics.push(info("ENGINE_OPTION_PRECEDENCE", "k6 command-line options and environment variables override script and JSON config values."));
    }
    config_result(source, Value::Object(recognized), diagnostics)
}

#[derive(Debug)]
enum UniqueJson {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<UniqueJson>),
    Object(BTreeMap<String, UniqueJson>),
}

impl<'de> Deserialize<'de> for UniqueJson {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct UniqueVisitor;
        impl<'de> Visitor<'de> for UniqueVisitor {
            type Value = UniqueJson;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a JSON value with unique object keys")
            }
            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueJson::Null)
            }
            fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueJson::Null)
            }
            fn visit_bool<E: de::Error>(self, value: bool) -> Result<Self::Value, E> {
                Ok(UniqueJson::Bool(value))
            }
            fn visit_i64<E: de::Error>(self, value: i64) -> Result<Self::Value, E> {
                Ok(UniqueJson::Number(Number::from(value)))
            }
            fn visit_u64<E: de::Error>(self, value: u64) -> Result<Self::Value, E> {
                Ok(UniqueJson::Number(Number::from(value)))
            }
            fn visit_f64<E: de::Error>(self, value: f64) -> Result<Self::Value, E> {
                Number::from_f64(value)
                    .map(UniqueJson::Number)
                    .ok_or_else(|| E::custom("non-finite JSON number"))
            }
            fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
                Ok(UniqueJson::String(value.into()))
            }
            fn visit_string<E: de::Error>(self, value: String) -> Result<Self::Value, E> {
                Ok(UniqueJson::String(value))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut values = Vec::new();
                while let Some(value) = seq.next_element()? {
                    values.push(value);
                }
                Ok(UniqueJson::Array(values))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut values = BTreeMap::new();
                while let Some((key, value)) = map.next_entry::<String, UniqueJson>()? {
                    if values.insert(key.clone(), value).is_some() {
                        return Err(de::Error::custom(format!("duplicate key '{key}'")));
                    }
                }
                Ok(UniqueJson::Object(values))
            }
        }
        deserializer.deserialize_any(UniqueVisitor)
    }
}

impl UniqueJson {
    fn into_value(self) -> Value {
        match self {
            Self::Null => Value::Null,
            Self::Bool(value) => Value::Bool(value),
            Self::Number(value) => Value::Number(value),
            Self::String(value) => Value::String(value),
            Self::Array(values) => Value::Array(values.into_iter().map(Self::into_value).collect()),
            Self::Object(values) => Value::Object(
                values
                    .into_iter()
                    .map(|(key, value)| (key, value.into_value()))
                    .collect(),
            ),
        }
    }
}
