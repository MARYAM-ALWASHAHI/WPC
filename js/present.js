/**
 * WPC Hub — presenting requests to the committee.
 * presentHTML: a full-screen, one-item-per-screen view the requester can talk through.
 * buildPdf: the same content as a PDF "meeting pack" (cover + one page per item), or one request sheet.
 * jsPDF (js/vendor) is loaded only when a PDF is asked for.
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

const TONE = { Approved: "ok", "Approved with conditions": "ok", "Recommended to EXCO": "info", "Endorsed by circulation": "ok", Rejected: "bad", Deferred: "warn", "Returned for clarification": "warn" };
const longDate = iso => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "");

/** i = -1 is the cover (the agenda); 0..n-1 are the items. */
export function presentHTML(ctx, m, i) {
  const agenda = m.agenda.map(id => ctx.d.items[id]).filter(Boolean);
  const it = agenda[i];
  const cover = i < 0 || !it;
  const hc = agenda.reduce((n, x) => n + (Number(x.hcRequested) || 0), 0), cost = agenda.reduce((n, x) => n + (Number(x.annualCost) || 0), 0);
  let slide;
  if (cover) {
    slide = `<main class="pr-slide pr-cover" tabindex="-1">
      <div class="pr-cover-h"><span class="eyebrow">Workforce Planning Committee · ${esc(m.ref)}</span>
        <h1 class="pr-title">${esc(m.title)}</h1>
        <p class="pr-sub">${esc(longDate(m.date))}${m.time ? ` · ${esc(m.time)}` : ""}${m.location ? ` · ${esc(m.location)}` : ""}</p>
        <div class="pr-tiles"><div class="pr-tile"><span>Items for decision</span><b>${agenda.length}</b></div>${hc ? `<div class="pr-tile"><span>Positions requested</span><b>${hc}</b></div>` : ""}${cost ? `<div class="pr-tile"><span>Annual cost requested</span><b>${esc(fmtOMR(cost))}</b></div>` : ""}</div></div>
      <section class="pr-body"><h2>Agenda</h2><ol class="pr-agenda">${agenda.map((x, k) => { const o = (ctx.d.minutes[`${m.id}__${x.id}`] || {}).outcome; return `<li><button type="button" data-action="present.go" data-i="${k}"><span class="pa-n">${k + 1}</span><span class="pa-t"><b>${esc(x.title)}</b><span>${esc(x.dept)} · ${esc(x.category)}${x.hcRequested ? ` · ${esc(x.hcRequested)} position${Number(x.hcRequested) === 1 ? "" : "s"}` : ""}</span></span>${o ? `<span class="badge ${TONE[o] || "neutral"}">${esc(o)}</span>` : icon("chevron")}</button></li>`; }).join("")}</ol></section>
    </main>`;
  } else {
    const prev = earlier(ctx, m, it);
    const docs = (it.attachments || []).filter(a => (a.kind || "request") === "request");
    const mn = ctx.d.minutes[`${m.id}__${it.id}`] || {};
    const openActs = Object.values(ctx.d.actions).filter(a => a.itemId === it.id && a.meetingId !== m.id && (a.status === "OPEN" || a.status === "IN_PROGRESS"));
    slide = `<main class="pr-slide" tabindex="-1">
      <div class="pr-cols">
        <div class="pr-main">
          <div class="pr-kicker"><span class="pr-num">${i + 1}</span><span class="ref">${esc(it.ref)}</span><span class="badge">${esc(itemStage(it, ctx.d))}</span></div>
          <h1 class="pr-title">${esc(it.title)}</h1>
          <p class="pr-sub">${esc(it.dept)} · ${esc(it.category)}${it.sub ? ` · ${esc(it.sub)}` : ""}</p>
          <section class="pr-body"><h2>Request and justification</h2><p class="pre">${esc(it.request || "—")}</p></section>
          ${docs.length ? `<section class="pr-body"><h2>Supporting documents</h2><div class="pr-docs">${docs.map(a => `<a class="btn" href="/_blob/${esc(a.id)}" target="_blank" rel="noopener">${icon("items")}${esc(a.name)}</a>`).join("")}</div></section>` : ""}
          ${prev.length ? `<section class="pr-body"><h2>Earlier decisions</h2><ul class="pr-prev">${prev.map(x => `<li><div><b>${fmtDate(x.m.date)}</b>${x.mn.outcome ? ` <span class="badge ${TONE[x.mn.outcome] || "neutral"}">${esc(x.mn.outcome)}</span>` : ""}</div><span>${esc(x.mn.decision || "")}</span></li>`).join("")}</ul></section>` : ""}
          ${openActs.length ? `<section class="pr-body"><h2>Open follow-up</h2><ul class="pr-prev">${openActs.map(a => `<li><div><b>${esc(a.text)}</b></div><span>${esc(a.owner)} · due ${fmtDate(a.due)}</span></li>`).join("")}</ul></section>` : ""}
        </div>
        <aside class="pr-side" aria-label="Key facts">
          <dl class="pr-facts">${[["Presented by", it.owner || "The department"], ...tiles(it)].map(([l, v], k) => `<div class="${k === 1 && it.hcRequested ? "big" : ""}"><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          <div class="pr-decision ${mn.outcome ? "set" : ""}"><span>Committee decision</span>${mn.outcome ? `<b><span class="badge ${TONE[mn.outcome] || "neutral"}">${esc(mn.outcome)}</span>${mn.hcApproved != null && mn.hcApproved !== "" ? ` ${esc(mn.hcApproved)} approved` : ""}</b>${mn.decision ? `<p>${esc(mn.decision)}</p>` : ""}` : `<b>To be decided</b><p>The secretaries record the outcome during the meeting.</p>`}</div>
        </aside>
      </div>
    </main>`;
  }
  return `<div class="present" role="dialog" aria-modal="true" aria-label="Presenting ${esc(cover ? m.title : it.ref)}">
    <header class="pr-bar">
      <div class="pr-meta"><span class="brand-mark" aria-hidden="true">WPC</span><span>${esc(m.title)} · ${fmtDate(m.date)}</span></div>
      <div class="pr-tools">
        <span class="pr-count">${cover ? "Agenda" : `Item ${i + 1} of ${agenda.length}`}</span>
        ${cover ? "" : `<button class="btn" data-action="present.go" data-i="-1">${icon("items")}<span>Agenda</span></button>`}
        ${ctx.s.downloads ? `<button class="btn" data-action="pdf.pack" data-id="${esc(m.id)}">${icon("download")}<span>Meeting pack (PDF)</span></button>` : ""}
        <button class="btn ghost icon-only" data-action="present.close" aria-label="Close presentation">${icon("close")}</button>
      </div>
    </header>
    ${slide}
    <footer class="pr-foot">
      <button class="btn" data-action="present.step" data-dir="-1" ${i < 0 ? "disabled" : ""}>${icon("back")}<span>${i === 0 ? "Agenda" : "Previous"}</span></button>
      <div class="pr-dots" aria-hidden="true"><span class="${cover ? "on" : ""}"></span>${agenda.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>
      <button class="btn primary" data-action="present.step" data-dir="1" ${i === agenda.length - 1 ? "disabled" : ""}><span>${cover ? "Start" : "Next"}</span>${icon("next")}</button>
    </footer>
  </div>`;
}

/* ---------- PDF ---------- */
let jsPdfPromise = null;
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    // Shipped with the app, so PDFs work on networks that block outside script hosts.
    s.src = "js/vendor/jspdf.umd.min.js";
    s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("PDF library did not load")));
    s.onerror = () => { jsPdfPromise = null; reject(new Error("PDF library could not be loaded")); };
    document.head.appendChild(s);
  });
  return jsPdfPromise;
}

const INK = [20, 32, 43], MUTED = [72, 87, 101], TEAL = [11, 110, 105], NAVY = [11, 42, 60], LINE = [224, 229, 234], MARK = [242, 177, 52], SOFT = [246, 248, 249];

/** A small layout kit over jsPDF: running y, page breaks, band header, headings, paragraphs, key/value grid, tables. */
async function writer(footerLabel) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, L = 16, R = W - 16, CW = R - L;
  const k = { doc, W, H, L, R, CW, y: 20 };
  k.ensure = h => { if (k.y + h > H - 18) { doc.addPage(); k.y = 18; return true; } return false; };
  k.band = (title, sub, kicker = "WORKFORCE PLANNING COMMITTEE") => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    const tl = doc.splitTextToSize(title, CW).slice(0, 2);
    const hgt = 28 + tl.length * 6.5;
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, hgt, "F");
    doc.setFillColor(...MARK); doc.rect(0, hgt, W, 1.5, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text(kicker, L, 13);
    doc.setFontSize(16); tl.forEach((ln, i) => doc.text(ln, L, 22 + i * 6.5));
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(doc.splitTextToSize(sub || "", CW)[0] || "", L, hgt - 5);
    k.y = hgt + 10;
  };
  k.heading = (t, size = 9) => { k.ensure(14); k.y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(size); doc.setTextColor(...TEAL); doc.text(t.toUpperCase(), L, k.y); k.y += 2; doc.setDrawColor(...LINE); doc.line(L, k.y, R, k.y); k.y += 5; };
  k.title = (t, size = 12.5) => { doc.setFont("helvetica", "bold"); doc.setFontSize(size); doc.setTextColor(...INK); const ls = doc.splitTextToSize(t, CW); k.ensure(ls.length * size * .45 + 2); doc.text(ls, L, k.y); k.y += ls.length * size * .45 + 1.5; };
  k.para = (txt, size = 10, color = INK, style = "normal", gap = 1.8, x = L, w = CW) => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color);
    const lh = size * 0.43;
    for (const ln of doc.splitTextToSize(String(txt ?? "") || "—", w)) { k.ensure(lh); doc.text(ln, x, k.y); k.y += lh; }
    k.y += gap;
  };
  k.label = (t, x = L) => { doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(t.toUpperCase(), x, k.y); k.y += 3.8; };
  /** Grid of label/value cells, `cols` per row. */
  k.facts = (pairs, cols = 3) => {
    pairs = pairs.filter(([, v]) => v !== "" && v != null);
    if (!pairs.length) return;
    const cw = (CW - (cols - 1) * 3) / cols;
    for (let r = 0; r < pairs.length; r += cols) {
      const row = pairs.slice(r, r + cols);
      doc.setFontSize(10);
      const hs = row.map(([, v]) => doc.splitTextToSize(String(v), cw - 6).length);
      const h = 9 + Math.max(...hs) * 4.3;
      k.ensure(h + 3);
      row.forEach(([l, v], i) => {
        const x = L + i * (cw + 3);
        doc.setDrawColor(...LINE); doc.setFillColor(...SOFT); doc.roundedRect(x, k.y, cw, h, 1.5, 1.5, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(l.toUpperCase(), x + 3, k.y + 5);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(String(v), cw - 6), x + 3, k.y + 10);
      });
      k.y += h + 3;
    }
    k.y += 1;
  };
  /** Table with wrapped cells. widths are fractions of the content width. */
  k.table = (head, rows, widths) => {
    if (!rows.length) { k.para("None.", 9.5, MUTED); return; }
    const ws = widths.map(f => f * CW);
    const drawHead = () => {
      doc.setFillColor(238, 242, 245); doc.rect(L, k.y - 4, CW, 7, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      let x = L; head.forEach((h, i) => { doc.text(h.toUpperCase(), x + 1.5, k.y); x += ws[i]; }); k.y += 5;
    };
    k.ensure(14); drawHead();
    for (const row of rows) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      const cells = row.map((c, i) => doc.splitTextToSize(String(c ?? "—") || "—", ws[i] - 3));
      const h = Math.max(...cells.map(c => c.length)) * 3.9 + 2.5;
      if (k.ensure(h)) drawHead();
      doc.setTextColor(...INK);
      let x = L; cells.forEach((c, i) => { doc.text(c, x + 1.5, k.y); x += ws[i]; });
      k.y += h - 1; doc.setDrawColor(...LINE); doc.line(L, k.y - 2.5, R, k.y - 2.5); k.y += 1.5;
    }
    k.y += 2;
  };
  k.finish = () => {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      doc.text(`${footerLabel} · Generated ${new Date().toLocaleString("en-GB")} from WPC Hub`, L, H - 9);
      doc.text(`Page ${p} of ${n}`, R, H - 9, { align: "right" });
    }
    return doc.output("blob");
  };
  return k;
}

const factPairs = it => [
  ["Department", it.dept], ["Category", [it.category, it.sub].filter(Boolean).join(" · ")], ["Responsible", it.owner || ""],
  ["Positions requested", it.hcRequested != null && it.hcRequested !== "" ? String(it.hcRequested) : ""], ["Grade", gradeTxt(it.grade)],
  ["Budget", it.budgeted || ""], ["Annual cost", fmtOMR(it.annualCost)], ["Effective date", it.effectiveDate ? fmtDate(it.effectiveDate) : ""],
  ["Submitted", it.createdAt ? fmtDate(it.createdAt) : ""],
];

/** Meeting pack (cover + one page per request) or a single request sheet. */
export async function buildPdf({ ctx, meeting = null, items }) {
  const k = await writer(`Workforce Planning Committee${meeting ? ` · ${meeting.ref}` : ""}`);
  if (meeting) {
    k.band(meeting.title, `${meeting.ref} · ${fmtDate(meeting.date)}${meeting.time ? ` · ${meeting.time}` : ""}${meeting.location ? ` · ${meeting.location}` : ""}`, "WORKFORCE PLANNING COMMITTEE · MEETING PACK");
    k.heading("Agenda");
    k.table(["#", "Reference", "Item", "Department", "Positions"], items.map((it, i) => [i + 1, it.ref, it.title, it.dept, it.hcRequested ?? "—"]), [.06, .17, .47, .18, .12]);
    k.para("Each request follows on its own page with everything the committee needs: the request, the manpower details, supporting documents, earlier decisions and open follow-up.", 9, MUTED);
  }
  items.forEach((it, i) => {
    if (meeting || i > 0) k.doc.addPage();
    k.band(it.title, `${it.ref} · ${it.dept} · ${it.category}`, meeting ? `AGENDA ITEM ${i + 1} OF ${items.length}` : "WORKFORCE PLANNING COMMITTEE · REQUEST SHEET");
    k.heading("Manpower details"); k.facts(factPairs(it), 3);
    k.heading("Request and justification"); k.para(it.request || "—", 10.5);
    const docs = (it.attachments || []).filter(a => (a.kind || "request") === "request");
    k.heading("Supporting documents"); k.para(docs.length ? docs.map(a => `• ${a.name}`).join("\n") : "None attached in WPC Hub.", 10, docs.length ? INK : MUTED);
    const prev = earlier(ctx, meeting, it);
    k.heading("Earlier committee decisions");
    if (prev.length) k.table(["Meeting", "Outcome", "Decision"], prev.map(x => [`${fmtDate(x.m.date)}\n${x.m.ref}`, x.mn.outcome || "—", x.mn.decision || ""]), [.2, .2, .6]);
    else k.para("First time at the committee.", 10, MUTED);
    const open = Object.values(ctx.d.actions).filter(a => a.itemId === it.id && a.status !== "DONE" && a.status !== "CANCELLED");
    if (open.length) { k.heading("Open follow-up actions"); k.table(["Action", "Responsible", "Due"], open.map(a => [a.text, a.owner, a.due ? fmtDate(a.due) : ""]), [.55, .27, .18]); }
    if (meeting) {
      k.heading("Committee decision (completed in the meeting)");
      ["Outcome", "Positions approved", "Decision wording", "Follow-up actions"].forEach(l => { k.ensure(11); k.doc.setFont("helvetica", "normal"); k.doc.setFontSize(9); k.doc.setTextColor(...MUTED); k.doc.text(l, k.L, k.y); k.doc.setDrawColor(...LINE); k.doc.line(k.L + 40, k.y + 1, k.R, k.y + 1); k.y += 10; });
    }
  });
  return k.finish();
}

/** Minutes: draft (live data) or a circulated version (frozen snapshot). */
export async function buildMinutesPdf({ m, snap, draft, name, sigRows = [], chairSig = null }) {
  const k = await writer(`WPC minutes · ${m.ref}${draft ? " · DRAFT" : ` · version ${snap.v}`}`);
  k.band(m.title, `${m.ref} · ${fmtDate(m.date)}${snap.time || m.time ? ` · ${snap.time || m.time}` : ""}${snap.location || m.location ? ` · ${snap.location || m.location}` : ""}`, `MINUTES OF MEETING · ${draft ? "DRAFT, NOT CIRCULATED" : `VERSION ${snap.v}`}`);
  const att = snap.attendance || {};
  const who = s => Object.entries(att).filter(([, x]) => x === s).map(([u]) => name(u)).join(", ");
  k.heading("Meeting");
  k.facts([["Reference", m.ref], ["Date", fmtDate(m.date)], ["Time", snap.time || m.time || ""], ["Location", snap.location || m.location || ""], ["Chairman", m.chairman ? name(m.chairman) : ""], ["Items", String(snap.items.length)]], 3);
  k.heading("Attendance");
  k.facts([["Present", who("Present") || "Not recorded"], ["Apologies", who("Apology") || "—"], ["Absent", who("Absent") || "—"]], 3);
  k.heading("Summary of decisions");
  k.table(["#", "Item", "Outcome", "Positions approved"], snap.items.map((x, i) => [i + 1, `${x.ref} ${x.title}`, x.outcome || "Not recorded", x.hcApproved ?? "—"]), [.06, .56, .24, .14]);
  snap.items.forEach((x, i) => {
    k.ensure(40); k.y += 3;
    k.doc.setFillColor(...MARK); k.doc.rect(k.L, k.y - 4.5, 1.6, 6, "F");
    k.doc.setFont("helvetica", "bold"); k.doc.setFontSize(8.5); k.doc.setTextColor(...TEAL); k.doc.text(`ITEM ${i + 1} · ${x.ref}`, k.L + 4, k.y); k.y += 5.5;
    k.title(x.title);
    k.facts(factPairs(x).filter(([l]) => l !== "Submitted"), 4);
    k.label("Request"); k.para(x.request, 9.5);
    k.label("Discussion"); k.para(x.discussion || "—", 9.5);
    k.label("Outcome"); k.para(`${x.outcome || "Not recorded"}${x.hcApproved != null && x.hcApproved !== "" ? ` · ${x.hcApproved} position(s) approved` : ""}`, 10, INK, "bold");
    k.label("Decision"); k.para(x.decision || "—", 9.5);
    k.label("Follow-up actions");
    if (x.actions.length) k.table(["Action", "Responsible", "Due"], x.actions.map(a => [a.text, a.owner, a.due ? fmtDate(a.due) : ""]), [.55, .27, .18]); else k.para("None.", 9.5, MUTED);
    k.doc.setDrawColor(...LINE); k.doc.line(k.L, k.y, k.R, k.y); k.y += 3;
  });
  if (!draft) {
    k.heading(`Signatures on version ${snap.v}`);
    k.table(["Name", "Role", "Status", "Date"], [...sigRows, ...(chairSig ? [chairSig] : [])], [.34, .16, .26, .24]);
    k.para("Sign-off recorded in WPC Hub. This is an approval record, not a qualified electronic signature.", 8.5, MUTED);
  } else k.para("Draft for review. Not circulated and not signed.", 9, MUTED);
  return k.finish();
}

/** Committee report for a period (data from reports.js reportData). */
export async function buildReportPdf({ r, name }) {
  const k = await writer(`WPC report · ${r.from} to ${r.to}`);
  k.band("Committee report", `${fmtDate(r.from)} to ${fmtDate(r.to)}`, "WORKFORCE PLANNING COMMITTEE · REPORT");
  k.heading("Summary");
  k.facts([["Requests received", String(r.received.length)], ["Positions requested", String(r.hcRequested)], ["Meetings held", String(r.meetings.length)],
    ["Decisions recorded", String(r.decisions.length)], ["Final decisions", String(r.finals.length)], ["Positions approved", String(r.hcApproved)],
    ["Request to decision", r.avgCycle == null ? "—" : `${r.avgCycle} days`], ["Items closed", String(r.closed.length)], ["Open items today", String(r.openNow)],
    ["Open actions", String(r.actionsOpen)], ["Overdue actions", String(r.actionsOverdue)], ["Department requests", String(r.requests.length)]], 3);
  k.heading("Decisions by outcome");
  k.table(["Outcome", "Count"], r.outcomes.filter(([, n]) => n), [.8, .2]);
  k.heading("Decision log");
  k.table(["Meeting", "Item", "Department", "Outcome", "Pos.", "Decision"], r.decisions.map(d => [`${fmtDate(d.m.date)}\n${d.m.ref}`, `${d.it.ref}\n${d.it.title}`, d.it.dept, d.mn.outcome || "—", d.mn.hcApproved ?? "—", d.mn.decision || ""]), [.13, .27, .13, .14, .06, .27]);
  k.heading("Meetings");
  k.table(["Date", "Meeting", "Items", "Present", "Minutes"], r.meetings.map(m => [fmtDate(m.date), `${m.title}\n${m.ref}`, m.agenda.length, Object.values(m.attendance || {}).filter(s => s === "Present").length || "—", m.status === "archived" ? `Final v${m.version}` : m.version ? `v${m.version} under review` : "Not circulated"]), [.15, .43, .1, .12, .2]);
  k.heading("Follow-up by responsible");
  k.table(["Responsible", "Open", "Overdue", "Done"], r.owners.map(o => [o.owner, o.open, o.overdue, o.done]), [.55, .15, .15, .15]);
  k.heading("Department requests");
  k.table(["Submitted", "Request", "Department", "Positions"], r.requests.map(q => [fmtDate(q.submittedAt), q.title, q.dept, q.hcRequested ?? "—"]), [.16, .5, .2, .14]);
  k.heading(`Activity log (${r.audit.length} entries${r.audit.length > 60 ? ", latest 60" : ""})`);
  k.table(["When", "Who", "Record", "What"], r.audit.slice(0, 60).map(e => [new Date(e.at).toLocaleString("en-GB"), name(e.by), e.ref || e.entity, `${e.action}${e.detail ? `: ${e.detail}` : ""}`]), [.2, .18, .16, .46]);
  return k.finish();
}
