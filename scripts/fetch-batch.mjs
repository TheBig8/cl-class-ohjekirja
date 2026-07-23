#!/usr/bin/env node
/**
 * Fetch raw English manual pages + standalone PDF-page HTML snapshots.
 *
 * Usage:
 *   node scripts/fetch-batch.mjs --from 1 --to 10
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "https://www.kayttooh.je";
const BASE = `${HOST}/mercedes/cl-class-2008/k%C3%A4ytt%C3%B6ohje`;

function parseArgs(argv) {
  let from = 1;
  let to = 10;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") from = Number(argv[++i]);
    if (argv[i] === "--to") to = Number(argv[++i]);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
    throw new Error("Käytä: --from N --to M (esim. --from 1 --to 10)");
  }
  return { from, to };
}

function pad(n) {
  return String(n).padStart(3, "0");
}

function pageToken(page) {
  return page.toString(16);
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(h\d|p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanManualText(text) {
  // Join PDF end-of-line hyphenation: "suitabili-\n ty" → "suitability"
  text = text.replace(/(\w)-\n\s*/g, "$1");
  text = text.replace(/앫/g, "•");
  const cutMarkers = [
    "\nTarvitsetko apua?",
    "\nKäyttöohje\nKatso Mercedes-Benz",
    "\nOnko sinulla kysyttävää aiheesta Mercedes-Benz",
  ];
  let out = text;
  for (const marker of cutMarkers) {
    const idx = out.indexOf(marker);
    if (idx > 40) {
      out = out.slice(0, idx);
      break;
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

/** Full outer <div class="page-N">…</div> */
function extractPageElement(html, page) {
  const token = pageToken(page);
  let start = -1;
  for (const re of [
    new RegExp(`<div[^>]*class="[^"]*\\bpage-${page}\\b[^"]*"[^>]*>`, "i"),
    new RegExp(`<div[^>]*id="pf${token}"[^>]*>`, "i"),
    new RegExp(`<div[^>]*data-page-no="${token}"[^>]*>`, "i"),
  ]) {
    const idx = html.search(re);
    if (idx >= 0) {
      start = idx;
      break;
    }
  }
  if (start < 0) return null;

  const after = html.slice(start);
  const openTagEnd = after.indexOf(">") + 1;
  let depth = 1;
  let i = openTagEnd;
  while (i < after.length && depth > 0) {
    const nextOpen = after.indexOf("<div", i);
    const nextClose = after.indexOf("</div>", i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      i = nextClose + 6;
      if (depth === 0) return after.slice(0, nextClose + 6);
    }
  }
  return null;
}

function extractViewerStyles(html) {
  const chunks = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) {
    const s = m[1];
    if (
      s.includes(".pf") ||
      s.includes(".pc") ||
      s.includes(".viewer-page") ||
      s.includes("@font-face") ||
      s.includes(".ff")
    ) {
      chunks.push(absolutizeUrls(s));
    }
  }
  // kayttooh.je injects both screen (px) and print (pt) metrics; later pt
  // rules win and blow up page size / break bg + text alignment.
  return stripPtViewerRules(chunks.join("\n"));
}

/** Drop print/pt overrides and site chrome that break standalone pages. */
function stripPtViewerRules(css) {
  let out = stripAtMediaBlocks(css, "print");
  out = out.replace(/\.viewer-page\s+\.[^{]+\{[^}]*\dpt;?[^}]*\}/gi, "");
  out = out.replace(
    /@media\(max-width:768px\)\{\.viewer-page:after,\.viewer-page:before\{[^}]+\}[^}]*\}/gi,
    ""
  );
  return out;
}

/** Remove `@media <name> { ... }` with brace matching (minified-safe). */
function stripAtMediaBlocks(css, mediaName) {
  const needle = `@media`;
  let out = "";
  let i = 0;
  while (i < css.length) {
    const idx = css.indexOf(needle, i);
    if (idx < 0) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, idx);
    const after = css.slice(idx);
    const open = after.indexOf("{");
    if (open < 0) {
      out += after;
      break;
    }
    const header = after.slice(0, open).toLowerCase();
    if (!header.includes(mediaName.toLowerCase())) {
      // keep this @media; copy through its balanced block
      const end = findBalancedBlockEnd(after, open);
      out += after.slice(0, end);
      i = idx + end;
      continue;
    }
    const end = findBalancedBlockEnd(after, open);
    i = idx + end;
  }
  return out;
}

function findBalancedBlockEnd(text, openBraceIdx) {
  let depth = 0;
  for (let j = openBraceIdx; j < text.length; j++) {
    const ch = text[j];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  return text.length;
}

function absolutizeUrls(text) {
  return text
    .replace(/url\(['"]?(\/viewer\/[^'")\s]+)['"]?\)/g, `url('${HOST}$1')`)
    .replace(/(src=["'])(\/viewer\/)/g, `$1${HOST}$2`)
    .replace(/(href=["'])(\/viewer\/)/g, `$1${HOST}$2`)
    .replace(/url\(['"]?(\/images\/[^'")\s]+)['"]?\)/g, `url('${HOST}$1')`);
}

/** Collect absolute kayttooh.je asset URLs from HTML/CSS. */
function collectAssetUrls(text) {
  const urls = new Set();
  const re = /https:\/\/www\.kayttooh\.je\/viewer\/[^"'()\s]+/gi;
  let m;
  while ((m = re.exec(text))) urls.add(m[0].replace(/['"]+$/, ""));
  return [...urls];
}

async function localizeAssets(html, page, originalDir) {
  const urls = collectAssetUrls(html);
  if (!urls.length) return html;
  const assetDir = path.join(originalDir, "assets", pad(page));
  await mkdir(assetDir, { recursive: true });
  let out = html;
  for (const url of urls) {
    const name = path.basename(new URL(url).pathname);
    const dest = path.join(assetDir, name);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CL-Class-ohjekirja/1.0; personal use)",
          Accept: "*/*",
        },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      const rel = `assets/${pad(page)}/${name}`;
      out = out.split(url).join(rel);
    } catch {
      // keep remote URL if download fails
    }
  }
  return out;
}

/** Remove hard-coded scale / embedded styles so our fit script can control layout. */
function preparePageElement(pageEl) {
  return absolutizeUrls(pageEl)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(
      /\s*style=["'][^"']*transform\s*:\s*scale\([^)]+\)[^"']*["']/gi,
      ""
    );
}

function buildOriginalDocument(pageEl, styles, page) {
  const body = preparePageElement(pageEl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>CL-Class sivu ${page}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #e8e8e8;
      overflow: hidden;
    }
    .wrap {
      box-sizing: border-box;
      width: 100%;
      overflow: hidden;
      padding: 0.35rem;
    }
    .frame {
      margin: 0 auto;
      overflow: hidden;
    }
    .stage {
      transform-origin: 0 0;
      position: relative;
    }
    .stage.viewer-page {
      margin: 0;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
    }
    .bi {
      background-repeat: no-repeat !important;
      background-position: 0 0 !important;
      background-size: 100% 100% !important;
    }
    ${styles}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="frame">
      <div class="stage viewer-page">${body}</div>
    </div>
  </div>
  <script>
(function () {
  var stage = document.querySelector(".stage");
  var frame = document.querySelector(".frame");
  var wrap = document.querySelector(".wrap");
  var page = document.querySelector(".stage .pf.w0, .stage .pf[data-page-no], .stage > .pf");
  if (!stage || !frame || !page) return;

  function notifyParent(height) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "cl-orig-size",
          page: ${page},
          height: height
        }, "*");
      }
    } catch (e) {}
  }

  function fit() {
    page.style.transform = "none";
    var pad = 8;
    var avail = Math.max(120, document.documentElement.clientWidth - pad);
    var w = page.offsetWidth || 842;
    var h = page.offsetHeight || 595;
    if (!w || !h) return;
    var scale = Math.min(1, avail / w);
    var fw = Math.round(w * scale);
    var fh = Math.round(h * scale);
    stage.style.transform = "scale(" + scale + ")";
    frame.style.width = fw + "px";
    frame.style.height = fh + "px";
    var total = fh + 12;
    if (wrap) wrap.style.height = total + "px";
    document.body.style.height = total + "px";
    notifyParent(total);
  }

  window.addEventListener("resize", fit);
  window.addEventListener("load", fit);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fit).catch(function () {});
  }
  var bi = page.querySelector(".bi");
  if (bi) {
    var bg = getComputedStyle(bi).backgroundImage;
    var m = bg && bg.match(/url\\(["']?([^"')]+)/);
    if (m && m[1]) {
      var img = new Image();
      img.onload = fit;
      img.src = m[1];
    }
  }
  fit();
  setTimeout(fit, 50);
  setTimeout(fit, 300);
})();
  </script>
</body>
</html>
`;
}

function extractPageImage(html, page) {
  const token = pageToken(page);
  const re = new RegExp(`/viewer/[^"'\\s]+/${page}/bg${token}\\.webp`, "i");
  const m = html.match(re);
  if (m) {
    return m[0].startsWith("http") ? m[0] : `${HOST}${m[0]}`;
  }
  return `${HOST}/viewer/59/540359/${page}/bg${token}.webp`;
}

function guessTitle(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[0] || `Page ${text.slice(0, 40)}`;
}

function sourceUrl(page) {
  return `${BASE}?p=${page}`;
}

async function fetchPage(page, originalDir) {
  const url = sourceUrl(page);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CL-Class-ohjekirja/1.0; personal use)",
      Accept: "text/html",
    },
  });
  if (!res.ok) {
    return {
      page,
      status: "missing",
      sourceUrl: url,
      title: null,
      en: null,
      error: `HTTP ${res.status}`,
    };
  }
  const html = await res.text();
  const pageEl = extractPageElement(html, page);
  const imageUrl = extractPageImage(html, page);
  if (!pageEl) {
    return {
      page,
      status: "missing",
      sourceUrl: url,
      imageUrl,
      title: null,
      en: null,
      error: "page content not found",
    };
  }

  const styles = extractViewerStyles(html);
  const originalFile = `${pad(page)}.html`;
  const originalPath = `original/${originalFile}`;
  let doc = buildOriginalDocument(pageEl, styles, page);
  doc = await localizeAssets(doc, page, originalDir);
  await writeFile(path.join(originalDir, originalFile), doc, "utf8");

  const en = cleanManualText(stripTags(pageEl));
  return {
    page,
    status: en ? "ok" : "missing",
    sourceUrl: url,
    imageUrl,
    originalPath,
    title: guessTitle(en),
    en: en || null,
    error: en ? undefined : "empty text after clean",
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { from, to } = parseArgs(process.argv.slice(2));
  const originalDir = path.join(ROOT, "data", "original");
  await mkdir(originalDir, { recursive: true });
  await mkdir(path.join(ROOT, "data", "raw"), { recursive: true });

  const pages = [];
  for (let p = from; p <= to; p++) {
    process.stderr.write(`Fetching page ${p}…\n`);
    const item = await fetchPage(p, originalDir);
    pages.push(item);
    await sleep(180);
  }

  const outName = `${pad(from)}-${pad(to)}.json`;
  const outPath = path.join(ROOT, "data", "raw", outName);
  const payload = { from, to, fetchedAt: new Date().toISOString(), pages };
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  process.stderr.write(`Wrote ${outPath}\n`);
  process.stderr.write(`Wrote PDF-page HTML → data/original/\n`);
  console.log(outPath);
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
