# Recolección web (Scrapy)

## Fuente web
La fuente web es un formulario público de consulta por número de registro (las URLs están en
`scraper/uagrm_scraper/spiders/registro_web.py`). Al escribir el registro y pulsar **Confirmar**,
el JavaScript de la página hace:

```
GET {url_api}/api/v1/estudiantes/…/{registro}?session_id={uuid}
```
* `url_api` está en un `<input type="hidden">` de la página y `session_id` dentro de su JavaScript.
  El spider los **lee de la página** en cada arranque (si cambian, se adapta solo).
* Respuesta encontrada:
  ```json
  {"type":"success","data":{"nombre":"…","apellido_pri":"…","apellido_seg":"…","ci":"…","lugar_ci":"SCZ",
   "activo":"1","sexo":"M","fecha_nac":"AAAA-MM-DD","direccion":"…","telefono":"…","tel_celular":"…",
   "carr":"…","plan":"…","des_carrera":"…","facultad":"…","registro":"…"}}
  ```
* No encontrado: `{"type":"error","data":"No se encuentra el estudiante con registro: …"}`
* Sin `session_id`: texto "Se requiere autentificacion…" (el spider recarga la sesión y reintenta).
* A veces la API devuelve escapes rotos (`ECONu00d3MICAS`); `fn_reparar_unicode` los corrige.
* El spider **sólo usa esa consulta de lectura**; nunca envía el formulario de registro (`/registrar`).

## Algoritmo de recolección completa
El PDF está incompleto, así que se usa sólo como **semilla** y para entender la numeración
(ver [registro.md](registro.md)). La fuente web es la principal.

1. **Semilla**: los 83 692 registros del PDF se encolan en `padron.scrape_objetivo`.
2. **Bloques**: para cada gestión 2000…año actual se crean bloques de 100 secuencias
   (`scrape_bloque`, 6 primeros dígitos) desde 0 hasta el último bloque con datos + 3 (frontera).
3. **Expandir / muestrear**:
   * bloque con ≥ 3 registros en el PDF → se encolan sus **100 registros válidos** (expandido);
   * bloque con < 3 → se consulta una **muestra de 20**; si aparece algún estudiante nuevo se
     expande, si no se marca **descartado** (rango vacío, no se gastan más consultas).
4. **Frontera**: si se encuentran estudiantes en el bloque más alto de una gestión, se agregan 3
   bloques más; se detiene tras 3 bloques vacíos seguidos. Así se capturan rangos que el PDF no tiene.
5. **Prioridad** (`padron.fn_prioridad_bloque`, migración 0008; dentro de cada nivel, registros más recientes primero):
   1. registros del PDF (estudiantes vigentes: existen seguro y se completan con CI, etc.);
   2. bloques densos (≥ 10 registros en el PDF) de gestiones ≥ 2015;
   3. resto de bloques y muestras de 2010+;
   4. gestiones 2001-2009 (siempre muestreo primero, se expanden sólo si hay hallazgos);
   5. prefijo `200` (formato antiguo disperso, muestreo primero).
   El planificador corre cada ~3000 consultas (no sólo al final), así las muestras resueltas se
   expanden o descartan y la frontera avanza durante la recolección.
   Densidad medida en la web: ~98.6 % de los números válidos de bloques recientes existen.
6. **Checkpoint**: cada consulta actualiza `scrape_objetivo.estado`
   (`pendiente → en_proceso → encontrado | no_encontrado | error`). Se puede detener en cualquier
   momento y al relanzar continúa donde quedó. Los `error` se reintentan hasta 5 veces.
   `fn_tomar_lote` usa `FOR UPDATE SKIP LOCKED`, así que se pueden correr varios workers.

## Cortesía (polite scraping)
* `CONCURRENT_REQUESTS=6`, `AUTOTHROTTLE` (objetivo 3 en paralelo, máx. 60 s de espera),
  `DOWNLOAD_DELAY=0.2 s` aleatorizado → ~2 consultas/s.
* `RETRY_TIMES=4` para 408/429/5xx.
* **Back-off global** (`BackoffMiddleware`): 5 fallos seguidos ⇒ pausa todo 30 s, 60 s, 120 s… hasta 15 min.
  Cuenta como fallo tanto HTTP 429/5xx como la respuesta HTTP 200
  `{"type":"error","data":"El sistema no puede procesar la consulta ... [204]"}` (caída temporal del
  backend de la API, observada de noche 02:20-04:01). Esas consultas son **transitorias**: el registro
  vuelve a `pendiente` sin gastar intentos (`fn_registrar_consulta_web(..., p_transitorio => true)`).
* Ritmo medido ~2.3-2.4 consultas/s con latencia ~1.9 s por consulta; no se aumentó la carga.

## Comandos
```bash
cd scraper && source .venv/bin/activate
# consultar registros concretos
scrapy crawl registro_web -a registros=224102117,225019590
# muestra de 40 de la cola, sin descubrimiento
scrapy crawl registro_web -a limite=40 -a descubrir=0
# recolección completa reanudable (supervisada, en segundo plano)
nohup ../scripts/scrape_full.sh > ../logs/scrape_full.out 2>&1 &
# progreso
../scripts/scrape_status.sh            # o la página /scraping del frontend
# planificador manual
python -m uagrm_scraper.planner status|step
```
Detener: `kill $(cat logs/scrape_full.pid)` (se reanuda al relanzar).

## Tablas involucradas
`scrape_objetivo` (cola/checkpoint) · `scrape_bloque` (descubrimiento) · `scrape_run` (corridas y
estadísticas) · `web_consulta` (JSON crudo de cada respuesta, para reprocesar).
