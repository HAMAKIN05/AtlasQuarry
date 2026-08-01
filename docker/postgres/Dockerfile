FROM postgres:16

# pg_bigm は公式イメージに含まれない（DB設計書 §1、機能定義書 §12.3）。
# postgres:16（bookworm）の apt には bigm のパッケージが存在しないため、ソースからビルドする。
#
# libicu-dev が要る点に注意。PostgreSQL 16 のヘッダ（utils/pg_locale.h）が unicode/ucol.h を
# include しており、無いとコンパイルが通らない。
ARG PG_BIGM_VERSION=1.2-20240606

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl libicu-dev postgresql-server-dev-16; \
    curl -fsSL -o /tmp/pg_bigm.tar.gz \
        "https://github.com/pgbigm/pg_bigm/archive/refs/tags/v${PG_BIGM_VERSION}.tar.gz"; \
    mkdir -p /tmp/pg_bigm; \
    tar xzf /tmp/pg_bigm.tar.gz -C /tmp/pg_bigm --strip-components=1; \
    make -C /tmp/pg_bigm USE_PGXS=1; \
    make -C /tmp/pg_bigm USE_PGXS=1 install; \
    rm -rf /tmp/pg_bigm /tmp/pg_bigm.tar.gz; \
    apt-get purge -y --auto-remove \
        build-essential curl libicu-dev postgresql-server-dev-16; \
    rm -rf /var/lib/apt/lists/*

# 初回起動時に拡張を作成する。既存ボリュームに対しては実行されないため、
# 移行時は scripts/migrate.mjs 側の CREATE EXTENSION が効く。
COPY initdb/ /docker-entrypoint-initdb.d/
