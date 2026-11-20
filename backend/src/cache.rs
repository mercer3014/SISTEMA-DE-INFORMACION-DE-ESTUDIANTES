//! Caché ligera en memoria con TTL para catálogos, resúmenes y conteos frecuentes.
use std::{
    collections::HashMap,
    sync::RwLock,
    time::{Duration, Instant},
};

use serde_json::Value;

const MAX_ENTRIES: usize = 128;

pub struct ApiCache {
    map: RwLock<HashMap<String, (Instant, Value)>>,
}

impl ApiCache {
    pub fn new() -> Self {
        Self {
            map: RwLock::new(HashMap::new()),
        }
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        let now = Instant::now();
        let guard = self.map.read().ok()?;
        let (exp, val) = guard.get(key)?;
        if *exp > now {
            Some(val.clone())
        } else {
            None
        }
    }

    pub fn set(&self, key: String, val: Value, ttl: Duration) {
        let now = Instant::now();
        if let Ok(mut guard) = self.map.write() {
            if guard.len() >= MAX_ENTRIES && !guard.contains_key(&key) {
                guard.retain(|_, (exp, _)| *exp > now);
                if guard.len() >= MAX_ENTRIES {
                    guard.clear();
                }
            }
            guard.insert(key, (now + ttl, val));
        }
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.map.write() {
            guard.clear();
        }
    }
}
