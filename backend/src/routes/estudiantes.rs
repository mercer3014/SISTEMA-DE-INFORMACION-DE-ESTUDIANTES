//! Búsqueda y detalle de estudiantes.
use std::time::Duration;

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Postgres, QueryBuilder};

use super::{push_filtros_comunes, FiltrosComunes};
use crate::{
    error::{ApiError, ApiResult},
    models::{EstudianteDetalle, EstudianteResumen, FilaPadron, Paginado},
    AppState,
};

#[derive(Deserialize, Default)]
pub struct BusquedaParams {
    /// Texto libre: nombre (con o sin tildes, cualquier orden), registro (prefijo) o CI.
    pub q: Option<String>,
    pub facultad_id: Option<String>,
    pub carrera_id: Option<String>,
    pub sede_id: Option<String>,
    pub gestion: Option<String>,
    pub sexo: Option<String>,
    /// "web" (con datos de la web), "solo_web" (no está en el PDF), "solo_pdf"
    pub fuente: Option<String>,
    pub activo: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    /// relevancia | nombre | registro | gestion | carrera | facultad | ci
    pub sort: Option<String>,
    /// asc | desc
    pub order: Option<String>,
}

fn aplicar_filtros(
    qb: &mut QueryBuilder<'static, Postgres>,
    q: Option<&str>,
    filtros: &FiltrosComunes,
    fuente: Option<&str>,
) {
    if let Some(qs) = q {
        let es_numerico = qs.chars().all(|c| c.is_ascii_digit());
        if es_numerico {
            qb.push(" AND (e.registro LIKE params.t || '%' OR e.ci LIKE params.t || '%')");
        } else {
            let tiene_digitos = qs.chars().any(|c| c.is_ascii_digit());
            let usar_trgm = qs.chars().count() >= 5;
            qb.push(
                " AND (e.nombre_norm LIKE '%' || params.t || '%' \
                  OR e.busqueda @@ plainto_tsquery('simple', params.t)",
            );
            if tiene_digitos {
                qb.push(" OR e.ci LIKE params.t || '%'");
            }
            if usar_trgm {
                qb.push(" OR e.nombre_norm % params.t");
            }
            qb.push(")");
        }
    }
    push_filtros_comunes(qb, filtros);
    match fuente {
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
        Some(_) => {}
    }
}

async fn total_global(st: &AppState) -> ApiResult<i64> {
    if let Some(n) = st.cache.get("total:all").and_then(|v| v.as_i64()) {
        return Ok(n);
    }
    let mv: Option<(i64,)> = sqlx::query_as("SELECT total FROM padron.mv_stats_resumen LIMIT 1")
        .fetch_optional(&st.db)
        .await?;
    let total = match mv {
        Some((n,)) if n > 0 => n,
        _ => {
            let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM padron.estudiante")
                .fetch_one(&st.db)
                .await?;
            n
        }
    };
    st.cache
        .set("total:all".into(), Value::from(total), Duration::from_secs(30));
    Ok(total)
}

/// GET /api/estudiantes
pub async fn buscar(
    State(st): State<AppState>,
    Query(p): Query<BusquedaParams>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    let page = p.page.unwrap_or(1).max(1);
    let page_size = p.page_size.unwrap_or(1000).clamp(1, 1000);
    let q = p
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(100).collect::<String>());

    let filtros = FiltrosComunes::from_raw(
        p.facultad_id.as_deref(),
        p.carrera_id.as_deref(),
        p.sede_id.as_deref(),
        p.gestion.as_deref(),
        p.sexo.as_deref(),
        p.activo.as_deref(),
    )?;

    let fuente = p.fuente.as_deref().map(str::trim);
    match fuente {
        None | Some("") | Some("todas") | Some("web") | Some("solo_web") | Some("solo_pdf") => {}
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

    let fuente_norm = match fuente {
        Some(v @ ("web" | "solo_web" | "solo_pdf")) => v,
        _ => "",
    };
    let sin_filtros = q.is_none() && filtros.is_empty() && fuente_norm.is_empty();
    let hay_filtros_selectivos = q.is_some() || !filtros.is_empty();

    let order_sql = match sort {
        "relevancia" if q.is_some() => "relevancia DESC, e.nombre_completo ASC".to_string(),
        "relevancia" | "nombre" if hay_filtros_selectivos => format!("(e.nombre_completo || '') {dir}"),
        "relevancia" | "nombre" => format!("e.nombre_completo {dir}"),
        "registro" if hay_filtros_selectivos => format!("(e.registro || '') {dir}"),
        "registro" => format!("e.registro {dir}"),
        "gestion" => format!("e.gestion_ingreso {dir} NULLS LAST, e.registro {dir}"),
        "carrera" => format!("c.nombre {dir} NULLS LAST, e.nombre_completo"),
        "facultad" => format!("f.nombre {dir} NULLS LAST, e.nombre_completo"),
        "ci" => format!("e.ci {dir} NULLS LAST"),
        o => return Err(ApiError::BadRequest(format!("sort inválido: {o}"))),
    };

    let cache_key = format!(
        "est:q={}:f={:?}:c={:?}:s={:?}:g={:?}:x={:?}:a={:?}:fu={fuente_norm}:p={page}:ps={page_size}:so={sort}:{dir}",
        q.as_deref().unwrap_or(""),
        filtros.facultad_ids,
        filtros.carrera_ids,
        filtros.sede_ids,
        filtros.gestiones,
        filtros.sexos,
        filtros.activos,
    );
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=15, stale-while-revalidate=60"),
    );
    if let Some(cached) = st.cache.get(&cache_key) {
        return Ok((headers, Json(cached)));
    }

    // Query de filas (sin WindowAgg / count(*) OVER ())
    let mut qb: QueryBuilder<'static, Postgres> = if let Some(ref qs) = q {
        let mut q_init = QueryBuilder::new("WITH params AS (SELECT padron.fn_normalizar(");
        q_init.push_bind(qs.clone());
        q_init.push(
            ") AS t) SELECT e.registro, e.nombre_completo, e.ci, e.sexo::text AS sexo, \
             e.facultad_id, f.nombre AS facultad, e.carrera_id, c.nombre AS carrera, s.nombre AS sede, \
             e.gestion_ingreso, e.activo, e.en_padron, e.en_web, \
             (CASE WHEN e.registro = params.t OR e.ci = params.t THEN 2 \
              ELSE similarity(e.nombre_norm, params.t) \
                 + CASE WHEN e.nombre_norm LIKE params.t || '%' THEN 0.5 \
                        WHEN e.nombre_norm LIKE '%' || params.t || '%' THEN 0.3 ELSE 0 END END)::real AS relevancia \
             FROM padron.estudiante e CROSS JOIN params ",
        );
        q_init
    } else {
        QueryBuilder::new(
            "SELECT e.registro, e.nombre_completo, e.ci, e.sexo::text AS sexo, \
             e.facultad_id, f.nombre AS facultad, e.carrera_id, c.nombre AS carrera, s.nombre AS sede, \
             e.gestion_ingreso, e.activo, e.en_padron, e.en_web, 0::real AS relevancia \
             FROM padron.estudiante e ",
        )
    };
    qb.push(
        "LEFT JOIN padron.facultad f ON f.id = e.facultad_id \
         LEFT JOIN padron.carrera c ON c.id = e.carrera_id \
         LEFT JOIN padron.sede s ON s.id = e.sede_id WHERE true",
    );
    aplicar_filtros(&mut qb, q.as_deref(), &filtros, fuente);
    qb.push(" ORDER BY ").push(order_sql);
    qb.push(" LIMIT ").push_bind(page_size);
    qb.push(" OFFSET ").push_bind((page - 1) * page_size);

    let (rows, total): (Vec<EstudianteResumen>, i64) = if sin_filtros {
        tokio::try_join!(
            async {
                qb.build_query_as::<EstudianteResumen>()
                    .fetch_all(&st.db)
                    .await
                    .map_err(ApiError::from)
            },
            total_global(&st),
        )?
    } else {
        let mut cqb: QueryBuilder<'static, Postgres> = if let Some(ref qs) = q {
            let mut c_init = QueryBuilder::new("WITH params AS (SELECT padron.fn_normalizar(");
            c_init.push_bind(qs.clone());
            c_init.push(") AS t) SELECT count(*) FROM padron.estudiante e CROSS JOIN params WHERE true");
            c_init
        } else {
            QueryBuilder::new("SELECT count(*) FROM padron.estudiante e WHERE true")
        };
        aplicar_filtros(&mut cqb, q.as_deref(), &filtros, fuente);

        tokio::try_join!(
            async {
                qb.build_query_as::<EstudianteResumen>()
                    .fetch_all(&st.db)
                    .await
                    .map_err(ApiError::from)
            },
            async {
                let (n,): (i64,) = cqb.build_query_as().fetch_one(&st.db).await?;
                Ok::<i64, ApiError>(n)
            },
        )?
    };

    let val = serde_json::to_value(Paginado {
        pages: (total + page_size - 1) / page_size,
        data: rows,
        total,
        page,
        page_size,
    })
    .unwrap_or_default();
    if page <= 5 {
        let ttl = if sin_filtros {
            Duration::from_secs(60)
        } else {
            Duration::from_secs(15)
        };
        st.cache.set(cache_key, val.clone(), ttl);
    }

    Ok((headers, Json(val)))
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
