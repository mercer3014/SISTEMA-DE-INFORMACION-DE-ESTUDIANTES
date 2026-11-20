# API Rust (Axum). Imágenes base multi-arquitectura (linux/amd64 y linux/arm64);
# sqlx usa rustls (sin OpenSSL), así que no hay dependencias nativas extra.

# ---- build ----
FROM rust:1-slim-bookworm AS build
WORKDIR /app
# Limita el paralelismo para no agotar la RAM de un VPS pequeño (sobrescribible).
ARG CARGO_BUILD_JOBS=2
ENV CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS}
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release --locked && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release --locked

# ---- runtime ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10001 api
COPY --from=build /app/target/release/estudiantes-api /usr/local/bin/estudiantes-api
USER api
ENV API_BIND=0.0.0.0:8080 RUST_LOG=info
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/health >/dev/null || exit 1
CMD ["estudiantes-api"]
