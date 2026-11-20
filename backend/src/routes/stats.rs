//! Estadísticas para el dashboard y progreso del scraping.
use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{error::ApiResult, models::Conteo, AppState};

/// GET /api/stats
pub async fn resumen(State(st): State<AppState>) -> ApiResult<Json<Value>> {
    let (total, en_web, en_padron, solo_web, con_ci, hombres, mujeres): (i64, i64, i64, i64, i64, i64, i64) =
        sqlx::query_as(
            "SELECT count(*), count(*) FILTER (WHERE en_web), count(*) FILTER (WHERE en_padron), \
             count(*) FILTER (WHERE en_web AND NOT en_padron), count(ci), \
             count(*) FILTER (WHERE sexo = 'M'), count(*) FILTER (WHERE sexo = 'F') \
             FROM padron.estudiante",
        )
        .fetch_one(&st.db)
        .await?;

    let por_facultad: Vec<Conteo> = sqlx::query_as(
        "SELECT facultad_id AS id, facultad AS etiqueta, total, con_datos_web \
         FROM padron.v_stats_facultad ORDER BY total DESC",
    )
    .fetch_all(&st.db)
    .await?;
    let por_carrera: Vec<Conteo> = sqlx::query_as(
        "SELECT carrera_id AS id, carrera || ' · ' || facultad AS etiqueta, total, con_datos_web \
         FROM padron.mv_stats_carrera WHERE total > 0 ORDER BY total DESC LIMIT 20",
    )
    .fetch_all(&st.db)
    .await?;
    let por_gestion: Vec<Conteo> = sqlx::query_as(
        "SELECT gestion::int AS id, gestion::text AS etiqueta, total, con_datos_web \
         FROM padron.mv_stats_gestion ORDER BY gestion",
    )
    .fetch_all(&st.db)
    .await?;
    let por_sede: Vec<Conteo> = sqlx::query_as(
        "SELECT sede_id AS id, sede AS etiqueta, total, NULL::bigint AS con_datos_web \
         FROM padron.v_stats_sede ORDER BY total DESC",
    )
    .fetch_all(&st.db)
    .await?;

    Ok(Json(json!({
        "resumen": {
            "total": total, "en_web": en_web, "en_padron": en_padron, "solo_web": solo_web,
            "con_ci": con_ci, "hombres": hombres, "mujeres": mujeres,
            "facultades": por_facultad.len(), "sedes": por_sede.len(),
        },
        "por_facultad": por_facultad,
        "por_carrera": por_carrera,
        "por_gestion": por_gestion,
        "por_sede": por_sede,
    })))
}

/// GET /api/scraping/progreso
pub async fn scraping(State(st): State<AppState>) -> ApiResult<Json<Value>> {
    let estados: Vec<(String, i64)> =
        sqlx::query_as("SELECT estado, count(*) FROM padron.scrape_objetivo GROUP BY 1 ORDER BY 1")
            .fetch_all(&st.db)
            .await?;
    let bloques: Vec<(String, i64)> =
        sqlx::query_as("SELECT estado, count(*) FROM padron.scrape_bloque GROUP BY 1 ORDER BY 1")
            .fetch_all(&st.db)
            .await?;
    let (ult_10min, ultima): (i64, Option<chrono::DateTime<chrono::Utc>>) = sqlx::query_as(
        "SELECT count(*) FILTER (WHERE consultado_en > now() - interval '10 minutes'), max(consultado_en) \
         FROM padron.web_consulta",
    )
    .fetch_one(&st.db)
    .await?;
    let corridas: Vec<(i64, String, String, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> =
        sqlx::query_as(
            "SELECT id, modo, estado, iniciado_en, finalizado_en FROM padron.scrape_run ORDER BY id DESC LIMIT 5",
        )
        .fetch_all(&st.db)
        .await?;
    Ok(Json(json!({
        "objetivos": estados.into_iter().map(|(e, n)| json!({"estado": e, "total": n})).collect::<Vec<_>>(),
        "bloques": bloques.into_iter().map(|(e, n)| json!({"estado": e, "total": n})).collect::<Vec<_>>(),
        "consultas_ultimos_10_min": ult_10min,
        "req_por_segundo": ult_10min as f64 / 600.0,
        "ultima_consulta": ultima,
        "corridas": corridas.into_iter().map(|(id, m, e, i, f)| json!({
            "id": id, "modo": m, "estado": e, "iniciado_en": i, "finalizado_en": f
        })).collect::<Vec<_>>(),
    })))
}
