use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{error::ApiResult, AppState};

/// GET /api/health — verifica API y conexión a la BD.
pub async fn health(State(st): State<AppState>) -> ApiResult<Json<Value>> {
    let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM padron.estudiante")
        .fetch_one(&st.db)
        .await?;
    Ok(Json(json!({ "status": "ok", "estudiantes": n, "version": env!("CARGO_PKG_VERSION") })))
}
