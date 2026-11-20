"""Back-off global: si el sitio falla o limita varias veces seguidas, se pausa todo el motor."""
from __future__ import annotations

import logging

from twisted.internet import reactor

log = logging.getLogger(__name__)


class BackoffMiddleware:
    LIMITE_CODES = {429, 500, 502, 503, 504, 520, 521, 522, 524}

    def __init__(self, crawler):
        s = crawler.settings
        self.crawler = crawler
        self.umbral = s.getint("BACKOFF_ERRORES_SEGUIDOS", 5)
        self.pausa_ini = s.getint("BACKOFF_PAUSA_INICIAL", 30)
        self.pausa_max = s.getint("BACKOFF_PAUSA_MAXIMA", 900)
        self.seguidos = 0
        self.nivel = 0
        self.pausado = False

    @classmethod
    def from_crawler(cls, crawler):
        return cls(crawler)

    def _fallo(self, motivo: str):
        self.seguidos += 1
        self.crawler.stats.inc_value("backoff/fallos")
        if self.seguidos >= self.umbral and not self.pausado:
            pausa = min(self.pausa_ini * (2 ** self.nivel), self.pausa_max)
            self.nivel += 1
            self.pausado = True
            self.crawler.stats.inc_value("backoff/pausas")
            log.warning("Back-off: %s fallos seguidos (%s). Pausando %ss", self.seguidos, motivo, pausa)
            self.crawler.engine.pause()
            reactor.callLater(pausa, self._reanudar)

    def _reanudar(self):
        log.info("Back-off: reanudando")
        self.pausado = False
        self.seguidos = 0
        self.crawler.engine.unpause()

    def process_response(self, request, response, spider=None):
        if response.status in self.LIMITE_CODES:
            self._fallo(f"HTTP {response.status}")
        elif self._error_api(response):
            # HTTP 200 pero la API dice que no puede procesar (caída de su backend)
            self._fallo("API: no puede procesar")
        else:
            self.seguidos = 0
            if self.nivel and not self.pausado:
                self.nivel = max(0, self.nivel - 1)
        return response

    @staticmethod
    def _error_api(response) -> bool:
        if "/apicai/" not in response.url:
            return False
        body = response.body[:400]
        if b'"type":"success"' in body or b"No se encuentra" in body:
            return False
        return b'"type":"error"' in body or not body.lstrip().startswith(b"{")

    def process_exception(self, request, exception, spider=None):
        self._fallo(type(exception).__name__)
        return None
