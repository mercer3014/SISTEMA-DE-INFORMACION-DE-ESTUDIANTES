"""Configuración Scrapy: scraping *educado* (polite) de la API de consulta de registro."""
import os

BOT_NAME = "uagrm_scraper"
SPIDER_MODULES = ["uagrm_scraper.spiders"]
NEWSPIDER_MODULE = "uagrm_scraper.spiders"

USER_AGENT = os.environ.get(
    "SCRAPER_USER_AGENT",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0 Safari/537.36 uagrm-padron/1.0",
)
ROBOTSTXT_OBEY = True

# --- Cortesía con el servidor -------------------------------------------
CONCURRENT_REQUESTS = int(os.environ.get("SCRAPER_CONCURRENCY", 4))
CONCURRENT_REQUESTS_PER_DOMAIN = CONCURRENT_REQUESTS
DOWNLOAD_DELAY = float(os.environ.get("SCRAPER_DELAY", 0.25))
RANDOMIZE_DOWNLOAD_DELAY = True
DOWNLOAD_TIMEOUT = 40

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1.0
AUTOTHROTTLE_MAX_DELAY = 60.0
AUTOTHROTTLE_TARGET_CONCURRENCY = float(os.environ.get("SCRAPER_TARGET_CONCURRENCY", 2.0))

RETRY_ENABLED = True
RETRY_TIMES = 4
RETRY_HTTP_CODES = [408, 429, 500, 502, 503, 504, 520, 521, 522, 524]

# Pausa global (back-off exponencial) si el sitio da errores seguidos o limita.
BACKOFF_ERRORES_SEGUIDOS = 5
BACKOFF_PAUSA_INICIAL = 30      # segundos
BACKOFF_PAUSA_MAXIMA = 900      # 15 minutos

DOWNLOADER_MIDDLEWARES = {
    "uagrm_scraper.middlewares.BackoffMiddleware": 560,
}
ITEM_PIPELINES = {
    "uagrm_scraper.pipelines.PostgresPipeline": 300,
}

# --- Cola en BD ---------------------------------------------------------
LOTE_COLA = int(os.environ.get("SCRAPER_LOTE", 300))   # registros tomados por vez
PLANIFICAR_CADA_LOTES = 10                               # paso del planificador cada ~3000 consultas

COOKIES_ENABLED = True
TELNETCONSOLE_ENABLED = False
LOG_LEVEL = os.environ.get("SCRAPER_LOG_LEVEL", "INFO")
LOGSTATS_INTERVAL = 60
REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
FEED_EXPORT_ENCODING = "utf-8"
