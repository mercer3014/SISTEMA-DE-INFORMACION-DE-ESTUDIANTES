//! Búsqueda y detalle de estudiantes.
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Postgres, QueryBuilder};

use crate::{
    error::{ApiError, ApiResult},
    models::{EstudianteDetalle, EstudianteResumen, FilaPadron, Paginado},
    AppState,
};

#[derive(Deserialize, Default)]
pub struct BusquedaParams {
    /// Texto libre: nombre (con o sin tildes, cualquier orden), registro (prefijo) o CI.
    pub q: Option<String>,
    pub facultad_id: Option<i32>,
    pub carrera_id: Option<i32>,
    pub sede_id: Option<i32>,
    pub gestion: Option<i16>,
    pub sexo: Option<String>,
    /// "web" (con datos de la web), "solo_web" (no está en el PDF), "solo_pdf"
    pub fuente: Option<String>,
    pub activo: Option<bool>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    /// relevancia | nombre | registro | gestion | carrera | facultad | ci
    pub sort: Option<String>,
    /// asc | desc
    pub order: Option<String>,
}

/// GET /api/estudiantes
pub async fn buscar(
    State(st): State<AppState>,
    Query(p): Query<BusquedaParams>,
) -> ApiResult<Json<Paginado<EstudianteResumen>>> {
    let page = p.page.unwrap_or(1).max(1);
    let page_size = p.page_size.unwrap_or(25).clamp(1, 200);
    let q = p
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(100).collect::<String>());

    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new("WITH params AS (SELECT padron.fn_normalizar(");
    qb.push_bind(q.clone());
    qb.push(
        ") AS t) SELECT e.registro, e.nombre_completo, e.ci, e.sexo::text AS sexo, \
         e.facultad_id, f.nombre AS facultad, e.carrera_id, c.nombre AS carrera, s.nombre AS sede, \
         e.gestion_ingreso, e.activo, e.en_padron, e.en_web, ",
    );
    if q.is_some() {
        qb.push(
            "(CASE WHEN e.registro = params.t OR e.ci = params.t THEN 2 \
              ELSE similarity(e.nombre_norm, params.t) \
                 + CASE WHEN e.nombre_norm LIKE params.t || '%' THEN 0.5 \
                        WHEN e.nombre_norm LIKE '%' || params.t || '%' THEN 0.3 ELSE 0 END END)::real",
        );
    } else {
        qb.push("0::real");
    }
    qb.push(
        " AS relevancia, count(*) OVER () AS total \
         FROM padron.estudiante e CROSS JOIN params \
         LEFT JOIN padron.facultad f ON f.id = e.facultad_id \
         LEFT JOIN padron.carrera c ON c.id = e.carrera_id \
         LEFT JOIN padron.sede s ON s.id = e.sede_id WHERE true",
    );
    if let Some(ref qs) = q {
        qb.push(
            " AND (e.registro LIKE params.t || '%' OR e.ci LIKE params.t || '%' \
              OR e.nombre_norm LIKE '%' || params.t || '%' \
              OR e.busqueda @@ plainto_tsquery('simple', params.t)",
        );
        if qs.chars().count() >= 5 && !qs.chars().all(|c| c.is_ascii_digit()) {
            // tolerancia a errores de tipeo (trigramas)
            qb.push(" OR e.nombre_norm % params.t");
        }
        qb.push(")");
    }
    if let Some(v) = p.facultad_id {
        qb.push(" AND e.facultad_id = ").push_bind(v);
    }
    if let Some(v) = p.carrera_id {
        qb.push(" AND e.carrera_id = ").push_bind(v);
    }
    if let Some(v) = p.sede_id {
        qb.push(" AND e.sede_id = ").push_bind(v);
    }
    if let Some(v) = p.gestion {
        qb.push(" AND e.gestion_ingreso = ").push_bind(v);
    }
    if let Some(v) = p.activo {
        qb.push(" AND e.activo = ").push_bind(v);
    }
    if let Some(ref v) = p.sexo {
        let v = v.to_uppercase();
        if v != "M" && v != "F" {
            return Err(ApiError::BadRequest("sexo debe ser M o F".into()));
        }
        qb.push(" AND e.sexo = ").push_bind(v);
    }
    match p.fuente.as_deref() {
        None | Some("") | Some("todas") => {}
        Some("web") => {
            qb.push(" AND e.en_web");
        }
        Some("solo_web") => {
            qb.push(" AND e.en_web AND NOT e.en_padron");
        }
        Some("solo_pdf") => {
            qb.push(" AND NOT e.en_web");
        }
        Some(o) => return Err(ApiError::BadRequest(format!("fuente inválida: {o}"))),
    }

    let dir = match p.order.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };
    let sort = p
        .sort
        .as_deref()
        .unwrap_or(if q.is_some() { "relevancia" } else { "nombre" });
    let order_sql = match sort {
        "relevancia" => "relevancia DESC, e.nombre_completo ASC".to_string(),
        "nombre" => format!("e.nombre_completo {dir}"),
        "registro" => format!("e.registro {dir}"),
        "gestion" => format!("e.gestion_ingreso {dir} NULLS LAST, e.registro {dir}"),
        "carrera" => format!("c.nombre {dir} NULLS LAST, e.nombre_completo"),
        "facultad" => format!("f.nombre {dir} NULLS LAST, e.nombre_completo"),
        "ci" => format!("e.ci {dir} NULLS LAST"),
        o => return Err(ApiError::BadRequest(format!("sort inválido: {o}"))),
    };
    qb.push(" ORDER BY ").push(order_sql);
    qb.push(" LIMIT ").push_bind(page_size);
    qb.push(" OFFSET ").push_bind((page - 1) * page_size);

    let rows: Vec<EstudianteResumen> = qb.build_query_as().fetch_all(&st.db).await?;
    let total = rows.first().map(|r| r.total).unwrap_or(0);
    Ok(Json(Paginado {
        pages: (total + page_size - 1) / page_size,
        data: rows,
        total,
        page,
        page_size,
    }))
}

/// GET /api/estudiantes/{registro}
pub async fn detalle(
    State(st): State<AppState>,
    Path(registro): Path<String>,
) -> ApiResult<Json<Value>> {
    if !registro.chars().all(|c| c.is_ascii_digit()) || registro.len() > 10 {
        return Err(ApiError::BadRequest("registro inválido".into()));
    }
    let est: Option<EstudianteDetalle> = sqlx::query_as(
        "SELECT registro, nombre_completo, nombres, apellido_pri, apellido_seg, ci, lugar_ci, \
         sexo::text AS sexo, fecha_nac, direccion, telefono, celular, activo, plan, gestion_ingreso, \
         facultad_id, facultad, carrera_id, carrera, carrera_codigo, sede_id, sede, en_padron, en_web, \
         mesa, recinto, recinto_lugar, aula, hab_ci, hab_icu_fac, hab_ful, web_actualizado_at, \
         padron_actualizado_at, created_at, updated_at \
         FROM padron.v_estudiante WHERE registro = $1",
    )
    .bind(&registro)
    .fetch_optional(&st.db)
    .await?;
    let est = est.ok_or_else(|| ApiError::NotFound(format!("registro {registro} no existe")))?;

    let padron: Vec<FilaPadron> = sqlx::query_as(
        "SELECT pf2.nombre AS fuente, p.nro, f.nombre AS facultad, c.nombre AS carrera, s.nombre AS sede, \
         p.nombre, p.mesa, p.recinto, p.aula, p.pagina \
         FROM padron.padron_fila p JOIN padron.padron_fuente pf2 ON pf2.id = p.fuente_id \
         LEFT JOIN padron.facultad f ON f.id = p.facultad_id \
         LEFT JOIN padron.carrera c ON c.id = p.carrera_id \
         LEFT JOIN padron.sede s ON s.id = p.sede_id \
         WHERE p.registro = $1 ORDER BY p.fuente_id DESC, p.nro",
    )
    .bind(&registro)
    .fetch_all(&st.db)
    .await?;

    let (consultas_web,): (i64,) =
        sqlx::query_as("SELECT count(*) FROM padron.web_consulta WHERE registro = $1")
            .bind(&registro)
            .fetch_one(&st.db)
            .await?;

    Ok(Json(json!({
        "estudiante": est,
        "padron": padron,
        "consultas_web": consultas_web,
    })))
}
