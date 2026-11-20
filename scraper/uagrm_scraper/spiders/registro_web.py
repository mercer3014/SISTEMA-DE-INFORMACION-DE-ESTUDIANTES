"""
Spider de la página de consulta de registro (URL en PAGINA).

La página es un formulario; al pulsar "Confirmar" hace un GET JSON a:
    {url_api_cai}/api/v1/estudiantes/datos-universidad/{registro}?session_id={uuid}
con url_api_cai (input oculto) = https://caiuagrm.com/apicai y session_id embebido
en js/registro.js. Este spider lee ambos valores de la página (no los hardcodea),
y SÓLO usa esa consulta de lectura; nunca envía el formulario de registro.

Modos:
  · cola (por defecto): consume padron.scrape_objetivo (checkpoint en BD) y, cuando
    se vacía, ejecuta un paso del planificador (descubrimiento de rangos).
  · registros: consulta una lista explícita:  -a registros=224102117,225019590

Argumentos (-a):
  registros=...   lista separada por comas (modo registros)
  limite=N        máximo de registros a consultar en esta corrida (0 = sin límite)
  descubrir=0/1   en modo cola, ejecutar el planificador cuando la cola se vacía (1)
"""
from __future__ import annotations

import json
import re

import scrapy
from scrapy import signals
from scrapy.exceptions import DontCloseSpider

from common.db import connect
from uagrm_scraper import planner
from uagrm_scraper.items import ConsultaRegistroItem

PAGINA = "https://emontero.caiuagrm.com/registro"
API_DEFAULT = "https://caiuagrm.com/apicai"


class RegistroWebSpider(scrapy.Spider):
    name = "registro_web"
    allowed_domains = ["emontero.caiuagrm.com", "caiuagrm.com"]

    def __init__(self, registros: str = "", limite: str = "0", descubrir: str = "1", *a, **kw):
        super().__init__(*a, **kw)
        self.lista = [r.strip() for r in registros.split(",") if r.strip()]
        self.modo = "registros" if self.lista else "cola"
        self.limite = int(limite)
        self.descubrir = descubrir not in ("0", "false", "no")
        self.api = API_DEFAULT
        self.session_id = None
        self.programados = 0
        self.config_lista = False
        self.cola_agotada = False
        self.lotes_desde_plan = 0

    def parametros(self) -> dict:
        return {"modo": self.modo, "registros": self.lista[:50], "limite": self.limite,
                "descubrir": self.descubrir}

    @classmethod
    def from_crawler(cls, crawler, *args, **kwargs):
        spider = super().from_crawler(crawler, *args, **kwargs)
        crawler.signals.connect(spider.on_idle, signal=signals.spider_idle)
        spider.lote = crawler.settings.getint("LOTE_COLA", 100)
        return spider

    # ------------------------------------------------------------------ config
    async def start(self):
        for req in self.start_requests():
            yield req

    def start_requests(self):
        yield scrapy.Request(PAGINA, callback=self.parse_pagina, dont_filter=True, priority=100)

    def parse_pagina(self, response):
        api = response.css("#url_api_cai::attr(value)").get()
        if api:
            self.api = api.rstrip("/")
        js = response.xpath("//script[contains(@src,'registro.js')]/@src").get()
        if js:
            yield response.follow(js, callback=self.parse_js, dont_filter=True, priority=100)
        else:
            self.logger.error("No se encontró registro.js en la página")

    def parse_js(self, response):
        m = re.search(r"session_id=([0-9a-fA-F-]{36})", response.text)
        if not m:
            self.logger.error("No se encontró session_id en registro.js")
            return
        nuevo = m.group(1)
        if nuevo != self.session_id:
            self.logger.info("API=%s session_id=%s", self.api, nuevo)
        self.session_id = nuevo
        self.config_lista = True
        if self.modo == "registros":
            for r in self.lista:
                yield self._req(r)
        # en modo cola los lotes los programa on_idle

    # ------------------------------------------------------------------ cola
    def _db(self):
        if not hasattr(self, "_conn") or self._conn.closed:
            self._conn = connect(autocommit=True)
        return self._conn

    def _tomar_lote(self) -> list[str]:
        n = self.lote
        if self.limite:
            n = min(n, self.limite - self.programados)
        if n <= 0:
            return []
        with self._db().cursor() as cur:
            cur.execute("SELECT padron.fn_tomar_lote(%s, %s)", (n, planner.MAX_INTENTOS))
            return [r[0] for r in cur.fetchall()]

    def on_idle(self, spider):
        if spider is not self or self.modo != "cola" or not self.config_lista:
            return
        # paso periódico del planificador: decide muestras ya resueltas y mueve la
        # frontera mientras se trabaja (no sólo al vaciarse la cola)
        self.lotes_desde_plan += 1
        if self.descubrir and self.lotes_desde_plan >= self.settings.getint("PLANIFICAR_CADA_LOTES", 10):
            self.lotes_desde_plan = 0
            try:
                self.logger.info("Planificador (periódico): %s", planner.paso(self._db()))
            except Exception as exc:  # noqa: BLE001
                self.logger.warning("Planificador falló: %s", exc)
        lote = self._tomar_lote()
        if not lote and self.descubrir and not (self.limite and self.programados >= self.limite):
            resumen = planner.paso(self._db())
            self.logger.info("Planificador: %s", resumen)
            lote = self._tomar_lote()
        if not lote:
            self.logger.info("Cola vacía: recolección terminada (o límite alcanzado).")
            return  # deja cerrar el spider
        for r in lote:
            self.crawler.engine.crawl(self._req(r))
        raise DontCloseSpider

    # ------------------------------------------------------------------ consulta
    def _req(self, registro: str, reintento_sesion: int = 0) -> scrapy.Request:
        self.programados += 1
        url = f"{self.api}/api/v1/estudiantes/datos-universidad/{registro}?session_id={self.session_id}"
        return scrapy.Request(
            url, callback=self.parse_api, errback=self.on_error, dont_filter=True,
            headers={"Accept": "application/json, text/javascript, */*; q=0.01",
                     "X-Requested-With": "XMLHttpRequest", "Referer": PAGINA},
            cb_kwargs={"registro": registro, "reintento_sesion": reintento_sesion},
        )

    def parse_api(self, response, registro: str, reintento_sesion: int):
        texto = response.text.strip().lstrip("\ufeff")
        try:
            data = json.loads(texto)
        except json.JSONDecodeError:
            if "autentific" in texto.lower() and reintento_sesion < 1:
                # sesión inválida: recargar configuración y reintentar
                self.logger.warning("Sesión rechazada; recargando session_id")
                self.programados -= 1
                yield scrapy.Request(PAGINA, callback=self.parse_pagina, dont_filter=True, priority=100)
                req = self._req(registro, reintento_sesion + 1)
                yield req.replace(priority=-1)
                return
            # HTML/texto inesperado = problema del servidor: reintentar luego sin gastar intentos
            yield ConsultaRegistroItem(registro=registro, http_status=response.status, resultado="error",
                                       payload=None, mensaje=texto[:300], transitorio=True)
            return

        if data.get("type") == "success" and isinstance(data.get("data"), dict):
            yield ConsultaRegistroItem(registro=registro, http_status=response.status,
                                       resultado="encontrado", payload=data["data"], mensaje=None)
        elif data.get("type") == "error" and "no se encuentra" in str(data.get("data", "")).lower():
            yield ConsultaRegistroItem(registro=registro, http_status=response.status,
                                       resultado="no_encontrado", payload=None, mensaje=str(data["data"]))
        else:
            # p.ej. "El sistema no puede procesar la consulta ... [204]" (caída temporal del backend):
            # vuelve a la cola sin gastar intentos; BackoffMiddleware pausa el motor.
            self.crawler.stats.inc_value("api/error_transitorio")
            yield ConsultaRegistroItem(registro=registro, http_status=response.status, resultado="error",
                                       payload=None, mensaje=texto[:300], transitorio=True)

    def on_error(self, failure):
        req = failure.request
        registro = req.cb_kwargs.get("registro")
        status = getattr(getattr(failure.value, "response", None), "status", None)
        self.logger.warning("Fallo definitivo %s: %s", registro, failure.value)
        yield ConsultaRegistroItem(registro=registro, http_status=status, resultado="error",
                                   payload=None, mensaje=repr(failure.value)[:300])

    def closed(self, reason):
        if hasattr(self, "_conn") and not self._conn.closed:
            self._conn.close()
