const LANG_KEY = "cl-manual-lang";
const PAGE_KEY = "cl-manual-page";

const state = {
  meta: null,
  pages: [],
  pageByNumber: new Map(),
  pageLabels: new Map(), // page -> { title, section?, translated }
  currentPage: 1,
  lang: localStorage.getItem(LANG_KEY) === "orig" ? "orig" : "fi",
  searchQuery: "",
  showSearchPanel: false,
  showPagePicker: false,
  pagePickerFilter: "",
};

const els = {
  title: document.getElementById("app-title"),
  subtitle: document.getElementById("app-subtitle"),
  search: document.getElementById("search"),
  searchPanel: document.getElementById("search-panel"),
  searchResults: document.getElementById("search-results"),
  searchEmpty: document.getElementById("search-empty"),
  pagePicker: document.getElementById("page-picker"),
  pagePickerList: document.getElementById("page-picker-list"),
  pagePickerFilter: document.getElementById("page-picker-filter"),
  pagePickerClose: document.getElementById("page-picker-close"),
  pageJumpBtn: document.getElementById("page-jump-btn"),
  fiView: document.getElementById("fi-view"),
  origView: document.getElementById("orig-view"),
  pageMeta: document.getElementById("page-meta"),
  pageTitle: document.getElementById("page-title"),
  pageBody: document.getElementById("page-body"),
  origFrame: document.getElementById("orig-frame"),
  origError: document.getElementById("orig-error"),
  origPageLabel: document.getElementById("orig-page-label"),
  btnFi: document.getElementById("btn-fi"),
  btnOrig: document.getElementById("btn-orig"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  pageIndicator: document.getElementById("page-indicator"),
  progress: document.getElementById("progress"),
  main: document.getElementById("main-scroll"),
};

function scrollMainTop() {
  window.scrollTo(0, 0);
}

function totalPages() {
  return state.meta?.totalPages || 769;
}

function clampPage(page) {
  const n = Number(page);
  if (!Number.isFinite(n)) return 1;
  return Math.min(totalPages(), Math.max(1, Math.round(n)));
}

function sourceUrlFor(page) {
  const base =
    state.meta?.sourceBaseUrl ||
    "https://www.kayttooh.je/mercedes/cl-class-2008/k%C3%A4ytt%C3%B6ohje";
  return `${base}?p=${page}`;
}

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function tokenize(query) {
  return normalize(query)
    .split(/[^a-z0-9åäö]+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function loadMeta() {
  const res = await fetch("data/meta.json");
  if (!res.ok) throw new Error("meta.json puuttuu");
  state.meta = await res.json();
  els.title.textContent = state.meta.title || "CL-Class ohjekirja";
  els.subtitle.textContent = state.meta.subtitle || "";
}

async function loadBatches() {
  const batches = state.meta.batches || [];
  const pages = [];
  for (const file of batches) {
    const res = await fetch(`data/pages/${file}`);
    if (!res.ok) continue;
    const data = await res.json();
    for (const page of data.pages || []) {
      pages.push(page);
    }
  }
  pages.sort((a, b) => a.page - b.page);
  state.pages = pages;
  state.pageByNumber = new Map(pages.map((p) => [p.page, p]));
  rebuildPageLabels();
}

function setPageLabel(page, title, section, translated) {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return;
  const prev = state.pageLabels.get(n) || {};
  state.pageLabels.set(n, {
    title: title || prev.title || null,
    section: section || prev.section || null,
    translated: Boolean(translated || prev.translated),
  });
}

function rebuildPageLabels() {
  state.pageLabels = new Map();
  for (const p of state.pages) {
    setPageLabel(p.page, p.titleFi || null, p.section || null, true);
    // Kerää otsikoita sisällysluetteloriveiltä tulevia sivuja varten
    const lines = (p.fi || "").split(/\n+/);
    for (const line of lines) {
      const toc = parseTocLine(line.trim());
      if (!toc) continue;
      setPageLabel(Number(toc.page), toc.title, p.section || "Sisällysluettelo", false);
    }
  }
}

function labelForPage(page) {
  const info = state.pageLabels.get(page);
  if (info?.title) return info;
  return { title: null, section: null, translated: state.pageByNumber.has(page) };
}

function pageJumpButtonText(page) {
  return `Sivu ${page} ▾`;
}

function setPagePickerOpen(open) {
  state.showPagePicker = Boolean(open);
  if (open) {
    state.showSearchPanel = false;
    state.pagePickerFilter = "";
    if (els.pagePickerFilter) els.pagePickerFilter.value = "";
  }
  document.body.classList.toggle("is-picking", state.showPagePicker);
  if (els.pageJumpBtn) {
    els.pageJumpBtn.setAttribute("aria-expanded", String(state.showPagePicker));
  }
  render();
}

function renderPagePicker() {
  const list = els.pagePickerList;
  if (!list) return;
  const q = normalize(state.pagePickerFilter || "");
  const rawFilter = (state.pagePickerFilter || "").trim();
  const total = totalPages();
  list.innerHTML = "";
  let shown = 0;
  let currentBtn = null;

  // Listaa kaikki sivut 1…total (suodatuksella vain osumat)
  for (let i = 1; i <= total; i++) {
    const info = labelForPage(i);
    const title = info.title || "Ei otsikkotietoa vielä";
    const section = info.section || (info.translated ? "Suomennettu" : "Ei vielä suomeksi");
    const hay = normalize(`${i} ${title} ${section}`);
    if (q && !hay.includes(q) && !String(i).includes(rawFilter)) {
      continue;
    }
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "option");
    if (i === state.currentPage) {
      btn.classList.add("is-current");
      currentBtn = btn;
    }
    btn.innerHTML = `
      <span class="pick-page">Sivu ${i}</span>
      <span class="pick-title">${escapeHtml(title)}</span>
      <span class="pick-meta">${escapeHtml(section)}</span>
    `;
    btn.addEventListener("click", () => {
      setPagePickerOpen(false);
      setLang("fi");
      goToPage(i, { clearSearch: true });
    });
    li.appendChild(btn);
    list.appendChild(li);
    shown += 1;
  }

  if (!shown) {
    const li = document.createElement("li");
    li.innerHTML = `<p class="muted">Ei osumia.</p>`;
    list.appendChild(li);
  } else if (currentBtn && !q) {
    // Pidä nykyinen sivu näkyvissä pitkässä listassa (body-scroll)
    requestAnimationFrame(() => {
      currentBtn.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }
}

function setLang(lang) {
  state.lang = lang === "orig" ? "orig" : "fi";
  localStorage.setItem(LANG_KEY, state.lang);
  els.btnFi.classList.toggle("is-active", state.lang === "fi");
  els.btnOrig.classList.toggle("is-active", state.lang === "orig");
  els.btnFi.setAttribute("aria-pressed", String(state.lang === "fi"));
  els.btnOrig.setAttribute("aria-pressed", String(state.lang === "orig"));
  document.body.classList.toggle("is-orig", state.lang === "orig");
  if (state.lang === "orig") {
    state.showPagePicker = false;
    state.showSearchPanel = false;
    document.body.classList.remove("is-picking");
    if (els.pageJumpBtn) els.pageJumpBtn.setAttribute("aria-expanded", "false");
  }
  render();
}

function goToPage(page, { clearSearch = false, keepSearchPanel = false } = {}) {
  const next = clampPage(page);
  state.currentPage = next;
  localStorage.setItem(PAGE_KEY, String(next));
  if (clearSearch) {
    state.searchQuery = "";
    els.search.value = "";
    state.showSearchPanel = false;
  } else if (!keepSearchPanel) {
    state.showSearchPanel = false;
  }
  state.showPagePicker = false;
  document.body.classList.remove("is-picking");
  if (els.pageJumpBtn) els.pageJumpBtn.setAttribute("aria-expanded", "false");
  scrollMainTop();
  render();
}

function currentRecord() {
  return state.pageByNumber.get(state.currentPage) || null;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hakusanat korostukseen (alkuperäinen kirjoitusasu, ei aksenttien poistoa). */
function highlightTokens(query) {
  return (query || "")
    .trim()
    .split(/[^a-zA-Z0-9åäöÅÄÖ]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .sort((a, b) => b.length - a.length);
}

function highlightHtml(text, tokens) {
  const escaped = escapeHtml(text || "");
  if (!tokens?.length) return escaped;
  const parts = tokens.map(escapeRegex).filter(Boolean);
  if (!parts.length) return escaped;
  const re = new RegExp(`(${parts.join("|")})`, "gi");
  return escaped.replace(re, '<mark class="hl">$1</mark>');
}

/** Sisällysluettelorivi: "Otsikko ...... 81" tai "Otsikko   81" */
function parseTocLine(line) {
  const dotted = line.match(/^(.+?)\s*\.{2,}\s*(\d+)\s*$/);
  if (dotted) return { title: dotted[1].trim(), page: dotted[2] };
  const spaced = line.match(/^(.+?)\s{2,}(\d{1,3})\s*$/);
  if (spaced && spaced[1].replace(/\./g, "").trim().length > 2) {
    return { title: spaced[1].replace(/\s*\.+\s*$/, "").trim(), page: spaced[2] };
  }
  return null;
}

function looksLikeToc(lines) {
  if (lines.length < 3) return false;
  let hits = 0;
  for (const line of lines) {
    if (parseTocLine(line) || /\.{3,}/.test(line)) hits += 1;
  }
  return hits >= 3 || hits / lines.length >= 0.35;
}

function isListLine(line) {
  return /^(?:[•●▪◦\-–—*]|[0-9]+[.)]|[a-zäöå][.)])\s+/i.test(line);
}

/**
 * Poistaa PDF-/OCR-rivijaot, jotta teksti rivittyy näytön leveyden mukaan.
 * Säilyttää tyhjät rivit kappaleina ja listarivit erillisinä.
 */
function reflowForScreen(text) {
  const raw = (text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  // Yhdistä tavuviivalla katkaistut sanat
  let s = raw.replace(/(\w)-\n(\w)/g, "$1$2");

  const lines = s.split("\n");
  const out = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
      out.push(""); // kappaleen raja
      continue;
    }
    if (isListLine(t) || parseTocLine(t)) {
      flush();
      out.push(t);
      continue;
    }
    if (!buf) {
      buf = t;
    } else {
      buf += " " + t;
    }
  }
  flush();

  // Tyhjät rivit → kappalejako; peräkkäiset tyhjät kasataan
  const paras = [];
  let chunk = [];
  for (const row of out) {
    if (row === "") {
      if (chunk.length) {
        paras.push(chunk.join("\n"));
        chunk = [];
      }
    } else {
      chunk.push(row);
    }
  }
  if (chunk.length) paras.push(chunk.join("\n"));
  return paras.join("\n\n");
}

function formatBody(text, tokens = []) {
  const raw = reflowForScreen(text);
  if (!raw) return "<p>Tälle sivulle ei ole vielä suomennosta.</p>";

  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (looksLikeToc(lines)) {
    const parts = [];
    let items = [];
    const flush = () => {
      if (!items.length) return;
      parts.push(`<ul class="toc">${items.join("")}</ul>`);
      items = [];
    };
    for (const line of lines) {
      const toc = parseTocLine(line);
      if (toc) {
        items.push(
          `<li><span class="toc-title">${highlightHtml(
            toc.title,
            tokens
          )}</span><button type="button" class="toc-page" data-page="${escapeHtml(
            toc.page
          )}">${escapeHtml(toc.page)}</button></li>`
        );
      } else {
        flush();
        parts.push(
          `<p class="toc-heading">${highlightHtml(line, tokens)}</p>`
        );
      }
    }
    flush();
    return parts.join("");
  }

  // Listat ja kappaleet — ei kovia <br>-rivijakoja (teksti rivittyy CSS:llä)
  const blocks = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const blockLines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (blockLines.length > 1 && blockLines.every(isListLine)) {
        const items = blockLines
          .map(
            (l) =>
              `<li>${highlightHtml(l.replace(/^(?:[•●▪◦\-–—*]|[0-9]+[.)]|[a-zäöå][.)])\s+/i, ""), tokens)}</li>`
          )
          .join("");
        return `<ul class="body-list">${items}</ul>`;
      }
      if (blockLines.length === 1 && isListLine(blockLines[0])) {
        const t = blockLines[0].replace(
          /^(?:[•●▪◦\-–—*]|[0-9]+[.)]|[a-zäöå][.)])\s+/i,
          ""
        );
        return `<ul class="body-list"><li>${highlightHtml(t, tokens)}</li></ul>`;
      }
      // Useina riveinä mutta ei lista → yksi kappale, rivit yhdistetty
      const prose = blockLines.join(" ");
      return `<p>${highlightHtml(prose, tokens)}</p>`;
    })
    .join("");
}

function originalPathFor(page) {
  const rec = state.pageByNumber.get(page);
  if (rec?.originalPath) return `data/${rec.originalPath}`;
  return `data/original/${String(page).padStart(3, "0")}.html`;
}

function updateOrigView(rec) {
  const page = rec?.page || state.currentPage;
  const localUrl = originalPathFor(page);
  if (els.origPageLabel) els.origPageLabel.textContent = String(page);
  els.origError.hidden = true;

  if (!els.origFrame) return;

  const wrap = els.origFrame.closest(".iframe-wrap");
  if (wrap) {
    wrap.style.height = "";
  }

  const current = els.origFrame.getAttribute("src");
  if (current !== localUrl) {
    els.origFrame.setAttribute("src", localUrl);
  }

  els.origFrame.onload = () => {
    els.origError.hidden = true;
  };
  els.origFrame.onerror = () => {
    els.origError.hidden = false;
  };

  // Jos tiedosto 404, python http.server näyttää virhesivun iframeen —
  // tarkista fetchillä etukäteen.
  fetch(localUrl, { method: "HEAD" })
    .then((res) => {
      if (!res.ok) els.origError.hidden = false;
    })
    .catch(() => {
      els.origError.hidden = false;
    });
}

function onOrigFrameMessage(ev) {
  const data = ev?.data;
  if (!data || data.type !== "cl-orig-size") return;
  if (Number(data.page) !== Number(state.currentPage)) return;
  const wrap = els.origFrame?.closest(".iframe-wrap");
  if (!wrap) return;
  const h = Math.max(120, Math.min(Number(data.height) || 0, window.innerHeight * 0.78));
  if (h > 0) wrap.style.height = `${Math.round(h)}px`;
}

function searchPages(query) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const scored = [];
  for (const page of state.pages) {
    const hay = normalize(
      `${page.titleFi || ""} ${page.section || ""} ${page.fi || ""}`
    );
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (!hay.includes(t)) {
        ok = false;
        break;
      }
      score += 1;
      if (
        (page.titleFi && normalize(page.titleFi).includes(t)) ||
        (page.section && normalize(page.section).includes(t))
      ) {
        score += 2;
      }
    }
    if (!ok) continue;
    const snip = makeSnippet(page.fi || "", tokens[0]);
    scored.push({ page, score, snip });
  }
  scored.sort((a, b) => b.score - a.score || a.page.page - b.page.page);
  return scored.slice(0, 40);
}

function makeSnippet(text, token) {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = normalize(raw);
  const t = normalize(token);
  let idx = lower.indexOf(t);
  if (idx < 0) idx = 0;
  const start = Math.max(0, idx - 40);
  const end = Math.min(raw.length, idx + 80);
  let snip = raw.slice(start, end);
  if (start > 0) snip = "…" + snip;
  if (end < raw.length) snip = snip + "…";
  return snip;
}

function renderSearch() {
  const q = state.searchQuery.trim();
  const tokens = highlightTokens(q);
  if (!q || !state.showSearchPanel) {
    els.searchPanel.hidden = true;
    els.searchResults.innerHTML = "";
    els.searchEmpty.hidden = true;
    return;
  }
  const hits = searchPages(q);
  els.searchPanel.hidden = false;
  els.searchResults.innerHTML = "";
  els.searchEmpty.hidden = hits.length > 0;
  for (const hit of hits) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    const title = hit.page.titleFi || hit.page.section || "Ohje";
    btn.innerHTML = `
      <span class="hit-page">Sivu ${hit.page.page}</span>
      <span class="hit-title">${highlightHtml(title, tokens)}</span>
      <span class="hit-snip">${highlightHtml(hit.snip, tokens)}</span>
    `;
    btn.addEventListener("click", () => {
      state.showSearchPanel = false;
      setLang("fi");
      goToPage(hit.page.page, { clearSearch: false });
    });
    li.appendChild(btn);
    els.searchResults.appendChild(li);
  }
}

function render() {
  const rec = currentRecord();
  const total = totalPages();
  const translated = state.pages.length;
  const tokens = highlightTokens(state.searchQuery);
  document.body.classList.toggle("is-picking", state.showPagePicker);

  els.progress.textContent =
    translated > 0 ? `${translated}/${total}` : "";

  els.pageIndicator.textContent = `Sivu ${state.currentPage}`;
  els.btnPrev.disabled = state.currentPage <= 1;
  els.btnNext.disabled = state.currentPage >= total;
  if (els.pageJumpBtn) {
    els.pageJumpBtn.textContent = pageJumpButtonText(state.currentPage);
  }

  if (state.showPagePicker) {
    els.pagePicker.hidden = false;
    els.searchPanel.hidden = true;
    els.fiView.hidden = true;
    els.origView.hidden = true;
    renderPagePicker();
    return;
  }

  els.pagePicker.hidden = true;

  if (state.lang === "fi" && state.showSearchPanel && state.searchQuery.trim()) {
    renderSearch();
    els.fiView.hidden = true;
    els.origView.hidden = true;
    scrollMainTop();
    return;
  }

  els.searchPanel.hidden = true;

  if (state.lang === "fi") {
    els.fiView.hidden = false;
    els.origView.hidden = true;
    if (!rec) {
      const info = labelForPage(state.currentPage);
      els.pageMeta.textContent = `Sivu ${state.currentPage}`;
      els.pageTitle.textContent = info.title || "Ei vielä suomeksi";
      els.pageBody.innerHTML = `<p>Sivua ${state.currentPage} ei ole vielä suomennettu.</p>
        <p>Kokeile yläreunan <strong>Alkuperäinen</strong>-valintaa, jos PDF-sivu on jo haettu.</p>`;
      return;
    }
    els.pageMeta.textContent = rec.section
      ? `${rec.section} · sivu ${rec.page}`
      : `Sivu ${rec.page}`;
    els.pageTitle.innerHTML = highlightHtml(rec.titleFi || "Ohje", tokens);
    els.pageBody.innerHTML = formatBody(rec.fi, tokens);
  } else {
    els.fiView.hidden = true;
    els.origView.hidden = false;
    updateOrigView(rec);
  }
}

function bind() {
  els.btnFi.addEventListener("click", () => setLang("fi"));
  els.btnOrig.addEventListener("click", () => setLang("orig"));
  window.addEventListener("message", onOrigFrameMessage);
  els.btnPrev.addEventListener("click", () => {
    if (state.currentPage > 1) goToPage(state.currentPage - 1);
  });
  els.btnNext.addEventListener("click", () => {
    if (state.currentPage < totalPages()) goToPage(state.currentPage + 1);
  });
  els.pageJumpBtn?.addEventListener("click", () => {
    setPagePickerOpen(!state.showPagePicker);
  });
  els.pagePickerClose?.addEventListener("click", () => setPagePickerOpen(false));
  let pickerTimer = null;
  els.pagePickerFilter?.addEventListener("input", () => {
    window.clearTimeout(pickerTimer);
    pickerTimer = window.setTimeout(() => {
      state.pagePickerFilter = els.pagePickerFilter.value;
      renderPagePicker();
    }, 80);
  });
  els.pageBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".toc-page");
    if (!btn) return;
    const page = Number(btn.dataset.page);
    if (!Number.isFinite(page)) return;
    state.showSearchPanel = false;
    setLang("fi");
    goToPage(page);
  });
  let searchTimer = null;
  els.search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.searchQuery = els.search.value;
      state.showSearchPanel = Boolean(state.searchQuery.trim());
      state.showPagePicker = false;
      document.body.classList.remove("is-picking");
      if (els.pageJumpBtn) els.pageJumpBtn.setAttribute("aria-expanded", "false");
      if (state.lang !== "fi") setLang("fi");
      else render();
    }, 120);
  });
}

async function main() {
  bind();
  try {
    await loadMeta();
    await loadBatches();
    const saved = Number(localStorage.getItem(PAGE_KEY));
    const start = Number.isFinite(saved) ? saved : 1;
    state.currentPage = clampPage(start);
    setLang(state.lang);
  } catch (err) {
    els.pageTitle.textContent = "Virhe";
    els.pageBody.innerHTML = `<p>${escapeHtml(err.message || String(err))}</p>
      <p>Käynnistä paikallinen palvelin projektikansiossa, esim. <code>python3 -m http.server 8080</code>.</p>`;
  }
}

main();
