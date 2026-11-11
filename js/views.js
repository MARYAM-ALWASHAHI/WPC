/**
 * WPC Hub — views. Each view is a pure function (ctx) => HTML string.
 * ctx is built in app.js: { d: data, s: session, ui, role, today, name(uid), ... }
 */
import {
  CATEGORIES, DEPARTMENTS, MEETING_STATES, ITEM_STAGES, ACTION_LABELS, PERMISSIONS, ROLES,
  meetingPhase, signatureState, sigFor, awaitingSignature, itemStage, isItemOpen, isActionOpen, isOverdue,
  canEditAgenda, canEditMinutes, daysBetween, diffSnapshots,
  OUTCOMES, BUDGETED, ATTENDANCE, charterKpis, outcomeCounts, headcountTotals, latestOutcome, quorumState, findDuplicates,
} from "./domain.js";
import { esc, icon, badge, btn, pageHeader, dataTable, field, msg, fmtDate, fmtDateTime, monthLabel, panelHead } from "./ui.js";

/* ---------- shared fragments ---------- */
const itemsArr = ctx => Object.values(ctx.d.items);
const meetingsArr = ctx => Object.values(ctx.d.meetings).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const actionsArr = ctx => Object.values(ctx.d.actions);
const meetingsOf = (ctx, it) => meetingsArr(ctx).filter(m => m.agenda.includes(it.id));
const stageOf = (ctx, it) => itemStage(it, ctx.d);
const phaseBadge = (ctx, m) => { const p = meetingPhase(m, ctx.d.sigs); return badge(p.label, { approved: "ok", archived: "ok", correction: "bad", signing: "warn", awaiting_chair: "warn", signed: "warn" }[p.key] || (m.status === "preparation" ? "neutral" : "info")); };
function actionBadge(a, today) {
  if (a.status === "DONE") return badge("Done", "ok");
  if (a.status === "CANCELLED") return badge("Cancelled", "neutral");
  if (isOverdue(a, today)) return badge(`Overdue ${daysBetween(a.due, today)}d`, "bad");
  return badge(ACTION_LABELS[a.status] || "Open", a.status === "IN_PROGRESS" ? "info" : "neutral");
}
const fileUrl = id => "/_blob/" + id;
export const safeUrl = u => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : "");
const hostOf = u => { try { return new URL(u).hostname; } catch (_) { return ""; } };
const fmtSize = n => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const fmtOMR = n => n == null || n === "" ? "—" : `OMR ${Number(n).toLocaleString("en-GB")}`;
/** Compact manpower facts line for cards and tables. */
function factsLine(it) {
  const parts = [];
  if (it.hcRequested != null && it.hcRequested !== "") parts.push(`${it.hcRequested} position${Number(it.hcRequested) === 1 ? "" : "s"}`);
  if (it.grade) parts.push(/^grade\b/i.test(it.grade) ? esc(it.grade) : `Grade ${esc(it.grade)}`);
  if (it.budgeted) parts.push(esc(it.budgeted));
  if (it.annualCost != null && it.annualCost !== "") parts.push(`${esc(fmtOMR(it.annualCost))}/yr`);
  if (it.effectiveDate) parts.push(`Effective ${fmtDate(it.effectiveDate)}`);
  return parts.length ? `<span class="chips">${parts.map(p => `<span class="chip">${p}</span>`).join("")}</span>` : "";
}
function docList(ctx, it, kind, canEdit) {
  const docs = (it.attachments || []).filter(a => (a.kind || "request") === kind);
  return `${docs.length ? `<ul class="docs">${docs.map(a => `<li>${icon("items")}<a href="${esc(fileUrl(a.id))}" target="_blank" rel="noopener">${esc(a.name)}</a><span class="hint">${esc(fmtSize(a.size || 0))} · ${fmtDate(a.at)} · ${esc(ctx.name(a.by))}</span>${canEdit ? btn("Remove", "doc.remove", { kind: "ghost", data: { id: it.id, doc: a.id } }) : ""}</li>`).join("")}</ul>` : `<p class="empty">No documents attached.</p>`}
  ${canEdit ? `<label class="upload">${icon("plus")}<span>Attach ${kind === "closure" ? "closure evidence" : "a document"}</span><input type="file" data-action="doc.upload" data-id="${esc(it.id)}" data-kind="${kind}" accept=".pdf,image/*,.txt,.csv,.md,application/pdf"></label><div class="hint">PDF, image or text, up to 20 MB. Save PowerPoint and Word files as PDF first.</div>` : ""}`;
}
const refLink = it => `<a href="#items" class="ref" data-action="item.open" data-id="${esc(it.id)}">${esc(it.ref)}</a>`;
const person = (ctx, uid) => `<span class="person">${esc(ctx.name(uid))}</span>`;
const readOnlyNote = ctx => ctx.role === "Secretary" ? "" : msg("info", `You are signed in as <b>${esc(ctx.role)}</b>. You can view records${ctx.role === "Viewer" ? "" : " and sign minutes"}; only secretaries can change them.`);

/* ====================================================================== */
/* Dashboard and analytics                                               */
/* ====================================================================== */
export function dashboard(ctx) {
  const items = itemsArr(ctx).filter(i => !i.archived);
  const open = items.filter(isItemOpen), closed = items.filter(i => i.status === "CLOSED");
  const acts = actionsArr(ctx);
  const overdue = acts.filter(a => isOverdue(a, ctx.today));
  const review = meetingsArr(ctx).filter(m => m.status === "circulated");
  const pendSigs = review.reduce((n, m) => n + signatureState(m, ctx.d.sigs).pending, 0);
  const myTasks = myReviewTasks(ctx);
  const k = charterKpis(ctx.d, ctx.today);
  const hc = headcountTotals(ctx.d);
  const newReqs = ctx.role === "Secretary" ? pendingRequests(ctx).length : 0;
  const stageCounts = ITEM_STAGES.map(s => [s, items.filter(i => stageOf(ctx, i) === s).length]);
  const outcomes = outcomeCounts(ctx.d);
  const depts = DEPARTMENTS.map(d => [d, open.filter(i => i.dept === d).length, closed.filter(i => i.dept === d).length]).filter(r => r[1] + r[2]);
  const kpi = (label, val, note, filter, tone = "") => `<button class="kpi ${tone}" data-action="nav.items" data-filter="${esc(JSON.stringify(filter))}"><span class="kpi-l">${esc(label)}</span><span class="kpi-v">${val}</span><span class="kpi-n">${esc(note)}</span></button>`;
  const stat = (label, val, note, tone = "") => `<div class="kpi static ${tone}"><span class="kpi-l">${esc(label)}</span><span class="kpi-v">${val}</span><span class="kpi-n">${esc(note)}</span></div>`;
  const bars = (rows, filterOf, max = Math.max(1, ...rows.map(r => r[1]))) => `<div class="bars">${rows.map(([l, n]) => `<button class="bar-row" ${filterOf ? `data-action="nav.items" data-filter="${esc(JSON.stringify(filterOf(l)))}"` : ""} ${n && filterOf ? "" : "disabled"}><span class="bar-l" title="${esc(l)}">${esc(l)}</span><span class="bar-t"><span class="bar-f" style="width:${(n / max) * 100}%"></span></span><span class="bar-n">${n}</span></button>`).join("")}</div>`;
  const upcoming = meetingsArr(ctx).filter(m => m.status !== "archived").slice().reverse().slice(0, 4);
  return `${pageHeader({ title: "Committee overview", sub: `Live figures as of ${fmtDate(ctx.today)}. Each agenda item is counted once, however many meetings it went to.`,
      actions: ctx.role === "Secretary" ? btn("New agenda item", "item.new", { ic: "plus" }) + btn("New meeting", "meeting.new", { kind: "primary", ic: "plus" }) : "" })}
  ${myTasks.length ? msg("info", `<b>${myTasks.length} set${myTasks.length > 1 ? "s" : ""} of minutes need${myTasks.length > 1 ? "" : "s"} your ${myTasks.some(t => t.role === "chairman") ? "approval or " : ""}signature.</b>`, btn("Open review queue", "nav.go", { kind: "primary", data: { to: "review" } })) : ""}
  ${newReqs ? msg("info", `<b>${newReqs} new request${newReqs > 1 ? "s" : ""} from departments</b> waiting to be accepted as agenda items.`, btn("Open requests", "nav.go", { kind: "primary", data: { to: "requests" } })) : ""}
  <section class="kpi-strip" aria-label="Key figures">
    ${kpi("Open items", open.length, `${hc.requested} position${hc.requested === 1 ? "" : "s"} requested on open items`, { status: "open" })}
    ${kpi("Closed items", closed.length, "Follow-up complete, evidence recorded", { status: "CLOSED" })}
    <button class="kpi ${overdue.length ? "bad" : ""}" data-action="nav.actions" data-filter='{"overdue":true}'><span class="kpi-l">Overdue actions</span><span class="kpi-v">${overdue.length}</span><span class="kpi-n">Past due date, not done</span></button>
    ${kpi("Pending signatures", pendSigs, `Across ${review.length} set${review.length === 1 ? "" : "s"} of minutes under review`, { status: "", pending: true }, pendSigs ? "warn" : "")}
  </section>
  <section class="card"><div class="card-h"><h2>Project charter measures</h2><span class="hint">From the WPC Process Automation charter</span></div>
    <div class="kpi-strip inner">
      ${stat("Request to decision", k.cycleDays == null ? "—" : `${k.cycleDays} days`, k.decidedCount ? `Average over ${k.decidedCount} decided item${k.decidedCount > 1 ? "s" : ""}` : "No item decided yet")}
      ${stat("Complete first time", k.firstTimePct == null ? "—" : `${k.firstTimePct}%`, "Decided without being returned for clarification")}
      ${stat("Open over 30 days", k.aged30, "Open items submitted more than 30 days ago", k.aged30 ? "warn" : "")}
      ${stat("Positions approved", hc.approved, "Headcount in final decisions (approved, EXCO, circulation)")}
    </div>
    <p class="hint">Member satisfaction, the fourth charter measure, needs a survey and is not measured in WPC Hub.</p>
  </section>
  <div class="cols-2">
    <section class="card"><div class="card-h"><h2>Decisions by outcome</h2><span class="hint">All meetings</span></div>${bars(outcomes, null)}</section>
    <section class="card"><div class="card-h"><h2>Items by stage</h2><span class="hint">Select a stage to see its items</span></div>${bars(stageCounts, s => ({ stage: s, status: "" }))}</section>
  </div>
  <div class="cols-2">
    <section class="card"><div class="card-h"><h2>Items by category</h2><span class="hint">Select a count to see the items</span></div>
      <div class="table-scroll"><table class="grid compact"><thead><tr><th scope="col">Category</th><th scope="col" class="num">Open</th><th scope="col" class="num">Closed</th><th scope="col" class="num">Positions requested</th></tr></thead><tbody>
      ${Object.keys(CATEGORIES).map(c => { const o = open.filter(i => i.category === c), cl = closed.filter(i => i.category === c).length;
        const link = (n, f) => n ? `<button class="count-link" data-action="nav.items" data-filter="${esc(JSON.stringify(f))}" aria-label="${n} ${esc(c)} items">${n}</button>` : `<span class="zero">0</span>`;
        return `<tr><td>${esc(c)}</td><td class="num">${link(o.length, { cat: c, status: "open" })}</td><td class="num">${link(cl, { cat: c, status: "CLOSED" })}</td><td class="num">${o.reduce((n, i) => n + (Number(i.hcRequested) || 0), 0) || "—"}</td></tr>`; }).join("")}
      </tbody></table></div>
    </section>
    <section class="card"><div class="card-h"><h2>Age of open items</h2><span class="hint">Days since submission</span></div>${bars(k.ageBuckets, null)}</section>
  </div>
  <div class="cols-2">
    <section class="card"><div class="card-h"><h2>Meetings in progress</h2>${btn("All meetings", "nav.go", { kind: "ghost", data: { to: "meetings" } })}</div>
      ${upcoming.length ? `<div class="table-scroll"><table class="grid compact"><thead><tr><th scope="col">Meeting</th><th scope="col" class="num">Items</th><th scope="col">Status</th></tr></thead><tbody>${upcoming.map(m => `<tr><td><a href="#meetings" data-action="meeting.open" data-id="${esc(m.id)}">${esc(m.title)}</a><div class="hint">${fmtDate(m.date)}${m.time ? ` · ${esc(m.time)}` : ""}${m.location ? ` · ${esc(m.location)}` : ""}</div></td><td class="num">${m.agenda.length}</td><td>${phaseBadge(ctx, m)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">No open meetings. Create the next one from New meeting.</p>`}
    </section>
    <section class="card"><div class="card-h"><h2>Open items by department</h2></div>
      ${depts.length ? `<div class="table-scroll"><table class="grid compact"><thead><tr><th scope="col">Department</th><th scope="col" class="num">Open</th><th scope="col" class="num">Closed</th></tr></thead><tbody>${depts.map(([d, o, c]) => `<tr><td>${esc(d)}</td><td class="num">${o ? `<button class="count-link" data-action="nav.items" data-filter="${esc(JSON.stringify({ dept: d, status: "open" }))}">${o}</button>` : 0}</td><td class="num">${c}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">No items yet.</p>`}
    </section>
  </div>
  <section class="card"><div class="card-h"><h2>Overdue follow-up actions</h2>${overdue.length ? btn("View all actions", "nav.go", { kind: "ghost", data: { to: "actions" } }) : ""}</div>
    ${overdue.length ? `<div class="table-scroll"><table class="grid compact"><thead><tr><th scope="col">Item</th><th scope="col">Action</th><th scope="col">Responsible</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead><tbody>${overdue.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8).map(a => { const it = ctx.d.items[a.itemId];
      return `<tr class="row-bad"><td>${it ? refLink(it) : "—"}</td><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td class="num">${fmtDate(a.due)}</td><td>${actionBadge(a, ctx.today)}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="empty">No overdue actions.</p>`}
  </section>`;
}

/* ====================================================================== */
/* Agenda management: items                                              */
/* ====================================================================== */
export function filterItems(ctx) {
  const f = ctx.ui.itemFilter;
  return itemsArr(ctx).filter(it => {
    if (!f.archived && it.archived) return false;
    if (f.archived && !it.archived) return false;
    if (f.status === "open" && !isItemOpen(it)) return false;
    if (f.status && f.status !== "open" && it.status !== f.status) return false;
    if (f.cat && it.category !== f.cat) return false;
    if (f.dept && it.dept !== f.dept) return false;
    if (f.stage && stageOf(ctx, it) !== f.stage) return false;
    if (f.owner && it.owner !== f.owner && !actionsArr(ctx).some(a => a.itemId === it.id && a.owner === f.owner)) return false;
    const ms = meetingsOf(ctx, it);
    if (f.month && !ms.some(m => (m.date || "").slice(0, 7) === f.month)) return false;
    if (f.pending && !ms.some(m => awaitingSignature(m, ctx.d.sigs))) return false;
    if (f.overdue && !actionsArr(ctx).some(a => a.itemId === it.id && isOverdue(a, ctx.today))) return false;
    if (f.q) { const q = f.q.toLowerCase(); if (!`${it.ref} ${it.title} ${it.request} ${it.owner}`.toLowerCase().includes(q)) return false; }
    return true;
  });
}
export function itemsView(ctx) {
  const f = ctx.ui.itemFilter;
  const rows = filterItems(ctx);
  const owners = [...new Set([...itemsArr(ctx).map(i => i.owner), ...actionsArr(ctx).map(a => a.owner)].filter(Boolean))].sort();
  const months = [...new Set(meetingsArr(ctx).map(m => (m.date || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const sel = (name, label, opts) => `<label class="fb"><span>${esc(label)}</span><select data-action="filter.items" data-key="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(f[name] ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const active = ["cat", "dept", "stage", "owner", "month"].filter(k => f[k]).length + (f.pending ? 1 : 0) + (f.overdue ? 1 : 0) + (f.q ? 1 : 0);
  return `${pageHeader({ title: "Agenda items", sub: "One record per item, from submission to closure. The reference never changes.",
      actions: ctx.role === "Secretary" ? btn("New agenda item", "item.new", { kind: "primary", ic: "plus" }) : "" })}
  ${readOnlyNote(ctx)}
  <section class="filterbar" aria-label="Filters">
    <label class="fb search">${icon("search")}<input type="search" data-action="filter.items" data-key="q" value="${esc(f.q)}" placeholder="Search reference, title, request" aria-label="Search items"></label>
    ${sel("status", "Status", [["open", "Open"], ["CLOSED", "Closed"], ["WITHDRAWN", "Withdrawn"], ["", "All"]])}
    ${sel("stage", "Stage", [["", "All stages"], ...ITEM_STAGES.map(s => [s, s])])}
    ${sel("cat", "Category", [["", "All categories"], ...Object.keys(CATEGORIES).map(c => [c, c])])}
    ${sel("dept", "Department", [["", "All departments"], ...DEPARTMENTS.map(d => [d, d])])}
    ${sel("owner", "Responsible", [["", "Anyone"], ...owners.map(o => [o, o])])}
    ${sel("month", "Meeting month", [["", "Any month"], ...months.map(m => [m, monthLabel(m)])])}
    <label class="fb chk"><input type="checkbox" data-action="filter.items" data-key="pending" ${f.pending ? "checked" : ""}> Pending signatures</label>
    <label class="fb chk"><input type="checkbox" data-action="filter.items" data-key="overdue" ${f.overdue ? "checked" : ""}> Overdue actions</label>
    <label class="fb chk"><input type="checkbox" data-action="filter.items" data-key="archived" ${f.archived ? "checked" : ""}> Archived only</label>
    ${active ? btn(`Clear ${active} filter${active > 1 ? "s" : ""}`, "filter.clear", { kind: "ghost" }) : ""}
  </section>
  ${dataTable({ id: "items", rows, tstate: ctx.ui.tables.items, caption: "Agenda items",
    rowAttrs: r => `class="clickable ${actionsArr(ctx).some(a => a.itemId === r.id && isOverdue(a, ctx.today)) ? "row-bad" : ""}" data-action="item.open" data-id="${esc(r.id)}" tabindex="0"`,
    empty: "No items match these filters.",
    columns: [
      { key: "ref", label: "Reference", render: r => `<span class="ref">${esc(r.ref)}</span>`, width: "120px" },
      { key: "title", label: "Item", render: r => `${esc(r.title)}${r.example ? ` <span class="tag">Example</span>` : ""}<div class="hint">${esc(r.sub || "")}</div>` },
      { key: "category", label: "Category" },
      { key: "dept", label: "Department" },
      { key: "hcRequested", label: "Positions", num: true, value: r => Number(r.hcRequested) || 0, render: r => r.hcRequested != null && r.hcRequested !== "" ? String(r.hcRequested) : "—" },
      { key: "owner", label: "Responsible" },
      { key: "meetings", label: "Meetings", num: true, value: r => meetingsOf(ctx, r).length, render: r => String(meetingsOf(ctx, r).length) },
      { key: "openActions", label: "Open actions", num: true, value: r => actionsArr(ctx).filter(a => a.itemId === r.id && isActionOpen(a)).length, render: r => String(actionsArr(ctx).filter(a => a.itemId === r.id && isActionOpen(a)).length) },
      { key: "stage", label: "Stage", value: r => ITEM_STAGES.indexOf(stageOf(ctx, r)), render: r => badge(stageOf(ctx, r)) },
    ] })}`;
}

export function itemPanel(ctx, it) {
  const ms = meetingsOf(ctx, it).slice().reverse();
  const acts = actionsArr(ctx).filter(a => a.itemId === it.id).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const audit = Object.values(ctx.d.audit).filter(e => e.entityId === it.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const sec = ctx.role === "Secretary";
  const stage = stageOf(ctx, it);
  const lo = latestOutcome(it, ctx.d);
  return `${panelHead(it.title, `<span class="ref">${esc(it.ref)}</span> · ${esc(it.category)} · ${esc(it.sub || "")}`)}
  <div class="panel-body">
    <div class="obj-status">${badge(stage)}${it.archived ? badge("Archived", "neutral") : ""}
      ${btn("Request sheet (PDF)", "pdf.item", { ic: "download", data: { id: it.id } })}
      ${sec && !it.archived ? `<span class="spacer"></span>${btn("Edit", "item.edit", { ic: "edit", data: { id: it.id } })}${isItemOpen(it) ? btn("Withdraw", "item.withdraw", { data: { id: it.id } }) : btn("Reopen", "item.reopen", { data: { id: it.id } })}${!isItemOpen(it) ? btn("Archive", "item.archive", { ic: "archive", data: { id: it.id } }) : ""}` : ""}
      ${sec && it.archived ? `<span class="spacer"></span>${btn("Restore from archive", "item.unarchive", { data: { id: it.id } })}` : ""}
    </div>
    <dl class="facts">
      <div><dt>Requesting department</dt><dd>${esc(it.dept)}</dd></div>
      <div><dt>Responsible</dt><dd>${esc(it.owner || "—")}</dd></div>
      <div><dt>Positions requested</dt><dd>${it.hcRequested != null && it.hcRequested !== "" ? esc(it.hcRequested) : "—"}</dd></div>
      <div><dt>Positions approved</dt><dd>${lo && lo.mn.hcApproved != null && lo.mn.hcApproved !== "" ? `${esc(lo.mn.hcApproved)} <span class="hint">(${esc(lo.m.ref)})</span>` : "—"}</dd></div>
      <div><dt>Grade</dt><dd>${esc(it.grade || "—")}</dd></div>
      <div><dt>Budget</dt><dd>${esc(it.budgeted || "—")}${it.annualCost != null && it.annualCost !== "" ? ` · ${esc(fmtOMR(it.annualCost))} a year` : ""}</dd></div>
      <div><dt>Effective date</dt><dd>${fmtDate(it.effectiveDate)}</dd></div>
      <div><dt>Latest outcome</dt><dd>${lo ? `${badge(lo.mn.outcome, outcomeTone(lo.mn.outcome))} <span class="hint">${fmtDate(lo.m.date)}</span>` : "—"}</dd></div>
      <div><dt>Submitted</dt><dd>${fmtDate(it.createdAt)}${it.requestKey ? ' <span class="hint">by department request</span>' : ""}</dd></div>
      <div><dt>Last changed</dt><dd>${it.updatedAt ? `${fmtDateTime(it.updatedAt)} by ${esc(ctx.name(it.updatedBy))}` : "—"}</dd></div>
      <div class="wide"><dt>Request</dt><dd class="pre">${esc(it.request || "—")}</dd></div>
    </dl>
    <section class="sec"><h3>Documents</h3>${docList(ctx, it, "request", sec && !it.archived && !!ctx.s.assets)}</section>
    <section class="sec"><h3>History across meetings</h3>
      ${ms.length ? `<ol class="timeline">${ms.map(m => { const mn = ctx.d.minutes[`${m.id}__${it.id}`] || {};
        return `<li><div class="tl-h"><a href="#meetings" data-action="meeting.open" data-id="${esc(m.id)}">${esc(m.title)}</a><span class="hint">${fmtDate(m.date)}</span>${phaseBadge(ctx, m)}</div>
          <div class="tl-b"><div><span class="lbl">Discussion</span><p class="pre">${esc(mn.discussion || "—")}</p></div><div><span class="lbl">Outcome and decision</span><p>${mn.outcome ? badge(mn.outcome, outcomeTone(mn.outcome)) : ""}${mn.hcApproved != null && mn.hcApproved !== "" ? ` <span class="hint">${esc(mn.hcApproved)} approved</span>` : ""}</p><p class="pre">${esc(mn.decision || (mn.outcome ? "" : "—"))}</p></div></div></li>`; }).join("")}</ol>` : `<p class="empty">Not yet on a meeting agenda.</p>`}
    </section>
    <section class="sec"><h3>Follow-up actions</h3>
      ${acts.length ? `<table class="grid compact"><thead><tr><th scope="col">Action</th><th scope="col">Responsible</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead><tbody>${acts.map(a => `<tr class="${isOverdue(a, ctx.today) ? "row-bad" : ""}"><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td class="num">${fmtDate(a.due)}</td><td>${sec ? actionStatusSelect(a) : actionBadge(a, ctx.today)}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">No actions recorded.</p>`}
    </section>
    <section class="sec"><h3>Closure</h3>
      ${it.status === "CLOSED" ? `<dl class="facts"><div><dt>Closed on</dt><dd>${fmtDate(it.closedDate)}</dd></div><div><dt>Closed by</dt><dd>${esc(ctx.name(it.closedBy))}</dd></div><div class="wide"><dt>Supporting evidence</dt><dd class="pre">${esc(it.evidence || "—")}</dd></div></dl>${docList(ctx, it, "closure", sec && !it.archived && !!ctx.s.assets)}`
        : it.status === "WITHDRAWN" ? `<p>Withdrawn on ${fmtDate(it.closedDate)}. Reason: ${esc(it.evidence || "—")}</p>`
        : sec ? `<p class="hint">Signed minutes do not close an item. Close it when the follow-up is complete.</p>
          <form class="form" data-form="item.close" data-id="${esc(it.id)}" novalidate>
            ${field({ id: "closedDate", label: "Closure date", type: "date", value: ctx.today, required: true, attrs: `max="${ctx.today}"` })}
            ${field({ id: "evidence", label: "Supporting evidence", type: "textarea", required: true, wide: true, rows: 2, hint: "e.g. renewal letter reference, SuccessFactors record updated, org chart published" })}
            <div class="form-actions wide">${btn("Close item", null, { kind: "primary", type: "submit" })}</div></form>
          <span class="lbl">Evidence documents</span>${docList(ctx, it, "closure", !!ctx.s.assets)}` : `<p class="empty">Open.</p>`}
    </section>
    <section class="sec"><h3>Change log</h3>
      ${audit.length ? `<ul class="log">${audit.map(e => `<li><span class="hint">${fmtDateTime(e.at)}</span> ${esc(ctx.name(e.by))}: ${esc(e.action)}${e.detail ? ` <span class="hint">(${esc(e.detail)})</span>` : ""}</li>`).join("")}</ul>` : `<p class="empty">No changes logged yet.</p>`}
    </section>
  </div>`;
}
export const outcomeTone = o => ({ Approved: "ok", "Approved with conditions": "ok", "Recommended to EXCO": "info", "Endorsed by circulation": "ok", Rejected: "bad", Deferred: "warn", "Returned for clarification": "warn" }[o] || "neutral");
const actionStatusSelect = a => `<select class="inline-select" data-action="action.status" data-id="${esc(a.id)}" aria-label="Status of ${esc(a.text)}">${Object.entries(ACTION_LABELS).map(([k, l]) => `<option value="${k}" ${a.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;

export const manpowerFields = (v, errors = {}) => `<fieldset class="fieldset wide"><legend>Manpower details</legend><div class="form inner">
  ${field({ id: "hcRequested", label: "Positions requested", type: "number", value: v.hcRequested ?? "", error: errors.hcRequested, attrs: 'min="0" step="1" inputmode="numeric"' })}
  ${field({ id: "grade", label: "Grade", value: v.grade || "", attrs: 'maxlength="20"', hint: "As in the job structure" })}
  ${field({ id: "budgeted", label: "Budget", value: v.budgeted || "", options: BUDGETED.map(b => [b, b || "Not stated"]), error: errors.budgeted })}
  ${field({ id: "annualCost", label: "Estimated annual cost (OMR)", type: "number", value: v.annualCost ?? "", error: errors.annualCost, attrs: 'min="0" step="any" inputmode="decimal"' })}
  ${field({ id: "effectiveDate", label: "Effective Date", type: "date", value: v.effectiveDate || "", error: errors.effectiveDate })}
  </div><p class="hint">Leave blank what does not apply (for example, an organisation change).</p></fieldset>`;

export function itemForm(ctx, it, { meetingId = "", errors = {}, values = null, dupes = [], requestKey = "" } = {}) {
  const v = values || it || { category: "Expatriate contract renewal", sub: "Renewal on same terms", dept: "Potline", owner: "", title: "", request: "", budgeted: "" };
  const subs = CATEGORIES[v.category] || CATEGORIES.Other;
  return `${panelHead(it ? `Edit ${it.ref}` : "New agenda item", it ? "Changes are logged with your name and time." : "A unique reference is assigned when you save.")}
  <div class="panel-body">
    ${dupes.length ? msg("warn", `<b>Possible duplicate.</b> ${dupes.length === 1 ? "This open item looks similar" : "These open items look similar"}: ${dupes.map(x => `<span class="ref">${esc(x.item.ref)}</span> ${esc(x.item.title)}`).join("; ")}. Open the existing item instead, or save again to create a separate item.`) : ""}
    <form class="form" data-form="${it ? "item.update" : "item.create"}" data-id="${esc(it?.id || "")}" data-meeting="${esc(meetingId)}" data-request="${esc(requestKey)}" data-rev="${esc(it?.rev ?? 0)}" data-dupeok="${dupes.length ? "1" : ""}" novalidate>
      ${errors.form ? msg("error", esc(errors.form)) : ""}
      ${field({ id: "title", label: "Item title", value: v.title, required: true, wide: true, error: errors.title, attrs: 'maxlength="150" autofocus' })}
      ${field({ id: "category", label: "Category", value: v.category, options: Object.keys(CATEGORIES), required: true, error: errors.category, attrs: 'data-action="form.category"' })}
      ${field({ id: "sub", label: "Subcategory", value: v.sub, options: subs, required: true, error: errors.sub })}
      ${field({ id: "dept", label: "Requesting department", value: v.dept, options: DEPARTMENTS, required: true, error: errors.dept })}
      ${field({ id: "owner", label: "Responsible", value: v.owner, required: true, error: errors.owner, hint: "Role or name, e.g. HR Manager" })}
      ${field({ id: "request", label: "Request", type: "textarea", value: v.request, required: true, wide: true, rows: 4, error: errors.request, hint: "What the department asks the committee to decide" })}
      ${manpowerFields(v, errors)}
      ${it ? field({ id: "returned", label: "Returned to the department for clarification?", value: it.returned ? "yes" : "", options: [["", "No"], ["yes", "Yes"]], hint: "Counts against the charter measure \u201ccomplete first time\u201d." }) : ""}
      <div class="form-actions wide">${btn("Cancel", "layer.close")}${btn(it ? "Save changes" : dupes.length ? "Create anyway" : "Create item", null, { kind: "primary", type: "submit" })}</div>
    </form>
    <p class="hint">Categories and subcategories are proposals to be confirmed by the committee.</p>
  </div>`;
}

/* ====================================================================== */
/* Meeting management + minutes                                          */
/* ====================================================================== */
export function meetingsView(ctx) {
  const rows = meetingsArr(ctx);
  return `${pageHeader({ title: "Meetings", sub: "Each monthly meeting from agenda preparation to approved, archived minutes.",
      actions: ctx.role === "Secretary" ? btn("New meeting", "meeting.new", { kind: "primary", ic: "plus" }) : "" })}
  ${dataTable({ id: "meetings", rows, tstate: ctx.ui.tables.meetings, caption: "Meetings",
    rowAttrs: r => `class="clickable" data-action="meeting.open" data-id="${esc(r.id)}" tabindex="0"`,
    empty: "No meetings yet.",
    columns: [
      { key: "ref", label: "Reference", render: r => `<span class="ref">${esc(r.ref)}</span>`, width: "110px" },
      { key: "title", label: "Meeting" },
      { key: "date", label: "Date", render: r => fmtDate(r.date) },
      { key: "agenda", label: "Items", num: true, value: r => r.agenda.length, render: r => String(r.agenda.length) },
      { key: "version", label: "Minutes version", num: true, render: r => r.version ? `v${r.version}` : "—" },
      { key: "sigs", label: "Signed", num: true, value: r => signatureState(r, ctx.d.sigs).signed, render: r => r.status === "circulated" || r.status === "archived" ? `${signatureState(r, ctx.d.sigs).signed}/${r.members.length}` : "—" },
      { key: "status", label: "Status", value: r => MEETING_STATES[r.status]?.order, render: r => phaseBadge(ctx, r) },
    ] })}`;
}

const STEPS = [["preparation", "Preparation"], ["agenda_issued", "Agenda issued"], ["in_session", "In session"], ["drafting", "Minutes drafting"], ["circulated", "Review and signature"], ["approved", "Chairman approval"], ["archived", "Archived"]];
function stepper(ctx, m) {
  const ph = meetingPhase(m, ctx.d.sigs).key;
  const cur = m.status === "archived" ? 6 : ph === "approved" ? 5 : m.status === "circulated" ? 4 : MEETING_STATES[m.status].order;
  return `<ol class="stepper" aria-label="Meeting workflow">${STEPS.map(([, l], i) => `<li class="${i < cur ? "done" : i === cur ? "current" : ""}" ${i === cur ? 'aria-current="step"' : ""}><span class="dot">${i < cur ? icon("actions") : i + 1}</span><span>${l}</span></li>`).join("")}</ol>`;
}

export function meetingDetail(ctx, m) {
  const sec = ctx.role === "Secretary";
  const ph = meetingPhase(m, ctx.d.sigs);
  const s = signatureState(m, ctx.d.sigs);
  const agenda = m.agenda.map(id => ctx.d.items[id]).filter(Boolean);
  const tab = ctx.ui.meetingTab;
  const transitions = [];
  if (sec) {
    if (m.status === "preparation") transitions.push(btn("Issue agenda", "meeting.transition", { kind: "primary", data: { id: m.id, to: "agenda_issued" } }));
    if (m.status === "agenda_issued") transitions.push(btn("Revise agenda", "meeting.transition", { data: { id: m.id, to: "preparation" } }), btn("Start meeting", "meeting.transition", { kind: "primary", data: { id: m.id, to: "in_session" } }));
    if (m.status === "in_session") transitions.push(btn("End meeting", "meeting.transition", { kind: "primary", data: { id: m.id, to: "drafting" } }));
    if (m.status === "drafting") transitions.push(btn(`Circulate minutes as v${m.version + 1}`, "meeting.transition", { kind: "primary", data: { id: m.id, to: "circulated" } }));
    if (m.status === "circulated" && !["approved", "signed"].includes(ph.key)) transitions.push(btn("Revise minutes (new version)", "meeting.transition", { data: { id: m.id, to: "drafting" } }));
    if (m.status === "circulated" && ["approved", "signed"].includes(ph.key)) transitions.push(btn("Archive approved minutes", "meeting.transition", { kind: "primary", ic: "archive", data: { id: m.id, to: "archived" } }));
    if (m.status !== "archived") transitions.unshift(btn("Edit details", "meeting.edit", { ic: "edit", data: { id: m.id } }));
  }
  if (ctx.s.downloads && agenda.length) transitions.unshift(
    btn(m.snapshot ? `Minutes v${m.version} (PDF)` : "Draft minutes (PDF)", "minutes.pdf", { ic: "download", data: { id: m.id } }),
    btn("Word", "minutes.download", { kind: "ghost", ic: "download", title: "Word file for editing on a computer", data: { id: m.id } }));
  if (sec && agenda.length && m.status !== "archived") transitions.unshift(btn("Email members", "email.members", { ic: "mail", data: { id: m.id } }));
  if (agenda.length) transitions.unshift(btn("Present", "present.open", { ic: "present", data: { id: m.id } }));
  const q = quorumState(m, ctx.d.roster.quorum);
  const tabs = [["agenda", `Agenda and minutes (${agenda.length})`], ["attendance", `Attendance (${q.present})`], ["signatures", "Signatures"], ["versions", `Versions (${m.versions.length})`], ["log", "Change log"]];
  return `${pageHeader({ crumbs: [{ label: "Meetings", href: "#meetings", action: "meeting.back" }, { label: m.title }], title: m.title,
      sub: `<span class="ref">${esc(m.ref)}</span> · ${fmtDate(m.date)}${m.time ? ` · ${esc(m.time)}` : ""}${m.location ? ` · ${esc(m.location)}` : ""}${m.version ? ` · minutes v${m.version}` : ""} · ${phaseBadge(ctx, m)}${q.required ? ` · ${badge(q.met ? `Quorum met (${q.present}/${q.required})` : `No quorum (${q.present}/${q.required})`, q.met ? "ok" : "bad")}` : ""}`, actions: transitions.join("") })}
  ${stepper(ctx, m)}
  ${meetingGuide(ctx, m, ph, s, agenda)}
  ${banners(ctx, m, ph, s)}
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? "on" : ""}" data-action="meeting.tab" data-tab="${k}">${esc(l)}</button>`).join("")}</div>
  <div class="tabpanel" role="tabpanel">
  ${tab === "agenda" ? agendaTab(ctx, m, agenda) : tab === "attendance" ? attendanceTab(ctx, m, q) : tab === "signatures" ? signaturesTab(ctx, m, s) : tab === "versions" ? versionsTab(ctx, m) : meetingLog(ctx, m)}
  </div>`;
}

/** "What happens now": the steps for the viewer's role at this stage, and who the meeting is waiting on. */
function meetingGuide(ctx, m, ph, s, agenda) {
  const role = ctx.role, me = ctx.s.myId;
  const isMember = me && m.members.includes(me), isChair = me && m.chairman === me;
  const missing = agenda.filter(it => !(ctx.d.minutes[`${m.id}__${it.id}`] || {}).outcome);
  const sec = role === "Secretary";
  const G = {
    preparation: { wait: "Secretaries are preparing the agenda.",
      sec: ["Check the agenda: add or remove items so it holds everything ready for decision.", "Open each item and check its request file is complete (positions, grade, budget, documents).", "Under Edit details, set the time, location, Chairman and the attendance sign-in link (DocuSign).", "Click Issue agenda."],
      other: ["Nothing to do yet. You can already read the requests below."] },
    agenda_issued: { wait: "Agenda issued. The meeting has not started.",
      sec: ["Click Email members to send the agenda, or download the Meeting pack (PDF) and share it.", "On the meeting day, click Start meeting."],
      other: ["Read each request before the meeting: use Present or download the Meeting pack (PDF).", "Note your questions for the department."] },
    in_session: { wait: `Meeting in progress: ${agenda.length - missing.length} of ${agenda.length} items decided.`,
      sec: ["Pick an item from the list on the left (one at a time).", "Step 1 Discussion, step 2 Outcome and positions approved, step 3 Decision wording, step 4 Follow-up actions.", "Record attendance on the Attendance tab.", missing.length ? `${missing.length} item${missing.length > 1 ? "s" : ""} still need an outcome. When all are done, click End meeting.` : "All items have an outcome. Click End meeting."],
      other: ["Follow along: each item shows its request file, and decisions appear as the secretaries record them."] },
    drafting: { wait: "Meeting held. Secretaries are finishing the minutes.",
      sec: [missing.length ? `Complete the outcome for: ${missing.map(i => i.ref).join(", ")}.` : "Every item has an outcome.", "Read through the decision wording and actions once more.", "Check who signs on the Signatures tab.", `Click Circulate minutes as v${m.version + 1}. The minutes are frozen and members are asked to sign.`],
      other: ["Nothing to do yet. You will be asked to sign when the minutes are circulated."] },
    circulated: { wait: ph.key === "correction" ? "A correction was requested. Secretaries will issue a new version." : !s.allSigned ? `Waiting for member signatures (${s.signed} of ${s.total}).` : !s.chairApproved && m.chairman ? `Waiting for the Chairman (${esc(ctx.name(m.chairman))}).` : "Approved. Ready to archive.",
      sec: ph.key === "correction" ? ["Read the correction request in the red box.", "Click Revise minutes, fix the text, then circulate the new version."] : !s.allSigned ? ["Follow signatures on the Signatures tab.", "Remind members who have not signed."] : ["Click Archive approved minutes. The record is locked."],
      member: ["Read the minutes below.", "Click Sign, or Request correction and say what must change."],
      chair: s.allSigned ? ["Read the minutes below.", "Click Approve minutes, or Request correction."] : [`Approval opens when all members have signed (${s.signed} of ${s.total}).`],
      other: ["The minutes are under review by the committee."] },
    archived: { wait: "Final minutes approved and locked.",
      sec: ["Download the final minutes (PDF) for the file.", "Follow up the actions. Close each item from Agenda items when its follow-up is done and evidence is recorded."],
      other: ["Download the final minutes (PDF) if you need a copy."] },
  }[m.status];
  if (!G) return "";
  const steps = sec ? G.sec : isChair && G.chair ? G.chair : isMember && G.member && !sigFor(m, me, ctx.d.sigs) ? G.member : G.other;
  return `<section class="guide" aria-label="What happens now"><div class="guide-h"><span class="guide-tag">What happens now</span><b>${G.wait}</b></div>
    <ol class="guide-steps">${steps.map(t => `<li>${t}</li>`).join("")}</ol>
    <span class="guide-role">You are viewing as ${esc(role)}${isChair && role !== "Secretary" ? " (Chairman of this meeting)" : ""}</span></section>`;
}

function banners(ctx, m, ph, s) {
  const out = [];
  const me = ctx.s.myId;
  const isMember = me && m.members.includes(me), isChair = me && m.chairman === me;
  if (m.status === "circulated") {
    const mine = me ? sigFor(m, me, ctx.d.sigs) : null;
    if (ph.key === "correction" && ctx.role === "Secretary") out.push(msg("error", `<b>Correction requested on v${m.version}.</b> ${s.corrections.map(c => `${esc(ctx.name(c.user))}: “${esc(c.sig.comment)}”`).join(" · ")}`, btn("Revise minutes (new version)", "meeting.transition", { kind: "primary", data: { id: m.id, to: "drafting" } })));
    if (isMember && !mine) out.push(msg("info", `<b>Your signature is needed on version ${m.version}.</b> Read the minutes below, then sign or request a correction.`, btn(`Sign v${m.version}`, "sig.sign", { kind: "primary", ic: "sign", data: { id: m.id } }) + btn("Request correction", "sig.correct", { data: { id: m.id } })));
    if (isMember && mine) out.push(msg(mine.status === "signed" ? "ok" : "warn", mine.status === "signed" ? `You signed v${m.version} on ${fmtDateTime(mine.at)}.` : `You requested a correction on v${m.version}. The secretaries will issue a new version for you to sign.`));
    if (isChair && s.allSigned && !s.chairApproved) out.push(msg("info", `<b>All ${s.total} members have signed v${m.version}.</b> Your final approval is required.`, btn("Approve minutes", "sig.approve", { kind: "primary", data: { id: m.id } }) + btn("Request correction", "sig.correct", { data: { id: m.id } })));
    if (isChair && !s.allSigned) out.push(msg("info", `Chairman approval opens once all members have signed (${s.signed}/${s.total}).`));
    if (ph.key === "signed" && ctx.role === "Secretary") out.push(msg("warn", "All members signed, but no Chairman is set for this meeting. Set the Chairman under Edit details to collect final approval, or archive without it if your procedure allows."));
  }
  if (m.status === "archived") out.push(msg("ok", `Final minutes v${m.version} archived on ${fmtDateTime(m.archivedAt)}. The record is locked.`));
  return out.join("");
}

/** People expected at the meeting: roster, Chairman and the meeting's signers. */
export const attendees = (ctx, m) => [...new Set([m.chairman, ctx.d.roster.chairman, ...(ctx.d.roster.members || []), ...m.members, ...Object.keys(m.attendance || {})].filter(Boolean))];
function attendanceTab(ctx, m, q) {
  const people = attendees(ctx, m);
  const edit = ctx.role === "Secretary" && !["circulated", "archived"].includes(m.status);
  const att = m.attendance || {};
  const link = safeUrl(m.attendanceLink);
  return `<section class="card"><div class="card-h"><h2>Attendance</h2><span class="hint">${q.required ? `Quorum: ${q.required} present. ${q.met ? "Met." : "Not met."}` : "Quorum not set. A secretary can set it under Users and permissions."}</span></div>
    <div class="sign-in-link">${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${icon("sign")}Open attendance sign-in sheet</a><span class="hint">${esc(hostOf(link))}. Opens outside WPC Hub. Check who signed there, then record attendance below.</span>` : `<span class="hint">No sign-in link yet. ${ctx.role === "Secretary" ? "Paste the DocuSign (or other) attendance link under Edit details." : ""}</span>`}</div>
    ${people.length ? `<div class="table-scroll"><table class="grid compact"><thead><tr><th scope="col">Name</th><th scope="col">Committee role</th><th scope="col">Attendance</th></tr></thead><tbody>${people.map(u => `<tr><td>${person(ctx, u)}</td><td>${u === (m.chairman || ctx.d.roster.chairman) ? "Chairman" : "Member"}</td><td>${edit ? `<select class="inline-select" data-action="attendance.set" data-id="${esc(m.id)}" data-user="${esc(u)}" aria-label="Attendance of ${esc(ctx.name(u))}"><option value="">Not recorded</option>${ATTENDANCE.map(a => `<option ${att[u] === a ? "selected" : ""}>${a}</option>`).join("")}</select>` : att[u] ? badge(att[u], att[u] === "Present" ? "ok" : att[u] === "Absent" ? "bad" : "neutral") : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">No committee people yet. Add the roster under Users and permissions, or signers under Signatures.</p>`}
    ${edit ? `<p class="hint">Attendance is part of the minutes and is frozen with each circulated version.</p>` : ""}
  </section>`;
}

function presenceFor(ctx, key) {
  const who = Object.values(ctx.presence).filter(p => p.editing === key).map(p => ctx.name(p.user));
  return who.length ? `<span class="presence">${icon("live")} ${esc(who.join(", "))} editing now</span>` : "";
}

function agendaTab(ctx, m, agenda) {
  const sec = ctx.role === "Secretary";
  const editAgenda = sec && canEditAgenda(m), editMin = sec && canEditMinutes(m);
  if (m.status === "circulated" || m.status === "archived") return minutesDocument(ctx, m, m.snapshot);
  const candidates = Object.values(ctx.d.items).filter(i => isItemOpen(i) && !i.archived && !m.agenda.includes(i.id));
  return `
  ${editAgenda ? `<div class="toolbar">
      <label class="fb"><span>Add open item</span><select id="add-item" aria-label="Open item to add"><option value="">Select an item…</option>${candidates.map(i => `<option value="${esc(i.id)}">${esc(i.ref)} · ${esc(i.title)}</option>`).join("")}</select></label>
      ${btn("Add", "agenda.add", { data: { id: m.id } })}
      ${candidates.length ? btn(`Bring forward all ${candidates.length} open items`, "agenda.bringAll", { data: { id: m.id } }) : ""}
      ${btn("New item on this agenda", "item.new", { ic: "plus", data: { meeting: m.id } })}
    </div>` : ""}
  ${agenda.length ? agendaWorkspace(ctx, m, agenda, editAgenda, editMin) : `<div class="card"><p class="empty">The agenda is empty.${editAgenda ? " Add open items or create a new one." : ""}</p></div>`}`;
}

/** One item at a time: a numbered rail on the left, the selected item on the right. "All items" keeps the long view. */
function agendaWorkspace(ctx, m, agenda, editAgenda, editMin) {
  const mode = ctx.ui.agendaMode || "one";
  const showMin = m.status !== "preparation" && m.status !== "agenda_issued";
  const mnOf = it => ctx.d.minutes[`${m.id}__${it.id}`] || {};
  const done = agenda.filter(it => mnOf(it).outcome).length;
  ctx.ui.agendaFocus = ctx.ui.agendaFocus || {};
  if (!agenda.some(it => it.id === ctx.ui.agendaFocus[m.id])) ctx.ui.agendaFocus[m.id] = (agenda.find(it => showMin && !mnOf(it).outcome) || agenda[0]).id;
  const idx = agenda.findIndex(it => it.id === ctx.ui.agendaFocus[m.id]);
  const switcher = `<div class="seg" role="group" aria-label="Agenda view">${[["one", "One item at a time"], ["all", "All items"]].map(([k, l]) => `<button type="button" class="seg-b ${mode === k ? "on" : ""}" aria-pressed="${mode === k}" data-action="agenda.mode" data-mode="${k}">${l}</button>`).join("")}</div>`;
  if (mode === "all") return `<div class="agenda-top">${switcher}${showMin ? `<span class="hint">${done} of ${agenda.length} items have an outcome</span>` : ""}</div>${agenda.map((it, i) => minuteBlock(ctx, m, it, i + 1, editAgenda, editMin)).join("")}`;
  const it = agenda[idx];
  const rail = `<nav class="agenda-rail" aria-label="Agenda items">
    <div class="rail-h"><b>Agenda</b>${showMin ? `<span class="rail-prog" aria-label="${done} of ${agenda.length} decided"><span style="width:${Math.round(100 * done / agenda.length)}%"></span></span><span class="hint">${done}/${agenda.length} decided</span>` : `<span class="hint">${agenda.length} items</span>`}</div>
    <ol>${agenda.map((x, i) => { const o = mnOf(x).outcome; return `<li><button type="button" class="rail-item ${i === idx ? "on" : ""}" ${i === idx ? 'aria-current="true"' : ""} data-action="agenda.focus" data-id="${esc(m.id)}" data-item="${esc(x.id)}">
      <span class="rail-n ${o ? "done" : ""}">${o ? icon("actions") : i + 1}</span>
      <span class="rail-t"><span class="ref">${esc(x.ref)}</span><span class="rail-title">${esc(x.title)}</span>${showMin ? `<span class="rail-o">${o ? esc(o) : "Outcome to record"}</span>` : `<span class="rail-o">${esc(x.dept)}</span>`}</span>
    </button></li>`; }).join("")}</ol></nav>`;
  const pager = `<div class="item-pager">
    ${btn("Previous item", "agenda.step", { ic: "back", data: { id: m.id, dir: -1 }, disabled: idx === 0 })}
    <span class="hint">Item ${idx + 1} of ${agenda.length}</span>
    ${btn(idx === agenda.length - 1 ? "Last item" : "Next item", "agenda.step", { kind: idx === agenda.length - 1 ? "secondary" : "primary", data: { id: m.id, dir: 1 }, disabled: idx === agenda.length - 1 })}
  </div>`;
  return `<div class="agenda-top">${switcher}<span class="hint">Use the list to move between items. Everything you type is saved when you leave a field.</span></div>
  <div class="agenda-ws">${rail}<div class="agenda-focus">${minuteBlock(ctx, m, it, idx + 1, editAgenda, editMin)}${pager}</div></div>`;
}

function minuteBlock(ctx, m, it, n, editAgenda, editMin) {
  const key = `${m.id}__${it.id}`;
  const mn = ctx.d.minutes[key] || {};
  const acts = actionsArr(ctx).filter(a => a.itemId === it.id && a.meetingId === m.id);
  const showMin = m.status !== "preparation" && m.status !== "agenda_issued";
  const focused = (ctx.ui.agendaMode || "one") === "one";
  const ta = (f, label, ph) => editMin
    ? `<div class="field"><label for="min-${key}-${f}">${label}</label><textarea id="min-${key}-${f}" data-minute="${esc(key)}" data-field="${f}" data-rev="${mn.rev || 0}" placeholder="${esc(ph)}" rows="3">${esc(mn[f] || "")}</textarea></div>`
    : `<div><span class="lbl">${label}</span><p class="pre">${esc(mn[f] || "—")}</p></div>`;
  const step = (k, title, body, done) => `<section class="rec-step ${done ? "done" : ""}"><div class="rec-n" aria-hidden="true">${done ? icon("actions") : k}</div><div class="rec-b"><h4>${title}</h4>${body}</div></section>`;
  return `<article class="card minute" aria-labelledby="mi-${esc(key)}">
    <div class="minute-h"><div><span class="num-badge">${n}</span> ${refLink(it)} <h3 id="mi-${esc(key)}">${esc(it.title)}</h3></div>
      <div class="minute-tools">${presenceFor(ctx, key)}${badge(stageOf(ctx, it))}${btn("Request sheet (PDF)", "pdf.item", { kind: "ghost", ic: "download", data: { id: it.id } })}${editAgenda ? btn("Remove", "agenda.remove", { kind: "ghost", data: { id: m.id, item: it.id } }) : ""}</div></div>
    <details class="dossier" ${focused || !showMin ? "open" : ""}><summary><span>Request file</span><span class="hint">Everything the committee needs to decide this item</span></summary>${itemDossier(ctx, m, it)}</details>
    ${showMin ? `<div class="record"><div class="record-h"><h4>Record the decision</h4><span class="hint">Work down the steps. Each field saves when you leave it.</span></div>
      ${step(1, "Discussion", `<div class="minute-grid one">${ta("discussion", "Summary of the discussion", "Key points raised, questions to the department, answers given")}</div>`, !!mn.discussion?.trim())}
      ${step(2, "Outcome", `<div class="outcome-row">${editMin
        ? `<div class="field"><label for="out-${key}">Outcome<span class="req" aria-hidden="true">*</span></label><select id="out-${key}" data-action="minute.outcome" data-minute="${esc(key)}"><option value="">Choose…</option>${Object.keys(OUTCOMES).map(o => `<option ${mn.outcome === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>
           <div class="field"><label for="hc-${key}">Positions approved</label><input id="hc-${key}" type="number" min="0" step="1" data-action="minute.hc" data-minute="${esc(key)}" value="${esc(mn.hcApproved ?? "")}" placeholder="${esc(it.hcRequested ?? "")}"></div>`
        : `<div><span class="lbl">Outcome</span><p>${mn.outcome ? badge(mn.outcome, outcomeTone(mn.outcome)) : "—"}${mn.hcApproved != null && mn.hcApproved !== "" ? ` <span class="hint">${esc(mn.hcApproved)} positions approved</span>` : ""}</p></div>`}</div>`, !!mn.outcome)}
      ${step(3, "Decision wording", `<div class="minute-grid one">${ta("decision", "Decision as it will appear in the minutes", "e.g. Approved: renew the contract for 2 years from 1 Jan 2027")}</div>`, !!mn.decision?.trim())}
      ${step(4, "Follow-up actions", `
      ${acts.length ? `<table class="grid compact"><thead><tr><th scope="col">Action</th><th scope="col">Responsible</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead><tbody>${acts.map(a => `<tr class="${isOverdue(a, ctx.today) ? "row-bad" : ""}"><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td class="num">${fmtDate(a.due)}</td><td>${ctx.role === "Secretary" ? actionStatusSelect(a) : actionBadge(a, ctx.today)}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">No actions yet.</p>`}
      ${editMin ? `<form class="inline-form" data-form="action.create" data-meeting="${esc(m.id)}" data-item="${esc(it.id)}" novalidate>
        <input name="text" placeholder="Action" aria-label="Action" required><input name="owner" placeholder="Responsible" aria-label="Responsible" required><input name="due" type="date" aria-label="Due date" required>${btn("Add action", null, { type: "submit" })}<div class="err" data-err></div></form>` : ""}
`, acts.length > 0)}
      ${mn.updatedBy ? `<div class="hint">Last saved by ${esc(ctx.name(mn.updatedBy))} at ${fmtDateTime(mn.updatedAt)} · revision ${mn.rev || 1}</div>` : ""}
    </div>` : ""}
  </article>`;
}

/** The full request file shown in the meeting: facts, request text, documents, history and open follow-up. */
function itemDossier(ctx, m, it) {
  const prior = meetingsOf(ctx, it).filter(x => x.id !== m.id && (x.date || "") < (m.date || "")).reverse();
  const docs = (it.attachments || []).filter(a => (a.kind || "request") === "request");
  const openActs = actionsArr(ctx).filter(a => a.itemId === it.id && a.meetingId !== m.id && isActionOpen(a));
  const f = (l, v) => `<div><dt>${l}</dt><dd>${v || "—"}</dd></div>`;
  return `<div class="dossier-b">
    <dl class="dossier-facts">
      ${f("Department", esc(it.dept))}${f("Category", `${esc(it.category)}${it.sub ? `<div class="hint">${esc(it.sub)}</div>` : ""}`)}${f("Responsible", esc(it.owner))}
      ${f("Positions requested", it.hcRequested != null && it.hcRequested !== "" ? `<b class="big">${esc(it.hcRequested)}</b>` : "")}${f("Grade", esc(it.grade))}${f("Budget", esc(it.budgeted))}
      ${f("Annual cost", it.annualCost != null && it.annualCost !== "" ? esc(fmtOMR(it.annualCost)) : "")}${f("Effective date", it.effectiveDate ? fmtDate(it.effectiveDate) : "")}${f("Submitted", `${fmtDate(it.createdAt)}${it.requestKey ? '<div class="hint">via department request</div>' : ""}`)}
    </dl>
    <div class="dossier-sec"><span class="lbl">Request and justification</span><p class="pre dossier-text">${esc(it.request || "—")}</p></div>
    <div class="dossier-cols">
      <div class="dossier-sec"><span class="lbl">Supporting documents (${docs.length})</span>${docs.length ? `<ul class="docs">${docs.map(a => `<li>${icon("items")}<a href="${esc(fileUrl(a.id))}" target="_blank" rel="noopener">${esc(a.name)}</a><span class="hint">${esc(fmtSize(a.size || 0))} · added ${fmtDate(a.at)}</span></li>`).join("")}</ul>` : `<p class="empty">None attached. The department can email slides to the secretaries, who attach them as PDF.</p>`}</div>
      <div class="dossier-sec"><span class="lbl">Earlier committee decisions (${prior.length})</span>${prior.length ? `<ul class="history">${prior.map(p => { const pm = ctx.d.minutes[`${p.id}__${it.id}`] || {}; return `<li><div><b>${fmtDate(p.date)}</b> <span class="hint">${esc(p.ref)}</span> ${pm.outcome ? badge(pm.outcome, outcomeTone(pm.outcome)) : ""}</div><p>${esc(pm.decision || "No decision recorded")}</p></li>`; }).join("")}</ul>` : `<p class="empty">First time at the committee.</p>`}</div>
    </div>
    ${openActs.length ? `<div class="dossier-sec"><span class="lbl">Open follow-up from earlier meetings (${openActs.length})</span><ul class="history">${openActs.map(a => `<li><div>${actionBadge(a, ctx.today)} <b>${esc(a.text)}</b></div><p class="hint">${esc(a.owner)} · due ${fmtDate(a.due)}</p></li>`).join("")}</ul></div>` : ""}
  </div>`;
}

export function minutesDocument(ctx, m, snap) {
  if (!snap) return `<p class="empty">No circulated version yet.</p>`;
  const s = signatureState(m, ctx.d.sigs);
  return `<article class="minutes-doc" aria-label="Minutes version ${snap.v}">
    <header><div><div class="lbl">Workforce Planning Committee · Minutes of meeting</div><h2>${esc(m.title)}</h2></div>
      <dl><div><dt>Reference</dt><dd>${esc(m.ref)}</dd></div><div><dt>Date</dt><dd>${fmtDate(m.date)}${snap.time ? ` ${esc(snap.time)}` : ""}</dd></div><div><dt>Version</dt><dd>v${snap.v}${m.version !== snap.v ? " (superseded)" : ""}</dd></div><div><dt>Circulated</dt><dd>${fmtDateTime(snap.at)}</dd></div></dl></header>
    ${snap.location || Object.keys(snap.attendance || {}).length ? `<div class="doc-att">${snap.location ? `<div><span class="lbl">Location</span> ${esc(snap.location)}</div>` : ""}${ATTENDANCE.map(a => { const who = Object.entries(snap.attendance || {}).filter(([, s]) => s === a).map(([u]) => ctx.name(u)); return who.length ? `<div><span class="lbl">${a === "Apology" ? "Apologies" : a}</span> ${esc(who.join(", "))}</div>` : ""; }).join("")}</div>` : ""}
    <table class="grid doc-table"><thead><tr><th scope="col" style="width:36px">#</th><th scope="col">Item and request</th><th scope="col">Discussion</th><th scope="col">Outcome and decision</th><th scope="col">Actions</th></tr></thead><tbody>
    ${snap.items.map((x, i) => `<tr><td>${i + 1}</td><td><span class="ref">${esc(x.ref)}</span><div><b>${esc(x.title)}</b></div><div class="hint">${esc(x.category)} · ${esc(x.dept)}</div><p class="pre">${esc(x.request)}</p>${factsLine(x)}</td><td class="pre">${esc(x.discussion || "—")}</td><td>${x.outcome ? badge(x.outcome, outcomeTone(x.outcome)) : ""}${x.hcApproved != null && x.hcApproved !== "" ? `<div class="hint">${esc(x.hcApproved)} positions approved</div>` : ""}<p class="pre"><b>${esc(x.decision || (x.outcome ? "" : "—"))}</b></p></td><td>${x.actions.length ? x.actions.map(a => `<div>${esc(a.text)}<div class="hint">${esc(a.owner)} · ${fmtDate(a.due)}</div></div>`).join("") : "—"}</td></tr>`).join("")}
    </tbody></table>
    <footer><span class="lbl">Signatures on v${m.version}</span>
      <table class="grid compact"><thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Date and time</th></tr></thead><tbody>
      ${s.rows.map(r => `<tr><td>${esc(ctx.name(r.user))}</td><td>Member</td><td>${r.sig ? badge(r.sig.status === "signed" ? "Signed" : "Correction requested") : badge("Pending")}</td><td>${r.sig ? fmtDateTime(r.sig.at) : "—"}</td></tr>`).join("")}
      ${m.chairman ? (() => { const c = sigFor(m, m.chairman, ctx.d.sigs, "chairman"); return `<tr><td>${esc(ctx.name(m.chairman))}</td><td>Chairman</td><td>${c ? badge(c.status === "approved" ? "Approved" : "Correction requested") : badge("Pending")}</td><td>${c ? fmtDateTime(c.at) : "—"}</td></tr>`; })() : ""}
      </tbody></table>
      <p class="hint">Electronic sign-off recorded in WPC Hub against the signer's claude.ai account. Not a qualified electronic signature.</p></footer>
  </article>`;
}

function signaturesTab(ctx, m, s) {
  const sec = ctx.role === "Secretary" && !["circulated", "archived"].includes(m.status);
  return `<div class="cols-2"><section class="card"><div class="card-h"><h2>Members who sign</h2></div>
    ${m.members.length ? `<table class="grid compact"><thead><tr><th scope="col">Member</th><th scope="col">Status on v${m.version || "—"}</th><th scope="col">Date</th>${sec ? "<th></th>" : ""}</tr></thead><tbody>${s.rows.map(r => `<tr><td>${person(ctx, r.user)}</td><td>${m.status === "circulated" || m.status === "archived" ? (r.sig ? badge(r.sig.status === "signed" ? "Signed" : "Correction requested") : badge("Pending")) : badge("Not circulated", "neutral")}</td><td>${r.sig ? fmtDateTime(r.sig.at) : "—"}</td>${sec ? `<td>${btn("Remove", "member.remove", { kind: "ghost", data: { id: m.id, user: r.user } })}</td>` : ""}</tr>`).join("")}</tbody></table>` : `<p class="empty">No members added.</p>`}
    ${sec ? `<div class="picker"><label for="member-q">Add member</label><input id="member-q" data-action="member.search" data-id="${esc(m.id)}" autocomplete="off" placeholder="Type a name"><div class="menu" id="member-menu" hidden></div></div>` : ""}
  </section>
  <section class="card"><div class="card-h"><h2>Chairman</h2></div>
    ${m.chairman ? `<p>${person(ctx, m.chairman)} ${(() => { const c = sigFor(m, m.chairman, ctx.d.sigs, "chairman"); return c ? badge(c.status === "approved" ? "Approved" : "Correction requested") : m.status === "circulated" ? badge("Pending") : ""; })()}</p>` : `<p class="empty">No Chairman set. Set one in Edit details.</p>`}
    <h3>Reminders</h3>
    <p class="hint">WPC Hub shows a banner to each member who still has to sign. It does not send email. To remind people by email, copy this text into Outlook.</p>
    <textarea id="reminder-text" readonly rows="4">Dear members, the minutes of ${esc(m.title)} (${fmtDate(m.date)}), version ${m.version || 1}, are ready for your review. Please open WPC Hub, read the minutes and sign them, or request a correction.${s.pending ? ` Pending: ${s.rows.filter(r => !r.sig || r.sig.status !== "signed").map(r => ctx.name(r.user)).join(", ")}.` : ""}</textarea>
    ${btn("Copy reminder text", "copy", { data: { target: "reminder-text" } })}
  </section></div>`;
}

function versionsTab(ctx, m) {
  if (!m.versions.length) return `<div class="card"><p class="empty">No version has been circulated yet.</p></div>`;
  const hist = m.snapshots || {};
  return `<div class="card"><table class="grid compact"><thead><tr><th scope="col">Version</th><th scope="col">Circulated</th><th scope="col">By</th><th scope="col">Changes from previous</th></tr></thead><tbody>
  ${m.versions.slice().reverse().map(v => { const snap = hist[v.v] || (v.v === m.version ? m.snapshot : null); const prev = hist[v.v - 1];
    const diff = snap && prev ? diffSnapshots(prev, snap) : [];
    return `<tr><td>v${v.v}${v.v === m.version ? " (current)" : ""}</td><td>${fmtDateTime(v.at)}</td><td>${esc(ctx.name(v.by))}</td><td>${v.v === 1 ? "First issue" : diff.length ? diff.map(d => `<div><span class="ref">${esc(d.ref)}</span> ${esc(d.field)} ${d.change ? esc(d.change) : "changed"}</div>`).join("") : "No content changes recorded"}</td></tr>`; }).join("")}
  </tbody></table></div>`;
}

function meetingLog(ctx, m) {
  const ids = new Set([m.id, ...m.agenda]);
  const ev = Object.values(ctx.d.audit).filter(e => e.entityId === m.id || (e.meetingId === m.id) || (e.entity === "minutes" && e.entityId.startsWith(m.id + "__"))).sort((a, b) => b.at.localeCompare(a.at));
  const sigEv = [];
  for (const [uid, doc] of Object.entries(ctx.d.sigs)) for (const h of [...(doc[m.id]?.history || []), ...(doc[m.id + ":chair"]?.history || [])]) sigEv.push({ at: h.at, by: uid, action: h.status === "signed" ? `Signed v${h.v}` : h.status === "approved" ? `Approved v${h.v}` : `Requested correction on v${h.v}`, detail: h.comment });
  const all = [...ev, ...sigEv].sort((a, b) => b.at.localeCompare(a.at));
  void ids;
  return `<div class="card">${all.length ? `<ul class="log">${all.map(e => `<li><span class="hint">${fmtDateTime(e.at)}</span> ${esc(ctx.name(e.by))}: ${esc(e.action)}${e.detail ? ` <span class="hint">(${esc(e.detail)})</span>` : ""}</li>`).join("")}</ul>` : `<p class="empty">No events yet.</p>`}</div>`;
}

export function meetingForm(ctx, m, { errors = {}, values = null } = {}) {
  const roster = ctx.d.roster;
  const v = values || m || { title: `WPC Meeting ${Object.keys(ctx.d.meetings).length + 1}`, date: ctx.today };
  const openCount = Object.values(ctx.d.items).filter(i => isItemOpen(i) && !i.archived).length;
  const memberOpts = [["", "No Chairman"], ...[...new Set([...(roster.members || []), roster.chairman, m?.chairman].filter(Boolean))].map(u => [u, ctx.name(u)])];
  return `${panelHead(m ? `Edit ${m.title}` : "New meeting")}
  <div class="panel-body"><form class="form" data-form="${m ? "meeting.update" : "meeting.create"}" data-id="${esc(m?.id || "")}" data-rev="${esc(m?.rev ?? 0)}" novalidate>
    ${errors.form ? msg("error", esc(errors.form)) : ""}
    ${field({ id: "title", label: "Meeting title", value: v.title, required: true, wide: true, error: errors.title, attrs: "autofocus" })}
    ${field({ id: "date", label: "Meeting date", type: "date", value: v.date, required: true, error: errors.date })}
    ${field({ id: "time", label: "Start time", type: "time", value: v.time || "" })}
    ${field({ id: "location", label: "Location", value: v.location || "", attrs: 'maxlength="80"', hint: "Room, or Teams" })}
    ${field({ id: "attendanceLink", label: "Attendance sign-in link (DocuSign or other)", type: "url", value: v.attendanceLink || "", wide: true, error: errors.attendanceLink, hint: "Paste the envelope or sign-in sheet link, starting with https://. WPC Hub links to it; it does not read signatures from DocuSign.", attrs: 'maxlength="500" placeholder="https://"' })}
    ${field({ id: "chairman", label: "Chairman (final approval)", value: v.chairman || roster.chairman || "", options: memberOpts, hint: "People come from the committee roster under Administration." })}
    ${!m ? `<label class="chk wide"><input type="checkbox" name="bring" ${openCount ? "checked" : "disabled"}> Bring forward all ${openCount} open items</label>
    <label class="chk wide"><input type="checkbox" name="roster" checked> Add the ${(roster.members || []).length} roster members as signers</label>` : ""}
    <div class="form-actions wide">${btn("Cancel", "layer.close")}${btn(m ? "Save" : "Create meeting", null, { kind: "primary", type: "submit" })}</div>
  </form></div>`;
}

/* ====================================================================== */
/* Action management                                                     */
/* ====================================================================== */
export function actionsView(ctx) {
  const f = ctx.ui.actionFilter;
  const rows = actionsArr(ctx).filter(a => (!f.overdue || isOverdue(a, ctx.today)) && (!f.status || (f.status === "active" ? isActionOpen(a) : a.status === f.status)) && (!f.owner || a.owner === f.owner));
  const owners = [...new Set(actionsArr(ctx).map(a => a.owner).filter(Boolean))].sort();
  const sec = ctx.role === "Secretary";
  return `${pageHeader({ title: "Follow-up actions", sub: "Every action agreed in the minutes, with Responsible and due date." })}
  <section class="filterbar" aria-label="Filters">
    <label class="fb"><span>Status</span><select data-action="filter.actions" data-key="status">${[["active", "Open and in progress"], ["DONE", "Done"], ["CANCELLED", "Cancelled"], ["", "All"]].map(([v, l]) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="fb"><span>Responsible</span><select data-action="filter.actions" data-key="owner"><option value="">Anyone</option>${owners.map(o => `<option ${f.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>
    <label class="fb chk"><input type="checkbox" data-action="filter.actions" data-key="overdue" ${f.overdue ? "checked" : ""}> Overdue only</label>
  </section>
  ${dataTable({ id: "actions", rows, tstate: ctx.ui.tables.actions, caption: "Follow-up actions", empty: "No actions match.",
    rowAttrs: a => isOverdue(a, ctx.today) ? 'class="row-bad"' : "",
    columns: [
      { key: "item", label: "Item", value: a => ctx.d.items[a.itemId]?.ref, render: a => ctx.d.items[a.itemId] ? refLink(ctx.d.items[a.itemId]) : "—", width: "120px" },
      { key: "text", label: "Action" },
      { key: "owner", label: "Responsible" },
      { key: "meeting", label: "Agreed in", value: a => ctx.d.meetings[a.meetingId]?.date, render: a => esc(ctx.d.meetings[a.meetingId]?.title || "—") },
      { key: "due", label: "Due", render: a => fmtDate(a.due) },
      { key: "status", label: "Status", value: a => ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].indexOf(a.status), render: a => sec ? `${actionStatusSelect(a)} ${isOverdue(a, ctx.today) ? badge(`Overdue ${daysBetween(a.due, ctx.today)}d`, "bad") : ""}` : actionBadge(a, ctx.today) },
    ] })}`;
}

/* ====================================================================== */
/* Member review and approval                                            */
/* ====================================================================== */
export function myReviewTasks(ctx) {
  const me = ctx.s.myId; if (!me) return [];
  const out = [];
  for (const m of Object.values(ctx.d.meetings)) {
    if (m.status !== "circulated") continue;
    const s = signatureState(m, ctx.d.sigs);
    if (m.members.includes(me) && !sigFor(m, me, ctx.d.sigs)) out.push({ m, role: "member" });
    if (m.chairman === me && s.allSigned && !s.chairApproved) out.push({ m, role: "chairman" });
  }
  return out;
}
export function reviewView(ctx) {
  const tasks = myReviewTasks(ctx);
  const tracked = meetingsArr(ctx).filter(m => m.status === "circulated" || m.status === "archived");
  return `${pageHeader({ title: "Review and signatures", sub: "Minutes waiting for you, and the signature status of every circulated version." })}
  <section class="card"><div class="card-h"><h2>Waiting for you</h2></div>
    ${tasks.length ? `<table class="grid compact"><thead><tr><th scope="col">Meeting</th><th scope="col">Version</th><th scope="col">Your role</th><th scope="col"></th></tr></thead><tbody>${tasks.map(t => `<tr><td>${esc(t.m.title)}<div class="hint">${fmtDate(t.m.date)}</div></td><td>v${t.m.version}</td><td>${t.role === "chairman" ? "Chairman: final approval" : "Member: sign"}</td><td>${btn("Review", "meeting.open", { kind: "primary", data: { id: t.m.id } })}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Nothing is waiting for your signature.</p>`}
  </section>
  <section class="card"><div class="card-h"><h2>Signature tracking</h2></div>
    ${tracked.length ? `<div class="table-scroll"><table class="grid compact"><thead><tr><th scope="col">Meeting</th><th scope="col">Version</th><th scope="col" class="num">Signed</th><th scope="col">Pending</th><th scope="col">Chairman</th><th scope="col">Status</th></tr></thead><tbody>${tracked.map(m => { const s = signatureState(m, ctx.d.sigs);
      return `<tr><td><a href="#meetings" data-action="meeting.open" data-id="${esc(m.id)}">${esc(m.title)}</a></td><td>v${m.version}</td><td class="num">${s.signed}/${s.total}</td><td>${esc(s.rows.filter(r => !r.sig || r.sig.status !== "signed").map(r => ctx.name(r.user)).join(", ") || "—")}</td><td>${m.chairman ? (s.chairApproved ? badge("Approved") : badge("Pending")) : "Not set"}</td><td>${phaseBadge(ctx, m)}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="empty">No minutes have been circulated yet.</p>`}
  </section>`;
}

/* ====================================================================== */
/* Historical records: audit trail                                       */
/* ====================================================================== */
export function recordsView(ctx) {
  const f = ctx.ui.auditFilter;
  const sigEv = [];
  for (const [uid, doc] of Object.entries(ctx.d.sigs)) for (const [mid, e] of Object.entries(doc)) for (const h of e?.history || []) {
    const m = ctx.d.meetings[mid.split(":")[0]];
    sigEv.push({ at: h.at, by: uid, entity: "signature", ref: m?.ref || mid, action: h.status === "signed" ? `Signed minutes v${h.v}` : h.status === "approved" ? `Chairman approved v${h.v}` : `Requested correction on v${h.v}`, detail: h.comment || "" });
  }
  const all = [...Object.values(ctx.d.audit), ...sigEv].filter(e => (!f.entity || e.entity === f.entity) && (!f.q || `${e.ref} ${e.action} ${e.detail}`.toLowerCase().includes(f.q.toLowerCase())));
  const archivedMeetings = meetingsArr(ctx).filter(m => m.status === "archived");
  return `${pageHeader({ title: "Historical records", sub: "Audit trail of every change and signature, and the archive of final minutes." })}
  <section class="card"><div class="card-h"><h2>Archived minutes</h2></div>
    ${archivedMeetings.length ? `<table class="grid compact"><thead><tr><th scope="col">Reference</th><th scope="col">Meeting</th><th scope="col">Date</th><th scope="col">Final version</th><th scope="col">Archived</th></tr></thead><tbody>${archivedMeetings.map(m => `<tr><td class="ref">${esc(m.ref)}</td><td><a href="#meetings" data-action="meeting.open" data-id="${esc(m.id)}">${esc(m.title)}</a></td><td>${fmtDate(m.date)}</td><td>v${m.version}</td><td>${fmtDateTime(m.archivedAt)}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">No minutes archived yet.</p>`}
  </section>
  <section class="filterbar" aria-label="Audit filters">
    <label class="fb search">${icon("search")}<input type="search" data-action="filter.audit" data-key="q" value="${esc(f.q)}" placeholder="Search reference or event" aria-label="Search audit trail"></label>
    <label class="fb"><span>Record type</span><select data-action="filter.audit" data-key="entity">${[["", "All"], ["item", "Items"], ["meeting", "Meetings"], ["minutes", "Minutes"], ["action", "Actions"], ["signature", "Signatures"], ["roster", "Roster"]].map(([v, l]) => `<option value="${v}" ${f.entity === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
  </section>
  ${dataTable({ id: "audit", rows: all, tstate: ctx.ui.tables.audit, caption: "Audit trail", empty: "No events match.",
    columns: [
      { key: "at", label: "When", render: e => fmtDateTime(e.at), width: "170px" },
      { key: "by", label: "Who", value: e => ctx.name(e.by), render: e => esc(ctx.name(e.by)) },
      { key: "entity", label: "Record type" },
      { key: "ref", label: "Reference", render: e => `<span class="ref">${esc(e.ref || "")}</span>` },
      { key: "action", label: "Event" },
      { key: "detail", label: "Detail", sortable: false, render: e => `<span class="hint">${esc(e.detail || "")}</span>` },
    ] })}`;
}

/* ====================================================================== */
/* User and permission management                                        */
/* ====================================================================== */
export function adminView(ctx) {
  const r = ctx.d.roster;
  const sec = ctx.role === "Secretary";
  return `${pageHeader({ title: "Users and permissions", sub: "Who does what in WPC Hub, and the committee roster used for new meetings.",
      actions: sec ? btn("Export data (JSON)", "data.export", { ic: "download" }) + btn("Export items (CSV)", "data.exportCsv", { ic: "download" }) : "" })}
  <div class="cols-2">
    <section class="card"><div class="card-h"><h2>Committee roster</h2></div>
      <table class="grid compact"><thead><tr><th scope="col">Person</th><th scope="col">Committee role</th>${sec ? "<th></th>" : ""}</tr></thead><tbody>
        ${r.chairman ? `<tr><td>${person(ctx, r.chairman)}</td><td>Chairman</td>${sec ? `<td>${btn("Remove", "roster.remove", { kind: "ghost", data: { user: r.chairman, role: "chairman" } })}</td>` : ""}</tr>` : ""}
        ${(r.members || []).map(u => `<tr><td>${person(ctx, u)}</td><td>Member</td>${sec ? `<td>${btn("Remove", "roster.remove", { kind: "ghost", data: { user: u, role: "member" } })}</td>` : ""}</tr>`).join("") || (r.chairman ? "" : `<tr><td colspan="3" class="empty-cell">No roster yet.</td></tr>`)}
      </tbody></table>
      ${sec ? `<div class="picker"><label for="roster-q">Add person</label><div class="picker-row"><input id="roster-q" data-action="roster.search" autocomplete="off" placeholder="Type a name"><select id="roster-role" aria-label="Committee role"><option value="member">as Member</option><option value="chairman">as Chairman</option></select></div><div class="menu" id="roster-menu" hidden></div></div>` : ""}
      ${sec ? `<form class="inline-form quorum" data-form="roster.quorum" novalidate><label for="quorum">Quorum (people present)</label><input id="quorum" name="quorum" type="number" min="1" step="1" value="${esc(r.quorum ?? "")}" placeholder="Not set">${btn("Save quorum", null, { type: "submit" })}</form><p class="hint">Use the number in the committee's Terms of Reference. WPC Hub does not assume one.</p>` : r.quorum ? `<p>Quorum: <b>${esc(r.quorum)}</b> present.</p>` : ""}
      <p class="hint">Your role here: <b>${esc(ctx.role)}</b>. Secretaries are the people given Editor access through the Share menu.</p>
    </section>
    <section class="card"><div class="card-h"><h2>How access is granted</h2></div>
      <table class="grid compact"><thead><tr><th scope="col">Role</th><th scope="col">Share menu level</th><th scope="col">Enforced by</th></tr></thead><tbody>
        <tr><td>Secretary</td><td>Editor</td><td>Database rule: only Editors write shared records</td></tr>
        <tr><td>Chairman</td><td>Contributor + roster</td><td>Can write only their own signature record</td></tr>
        <tr><td>Member</td><td>Contributor + roster</td><td>Can write only their own signature record</td></tr>
        <tr><td>Requester</td><td>Contributor</td><td>Can write only their own requests</td></tr>
        <tr><td>Viewer</td><td>Viewer</td><td>Read only</td></tr>
      </tbody></table>
    </section>
  </div>
  <section class="card"><div class="card-h"><h2>Permissions matrix</h2></div>
    <div class="table-scroll"><table class="grid compact"><thead><tr><th scope="col">Permission</th>${ROLES.map(x => `<th scope="col" class="c">${x}</th>`).join("")}</tr></thead><tbody>
    ${PERMISSIONS.map(([p, roles]) => `<tr><td>${esc(p)}</td>${ROLES.map(x => `<td class="c">${roles.includes(x) ? `<span class="yes" role="img" aria-label="Allowed">${icon("actions")}</span>` : `<span class="no" role="img" aria-label="Not allowed">–</span>`}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>
  </section>`;
}

/* ====================================================================== */
/* Department requests (intake)                                          */
/* ====================================================================== */
/** Every request across all requesters, with its status derived from items and the intake record. */
export function allRequests(ctx) {
  const out = [];
  const byKey = Object.fromEntries(Object.values(ctx.d.items).filter(i => i.requestKey).map(i => [i.requestKey, i]));
  for (const [uid, doc] of Object.entries(ctx.d.requests || {})) for (const [rid, r] of Object.entries(doc || {})) {
    if (!r || typeof r !== "object" || !r.title) continue;
    const key = `${uid}:${rid}`;
    const item = byKey[key];
    const intake = ctx.d.intake?.[`${uid}__${rid}`];
    const status = item ? "Accepted" : r.status === "withdrawn" ? "Withdrawn" : intake?.status === "returned" && (intake.at || "") >= (r.updatedAt || "") ? "Returned" : "New";
    out.push({ ...r, uid, rid, key, item, intake, status });
  }
  return out.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
}
export const pendingRequests = ctx => allRequests(ctx).filter(r => r.status === "New");
const reqTone = s => ({ Accepted: "ok", Returned: "warn", Withdrawn: "neutral", New: "info" }[s]);

export function requestsView(ctx) {
  const sec = ctx.role === "Secretary";
  const all = allRequests(ctx);
  const mine = all.filter(r => r.uid === ctx.s.myId);
  const rows = sec ? all : mine;
  const canSubmit = !!ctx.s.myId && ctx.role !== "Viewer";
  return `${pageHeader({ title: sec ? "Department requests" : "Submit a request", sub: sec ? "Requests sent by departments. Accept one to give it a WPC reference and put it on an agenda, or return it for clarification." : "Send a manpower or organisation request to the committee secretaries. You can follow its status here.",
      actions: canSubmit ? btn("New request", "request.new", { kind: "primary", ic: "plus" }) : "" })}
  ${!canSubmit ? msg("info", "To submit requests you need Contributor access to WPC Hub. Ask a committee secretary to share it with you.") : ""}
  ${dataTable({ id: "requests", rows, tstate: ctx.ui.tables.requests, caption: "Requests", empty: sec ? "No requests yet." : "You have not submitted any requests.",
    columns: [
      { key: "submittedAt", label: "Submitted", render: r => fmtDate(r.submittedAt), width: "120px" },
      ...(sec ? [{ key: "by", label: "From", value: r => ctx.name(r.uid), render: r => esc(ctx.name(r.uid)) }] : []),
      { key: "title", label: "Request", render: r => `<b>${esc(r.title)}</b><div class="hint">${esc(r.category)} · ${esc(r.sub || "")} · ${esc(r.dept)}</div>${factsLine(r)}` },
      { key: "status", label: "Status", render: r => `${badge(r.status, reqTone(r.status))}${r.item ? ` <a href="#items" class="ref" data-action="item.open" data-id="${esc(r.item.id)}">${esc(r.item.ref)}</a>` : ""}${r.status === "Returned" && r.intake?.reason ? `<div class="hint">${esc(r.intake.reason)}</div>` : ""}` },
      { key: "do", label: "", sortable: false, render: r => sec
        ? (r.status === "New" ? btn("Accept", "request.accept", { kind: "primary", data: { key: r.key } }) + btn("Return", "request.return", { data: { key: r.key } }) : "")
        : (r.status === "New" ? btn("Withdraw", "request.withdraw", { kind: "ghost", data: { rid: r.rid } }) : r.status === "Returned" ? btn("Edit and resend", "request.edit", { data: { rid: r.rid } }) : "") },
    ] })}`;
}

export function requestForm(ctx, r = null, { errors = {}, values = null } = {}) {
  const v = values || r || { category: "Manpower requirement", sub: "New position (budgeted)", dept: "Operations", owner: "", title: "", request: "", budgeted: "" };
  const subs = CATEGORIES[v.category] || CATEGORIES.Other;
  return `${panelHead(r ? "Edit and resend request" : "New request to the committee", "The secretaries review it before it goes on an agenda.")}
  <div class="panel-body"><form class="form" data-form="request.submit" data-rid="${esc(r?.rid || "")}" novalidate>
    ${field({ id: "title", label: "Request title", value: v.title, required: true, wide: true, error: errors.title, attrs: 'maxlength="150" autofocus' })}
    ${field({ id: "category", label: "Category", value: v.category, options: Object.keys(CATEGORIES), required: true, error: errors.category, attrs: 'data-action="form.category"' })}
    ${field({ id: "sub", label: "Subcategory", value: v.sub, options: subs, required: true, error: errors.sub })}
    ${field({ id: "dept", label: "Requesting department", value: v.dept, options: DEPARTMENTS, required: true, error: errors.dept })}
    ${field({ id: "owner", label: "Responsible", value: v.owner, required: true, error: errors.owner, hint: "Who answers questions on this request" })}
    ${field({ id: "request", label: "Request and justification", type: "textarea", value: v.request, required: true, wide: true, rows: 5, error: errors.request, hint: "What you ask the committee to decide, and why" })}
    ${manpowerFields(v, errors)}
    <p class="hint wide">Supporting slides or documents: email them to the secretaries; they attach them to the item when they accept it.</p>
    <div class="form-actions wide">${btn("Cancel", "layer.close")}${btn(r ? "Resend request" : "Submit request", null, { kind: "primary", type: "submit" })}</div>
  </form></div>`;
}
