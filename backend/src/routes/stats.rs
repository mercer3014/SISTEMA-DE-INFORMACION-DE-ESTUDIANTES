//! Estadísticas para el dashboard (globales y filtrables) y progreso del scraping.
use std::time::Duration;

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Postgres, QueryBuilder};

use crate::{
    error::{ApiError, ApiResult},
    models::Conteo,
    AppState,
};

const STATS_TTL: Duration = Duration::from_secs(60);
const SCRAPING_TTL: Duration = Duration::from_secs(10);

#[derive(Deserialize, Default)]
pub struct StatsParams {
    pub gestion: Option<i16>,
    pub facultad_id: Option<i32>,
    pub carrera_id: Option<i32>,
    pub sede_id: Option<i32>,
    pub sexo: Option<String>,
    pub activo: Option<bool>,
}

fn respuesta_cacheada(val: Value, cc: &'static str) -> (HeaderMap, Json<Value>) {
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(cc));
    (headers, Json(val))
}

/// GET /api/stats
pub async fn resumen(
    State(st): State<AppState>,
    Query(p): Query<StatsParams>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    let sexo = match p.sexo.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None => None,
        Some(v) => {
            let u = v.to_uppercase();
            if u != "M" && u != "F" {
                return Err(ApiError::BadRequest("sexo debe ser M o F".into()));
            }
            Some(u)
        }
    };

    let sin_filtros = p.gestion.is_none()
        && p.facultad_id.is_none()
        && p.carrera_id.is_none()
        && p.sede_id.is_none()
        && sexo.is_none()
        && p.activo.is_none();

    if sin_filtros {
        if let Some(val) = st.cache.get("stats:all") {
            return Ok(respuesta_cacheada(val, "public, max-age=30"));
        }

        let (res_row, por_facultad, por_carrera, por_gestion, por_sede) = tokio::try_join!(
            async {
                sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64, i64, i64, i64)>(
                    "SELECT total, en_web, en_padron, solo_web, con_ci, hombres, mujeres, activos, inactivos \
                     FROM padron.mv_stats_resumen LIMIT 1",
                )
                .fetch_optional(&st.db)
                .await
                .map_err(ApiError::from)
            },
            async {
                sqlx::query_as::<_, Conteo>(
                    "SELECT facultad_id AS id, facultad AS etiqueta, total, con_datos_web \
                     FROM padron.v_stats_facultad WHERE total > 0 ORDER BY total DESC",
                )
                .fetch_all(&st.db)
                .await
                .map_err(ApiError::from)
            },
            async {
                sqlx::query_as::<_, Conteo>(
                    "SELECT carrera_id AS id, carrera || ' · ' || facultad AS etiqueta, total, con_datos_web \
                     FROM padron.mv_stats_carrera WHERE total > 0 ORDER BY total DESC LIMIT 20",
                )
                .fetch_all(&st.db)
                .await
                .map_err(ApiError::from)
            },
            async {
                sqlx::query_as::<_, Conteo>(
                    "SELECT gestion::int AS id, gestion::text AS etiqueta, total, con_datos_web \
                     FROM padron.mv_stats_gestion ORDER BY gestion",
                )
                .fetch_all(&st.db)
                .await
                .map_err(ApiError::from)
            },
            async {
                sqlx::query_as::<_, Conteo>(
                    "SELECT sede_id AS id, sede AS etiqueta, total, con_datos_web \
                     FROM padron.mv_stats_sede WHERE total > 0 ORDER BY total DESC",
                )
                .fetch_all(&st.db)
                .await
                .map_err(ApiError::from)
            },
        )?;

        let (total, en_web, en_padron, solo_web, con_ci, hombres, mujeres, activos, inactivos) =
            res_row.unwrap_or_default();

        let val = json!({
            "resumen": {
                "total": total, "en_web": en_web, "en_padron": en_padron, "solo_web": solo_web,
                "con_ci": con_ci, "hombres": hombres, "mujeres": mujeres,
                "activos": activos, "inactivos": inactivos,
                "facultades": por_facultad.len(), "sedes": por_sede.len(),
            },
            "por_facultad": por_facultad,
            "por_carrera": por_carrera,
            "por_gestion": por_gestion,
            "por_sede": por_sede,
        });
        st.cache.set("stats:all".into(), val.clone(), STATS_TTL);
        return Ok(respuesta_cacheada(val, "public, max-age=30"));
    }

    let key = format!(
        "stats:g={:?}:f={:?}:c={:?}:s={:?}:x={:?}:a={:?}",
        p.gestion, p.facultad_id, p.carrera_id, p.sede_id, sexo, p.activo
    );
    if let Some(val) = st.cache.get(&key) {
        return Ok(respuesta_cacheada(val, "public, max-age=30"));
    }

    let mut qb: QueryBuilder<'static, Postgres> = QueryBuilder::new(
        "WITH base AS MATERIALIZED ( \
            SELECT facultad_id, carrera_id, sede_id, gestion_ingreso, sexo, ci, en_web, en_padron, activo \
              FROM padron.estudiante \
             WHERE true",
    );
    if let Some(v) = p.gestion {
        qb.push(" AND gestion_ingreso = ").push_bind(v);
    }
    if let Some(v) = p.facultad_id {
        qb.push(" AND facultad_id = ").push_bind(v);
    }
    if let Some(v) = p.carrera_id {
        qb.push(" AND carrera_id = ").push_bind(v);
    }
    if let Some(v) = p.sede_id {
        qb.push(" AND sede_id = ").push_bind(v);
    }
    if let Some(ref v) = sexo {
        qb.push(" AND sexo = ").push_bind(v.clone());
    }
    if let Some(v) = p.activo {
        qb.push(" AND activo = ").push_bind(v);
    }
    qb.push(
        "), \
        res AS ( \
            SELECT count(*)::bigint AS total, \
                   count(*) FILTER (WHERE en_web)::bigint AS en_web, \
                   count(*) FILTER (WHERE en_padron)::bigint AS en_padron, \
                   count(*) FILTER (WHERE en_web AND NOT en_padron)::bigint AS solo_web, \
                   count(ci)::bigint AS con_ci, \
                   count(*) FILTER (WHERE sexo = 'M')::bigint AS hombres, \
                   count(*) FILTER (WHERE sexo = 'F')::bigint AS mujeres, \
                   count(*) FILTER (WHERE activo IS TRUE)::bigint AS activos, \
                   count(*) FILTER (WHERE activo IS FALSE)::bigint AS inactivos \
              FROM base \
        ), \
        fac AS ( \
            SELECT b.facultad_id AS id, f.nombre AS etiqueta, \
                   count(*)::bigint AS total, \
                   count(*) FILTER (WHERE b.en_web)::bigint AS con_datos_web \
              FROM base b \
              JOIN padron.facultad f ON f.id = b.facultad_id \
             GROUP BY b.facultad_id, f.nombre \
             ORDER BY total DESC \
        ), \
        car AS ( \
            SELECT b.carrera_id AS id, c.nombre || ' · ' || f.nombre AS etiqueta, \
                   count(*)::bigint AS total, \
                   count(*) FILTER (WHERE b.en_web)::bigint AS con_datos_web \
              FROM base b \
              JOIN padron.carrera c ON c.id = b.carrera_id \
              JOIN padron.facultad f ON f.id = c.facultad_id \
             GROUP BY b.carrera_id, c.nombre, f.nombre \
             ORDER BY total DESC \
             LIMIT 20 \
        ), \
        ges AS ( \
            SELECT b.gestion_ingreso::int AS id, b.gestion_ingreso::text AS etiqueta, \
                   count(*)::bigint AS total, \
                   count(*) FILTER (WHERE b.en_web)::bigint AS con_datos_web \
              FROM base b \
             WHERE b.gestion_ingreso IS NOT NULL \
             GROUP BY b.gestion_ingreso \
             ORDER BY b.gestion_ingreso \
        ), \
        sed AS ( \
            SELECT b.sede_id AS id, s.nombre AS etiqueta, \
                   count(*)::bigint AS total, \
                   count(*) FILTER (WHERE b.en_web)::bigint AS con_datos_web \
              FROM base b \
              JOIN padron.sede s ON s.id = b.sede_id \
             GROUP BY b.sede_id, s.nombre \
             ORDER BY total DESC \
        ) \
        SELECT json_build_object( \
            'resumen', json_build_object( \
                'total', r.total, 'en_web', r.en_web, 'en_padron', r.en_padron, 'solo_web', r.solo_web, \
                'con_ci', r.con_ci, 'hombres', r.hombres, 'mujeres', r.mujeres, \
                'activos', r.activos, 'inactivos', r.inactivos, \
                'facultades', (SELECT count(*)::bigint FROM fac), \
                'sedes', (SELECT count(*)::bigint FROM sed) \
            ), \
            'por_facultad', coalesce((SELECT json_agg(row_to_json(fac)) FROM fac), '[]'::json), \
            'por_carrera', coalesce((SELECT json_agg(row_to_json(car)) FROM car), '[]'::json), \
            'por_gestion', coalesce((SELECT json_agg(row_to_json(ges)) FROM ges), '[]'::json), \
            'por_sede', coalesce((SELECT json_agg(row_to_json(sed)) FROM sed), '[]'::json) \
        ) FROM res r",
    );

    let (val,): (Value,) = qb.build_query_as().fetch_one(&st.db).await?;
    st.cache.set(key, val.clone(), STATS_TTL);
    Ok(respuesta_cacheada(val, "public, max-age=30"))
}

/// GET /api/scraping/progreso
pub async fn scraping(State(st): State<AppState>) -> ApiResult<(HeaderMap, Json<Value>)> {
    if let Some(val) = st.cache.get("scraping:progreso") {
        return Ok(respuesta_cacheada(val, "public, max-age=5"));
    }

    let (estados, bloques, (ult_10min, ultima), corridas) = tokio::try_join!(
        async {
            sqlx::query_as::<_, (String, i64)>(
                "SELECT estado, count(*) FROM padron.scrape_objetivo GROUP BY 1 ORDER BY 1",
            )
            .fetch_all(&st.db)
            .await
            .map_err(ApiError::from)
        },
        async {
            sqlx::query_as::<_, (String, i64)>(
                "SELECT estado, count(*) FROM padron.scrape_bloque GROUP BY 1 ORDER BY 1",
            )
            .fetch_all(&st.db)
            .await
            .map_err(ApiError::from)
        },
        async {
            sqlx::query_as::<_, (i64, Option<chrono::DateTime<chrono::Utc>>)>(
                "SELECT \
                    (SELECT count(*) FROM padron.web_consulta WHERE consultado_en > now() - interval '10 minutes'), \
                    (SELECT max(consultado_en) FROM padron.web_consulta)",
            )
            .fetch_one(&st.db)
            .await
            .map_err(ApiError::from)
        },
        async {
            sqlx::query_as::<
                _,
                (
                    i64,
                    String,
                    String,
                    chrono::DateTime<chrono::Utc>,
                    Option<chrono::DateTime<chrono::Utc>>,
                ),
            >(
                "SELECT id, modo, estado, iniciado_en, finalizado_en FROM padron.scrape_run ORDER BY id DESC LIMIT 5",
            )
            .fetch_all(&st.db)
            .await
            .map_err(ApiError::from)
        },
    )?;

    let val = json!({
        "objetivos": estados.into_iter().map(|(e, n)| json!({"estado": e, "total": n})).collect::<Vec<_>>(),
        "bloques": bloques.into_iter().map(|(e, n)| json!({"estado": e, "total": n})).collect::<Vec<_>>(),
        "consultas_ultimos_10_min": ult_10min,
        "req_por_segundo": ult_10min as f64 / 600.0,
        "ultima_consulta": ultima,
        "corridas": corridas.into_iter().map(|(id, m, e, i, f)| json!({
            "id": id, "modo": m, "estado": e, "iniciado_en": i, "finalizado_en": f
        })).collect::<Vec<_>>(),
    });
    st.cache
        .set("scraping:progreso".into(), val.clone(), SCRAPING_TTL);
    Ok(respuesta_cacheada(val, "public, max-age=5"))
}
