//! Configuración por variables de entorno.
use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub bind: String,
    pub cors_origins: Vec<String>,
    pub api_key: Option<String>,
    pub max_db_connections: u32,
    /// Nº mínimo de migraciones aplicadas antes de atender (MIN_MIGRACIONES; 0 = no esperar).
    pub min_migraciones: i64,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let _ = dotenvy::dotenv();
        let _ = dotenvy::from_filename("../.env");
        Ok(Self {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("Defina DATABASE_URL"))?,
            bind: env::var("API_BIND").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            cors_origins: env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "*".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            api_key: env::var("API_KEY").ok().filter(|k| !k.is_empty()),
            max_db_connections: env::var("DB_MAX_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
            min_migraciones: env::var("MIN_MIGRACIONES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(9),
        })
    }
}
