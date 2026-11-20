//! Definición de rutas y helpers compartidos de filtrado multi-selección.
use axum::{routing::get, Router};
use sqlx::{Postgres, QueryBuilder};

use crate::{
    error::{ApiError, ApiResult},
    AppState,
};

pub mod catalogos;
pub mod estudiantes;
pub mod health;
pub mod stats;

const MAX_VALORES_FILTRO: usize = 50;

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

fn parse_num_list<T>(raw: Option<&str>, campo: &str) -> ApiResult<Vec<T>>
where
    T: std::str::FromStr + Ord + Copy,
{
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for part in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        if out.len() >= MAX_VALORES_FILTRO {
            return Err(ApiError::BadRequest(format!(
                "{campo}: máximo {MAX_VALORES_FILTRO} valores"
            )));
        }
        let v = part
            .parse::<T>()
            .map_err(|_| ApiError::BadRequest(format!("{campo} inválido: {part}")))?;
        out.push(v);
    }
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

pub fn parse_i32_list(raw: Option<&str>, campo: &str) -> ApiResult<Vec<i32>> {
    parse_num_list(raw, campo)
}

pub fn parse_i16_list(raw: Option<&str>, campo: &str) -> ApiResult<Vec<i16>> {
    parse_num_list(raw, campo)
}

pub fn parse_sexo_list(raw: Option<&str>) -> ApiResult<Vec<String>> {
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for part in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        if out.len() >= MAX_VALORES_FILTRO {
            return Err(ApiError::BadRequest(format!(
                "sexo: máximo {MAX_VALORES_FILTRO} valores"
            )));
        }
        let u = part.to_uppercase();
        if u != "M" && u != "F" {
            return Err(ApiError::BadRequest("sexo debe ser M o F".into()));
        }
        out.push(u);
    }
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

pub fn parse_bool_list(raw: Option<&str>, campo: &str) -> ApiResult<Vec<bool>> {
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for part in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        if out.len() >= MAX_VALORES_FILTRO {
            return Err(ApiError::BadRequest(format!(
                "{campo}: máximo {MAX_VALORES_FILTRO} valores"
            )));
        }
        let b = match part.to_ascii_lowercase().as_str() {
            "true" | "1" => true,
            "false" | "0" => false,
            _ => return Err(ApiError::BadRequest(format!("{campo} inválido: {part}"))),
        };
        out.push(b);
    }
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

pub struct FiltrosComunes {
    pub facultad_ids: Vec<i32>,
    pub carrera_ids: Vec<i32>,
    pub sede_ids: Vec<i32>,
    pub gestiones: Vec<i16>,
    pub sexos: Vec<String>,
    pub activos: Vec<bool>,
}

impl FiltrosComunes {
    pub fn from_raw(
        facultad_id: Option<&str>,
        carrera_id: Option<&str>,
        sede_id: Option<&str>,
        gestion: Option<&str>,
        sexo: Option<&str>,
        activo: Option<&str>,
    ) -> ApiResult<Self> {
        Ok(Self {
            facultad_ids: parse_i32_list(facultad_id, "facultad_id")?,
            carrera_ids: parse_i32_list(carrera_id, "carrera_id")?,
            sede_ids: parse_i32_list(sede_id, "sede_id")?,
            gestiones: parse_i16_list(gestion, "gestion")?,
            sexos: parse_sexo_list(sexo)?,
            activos: parse_bool_list(activo, "activo")?,
        })
    }

    pub fn is_empty(&self) -> bool {
        self.facultad_ids.is_empty()
            && self.carrera_ids.is_empty()
            && self.sede_ids.is_empty()
            && self.gestiones.is_empty()
            && self.sexos.is_empty()
            && self.activos.is_empty()
    }
}

pub fn push_filtros_comunes(qb: &mut QueryBuilder<'static, Postgres>, f: &FiltrosComunes) {
    match f.facultad_ids.as_slice() {
        [] => {}
        [v] => {
            qb.push(" AND e.facultad_id = ").push_bind(*v);
        }
        many => {
            qb.push(" AND e.facultad_id = ANY(")
                .push_bind(many.to_vec())
                .push(")");
        }
    }
    match f.carrera_ids.as_slice() {
        [] => {}
        [v] => {
            qb.push(" AND e.carrera_id = ").push_bind(*v);
        }
        many => {
            qb.push(" AND e.carrera_id = ANY(")
                .push_bind(many.to_vec())
                .push(")");
        }
    }
    match f.sede_ids.as_slice() {
        [] => {}
        [v] => {
            qb.push(" AND e.sede_id = ").push_bind(*v);
        }
        many => {
            qb.push(" AND e.sede_id = ANY(")
                .push_bind(many.to_vec())
                .push(")");
        }
    }
    match f.gestiones.as_slice() {
        [] => {}
        [v] => {
            qb.push(" AND e.gestion_ingreso = ").push_bind(*v);
        }
        many => {
            qb.push(" AND e.gestion_ingreso = ANY(")
                .push_bind(many.to_vec())
                .push(")");
        }
    }
    match f.sexos.as_slice() {
        [] => {}
        [v] => {
            qb.push(" AND e.sexo = ").push_bind(v.clone());
        }
        _ => {
            qb.push(" AND e.sexo IS NOT NULL");
        }
    }
    match f.activos.as_slice() {
        [] => {}
        [v] => {
            qb.push(" AND e.activo = ").push_bind(*v);
        }
        _ => {
            qb.push(" AND e.activo IS NOT NULL");
        }
    }
}
