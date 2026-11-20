"""Pipeline PostgreSQL: cada item se guarda con padron.fn_registrar_consulta_web()."""
from __future__ import annotations

import json
import logging

from psycopg.types.json import Jsonb

from common.db import connect

log = logging.getLogger(__name__)


class PostgresPipeline:
    def open_spider(self, spider):
        self.conn = connect(autocommit=True)
        spider.db = self.conn
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO padron.scrape_run (spider, modo, parametros) VALUES (%s, %s, %s) RETURNING id",
                (spider.name, spider.modo, Jsonb(spider.parametros())),
            )
            self.run_id = cur.fetchone()[0]
        spider.run_id = self.run_id
        self.contador = {"encontrado": 0, "no_encontrado": 0, "error": 0, "transitorio": 0}
        log.info("scrape_run id=%s", self.run_id)

    def process_item(self, item, spider):
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT padron.fn_registrar_consulta_web(%s, %s, %s, %s, %s, %s, %s)",
                (self.run_id, item["registro"], item.get("http_status"), item["resultado"],
                 Jsonb(item["payload"]) if item.get("payload") is not None else None,
                 item.get("mensaje"), bool(item.get("transitorio"))),
            )
        self.contador["transitorio" if item.get("transitorio") else item["resultado"]] += 1
        return item

    def close_spider(self, spider):
        stats = dict(spider.crawler.stats.get_stats())
        stats = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in stats.items()}
        stats["resultados"] = self.contador
        reason = stats.get("finish_reason", "finished")
        estado = "finalizado" if reason == "finished" else "interrumpido"
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE padron.scrape_run SET estado = %s, finalizado_en = now(), stats = %s WHERE id = %s",
                (estado, Jsonb(json.loads(json.dumps(stats, default=str))), self.run_id),
            )
            # devolver a la cola lo que quedó a medias (parada con Ctrl+C, etc.)
            cur.execute("UPDATE padron.scrape_objetivo SET estado = 'pendiente' WHERE estado = 'en_proceso'")
            cur.execute("SELECT padron.fn_refrescar_stats()")
        self.conn.close()
