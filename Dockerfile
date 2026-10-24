# Firecrawl playground: static page + same-origin proxy to a Firecrawl API.
# Runs as uid 1000 with a read-only root filesystem; only /data and /config
# (Caddy's XDG dirs) need to be writable.
FROM docker.io/library/caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f

# Overrides the base image's Caddy labels (CI's metadata-action sets version/revision).
ARG VERSION=dev
LABEL org.opencontainers.image.title="firecrawl-playground" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.vendor="carneirofc" \
      org.opencontainers.image.documentation="https://github.com/carneirofc/firecrawl-playground#readme" \
      org.opencontainers.image.description="Browser playground for a self-hosted Firecrawl API, served and proxied by Caddy" \
      org.opencontainers.image.source="https://github.com/carneirofc/firecrawl-playground" \
      org.opencontainers.image.url="https://github.com/carneirofc/firecrawl-playground" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="docker.io/library/caddy:2.11.7-alpine"

# The base image grants caddy cap_net_bind_service as a file capability. We
# listen on an unprivileged port, and file caps make exec fail under
# no_new_privs (e.g. Kubernetes allowPrivilegeEscalation: false), so drop it.
RUN setcap -r /usr/bin/caddy \
 && mkdir -p /data /config \
 && chown 1000:1000 /data /config

ENV XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config \
    FIRECRAWL_UPSTREAM=api:3002 \
    LISTEN_PORT=8080

COPY Caddyfile /etc/caddy/Caddyfile
COPY www/ /srv/

USER 1000:1000
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
