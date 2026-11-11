/**
 * WPC Hub — UI kit. Small, reusable render helpers that return HTML strings.
 * All user text goes through esc(). Components never read the store directly.
 */
import { sortRows, paginate } from "./domain.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const attr = obj => esc(JSON.stringify(obj));

export const fmtDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtDateTime = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const monthLabel = ym => { if (!ym) return ""; const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }); };

/* ---------- icons: one 16px stroke set ---------- */
const P = {
  dashboard: "M2 2h5v6H2zM9 2h5v3H9zM9 7h5v7H9zM2 10h5v4H2z",
  meeting: "M2 4h12v10H2zM2 7h12M5 2v3M11 2v3",
  items: "M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01",
  actions: "M3 8l3 3 7-7M2 14h12",
  sign: "M2 12c2-1 3-5 5-5s0 5 2 5 2-3 4-3M2 14h12",
  history: "M8 4v4l3 2M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2 2v3h3",
  users: "M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 2.5a2.5 2.5 0 0 1 0 4.5M12.5 10c1.2.5 2 1.8 2 4",
  plus: "M8 3v10M3 8h10",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5",
  close: "M4 4l8 8M12 4l-8 8",
  chevron: "M6 4l4 4-4 4",
  back: "M10 4L6 8l4 4",
  alert: "M8 2l6.5 11.5h-13zM8 6.5v3M8 11.5h.01",
  download: "M8 2v8M5 7l3 3 3-3M2 13h12",
  archive: "M2 3h12v3H2zM3 6v8h10V6M6.5 9h3",
  edit: "M10.5 2.5l3 3L6 13H3v-3z",
  lock: "M4 7h8v7H4zM5.5 7V5a2.5 2.5 0 0 1 5 0v2",
  sortAsc: "M8 3l3 4H5zM8 13V7",
  sortDesc: "M8 13l3-4H5zM8 3v6",
  sort: "M8 2l3 4H5zM8 14l3-4H5z",
  info: "M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM8 7v4.5M8 4.8h.01",
  inbox: "M2 9h3.5l1 2h3l1-2H14M2 9l2-6h8l2 6v4H2z",
  mail: "M2 4h12v8H2zM2 4l6 5 6-5",
  present: "M2 3h12v8H2zM8 11v3M5 14h6M6 6l3 1.5L6 9z",
  report: "M4 2h6l3 3v9H4zM10 2v3h3M6 8h5M6 10.5h5M6 13h3",
  next: "M6 4l4 4-4 4",
  clock: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 5v3.2l2 1.3",
  pin: "M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14zM8 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  more: "M3 8h.01M8 8h.01M13 8h.01",
  check: "M3 8.5l3.2 3L13 4.5",
  live: "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4.5 4.5a5 5 0 0 0 0 7M11.5 4.5a5 5 0 0 1 0 7",
};
export const icon = (name, label) =>
  `<svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}><path d="${P[name] || ""}"/></svg>`;

/* ---------- status badges ---------- */
const TONE = {
  ok: ["Closed", "Done", "Approved", "Archived", "Signed", "signed", "approved"],
  bad: ["Correction requested", "correction", "Overdue"],
  warn: ["Under review", "Awaiting Chairman approval", "In follow-up", "Pending", "signing", "awaiting_chair", "Signed, no Chairman set"],
  info: ["In session", "Minutes drafting", "Scheduled", "Under discussion", "Decided", "In progress", "Agenda issued"],
};
export function badge(text, tone) {
  const t = tone || Object.keys(TONE).find(k => TONE[k].includes(text)) || "neutral";
  return `<span class="badge ${t}">${esc(text)}</span>`;
}

/* ---------- buttons ---------- */
export const btn = (label, action, { kind = "secondary", ic, data = {}, disabled = false, title = "", type = "button" } = {}) =>
  `<button type="${type}" class="btn ${kind}" ${action ? `data-action="${esc(action)}"` : ""} ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")} ${disabled ? "disabled" : ""} ${title ? `title="${esc(title)}"` : ""}>${ic ? icon(ic) : ""}<span>${esc(label)}</span></button>`;

/* ---------- page header ---------- */
export function pageHeader({ crumbs = [], title, sub = "", actions = "", meta = "" }) {
  return `<header class="ph">
    ${crumbs.length ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${esc(c.href)}" ${c.action ? `data-action="${esc(c.action)}"` : ""}>${esc(c.label)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(c.label)}</span>`).join("")}</nav>` : ""}
    <div class="ph-row"><div class="ph-title"><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${actions ? `<div class="ph-actions">${actions}</div>` : ""}</div>
    ${meta ? `<div class="ph-meta">${meta}</div>` : ""}
  </header>`;
}

/* ---------- data table with sorting + pagination ---------- */
/**
 * columns: [{ key, label, sortable=true, value: row => sortValue, render: row => html, num, width }]
 * tstate: { sort, dir, page, size } (owned by the caller, keyed by id)
 */
export function dataTable({ id, columns, rows, tstate, rowAttrs = () => "", empty = "No records match.", caption = "" }) {
  const col = columns.find(c => c.key === tstate.sort);
  const sorted = col ? sortRows(rows, col.key, tstate.dir, col.value || (r => r[col.key])) : rows;
  const pg = paginate(sorted, tstate.page, tstate.size);
  const head = columns.map(c => {
    if (c.sortable === false) return `<th scope="col" ${c.width ? `style="width:${c.width}"` : ""} class="${c.num ? "num" : ""}">${esc(c.label)}</th>`;
    const on = tstate.sort === c.key;
    const aria = on ? (tstate.dir === "asc" ? "ascending" : "descending") : "none";
    return `<th scope="col" aria-sort="${aria}" ${c.width ? `style="width:${c.width}"` : ""} class="${c.num ? "num" : ""}"><button class="th-sort" data-action="table.sort" data-table="${id}" data-key="${c.key}">${esc(c.label)}${icon(on ? (tstate.dir === "asc" ? "sortAsc" : "sortDesc") : "sort")}</button></th>`;
  }).join("");
  const body = pg.rows.length
    ? pg.rows.map(r => `<tr ${rowAttrs(r)}>${columns.map(c => `<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}" class="empty-cell">${esc(empty)}</td></tr>`;
  return `<div class="table-card">
    <div class="table-scroll"><table class="grid" id="tbl-${id}">${caption ? `<caption class="sr">${esc(caption)}</caption>` : ""}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="pager">
      <span>${pg.total ? `${pg.from}–${pg.to} of ${pg.total}` : "0 records"}</span>
      <label class="pager-size">Rows <select data-action="table.size" data-table="${id}" aria-label="Rows per page">${[10, 25, 50].map(n => `<option ${n === tstate.size ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <span class="pager-nav">
        <button class="btn ghost icon-only" data-action="table.page" data-table="${id}" data-page="${pg.page - 1}" ${pg.page <= 1 ? "disabled" : ""} aria-label="Previous page">${icon("back")}</button>
        <span>Page ${pg.page} of ${pg.pages}</span>
        <button class="btn ghost icon-only" data-action="table.page" data-table="${id}" data-page="${pg.page + 1}" ${pg.page >= pg.pages ? "disabled" : ""} aria-label="Next page">${icon("chevron")}</button>
      </span>
    </div></div>`;
}

/* ---------- form fields ---------- */
export function field({ id, label, type = "text", value = "", options = null, error = "", required = false, hint = "", wide = false, rows = 3, attrs = "" }) {
  const req = required ? `<span class="req" aria-hidden="true">*</span>` : "";
  const desc = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ");
  const common = `id="${id}" name="${id}" ${required ? "required" : ""} ${error ? 'aria-invalid="true"' : ""} ${desc ? `aria-describedby="${desc}"` : ""} ${attrs}`;
  let control;
  if (options) control = `<select ${common}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
  else if (type === "textarea") control = `<textarea ${common} rows="${rows}">${esc(value)}</textarea>`;
  else control = `<input type="${type}" ${common} value="${esc(value)}">`;
  return `<div class="field ${wide ? "wide" : ""} ${error ? "has-error" : ""}"><label for="${id}">${esc(label)}${req}</label>${control}${hint ? `<div class="hint" id="${id}-hint">${esc(hint)}</div>` : ""}${error ? `<div class="err" id="${id}-err">${esc(error)}</div>` : ""}</div>`;
}
export const formErrors = errs => Object.keys(errs).length ? `<div class="msg error" role="alert">${icon("alert")}<div><b>Check the highlighted fields.</b>${Object.entries(errs).filter(([k]) => k === "actions" || k === "form").map(([, v]) => `<div>${esc(v)}</div>`).join("")}</div></div>` : "";

/* ---------- message strip ---------- */
export const msg = (tone, html, actions = "") => `<div class="msg ${tone}" role="${tone === "error" ? "alert" : "status"}">${icon(tone === "error" ? "alert" : "info")}<div class="msg-body">${html}</div>${actions ? `<div class="msg-actions">${actions}</div>` : ""}</div>`;

/* ---------- layers: side panel and dialog ---------- */
const layer = () => document.getElementById("layer");
let lastFocus = null;
export function openPanel(html, label, { size = "md" } = {}) {
  lastFocus = document.activeElement;
  layer().innerHTML = `<div class="scrim" data-action="layer.close"></div><aside class="panel ${size}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</aside>`;
  const f = layer().querySelector("[autofocus], input, select, textarea, button");
  f?.focus();
}
export function closePanel() { layer().innerHTML = ""; lastFocus?.focus?.(); }
export const panelOpen = () => !!layer().innerHTML;
export const panelHead = (title, sub = "") => `<div class="panel-head"><div><h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div><button class="btn ghost icon-only" data-action="layer.close" aria-label="Close">${icon("close")}</button></div>`;

/** In-page confirmation (the viewer blocks window.confirm). Resolves true/false. */
export function confirmDialog({ title, body, confirm = "Confirm", tone = "primary" }) {
  return new Promise(resolve => {
    const host = document.getElementById("dialog");
    const prev = document.activeElement;
    host.innerHTML = `<div class="scrim"></div><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t">${esc(title)}</h2><div class="dialog-body">${body}</div><div class="dialog-actions"><button class="btn secondary" data-r="0">Cancel</button><button class="btn ${tone}" data-r="1">${esc(confirm)}</button></div></div>`;
    const done = v => { host.innerHTML = ""; prev?.focus?.(); resolve(v); };
    host.querySelector('[data-r="1"]').focus();
    host.onclick = e => { const b = e.target.closest("[data-r]"); if (b) done(b.dataset.r === "1"); };
    host.onkeydown = e => { if (e.key === "Escape") done(false); };
  });
}

/* ---------- toast ---------- */
export function toast(text, tone = "neutral") {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${tone}`; el.setAttribute("role", tone === "error" ? "alert" : "status"); el.textContent = text;
  host.appendChild(el);
  setTimeout(() => el.remove(), tone === "error" ? 6000 : 3000);
}

/** Read a form into an object of trimmed strings. */
export const readForm = form => Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
