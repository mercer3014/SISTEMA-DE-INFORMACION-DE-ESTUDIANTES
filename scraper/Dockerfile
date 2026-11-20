# Scraper Scrapy + herramientas de BD. Se construye con el CONTEXTO EN LA RAÍZ del repo:
#   docker build -f scraper/Dockerfile -t estudiantes-scraper .
# La misma imagen sirve para el servicio `estudiantes-migrate` (database/migrate.sh).
# Base multi-arquitectura; todas las dependencias tienen wheels para linux/arm64.
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10002 -m scraper
WORKDIR /app
COPY scraper/requirements.txt .
RUN pip install -r requirements.txt
COPY database /database
COPY --chown=scraper:scraper scraper/ .
RUN chmod +x /app/docker-loop.sh /database/migrate.sh
USER scraper
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-loop.sh"]
