//! Catálogos para los filtros del frontend (respaldados por vistas materializadas y caché TTL).
use std::time::Duration;

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    error::ApiResult,
    models::{Carrera, Facultad, Sede},
    AppState,
};

const CATALOGOS_TTL: Duration = Duration::from_secs(60);
const CACHE_HEADER: &str = "public, max-age=60, stale-while-revalidate=300";

fn respuesta_cacheada(val: Value) -> (HeaderMap, Json<Value>) {
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(CACHE_HEADER));
    (headers, Json(val))
}

pub async fn facultades(State(st): State<AppState>) -> ApiResult<(HeaderMap, Json<Value>)> {
    if let Some(val) = st.cache.get("catalogos:facultades") {
        return Ok(respuesta_cacheada(val));
    }
    let rows: Vec<Facultad> = sqlx::query_as(
        "SELECT facultad_id AS id, facultad AS nombre, total \
         FROM padron.v_stats_facultad ORDER BY facultad",
    )
    .fetch_all(&st.db)
    .await?;
    let val = serde_json::to_value(rows).unwrap_or_else(|_| json!([]));
    st.cache.set("catalogos:facultades".into(), val.clone(), CATALOGOS_TTL);
    Ok(respuesta_cacheada(val))
}

#[derive(Deserialize)]
pub struct CarrerasParams {
    pub facultad_id: Option<i32>,
}

pub async fn carreras(
    State(st): State<AppState>,
    Query(p): Query<CarrerasParams>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    let key = format!("catalogos:carreras:{:?}", p.facultad_id);
    if let Some(val) = st.cache.get(&key) {
        return Ok(respuesta_cacheada(val));
    }
    let rows: Vec<Carrera> = sqlx::query_as(
        "SELECT m.carrera_id AS id, m.facultad_id, m.carrera AS nombre, c.codigo, m.total \
         FROM padron.mv_stats_carrera m \
         JOIN padron.carrera c ON c.id = m.carrera_id \
         WHERE ($1::int IS NULL OR m.facultad_id = $1) \
         ORDER BY m.carrera",
    )
    .bind(p.facultad_id)
    .fetch_all(&st.db)
    .await?;
    let val = serde_json::to_value(rows).unwrap_or_else(|_| json!([]));
    st.cache.set(key, val.clone(), CATALOGOS_TTL);
    Ok(respuesta_cacheada(val))
}

pub async fn sedes(State(st): State<AppState>) -> ApiResult<(HeaderMap, Json<Value>)> {
    if let Some(val) = st.cache.get("catalogos:sedes") {
        return Ok(respuesta_cacheada(val));
    }
    let rows: Vec<Sede> = sqlx::query_as(
        "SELECT sede_id AS id, sede AS nombre, total \
         FROM padron.mv_stats_sede ORDER BY total DESC",
    )
    .fetch_all(&st.db)
    .await?;
    let val = serde_json::to_value(rows).unwrap_or_else(|_| json!([]));
    st.cache.set("catalogos:sedes".into(), val.clone(), CATALOGOS_TTL);
    Ok(respuesta_cacheada(val))
}

pub async fn gestiones(State(st): State<AppState>) -> ApiResult<(HeaderMap, Json<Value>)> {
    if let Some(val) = st.cache.get("catalogos:gestiones") {
        return Ok(respuesta_cacheada(val));
    }
    let rows: Vec<(i16, i64)> = sqlx::query_as(
        "SELECT gestion, total FROM padron.mv_stats_gestion ORDER BY gestion DESC",
    )
    .fetch_all(&st.db)
    .await?;
    let val = json!(rows
        .into_iter()
        .map(|(g, t)| json!({ "gestion": g, "total": t }))
        .collect::<Vec<_>>());
    st.cache.set("catalogos:gestiones".into(), val.clone(), CATALOGOS_TTL);
    Ok(respuesta_cacheada(val))
}
