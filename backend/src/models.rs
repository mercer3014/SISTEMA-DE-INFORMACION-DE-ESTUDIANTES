//! Modelos (filas de la BD serializadas a JSON).
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use sqlx::FromRow;

#[derive(Serialize, FromRow)]
pub struct EstudianteResumen {
    pub registro: String,
    pub nombre_completo: String,
    pub ci: Option<String>,
    pub sexo: Option<String>,
    pub facultad_id: Option<i32>,
    pub facultad: Option<String>,
    pub carrera_id: Option<i32>,
    pub carrera: Option<String>,
    pub sede: Option<String>,
    pub gestion_ingreso: Option<i16>,
    pub activo: Option<bool>,
    pub en_padron: bool,
    pub en_web: bool,
    pub relevancia: f32,
}

#[derive(Serialize, FromRow)]
pub struct EstudianteDetalle {
    pub registro: String,
    pub nombre_completo: String,
    pub nombres: Option<String>,
    pub apellido_pri: Option<String>,
    pub apellido_seg: Option<String>,
    pub ci: Option<String>,
    pub lugar_ci: Option<String>,
    pub sexo: Option<String>,
    pub fecha_nac: Option<NaiveDate>,
    pub direccion: Option<String>,
    pub telefono: Option<String>,
    pub celular: Option<String>,
    pub activo: Option<bool>,
    pub plan: Option<String>,
    pub gestion_ingreso: Option<i16>,
    pub facultad_id: Option<i32>,
    pub facultad: Option<String>,
    pub carrera_id: Option<i32>,
    pub carrera: Option<String>,
    pub carrera_codigo: Option<String>,
    pub sede_id: Option<i32>,
    pub sede: Option<String>,
    pub en_padron: bool,
    pub en_web: bool,
    pub mesa: Option<i32>,
    pub recinto: Option<String>,
    pub recinto_lugar: Option<String>,
    pub aula: Option<String>,
    pub hab_ci: Option<bool>,
    pub hab_icu_fac: Option<bool>,
    pub hab_ful: Option<bool>,
    pub web_actualizado_at: Option<DateTime<Utc>>,
    pub padron_actualizado_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
pub struct FilaPadron {
    pub fuente: String,
    pub nro: Option<i32>,
    pub facultad: Option<String>,
    pub carrera: Option<String>,
    pub sede: Option<String>,
    pub nombre: String,
    pub mesa: Option<i32>,
    pub recinto: Option<String>,
    pub aula: Option<String>,
    pub pagina: Option<i32>,
}

#[derive(Serialize, FromRow)]
pub struct Facultad {
    pub id: i32,
    pub nombre: String,
    pub total: i64,
}

#[derive(Serialize, FromRow)]
pub struct Carrera {
    pub id: i32,
    pub facultad_id: i32,
    pub nombre: String,
    pub codigo: Option<String>,
    pub total: i64,
}

#[derive(Serialize, FromRow)]
pub struct Sede {
    pub id: i32,
    pub nombre: String,
    pub total: i64,
}

#[derive(Serialize, FromRow)]
pub struct Conteo {
    pub id: Option<i32>,
    pub etiqueta: Option<String>,
    pub total: i64,
    pub con_datos_web: Option<i64>,
}

#[derive(Serialize)]
pub struct Paginado<T: Serialize> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub pages: i64,
}
