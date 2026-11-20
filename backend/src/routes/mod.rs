//! Definición de rutas.
use axum::{routing::get, Router};

use crate::AppState;

pub mod catalogos;
pub mod estudiantes;
pub mod health;
pub mod stats;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health::health))
        .route("/api/estudiantes", get(estudiantes::buscar))
        .route("/api/estudiantes/{registro}", get(estudiantes::detalle))
        .route("/api/catalogos/facultades", get(catalogos::facultades))
        .route("/api/catalogos/carreras", get(catalogos::carreras))
        .route("/api/catalogos/sedes", get(catalogos::sedes))
        .route("/api/catalogos/gestiones", get(catalogos::gestiones))
        .route("/api/stats", get(stats::resumen))
        .route("/api/scraping/progreso", get(stats::scraping))
}
