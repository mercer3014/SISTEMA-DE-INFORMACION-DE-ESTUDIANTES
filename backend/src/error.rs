//! Errores de la API -> respuestas JSON.
use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("no encontrado: {0}")]
    NotFound(String),
    #[error("solicitud inválida: {0}")]
    BadRequest(String),
    #[error("no autorizado")]
    Unauthorized,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, msg) = match &self {
            ApiError::NotFound(m) => (StatusCode::NOT_FOUND, m.clone()),
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "API key inválida".into()),
            ApiError::Db(e) => {
                tracing::error!(error = %e, "error de base de datos");
                (StatusCode::INTERNAL_SERVER_ERROR, "error interno".into())
            }
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
