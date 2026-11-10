/**
 * WPC Hub — views. Each view is a pure function (ctx) => HTML string.
 * ctx is built in app.js: { d: data, s: session, ui, role, today, name(uid), ... }
 */
import {
  CATEGORIES, DEPARTMENTS, MEETING_STATES, ITEM_STAGES, ACTION_LABELS, PERMISSIONS, ROLES,
  meetingPhase, signatureState, sigFor, awaitingSignature, itemStage, isItemOpen, isActionOpen, isOverdue,
  canEditAgenda, canEditMinutes, daysBetween, diffSnapshots,
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
  const stageCounts = ITEM_STAGES.map(s => [s, items.filter(i => stageOf(ctx, i) === s).length]);
  const maxStage = Math.max(1, ...stageCounts.map(x => x[1]));
  const depts = DEPARTMENTS.map(d => [d, open.filter(i => i.dept === d).length, closed.filter(i => i.dept === d).length]).filter(r => r[1] + r[2]);
  const kpi = (label, val, note, filter, tone = "") => `<button class="kpi ${tone}" data-action="nav.items" data-filter="${esc(JSON.stringify(filter))}"><span class="kpi-l">${esc(label)}</span><span class="kpi-v">${val}</span><span class="kpi-n">${esc(note)}</span></button>`;
  return `${pageHeader({ title: "Committee overview", sub: `Live figures as of ${fmtDate(ctx.today)}. Each agenda item is counted once, however many meetings it went to.`,
      actions: ctx.role === "Secretary" ? btn("New agenda item", "item.new", { ic: "plus" }) + btn("New meeting", "meeting.new", { kind: "primary", ic: "plus" }) : "" })}
  ${myTasks.length ? msg("info", `<b>${myTasks.length} set${myTasks.length > 1 ? "s" : ""} of minutes need${myTasks.length > 1 ? "" : "s"} your ${myTasks.some(t => t.role === "chairman") ? "approval or " : ""}signature.</b>`, btn("Open review queue", "nav.go", { kind: "primary", data: { to: "review" } })) : ""}
  <section class="kpi-strip" aria-label="Key figures">
    ${kpi("Open items", open.length, "Awaiting decision or follow-up", { status: "open" })}
    ${kpi("Closed items", closed.length, "Follow-up complete, evidence recorded", { status: "CLOSED" })}
    <button class="kpi ${overdue.length ? "bad" : ""}" data-action="nav.actions" data-filter='{"overdue":true}'><span class="kpi-l">Overdue actions</span><span class="kpi-v">${overdue.length}</span><span class="kpi-n">Past due date, not done</span></button>
    ${kpi("Pending signatures", pendSigs, `Across ${review.length} set${review.length === 1 ? "" : "s"} of minutes under review`, { status: "", pending: true }, pendSigs ? "warn" : "")}
  </section>
  <div class="cols-2">
    <section class="card"><div class="card-h"><h2>Items by category</h2><span class="hint">Select a count to see the items</span></div>
      <table class="grid compact"><thead><tr><th scope="col">Category</th><th scope="col" class="num">Open</th><th scope="col" class="num">Closed</th><th scope="col" class="num">Total</th></tr></thead><tbody>
      ${Object.keys(CATEGORIES).map(c => { const o = open.filter(i => i.category === c).length, cl = closed.filter(i => i.category === c).length;
        const link = (n, f) => n ? `<button class="count-link" data-action="nav.items" data-filter="${esc(JSON.stringify(f))}" aria-label="${n} ${esc(c)} items">${n}</button>` : `<span class="zero">0</span>`;
        return `<tr><td>${esc(c)}</td><td class="num">${link(o, { cat: c, status: "open" })}</td><td class="num">${link(cl, { cat: c, status: "CLOSED" })}</td><td class="num">${o + cl}</td></tr>`; }).join("")}
      </tbody><tfoot><tr><th scope="row">Total</th><td class="num">${open.length}</td><td class="num">${closed.length}</td><td class="num">${open.length + closed.length}</td></tr></tfoot></table>
    </section>
    <section class="card"><div class="card-h"><h2>Items by stage</h2><span class="hint">Select a stage to see its items</span></div>
      <div class="bars">${stageCounts.map(([s, n]) => `<button class="bar-row" data-action="nav.items" data-filter="${esc(JSON.stringify({ stage: s, status: "" }))}" ${n ? "" : "disabled"}><span class="bar-l">${esc(s)}</span><span class="bar-t"><span class="bar-f" style="width:${(n / maxStage) * 100}%"></span></span><span class="bar-n">${n}</span></button>`).join("")}</div>
    </section>
  </div>
  <div class="cols-2">
    <section class="card"><div class="card-h"><h2>Minutes under review</h2></div>
      ${review.length ? `<table class="grid compact"><thead><tr><th scope="col">Meeting</th><th scope="col">Version</th><th scope="col" class="num">Signed</th><th scope="col">Status</th></tr></thead><tbody>${review.map(m => { const s = signatureState(m, ctx.d.sigs);
        return `<tr><td><a href="#meetings" data-action="meeting.open" data-id="${esc(m.id)}">${esc(m.title)}</a><div class="hint">${fmtDate(m.date)}</div></td><td>v${m.version}</td><td class="num">${s.signed}/${s.total}</td><td>${phaseBadge(ctx, m)}</td></tr>`; }).join("")}</tbody></table>` : `<p class="empty">No minutes are waiting for signatures.</p>`}
    </section>
    <section class="card"><div class="card-h"><h2>Open items by department</h2></div>
      ${depts.length ? `<table class="grid compact"><thead><tr><th scope="col">Department</th><th scope="col" class="num">Open</th><th scope="col" class="num">Closed</th></tr></thead><tbody>${depts.map(([d, o, c]) => `<tr><td>${esc(d)}</td><td class="num">${o ? `<button class="count-link" data-action="nav.items" data-filter="${esc(JSON.stringify({ dept: d, status: "open" }))}">${o}</button>` : 0}</td><td class="num">${c}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">No items yet.</p>`}
    </section>
  </div>
  <section class="card"><div class="card-h"><h2>Overdue follow-up actions</h2>${overdue.length ? btn("View all actions", "nav.go", { kind: "ghost", data: { to: "actions" } }) : ""}</div>
    ${overdue.length ? `<table class="grid compact"><thead><tr><th scope="col">Item</th><th scope="col">Action</th><th scope="col">Responsible</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead><tbody>${overdue.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8).map(a => { const it = ctx.d.items[a.itemId];
      return `<tr class="row-bad"><td>${it ? refLink(it) : "—"}</td><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td class="num">${fmtDate(a.due)}</td><td>${actionBadge(a, ctx.today)}</td></tr>`; }).join("")}</tbody></table>` : `<p class="empty">No overdue actions.</p>`}
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
  return `${panelHead(it.title, `<span class="ref">${esc(it.ref)}</span> · ${esc(it.category)} · ${esc(it.sub || "")}`)}
  <div class="panel-body">
    <div class="obj-status">${badge(stage)}${it.archived ? badge("Archived", "neutral") : ""}
      ${sec && !it.archived ? `<span class="spacer"></span>${btn("Edit", "item.edit", { ic: "edit", data: { id: it.id } })}${isItemOpen(it) ? btn("Withdraw", "item.withdraw", { data: { id: it.id } }) : btn("Reopen", "item.reopen", { data: { id: it.id } })}${!isItemOpen(it) ? btn("Archive", "item.archive", { ic: "archive", data: { id: it.id } }) : ""}` : ""}
      ${sec && it.archived ? `<span class="spacer"></span>${btn("Restore from archive", "item.unarchive", { data: { id: it.id } })}` : ""}
    </div>
    <dl class="facts">
      <div><dt>Requesting department</dt><dd>${esc(it.dept)}</dd></div>
      <div><dt>Responsible</dt><dd>${esc(it.owner || "—")}</dd></div>
      <div><dt>Submitted</dt><dd>${fmtDate(it.createdAt)}</dd></div>
      <div><dt>Last changed</dt><dd>${it.updatedAt ? `${fmtDateTime(it.updatedAt)} by ${esc(ctx.name(it.updatedBy))}` : "—"}</dd></div>
      <div class="wide"><dt>Request</dt><dd class="pre">${esc(it.request || "—")}</dd></div>
    </dl>
    <section class="sec"><h3>History across meetings</h3>
      ${ms.length ? `<ol class="timeline">${ms.map(m => { const mn = ctx.d.minutes[`${m.id}__${it.id}`] || {};
        return `<li><div class="tl-h"><a href="#meetings" data-action="meeting.open" data-id="${esc(m.id)}">${esc(m.title)}</a><span class="hint">${fmtDate(m.date)}</span>${phaseBadge(ctx, m)}</div>
          <div class="tl-b"><div><span class="lbl">Discussion</span><p class="pre">${esc(mn.discussion || "—")}</p></div><div><span class="lbl">Recommendation / decision</span><p class="pre">${esc(mn.decision || "—")}</p></div></div></li>`; }).join("")}</ol>` : `<p class="empty">Not yet on a meeting agenda.</p>`}
    </section>
    <section class="sec"><h3>Follow-up actions</h3>
      ${acts.length ? `<table class="grid compact"><thead><tr><th scope="col">Action</th><th scope="col">Responsible</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead><tbody>${acts.map(a => `<tr class="${isOverdue(a, ctx.today) ? "row-bad" : ""}"><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td class="num">${fmtDate(a.due)}</td><td>${sec ? actionStatusSelect(a) : actionBadge(a, ctx.today)}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">No actions recorded.</p>`}
    </section>
    <section class="sec"><h3>Closure</h3>
      ${it.status === "CLOSED" ? `<dl class="facts"><div><dt>Closed on</dt><dd>${fmtDate(it.closedDate)}</dd></div><div><dt>Closed by</dt><dd>${esc(ctx.name(it.closedBy))}</dd></div><div class="wide"><dt>Supporting evidence</dt><dd class="pre">${esc(it.evidence || "—")}</dd></div></dl>`
        : it.status === "WITHDRAWN" ? `<p>Withdrawn on ${fmtDate(it.closedDate)}. Reason: ${esc(it.evidence || "—")}</p>`
        : sec ? `<p class="hint">Signed minutes do not close an item. Close it when the follow-up is complete.</p>
          <form class="form" data-form="item.close" data-id="${esc(it.id)}" novalidate>
            ${field({ id: "closedDate", label: "Closure date", type: "date", value: ctx.today, required: true, attrs: `max="${ctx.today}"` })}
            ${field({ id: "evidence", label: "Supporting evidence", type: "textarea", required: true, wide: true, rows: 2, hint: "e.g. renewal letter reference, SuccessFactors record updated, org chart published" })}
            <div class="form-actions wide">${btn("Close item", null, { kind: "primary", type: "submit" })}</div></form>` : `<p class="empty">Open.</p>`}
    </section>
    <section class="sec"><h3>Change log</h3>
      ${audit.length ? `<ul class="log">${audit.map(e => `<li><span class="hint">${fmtDateTime(e.at)}</span> ${esc(ctx.name(e.by))}: ${esc(e.action)}${e.detail ? ` <span class="hint">(${esc(e.detail)})</span>` : ""}</li>`).join("")}</ul>` : `<p class="empty">No changes logged yet.</p>`}
    </section>
  </div>`;
}
const actionStatusSelect = a => `<select class="inline-select" data-action="action.status" data-id="${esc(a.id)}" aria-label="Status of ${esc(a.text)}">${Object.entries(ACTION_LABELS).map(([k, l]) => `<option value="${k}" ${a.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;

export function itemForm(ctx, it, { meetingId = "", errors = {}, values = null, dupes = [] } = {}) {
  const v = values || it || { category: "Expatriate contract renewal", sub: "Renewal on same terms", dept: "Potline", owner: "", title: "", request: "" };
  const subs = CATEGORIES[v.category] || CATEGORIES.Other;
  return `${panelHead(it ? `Edit ${it.ref}` : "New agenda item", it ? "Changes are logged with your name and time." : "A unique reference is assigned when you save.")}
  <div class="panel-body">
    ${dupes.length ? msg("warn", `<b>Possible duplicate.</b> ${dupes.length === 1 ? "This open item looks similar" : "These open items look similar"}: ${dupes.map(x => `<span class="ref">${esc(x.item.ref)}</span> ${esc(x.item.title)}`).join("; ")}. Open the existing item instead, or save again to create a separate item.`) : ""}
    <form class="form" data-form="${it ? "item.update" : "item.create"}" data-id="${esc(it?.id || "")}" data-meeting="${esc(meetingId)}" data-rev="${esc(it?.rev ?? 0)}" data-dupeok="${dupes.length ? "1" : ""}" novalidate>
      ${errors.form ? msg("error", esc(errors.form)) : ""}
      ${field({ id: "title", label: "Item title", value: v.title, required: true, wide: true, error: errors.title, attrs: 'maxlength="150" autofocus' })}
      ${field({ id: "category", label: "Category", value: v.category, options: Object.keys(CATEGORIES), required: true, error: errors.category, attrs: 'data-action="form.category"' })}
      ${field({ id: "sub", label: "Subcategory", value: v.sub, options: subs, required: true, error: errors.sub })}
      ${field({ id: "dept", label: "Requesting department", value: v.dept, options: DEPARTMENTS, required: true, error: errors.dept })}
      ${field({ id: "owner", label: "Responsible", value: v.owner, required: true, error: errors.owner, hint: "Role or name, e.g. HR Manager" })}
      ${field({ id: "request", label: "Request", type: "textarea", value: v.request, required: true, wide: true, rows: 4, error: errors.request, hint: "What the department asks the committee to decide" })}
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
  const tabs = [["agenda", `Agenda and minutes (${agenda.length})`], ["signatures", "Signatures"], ["versions", `Versions (${m.versions.length})`], ["log", "Change log"]];
  return `${pageHeader({ crumbs: [{ label: "Meetings", href: "#meetings", action: "meeting.back" }, { label: m.title }], title: m.title,
      sub: `<span class="ref">${esc(m.ref)}</span> · ${fmtDate(m.date)}${m.version ? ` · minutes v${m.version}` : ""} · ${phaseBadge(ctx, m)}`, actions: transitions.join("") })}
  ${stepper(ctx, m)}
  ${banners(ctx, m, ph, s)}
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? "on" : ""}" data-action="meeting.tab" data-tab="${k}">${esc(l)}</button>`).join("")}</div>
  <div class="tabpanel" role="tabpanel">
  ${tab === "agenda" ? agendaTab(ctx, m, agenda) : tab === "signatures" ? signaturesTab(ctx, m, s) : tab === "versions" ? versionsTab(ctx, m) : meetingLog(ctx, m)}
  </div>`;
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

function presenceFor(ctx, key) {
  const who = Object.values(ctx.presence).filter(p => p.editing === key).map(p => ctx.name(p.user));
  return who.length ? `<span class="presence">${icon("live")} ${esc(who.join(", "))} editing now</span>` : "";
}

function agendaTab(ctx, m, agenda) {
  const sec = ctx.role === "Secretary";
  const editAgenda = sec && canEditAgenda(m), editMin = sec && canEditMinutes(m);
  if (m.status === "circulated" || m.status === "archived") return minutesDocument(ctx, m, m.snapshot);
  const candidates = Object.values(ctx.d.items).filter(i => isItemOpen(i) && !i.archived && !m.agenda.includes(i.id));
  return `${m.status === "preparation" || m.status === "agenda_issued" ? msg("info", m.status === "preparation" ? "Build the agenda, then issue it. Minutes open when the meeting starts." : "Agenda issued. Start the meeting to record live minutes.") : ""}
  ${editAgenda ? `<div class="toolbar">
      <label class="fb"><span>Add open item</span><select id="add-item" aria-label="Open item to add"><option value="">Select an item…</option>${candidates.map(i => `<option value="${esc(i.id)}">${esc(i.ref)} · ${esc(i.title)}</option>`).join("")}</select></label>
      ${btn("Add", "agenda.add", { data: { id: m.id } })}
      ${candidates.length ? btn(`Bring forward all ${candidates.length} open items`, "agenda.bringAll", { data: { id: m.id } }) : ""}
      ${btn("New item on this agenda", "item.new", { ic: "plus", data: { meeting: m.id } })}
    </div>` : ""}
  ${agenda.length ? agenda.map((it, i) => minuteBlock(ctx, m, it, i + 1, editAgenda, editMin)).join("") : `<div class="card"><p class="empty">The agenda is empty.${editAgenda ? " Add open items or create a new one." : ""}</p></div>`}`;
}

function minuteBlock(ctx, m, it, n, editAgenda, editMin) {
  const key = `${m.id}__${it.id}`;
  const mn = ctx.d.minutes[key] || {};
  const acts = actionsArr(ctx).filter(a => a.itemId === it.id && a.meetingId === m.id);
  const prior = meetingsOf(ctx, it).filter(x => x.id !== m.id && (x.date || "") < (m.date || ""));
  const showMin = m.status !== "preparation" && m.status !== "agenda_issued";
  const ta = (f, label, ph) => editMin
    ? `<div class="field"><label for="min-${key}-${f}">${label}</label><textarea id="min-${key}-${f}" data-minute="${esc(key)}" data-field="${f}" data-rev="${mn.rev || 0}" placeholder="${esc(ph)}" rows="3">${esc(mn[f] || "")}</textarea></div>`
    : `<div><span class="lbl">${label}</span><p class="pre">${esc(mn[f] || "—")}</p></div>`;
  return `<article class="card minute" aria-labelledby="mi-${esc(key)}">
    <div class="minute-h"><div><span class="num-badge">${n}</span> ${refLink(it)} <h3 id="mi-${esc(key)}">${esc(it.title)}</h3>
      <div class="hint">${esc(it.category)} · ${esc(it.sub || "")} · ${esc(it.dept)} · Responsible: ${esc(it.owner || "—")}${prior.length ? ` · previously discussed in ${prior.length} meeting${prior.length > 1 ? "s" : ""}` : ""}</div></div>
      <div class="minute-tools">${presenceFor(ctx, key)}${badge(stageOf(ctx, it))}${editAgenda ? btn("Remove", "agenda.remove", { kind: "ghost", data: { id: m.id, item: it.id } }) : ""}</div></div>
    <div class="req"><span class="lbl">Request</span><p class="pre">${esc(it.request || "—")}</p></div>
    ${prior.length ? `<details class="prior"><summary>Earlier decisions (${prior.length})</summary>${prior.map(p => { const pm = ctx.d.minutes[`${p.id}__${it.id}`] || {}; return `<p><b>${esc(p.title)}, ${fmtDate(p.date)}:</b> ${esc(pm.decision || "No decision recorded")}</p>`; }).join("")}</details>` : ""}
    ${showMin ? `<div class="minute-grid">${ta("discussion", "Discussion summary", "Key points raised")}${ta("decision", "Recommendation / decision", "e.g. Recommended: renew for 2 years")}</div>
    ${mn.updatedBy ? `<div class="hint">Last saved by ${esc(ctx.name(mn.updatedBy))} at ${fmtDateTime(mn.updatedAt)} · revision ${mn.rev || 1}</div>` : ""}
    <div class="sub-sec"><span class="lbl">Follow-up actions</span>
      ${acts.length ? `<table class="grid compact"><thead><tr><th scope="col">Action</th><th scope="col">Responsible</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead><tbody>${acts.map(a => `<tr class="${isOverdue(a, ctx.today) ? "row-bad" : ""}"><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td class="num">${fmtDate(a.due)}</td><td>${ctx.role === "Secretary" ? actionStatusSelect(a) : actionBadge(a, ctx.today)}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">No actions yet.</p>`}
      ${editMin ? `<form class="inline-form" data-form="action.create" data-meeting="${esc(m.id)}" data-item="${esc(it.id)}" novalidate>
        <input name="text" placeholder="Action" aria-label="Action" required><input name="owner" placeholder="Responsible" aria-label="Responsible" required><input name="due" type="date" aria-label="Due date" required>${btn("Add action", null, { type: "submit" })}<div class="err" data-err></div></form>` : ""}
    </div>` : ""}
  </article>`;
}

export function minutesDocument(ctx, m, snap) {
  if (!snap) return `<p class="empty">No circulated version yet.</p>`;
  const s = signatureState(m, ctx.d.sigs);
  return `<article class="minutes-doc" aria-label="Minutes version ${snap.v}">
    <header><div><div class="lbl">Workforce Planning Committee · Minutes of meeting</div><h2>${esc(m.title)}</h2></div>
      <dl><div><dt>Reference</dt><dd>${esc(m.ref)}</dd></div><div><dt>Date</dt><dd>${fmtDate(m.date)}</dd></div><div><dt>Version</dt><dd>v${snap.v}${m.version !== snap.v ? " (superseded)" : ""}</dd></div><div><dt>Circulated</dt><dd>${fmtDateTime(snap.at)}</dd></div></dl></header>
    <table class="grid doc-table"><thead><tr><th scope="col" style="width:36px">#</th><th scope="col">Item and request</th><th scope="col">Discussion</th><th scope="col">Recommendation / decision</th><th scope="col">Actions</th></tr></thead><tbody>
    ${snap.items.map((x, i) => `<tr><td>${i + 1}</td><td><span class="ref">${esc(x.ref)}</span><div><b>${esc(x.title)}</b></div><div class="hint">${esc(x.category)} · ${esc(x.dept)}</div><p class="pre">${esc(x.request)}</p></td><td class="pre">${esc(x.discussion || "—")}</td><td class="pre"><b>${esc(x.decision || "—")}</b></td><td>${x.actions.length ? x.actions.map(a => `<div>${esc(a.text)}<div class="hint">${esc(a.owner)} · ${fmtDate(a.due)}</div></div>`).join("") : "—"}</td></tr>`).join("")}
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
    ${tracked.length ? `<table class="grid compact"><thead><tr><th scope="col">Meeting</th><th scope="col">Version</th><th scope="col" class="num">Signed</th><th scope="col">Pending</th><th scope="col">Chairman</th><th scope="col">Status</th></tr></thead><tbody>${tracked.map(m => { const s = signatureState(m, ctx.d.sigs);
      return `<tr><td><a href="#meetings" data-action="meeting.open" data-id="${esc(m.id)}">${esc(m.title)}</a></td><td>v${m.version}</td><td class="num">${s.signed}/${s.total}</td><td>${esc(s.rows.filter(r => !r.sig || r.sig.status !== "signed").map(r => ctx.name(r.user)).join(", ") || "—")}</td><td>${m.chairman ? (s.chairApproved ? badge("Approved") : badge("Pending")) : "Not set"}</td><td>${phaseBadge(ctx, m)}</td></tr>`; }).join("")}</tbody></table>` : `<p class="empty">No minutes have been circulated yet.</p>`}
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
      <p class="hint">Your role here: <b>${esc(ctx.role)}</b>. Secretaries are the people given Editor access through the Share menu.</p>
    </section>
    <section class="card"><div class="card-h"><h2>How access is granted</h2></div>
      <table class="grid compact"><thead><tr><th scope="col">Role</th><th scope="col">Share menu level</th><th scope="col">Enforced by</th></tr></thead><tbody>
        <tr><td>Secretary</td><td>Editor</td><td>Database rule: only Editors write shared records</td></tr>
        <tr><td>Chairman</td><td>Contributor + roster</td><td>Can write only their own signature record</td></tr>
        <tr><td>Member</td><td>Contributor + roster</td><td>Can write only their own signature record</td></tr>
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
