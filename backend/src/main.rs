//! API REST de búsqueda de estudiantes.
//!
//! Stack: Axum (HTTP) + SQLx (PostgreSQL) + Tokio. Pensada para correr en un VPS.
mod config;
mod error;
mod models;
mod routes;

use std::time::Duration;

use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, Method},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use sqlx::postgres::{PgPool, PgPoolOptions};
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, Any, CorsLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

use crate::{config::Config, error::ApiError};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
}

/// Si API_KEY está definida, exige el header `x-api-key` (excepto /api/health).
async fn api_key_guard(State(st): State<AppState>, req: Request, next: Next) -> Response {
    if let Some(ref key) = st.config.api_key {
        let path = req.uri().path();
        let ok = path == "/api/health"
            || req.method() == Method::OPTIONS
            || req
                .headers()
                .get("x-api-key")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v == key);
        if !ok {
            return ApiError::Unauthorized.into_response();
        }
    }
    next.run(req).await
}

/// Conecta a PostgreSQL reintentando con back-off exponencial (1 s … 30 s).
/// En Docker Swarm no hay `depends_on`: la BD puede tardar en estar lista.
async fn conectar_con_reintentos(config: &Config) -> PgPool {
    let mut espera = Duration::from_secs(1);
    loop {
        match PgPoolOptions::new()
            .max_connections(config.max_db_connections)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&config.database_url)
            .await
        {
            Ok(db) => {
                tracing::info!("conectado a PostgreSQL");
                return db;
            }
            Err(e) => {
                tracing::warn!(error = %e, "PostgreSQL no disponible; reintento en {:?}", espera);
                tokio::time::sleep(espera).await;
                espera = (espera * 2).min(Duration::from_secs(30));
            }
        }
    }
}

/// Espera a que el servicio de migraciones haya aplicado al menos `minimo` versiones
/// (tabla public.schema_migrations) y a que exista el esquema de datos.
async fn esperar_migraciones(db: &PgPool, minimo: i64) {
    let mut espera = Duration::from_secs(2);
    loop {
        let r: Result<(Option<i64>, bool), sqlx::Error> = sqlx::query_as(
            "SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN NULL \
                    ELSE (SELECT count(*) FROM public.schema_migrations) END, \
                    to_regclass('padron.estudiante') IS NOT NULL",
        )
        .fetch_one(db)
        .await;
        match r {
            Ok((Some(n), true)) if n >= minimo => {
                tracing::info!(migraciones = n, "esquema listo");
                return;
            }
            Ok((n, _)) => tracing::info!(aplicadas = ?n, minimo, "esperando migraciones; reintento en {:?}", espera),
            Err(e) => tracing::warn!(error = %e, "no se pudo comprobar migraciones; reintento en {:?}", espera),
        }
        tokio::time::sleep(espera).await;
        espera = (espera * 2).min(Duration::from_secs(30));
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info,sqlx=warn".into()),
        )
        .init();

    let config = Config::from_env()?;
    let db = conectar_con_reintentos(&config).await;
    esperar_migraciones(&db, config.min_migraciones).await;

    // Refresca las vistas materializadas de estadísticas cada 10 minutos
    // (el scraping completo puede durar días y va agregando datos).
    {
        let db = db.clone();
        tokio::spawn(async move {
            let mut iv = tokio::time::interval(Duration::from_secs(600));
            loop {
                iv.tick().await;
                if let Err(e) = sqlx::query("SELECT padron.fn_refrescar_stats()").execute(&db).await {
                    tracing::warn!(error = %e, "no se pudo refrescar estadísticas");
                }
            }
        });
    }

    let cors = if config.cors_origins.iter().any(|o| o == "*") {
        CorsLayer::new().allow_origin(Any)
    } else {
        let origins: Vec<HeaderValue> =
            config.cors_origins.iter().filter_map(|o| o.parse().ok()).collect();
        CorsLayer::new().allow_origin(AllowOrigin::list(origins))
    }
    .allow_methods([Method::GET, Method::OPTIONS])
    .allow_headers([header::CONTENT_TYPE, "x-api-key".parse().unwrap()]);

    let state = AppState { db, config: config.clone() };
    let app = routes::router()
        .layer(middleware::from_fn_with_state(state.clone(), api_key_guard))
        .with_state(state)
        .layer(TimeoutLayer::with_status_code(axum::http::StatusCode::REQUEST_TIMEOUT, Duration::from_secs(30)))
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&config.bind).await?;
    tracing::info!("API escuchando en http://{}", config.bind);
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
