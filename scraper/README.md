# Scraper (Scrapy) + ingesta del PDF

```bash
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python -m pdf_ingest.parse_padron ../data/padron.pdf ../data/padron.csv --workers 3
python -m pdf_ingest.load_padron ../data/padron.csv --pdf ../data/padron.pdf
python -m uagrm_scraper.planner init
scrapy crawl registro_web -a registros=224102117,225019590   # prueba
scrapy crawl registro_web                                    # recolección completa reanudable
```
Detalles del endpoint y del algoritmo: [../docs/scraping.md](../docs/scraping.md).
