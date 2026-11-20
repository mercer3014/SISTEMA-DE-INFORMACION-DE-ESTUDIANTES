"""Conexión compartida a PostgreSQL (lee DATABASE_URL de entorno o .env)."""
from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Defina DATABASE_URL (ver .env.example)")
    return url


def connect(**kw) -> psycopg.Connection:
    return psycopg.connect(database_url(), **kw)
