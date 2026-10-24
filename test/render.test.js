// Unit tests for www/render.js: loads the vendored libraries and the renderer
// into a jsdom window exactly as the page does (classic scripts, globals).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const www = new URL("../www/", import.meta.url);
const { window } = new JSDOM("<!doctype html><div id=view></div>", { runScripts: "outside-only", url: "http://playground.test/" });
for (const f of ["vendor/marked.umd.js", "vendor/purify.min.js", "render.js"]) window.eval(readFileSync(new URL(f, www), "utf8"));
const { markdownToHtml, markdownView } = window.FcRender;
const dom = (md, base) => markdownView(md, base);

test("Firecrawl's escaped CommonMark renders: no literal \\| and links become <a>", () => {
  // Shape of a real news.ycombinator.com scrape.
  const md = "1 point by [someone](https://news.ycombinator.com/user?id=someone) 2 hours ago<br> \\| [past](https://news.ycombinator.com/item?id=1) \\| [discuss](item?id=1)";
  const div = dom(md, "https://news.ycombinator.com/");
  assert.ok(!div.innerHTML.includes("\\|"), div.innerHTML);
  assert.ok(!div.textContent.includes("<br>"), div.textContent);
  assert.ok(div.textContent.includes("| past |"), div.textContent);
  assert.equal(div.querySelectorAll("br").length, 1);
  const links = [...div.querySelectorAll("a")];
  assert.equal(links.length, 3);
  for (const a of links) {
    assert.equal(a.getAttribute("target"), "_blank");
    assert.equal(a.getAttribute("rel"), "noopener noreferrer");
  }
  // Relative links resolve against the scraped page, not the playground.
  assert.equal(links[2].getAttribute("href"), "https://news.ycombinator.com/item?id=1");
});

test("GFM tables, code and images render", () => {
  const div = dom("| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet x = 1;\n```\n\n![logo](/logo.png)", "https://example.com/docs/");
  assert.equal(div.querySelectorAll("table td").length, 2);
  assert.equal(div.querySelector("pre code").textContent, "let x = 1;\n");
  const img = div.querySelector("img");
  assert.equal(img.getAttribute("src"), "https://example.com/logo.png");
  assert.equal(img.getAttribute("referrerpolicy"), "no-referrer");
});

test("sanitiser strips scripts, handlers, iframes, forms and javascript: URLs", () => {
  const md = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(2)>",
    "<a href=\"https://ok.test\" onclick=\"alert(3)\">click</a>",
    "[js](javascript:alert(4)) <a href=\"JaVaScRiPt:alert(5)\">x</a>",
    "<iframe src=\"https://evil.test\"></iframe><object data=x></object><embed src=x>",
    "<form action=\"https://evil.test\"><input name=q><button>go</button></form>",
    "<svg onload=alert(6)><circle/></svg><math><mi>x</mi></math>",
    "<div style=\"position:fixed;inset:0\">overlay</div><style>body{display:none}</style>",
    "<details open ontoggle=alert(7)>t</details><body onload=alert(8)>",
    "<a id=\"view\" name=\"base\">clobber</a>",
  ].join("\n\n");
  const html = markdownToHtml(md, "https://example.com/");
  const div = dom(md, "https://example.com/");
  for (const sel of ["script", "iframe", "object", "embed", "form", "input", "button", "svg", "math", "style", "[style]"]) {
    assert.equal(div.querySelectorAll(sel).length, 0, `${sel} survived: ${html}`);
  }
  for (const n of div.querySelectorAll("*")) {
    for (const a of n.attributes) assert.ok(!/^on/i.test(a.name), `${a.name} survived on <${n.tagName}>`);
  }
  assert.ok(!/javascript:/i.test(html), html);
  // Clobbering ids/names are prefixed, so getElementById("view") stays ours.
  const a = div.querySelector("a[id]");
  assert.equal(a.id, "user-content-view");
  assert.equal(a.getAttribute("name"), "user-content-base");
});

test("a non-http base URL is ignored", () => {
  const div = dom("[frag](#x) [rel](/y)", "javascript:alert(1)//");
  const hrefs = [...div.querySelectorAll("a")].map(a => a.getAttribute("href"));
  assert.deepEqual(hrefs, ["#x", "/y"]);
});
