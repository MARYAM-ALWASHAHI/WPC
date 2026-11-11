/**
 * WPC Hub — presenting requests to the committee.
 * presentHTML: a full-screen, one-item-per-screen view the requester can talk through.
 * buildPdf: the same content as a PDF "meeting pack" (cover + one page per item), or one request sheet.
 * jsPDF is loaded from cdnjs only when a PDF is asked for.
 */
import { esc, icon, fmtDate } from "./ui.js";
import { itemStage } from "./domain.js";

const fmtOMR = n => (n == null || n === "" ? "" : `OMR ${Number(n).toLocaleString("en-GB")}`);
const gradeTxt = g => (!g ? "" : /^grade\b/i.test(g) ? g : `Grade ${g}`);
const earlier = (ctx, m, it) => Object.values(ctx.d.meetings)
  .filter(x => x.id !== m?.id && x.agenda.includes(it.id) && (!m || (x.date || "") < (m.date || "")))
  .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
  .map(x => ({ m: x, mn: ctx.d.minutes[`${x.id}__${it.id}`] || {} }))
  .filter(x => x.mn.decision || x.mn.outcome);

function tiles(it) {
  const t = [
    ["Positions requested", it.hcRequested != null && it.hcRequested !== "" ? String(it.hcRequested) : ""],
    ["Grade", gradeTxt(it.grade)],
    ["Budget", it.budgeted || ""],
    ["Annual cost", fmtOMR(it.annualCost)],
    ["Effective date", it.effectiveDate ? fmtDate(it.effectiveDate) : ""],
  ].filter(([, v]) => v);
  return t;
}

export function presentHTML(ctx, m, i) {
  const agenda = m.agenda.map(id => ctx.d.items[id]).filter(Boolean);
  const it = agenda[i];
  if (!it) return "";
  const prev = earlier(ctx, m, it);
  const docs = (it.attachments || []).filter(a => (a.kind || "request") === "request");
  return `<div class="present" role="dialog" aria-modal="true" aria-label="Presenting ${esc(it.ref)}">
    <header class="pr-bar">
      <div class="pr-meta"><span class="brand-mark" aria-hidden="true">WPC</span><span>${esc(m.title)} · ${fmtDate(m.date)}</span></div>
      <div class="pr-tools">
        <span class="pr-count">Item ${i + 1} of ${agenda.length}</span>
        <button class="btn" data-action="pdf.pack" data-id="${esc(m.id)}">${icon("download")}Meeting pack (PDF)</button>
        <button class="btn ghost icon-only" data-action="present.close" aria-label="Close presentation">${icon("close")}</button>
      </div>
    </header>
    <main class="pr-slide" tabindex="-1">
      <div class="pr-kicker"><span class="ref">${esc(it.ref)}</span><span class="badge">${esc(itemStage(it, ctx.d))}</span></div>
      <h1 class="pr-title">${esc(it.title)}</h1>
      <p class="pr-sub">${esc(it.dept)} · ${esc(it.category)}${it.sub ? ` · ${esc(it.sub)}` : ""} · Presented by ${esc(it.owner || "the department")}</p>
      ${tiles(it).length ? `<div class="pr-tiles">${tiles(it).map(([l, v]) => `<div class="pr-tile"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
      <section class="pr-body"><h2>Request and justification</h2><p class="pre">${esc(it.request || "—")}</p></section>
      ${docs.length ? `<section class="pr-body"><h2>Supporting documents</h2><div class="pr-docs">${docs.map(a => `<a class="btn" href="/_blob/${esc(a.id)}" target="_blank" rel="noopener">${icon("items")}${esc(a.name)}</a>`).join("")}</div></section>` : ""}
      ${prev.length ? `<section class="pr-body"><h2>Earlier decisions</h2><ul class="pr-prev">${prev.map(x => `<li><b>${fmtDate(x.m.date)}${x.mn.outcome ? ` · ${esc(x.mn.outcome)}` : ""}</b> ${esc(x.mn.decision || "")}</li>`).join("")}</ul></section>` : ""}
    </main>
    <footer class="pr-foot">
      <button class="btn" data-action="present.step" data-dir="-1" ${i === 0 ? "disabled" : ""}>${icon("back")}Previous</button>
      <div class="pr-dots" aria-hidden="true">${agenda.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>
      <button class="btn primary" data-action="present.step" data-dir="1" ${i === agenda.length - 1 ? "disabled" : ""}>Next${icon("next")}</button>
    </footer>
  </div>`;
}

/* ---------- PDF ---------- */
let jsPdfPromise = null;
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("PDF library did not load")));
    s.onerror = () => { jsPdfPromise = null; reject(new Error("PDF library could not be loaded")); };
    document.head.appendChild(s);
  });
  return jsPdfPromise;
}

const INK = [20, 32, 43], MUTED = [72, 87, 101], TEAL = [11, 110, 105], NAVY = [11, 42, 60], LINE = [224, 229, 234], MARK = [242, 177, 52];

/**
 * @param {object} o { ctx, meeting (optional), items: [item], name(uid) }
 * @returns {Promise<Blob>}
 */
export async function buildPdf({ ctx, meeting = null, items }) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, L = 18, R = W - 18, CW = R - L;
  let y = 0;
  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text(`Workforce Planning Committee${meeting ? ` · ${meeting.ref}` : ""} · Generated ${new Date().toLocaleDateString("en-GB")} from WPC Hub`, L, H - 10);
      doc.text(`Page ${p} of ${n}`, R, H - 10, { align: "right" });
    }
  };
  const ensure = h => { if (y + h > H - 20) { doc.addPage(); y = 20; } };
  const para = (txt, size = 10.5, color = INK, style = "normal", gap = 1.6) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(txt || ""), CW);
    const lh = size * 0.42;
    for (const ln of lines) { ensure(lh); doc.text(ln, L, y); y += lh; }
    y += gap;
  };
  const heading = t => { ensure(12); y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...TEAL); doc.text(t.toUpperCase(), L, y); y += 2; doc.setDrawColor(...LINE); doc.line(L, y, R, y); y += 5; };
  const band = (title, sub) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    const tl = doc.splitTextToSize(title, CW).slice(0, 2);
    const hgt = 28 + tl.length * 6.5;
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, hgt, "F");
    doc.setFillColor(...MARK); doc.rect(0, hgt, W, 1.5, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(9);
    doc.text("WORKFORCE PLANNING COMMITTEE", L, 13);
    doc.setFontSize(16); tl.forEach((ln, k) => doc.text(ln, L, 22 + k * 6.5));
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(doc.splitTextToSize(sub, CW)[0], L, hgt - 5);
    y = hgt + 12;
  };

  if (meeting) {
    band(meeting.title, `${meeting.ref} · ${meeting.date || ""}${meeting.time ? ` · ${meeting.time}` : ""}${meeting.location ? ` · ${meeting.location}` : ""}`);
    heading("Meeting pack: agenda");
    items.forEach((it, i) => {
      ensure(10);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
      doc.text(`${i + 1}.`, L, y);
      const t = doc.splitTextToSize(`${it.ref}  ${it.title}`, CW - 8);
      doc.text(t, L + 8, y); y += t.length * 4.8;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
      doc.text(`${it.dept} · ${it.category}${it.hcRequested ? ` · ${it.hcRequested} position(s)` : ""}`, L + 8, y); y += 7;
    });
    para("Each request follows on its own page. Earlier committee decisions on the same item are listed under it.", 9, MUTED);
  }

  items.forEach((it, i) => {
    if (meeting || i > 0) doc.addPage();
    band(it.title, `${it.ref} · ${it.dept} · ${it.category}${it.sub ? ` · ${it.sub}` : ""}`);
    const t = tiles(it);
    if (t.length) {
      const tw = (CW - (t.length - 1) * 3) / t.length;
      t.forEach(([l, v], k) => {
        const x = L + k * (tw + 3);
        doc.setDrawColor(...LINE); doc.setFillColor(246, 248, 249); doc.roundedRect(x, y, tw, 17, 2, 2, "FD");
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(l.toUpperCase(), x + 3, y + 6);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(v, tw - 5)[0], x + 3, y + 13);
      });
      y += 24;
    }
    heading("Request and justification");
    para(it.request || "—", 11);
    heading("Responsible");
    para(it.owner || "—");
    const prev = earlier(ctx, meeting, it);
    if (prev.length) { heading("Earlier decisions"); prev.forEach(x => para(`${x.m.date || ""}${x.mn.outcome ? ` · ${x.mn.outcome}` : ""}: ${x.mn.decision || ""}`, 10)); }
    const docs = (it.attachments || []).filter(a => (a.kind || "request") === "request");
    if (docs.length) { heading("Supporting documents (in WPC Hub)"); docs.forEach(a => para(`• ${a.name}`, 10)); }
    if (meeting) {
      heading("Committee decision (to be completed in the meeting)");
      ["Outcome", "Positions approved", "Decision wording"].forEach(l => { ensure(12); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(l, L, y); doc.setDrawColor(...LINE); doc.line(L + 38, y + 1, R, y + 1); y += 10; });
    }
  });
  footer();
  return doc.output("blob");
}
