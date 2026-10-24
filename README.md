# Firecrawl playground

A single static page for poking at a **self-hosted [Firecrawl](https://github.com/firecrawl/firecrawl) API** from a
browser. It has tabs for Scrape, Map, Crawl, Batch scrape, Search, Extract and a Raw request form. Results show up
as rendered Markdown, raw Markdown, links, metadata and the raw JSON response. Every request is also logged to the
browser console as a `curl` command.

The page is plain HTML/JS with no build step (`www/`). The container image serves it with
[Caddy](https://caddyserver.com/), which also reverse-proxies `/v1/*` and `/v2/*` to the Firecrawl API so the page
and the API share one origin.

> [!WARNING]
> **Firecrawl's self-hosted API is unauthenticated, and so is this playground.** Anyone who can reach either one
> can use your instance to scrape and crawl, and use your LLM keys. **Never expose it to the internet.** It is
> meant for localhost or a private network such as WireGuard. If you put it behind a reverse proxy, keep that
> proxy private or add authentication there.

## Run it

### Container (recommended)

```sh
# Firecrawl API reachable as api:3002 on a shared network (e.g. the Firecrawl compose stack):
podman run --rm --name firecrawl-playground \
  --network <firecrawl-network> -p 127.0.0.1:3003:8080 \
  ghcr.io/carneirofc/firecrawl-playground:latest

# Firecrawl API on the host at 127.0.0.1:3002:
podman run --rm --name firecrawl-playground --network host \
  -e FIRECRAWL_UPSTREAM=127.0.0.1:3002 -e LISTEN_PORT=3003 \
  ghcr.io/carneirofc/firecrawl-playground:latest
```

`docker` works the same way. Open <http://127.0.0.1:3003>.

Hardened run (this is how the image is tested):

```sh
podman run --rm --read-only --user 1000 \
  --tmpfs /data --tmpfs /config \
  --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1:3003:8080 -e FIRECRAWL_UPSTREAM=api:3002 \
  ghcr.io/carneirofc/firecrawl-playground:latest
```

Build it yourself with `podman build -t localhost/firecrawl-playground .`.

### Without a container

Open `www/index.html` directly (`file://`). The API field defaults to `http://127.0.0.1:3002`, the Firecrawl API's
default port, and the API's CORS headers let the page call it. Any change to the API field is saved in
`localStorage`. When the page is served over HTTP the field defaults to the page's own origin, which is the
container's proxy.

### Configuration

| Variable             | Default    | Meaning                                                          |
| -------------------- | ---------- | ---------------------------------------------------------------- |
| `FIRECRAWL_UPSTREAM` | `api:3002` | `host:port` of the Firecrawl API that `/v1/*` and `/v2/*` go to. |
| `LISTEN_PORT`        | `8080`     | Port Caddy listens on (plain HTTP).                              |

| Path       | Purpose                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------- |
| `/healthz` | Returns `200 ok` from Caddy itself without contacting the API. Use it for liveness/readiness probes. |
| `/v1/*`, `/v2/*` | Proxied to `FIRECRAWL_UPSTREAM`.                                                        |
| `/`        | The playground (`/srv`).                                                                      |

### Runtime properties

- Runs as **uid/gid 1000**, and the root filesystem can be **read-only**.
- **Writable paths:** `/data` (`XDG_DATA_HOME`) and `/config` (`XDG_CONFIG_HOME`). Mount an `emptyDir` or tmpfs on
  each. Nothing else is written.
- Listens only on `LISTEN_PORT` (default `8080`). Caddy's admin endpoint is disabled, automatic HTTPS is off (TLS
  terminates in front, e.g. at Traefik), and the config is not persisted.
- The base image's `cap_net_bind_service` file capability is removed, so the image starts with
  `allowPrivilegeEscalation: false` / `no-new-privileges` and `capabilities: drop: [ALL]`.
- Base image: `caddy:2.11.7-alpine`, pinned by digest in the `Dockerfile`.

### Security headers

Caddy sends these headers on every response:

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src * data:;
                         connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

Because of `connect-src 'self'`, the served page can only reach the API through its own proxy. Pointing the API
field at another origin is blocked; open the page as `file://` for that instead. Images in scraped Markdown are
loaded from anywhere, and no referrer is sent with them.

## Markdown rendering

Firecrawl returns escaped CommonMark with inline HTML, for example `<br> \| [past](…)` on Hacker News. The Markdown,
Summary and Search views render it with [marked](https://github.com/markedjs/marked) (GFM) and then sanitise it with
[DOMPurify](https://github.com/cure53/DOMPurify) before it reaches the DOM (`www/render.js`):

- scripts, iframes, objects, forms and form controls, `<style>`, `style` attributes, SVG/MathML and event handlers
  are removed, and so are `javascript:` URLs;
- scraped `id`/`name` attributes get a `user-content-` prefix so they can't clobber the page's own elements;
- links open in a new tab with `rel="noopener noreferrer"`, and relative links and images resolve against the
  scraped page's URL;
- "Markdown (raw)" shows the text exactly as returned, and "Raw response" shows the JSON.

## Vendored dependencies

These are served from `www/vendor/`, so nothing is loaded from a CDN at runtime. The files are byte-for-byte
copies from the npm registry tarballs. Licence headers are kept, and the full licence texts sit next to the files.

| File                         | Package / version  | Source                                                                                       | sha256 |
| ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------- | ------ |
| `www/vendor/marked.umd.js`   | marked 18.1.1 (MIT) | `lib/marked.umd.js` in <https://registry.npmjs.org/marked/-/marked-18.1.1.tgz>              | `b82b9334406d8bdd16b6236c08de1cb65b2a859873ca9503d9cc0b292ca3c12a` |
| `www/vendor/purify.min.js`   | dompurify 3.4.17 (Apache-2.0 OR MPL-2.0) | `dist/purify.min.js` in <https://registry.npmjs.org/dompurify/-/dompurify-3.4.17.tgz> | `cd37898f9782adf54820c413191b5691803f0f137c799d6edcfd38523b4c2c31` |

Check them with `sha256sum www/vendor/*.js`. To update one, download the new tarball (`npm pack marked@<version>`),
copy the same file over, and update this table and the version in the commit message.

## Development

```sh
cd test && npm ci && npm test   # node:test + jsdom unit tests for www/render.js
```

CI (`.github/workflows/image.yml`) runs those tests and hadolint, then pushes
`ghcr.io/carneirofc/firecrawl-playground:latest` and `:sha-<short>` (linux/amd64) on every push to `main`.

## Licence

[MIT](LICENSE). The vendored libraries keep their own licences (see above).
