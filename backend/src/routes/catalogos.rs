//! Catálogos para los filtros del frontend.
use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    error::ApiResult,
    models::{Carrera, Facultad, Sede},
    AppState,
};

pub async fn facultades(State(st): State<AppState>) -> ApiResult<Json<Vec<Facultad>>> {
    let rows = sqlx::query_as(
        "SELECT f.id, f.nombre, count(e.registro) AS total FROM padron.facultad f \
         LEFT JOIN padron.estudiante e ON e.facultad_id = f.id GROUP BY f.id ORDER BY f.nombre",
    )
    .fetch_all(&st.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct CarrerasParams {
    pub facultad_id: Option<i32>,
}

pub async fn carreras(
    State(st): State<AppState>,
    Query(p): Query<CarrerasParams>,
) -> ApiResult<Json<Vec<Carrera>>> {
    let rows = sqlx::query_as(
        "SELECT c.id, c.facultad_id, c.nombre, c.codigo, count(e.registro) AS total \
         FROM padron.carrera c LEFT JOIN padron.estudiante e ON e.carrera_id = c.id \
         WHERE ($1::int IS NULL OR c.facultad_id = $1) GROUP BY c.id ORDER BY c.nombre",
    )
    .bind(p.facultad_id)
    .fetch_all(&st.db)
    .await?;
    Ok(Json(rows))
}

pub async fn sedes(State(st): State<AppState>) -> ApiResult<Json<Vec<Sede>>> {
    let rows = sqlx::query_as(
        "SELECT sede_id AS id, sede AS nombre, total FROM padron.v_stats_sede ORDER BY total DESC",
    )
    .fetch_all(&st.db)
    .await?;
    Ok(Json(rows))
}

pub async fn gestiones(State(st): State<AppState>) -> ApiResult<Json<Value>> {
    let rows: Vec<(i16, i64)> = sqlx::query_as(
        "SELECT gestion_ingreso, count(*) FROM padron.estudiante \
         WHERE gestion_ingreso IS NOT NULL GROUP BY 1 ORDER BY 1 DESC",
    )
    .fetch_all(&st.db)
    .await?;
    Ok(Json(json!(rows
        .into_iter()
        .map(|(g, t)| json!({ "gestion": g, "total": t }))
        .collect::<Vec<_>>())))
}
