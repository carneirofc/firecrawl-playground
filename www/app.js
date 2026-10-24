const $ = id => document.getElementById(id);
const FORMATS = ["markdown","html","rawHtml","links","images","summary","screenshot","json"];

// API base: same origin when served by the playground container (which proxies /v1, /v2),
// else the local API. Remembered in localStorage.
const defBase = location.protocol === "file:" ? "http://127.0.0.1:3002" : location.origin;
$("base").value = localStorage.getItem("fc_base") || defBase;
$("base").onchange = () => localStorage.setItem("fc_base", $("base").value.replace(/\/+$/,""));
const base = () => $("base").value.replace(/\/+$/,"");

// Tabs
const sections = [...document.querySelectorAll("section.form")];
sections.forEach(s => {
  const b = document.createElement("button");
  b.textContent = s.dataset.title; b.dataset.tab = s.dataset.tab;
  b.onclick = () => showTab(s.dataset.tab);
  $("tabs").appendChild(b);
});
function showTab(t) {
  sections.forEach(s => s.classList.toggle("active", s.dataset.tab === t));
  [...$("tabs").children].forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  location.hash = t;
}
showTab((location.hash || "#scrape").slice(1));
window.addEventListener("hashchange", () => showTab((location.hash || "#scrape").slice(1)));

// Scrape format checkboxes
FORMATS.forEach(f => {
  const l = document.createElement("label");
  l.innerHTML = `<input type="checkbox" value="${f}" ${f==="markdown"?"checked":""}> ${f}`;
  $("s_formats").appendChild(l);
});
$("s_formats").onchange = () => { $("s_json").hidden = !checked("s_formats").includes("json"); };
function checked(id) { return [...$(id).querySelectorAll("input:checked")].map(i => i.value); }
const lines = id => $(id).value.split("\n").map(s => s.trim()).filter(Boolean);
const num = id => Number($(id).value);
function parseJSON(id, label) {
  const v = $(id).value.trim(); if (!v) return undefined;
  try { return JSON.parse(v); } catch (e) { throw new Error(`${label}: invalid JSON (${e.message})`); }
}

// Output
let last = null;
function status(html) { $("status").innerHTML = html; }
function render(result) {
  last = result;
  const views = buildViews(result);
  $("views").innerHTML = "";
  views.forEach((v, i) => {
    const b = document.createElement("button"); b.textContent = v.name;
    b.onclick = () => { [...$("views").children].forEach(x => x.classList.remove("active")); b.classList.add("active"); $("view").replaceChildren(v.render()); };
    $("views").appendChild(b);
    if (i === 0) b.click();
  });
}
function pre(text) { const p = document.createElement("pre"); p.textContent = text; return p; }
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const srcOf = d => d?.metadata?.sourceURL || d?.url || "";
// Markdown rendered as sanitised HTML (render.js); relative links resolve against the page's final URL.
function mdDocs(docs, key) {
  const box = el("div");
  docs.filter(d => d[key]).forEach((d, i) => {
    if (i) box.appendChild(el("hr", "doc-sep"));
    if (docs.length > 1) box.appendChild(el("div", "md-src", srcOf(d)));
    box.appendChild(FcRender.markdownView(d[key], d.metadata?.url || srcOf(d)));
  });
  return box;
}
function searchView(items) {
  const ol = el("ol", "results");
  items.forEach(x => {
    const li = el("li"), url = x.url || x.imageUrl || "";
    const a = el("a", null, x.title || url || "(untitled)");
    if (/^https?:\/\//i.test(url)) { a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
    li.append(a, el("div", "dim", url));
    if (x.description || x.snippet) li.appendChild(el("div", null, x.description || x.snippet));
    if (x.markdown) {
      const det = el("details"); det.appendChild(el("summary", null, "Markdown"));
      det.appendChild(FcRender.markdownView(x.markdown, x.metadata?.url || url));
      li.appendChild(det);
    }
    ol.appendChild(li);
  });
  return ol;
}
function buildViews(r) {
  const v = [];
  const data = r && (r.data ?? r);
  const docs = Array.isArray(data) ? data : (data && typeof data === "object" ? [data] : []);
  const first = docs.find(d => d && (d.markdown || d.summary || d.json || d.screenshot || d.links));
  if (first?.markdown) {
    v.push({ name: "Markdown", render: () => mdDocs(docs, "markdown") });
    v.push({ name: "Markdown (raw)", render: () => pre(docs.filter(d=>d.markdown).map(d => (docs.length>1?`# ${srcOf(d)}\n\n`:"") + d.markdown).join("\n\n---\n\n")) });
  }
  if (first?.summary) v.push({ name: "Summary", render: () => mdDocs(docs, "summary") });
  if (first?.json) v.push({ name: "JSON result", render: () => pre(JSON.stringify(docs.length>1?docs.map(d=>d.json):first.json, null, 2)) });
  const fmtLinks = ls => ls.map(l => typeof l === "string" ? l : `${l.url}${l.title?"  — "+l.title:""}`).join("\n");
  if (first?.links) v.push({ name: `Links (${first.links.length})`, render: () => pre(fmtLinks(first.links)) });
  if (data?.links && !first?.links) v.push({ name: `Links (${data.links.length})`, render: () => pre(fmtLinks(data.links)) });
  // /v2/search: data.web / data.news / data.images
  ["web","news","images"].forEach(k => { if (Array.isArray(data?.[k])) v.push({ name: `Search ${k} (${data[k].length})`, render: () => searchView(data[k]) }); });
  // /v2/extract: data is the extracted object itself
  if (r?.status && data && !Array.isArray(data) && !first && !["web","news","images"].some(k => data[k])) v.push({ name: "Extracted", render: () => pre(JSON.stringify(data, null, 2)) });
  if (first?.screenshot) v.push({ name: "Screenshot", render: () => { const s = first.screenshot; const img = document.createElement("img"); img.className = "shot"; img.src = s.startsWith("http")||s.startsWith("data:") ? s : `data:image/png;base64,${s}`; return img; } });
  if (first?.html || first?.rawHtml) v.push({ name: "HTML", render: () => pre(first.html || first.rawHtml) });
  if (first?.metadata) v.push({ name: "Metadata", render: () => pre(JSON.stringify(first.metadata, null, 2)) });
  v.push({ name: "Raw response", render: () => pre(JSON.stringify(r, null, 2)) });
  return v;
}

async function call(method, path, body) {
  const t0 = performance.now();
  const res = await fetch(base() + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _nonJson: text }; }
  return { res, json, ms: Math.round(performance.now() - t0) };
}
function curlOf(method, path, body) {
  return `curl -X ${method} ${base()}${path}` + (body ? ` -H 'Content-Type: application/json' -d '${JSON.stringify(body).replace(/'/g,"'\\''")}'` : "");
}
function statusLine(method, path, r, extra = "") {
  const cls = r.res.ok && r.json.success !== false ? "ok" : "err";
  const err = r.json.error ? ` — ${escapeHtml(String(r.json.error))}` : "";
  const warn = r.json.data?.warning || r.json.warning ? ` · warning: ${escapeHtml(String(r.json.data?.warning || r.json.warning))}` : "";
  return `<span class="${cls}">${r.res.status}</span><span>${method} ${path}</span><span>${r.ms} ms</span>${extra}<span>${err}${warn}</span>`;
}
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

let pollAbort = null;
async function poll(path, label, extraStatus) {
  const ctl = { stop: false }; pollAbort = ctl;
  for (let i = 0; i < 600 && !ctl.stop; i++) {
    const r = await call("GET", path);
    const st = r.json.status;
    const prog = r.json.total != null ? ` ${r.json.completed ?? 0}/${r.json.total}` : "";
    status(statusLine("GET", path, r, `<span>${label}: <b>${st ?? "?"}</b>${prog}</span>${extraStatus||""}`));
    render(r.json);
    if (!r.res.ok || ["completed","failed","cancelled"].includes(st)) return r;
    await new Promise(res => setTimeout(res, 2000));
  }
}

// Endpoint builders: return [method, path, body, asyncKind]
const builders = {
  scrape() {
    const fmts = checked("s_formats").map(f => {
      if (f === "json") { const o = { type: "json", prompt: $("s_prompt").value }; const s = parseJSON("s_schema", "schema"); if (s) o.schema = s; return o; }
      return f;
    });
    const body = { url: $("s_url").value, formats: fmts, onlyMainContent: $("s_main").checked, timeout: num("s_timeout") };
    if (num("s_wait")) body.waitFor = num("s_wait");
    if ($("s_mobile").checked) body.mobile = true;
    if ($("s_cache").checked) body.maxAge = 0;
    return ["POST", "/v2/scrape", body];
  },
  map() {
    const body = { url: $("m_url").value, limit: num("m_limit"), sitemap: $("m_sitemap").value, includeSubdomains: $("m_sub").checked };
    if ($("m_search").value.trim()) body.search = $("m_search").value.trim();
    return ["POST", "/v2/map", body];
  },
  crawl() {
    const body = { url: $("c_url").value, limit: num("c_limit"), sitemap: $("c_sitemap").value,
      allowExternalLinks: $("c_ext").checked, allowSubdomains: $("c_subd").checked,
      scrapeOptions: { formats: [$("c_fmt").value], onlyMainContent: true } };
    if ($("c_depth").value !== "") body.maxDiscoveryDepth = num("c_depth");
    if (lines("c_inc").length) body.includePaths = lines("c_inc");
    if (lines("c_exc").length) body.excludePaths = lines("c_exc");
    return ["POST", "/v2/crawl", body, "/v2/crawl/"];
  },
  batch() { return ["POST", "/v2/batch/scrape", { urls: lines("b_urls"), formats: [$("b_fmt").value] }, "/v2/batch/scrape/"]; },
  search() {
    const body = { query: $("q_query").value, limit: num("q_limit"), lang: $("q_lang").value };
    if ($("q_scrape").checked) body.scrapeOptions = { formats: ["markdown"], onlyMainContent: true };
    return ["POST", "/v2/search", body];
  },
  extract() {
    const body = { urls: lines("e_urls"), prompt: $("e_prompt").value };
    const s = parseJSON("e_schema", "schema"); if (s) body.schema = s;
    return ["POST", "/v2/extract", body, "/v2/extract/"];
  },
  raw() {
    const m = $("r_method").value; const b = m === "GET" ? undefined : parseJSON("r_body", "body");
    return [m, $("r_path").value, b];
  },
};

document.querySelectorAll("[data-run]").forEach(btn => btn.onclick = async () => {
  const kind = btn.dataset.run;
  if (pollAbort) pollAbort.stop = true;
  btn.disabled = true;
  try {
    const [method, path, body, pollPrefix] = builders[kind]();
    console.log(curlOf(method, path, body));
    status(`<span>Running ${method} ${path}…</span><span class="link" id="cp">copy as curl</span>`);
    $("cp").onclick = () => navigator.clipboard.writeText(curlOf(method, path, body));
    const r = await call(method, path, body);
    status(statusLine(method, path, r));
    render(r.json);
    if (pollPrefix && r.res.ok && r.json.id) {
      const id = r.json.id;
      if (kind === "crawl") { $("c_cancel").disabled = false; $("c_cancel").onclick = async () => { pollAbort && (pollAbort.stop = true); const c = await call("DELETE", `/v2/crawl/${id}`); status(statusLine("DELETE", `/v2/crawl/${id}`, c)); render(c.json); $("c_cancel").disabled = true; }; }
      await poll(pollPrefix + id, `${kind} ${id.slice(0,8)}`);
      if (kind === "crawl") $("c_cancel").disabled = true;
    }
  } catch (e) {
    status(`<span class="err">Error</span><span>${escapeHtml(e.message)}</span>`);
    $("view").replaceChildren(pre(String(e.stack || e)));
  } finally { btn.disabled = false; }
});

// Health check
$("ping").onclick = async () => {
  $("health").textContent = "…";
  try { const r = await call("GET", "/"); $("health").innerHTML = r.res.ok ? `<span class="ok">up</span> · ${r.ms} ms` : `<span class="err">${r.res.status}</span>`; }
  catch (e) { $("health").innerHTML = `<span class="err">unreachable</span> (${escapeHtml(e.message)})`; }
};
$("ping").click();
