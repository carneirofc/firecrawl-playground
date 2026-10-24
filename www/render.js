// Markdown rendering for the result views.
// Scraped content is untrusted: marked turns it into HTML and DOMPurify strips
// everything active (scripts, iframes, forms, event handlers, javascript: URLs)
// before it reaches the DOM. Needs vendor/marked.umd.js and vendor/purify.min.js.
(function (global) {
  "use strict";
  const md = new global.marked.Marked({ gfm: true, async: false });
  const purify = global.DOMPurify(global);

  const CONFIG = {
    USE_PROFILES: { html: true }, // no SVG / MathML
    FORBID_TAGS: ["style", "form", "input", "button", "select", "option", "optgroup", "textarea",
      "fieldset", "dialog", "template", "audio", "video", "source", "track"],
    FORBID_ATTR: ["style"], // blocked by the CSP anyway
    SANITIZE_NAMED_PROPS: true, // scraped id/name can't clobber the page's own ids
  };
  const SAFE_SCHEME = /^(https?|mailto|tel|data):$/;

  // Base URL for relative links/images: the scraped page's URL, http(s) only.
  let base = null;
  const httpBase = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

  purify.addHook("afterSanitizeAttributes", node => {
    for (const attr of ["href", "src"]) {
      const v = node.getAttribute(attr);
      if (v == null || !base) continue;
      let abs = null;
      try { abs = new URL(v, base); } catch { /* leave as-is */ }
      if (abs && !SAFE_SCHEME.test(abs.protocol)) node.removeAttribute(attr);
      else if (abs) node.setAttribute(attr, abs.href);
    }
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });

  // Markdown string -> sanitised HTML string.
  function markdownToHtml(markdown, baseUrl) {
    base = baseUrl ? httpBase(baseUrl) : null;
    try { return purify.sanitize(md.parse(String(markdown ?? "")), CONFIG); }
    finally { base = null; }
  }

  // Markdown string -> <div class="md"> element.
  function markdownView(markdown, baseUrl) {
    const div = global.document.createElement("div");
    div.className = "md";
    div.innerHTML = markdownToHtml(markdown, baseUrl);
    return div;
  }

  global.FcRender = { markdownToHtml, markdownView };
})(globalThis);
