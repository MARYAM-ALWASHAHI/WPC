/**
 * WPC Hub — reports for a chosen period. Pure functions: reportData(ctx, from, to) gathers the figures,
 * reportsView renders them, reportWord / reportCsv turn them into files.
 */
import { OUTCOMES, isFinalOutcome, isActionOpen, isOverdue, daysBetween, isItemOpen, ACTION_LABELS } from "./domain.js";
import { esc, icon, btn, pageHeader, fmtDate, fmtDateTime, badge } from "./ui.js";

const inRange = (d, from, to) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;

export function reportData(ctx, from, to) {
  const items = Object.values(ctx.d.items).filter(i => !i.archived || inRange(i.createdAt, from, to));
  const meetings = Object.values(ctx.d.meetings).filter(m => inRange(m.date, from, to)).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const received = items.filter(i => inRange(i.createdAt, from, to));
  const decisions = [];
  for (const m of meetings) for (const id of m.agenda) {
    const mn = ctx.d.minutes[`${m.id}__${id}`]; const it = ctx.d.items[id];
    if (!mn || !it || !(mn.outcome || mn.decision)) continue;
    decisions.push({ m, it, mn });
  }
  const outcomes = Object.keys(OUTCOMES).map(o => [o, decisions.filter(d => d.mn.outcome === o).length]);
  const finals = decisions.filter(d => isFinalOutcome(d.mn.outcome));
  const hcApproved = finals.filter(d => d.mn.outcome !== "Rejected").reduce((s, d) => s + (Number(d.mn.hcApproved) || 0), 0);
  const hcRequested = received.reduce((s, i) => s + (Number(i.hcRequested) || 0), 0);
  const cycle = finals.filter(d => d.it.createdAt).map(d => Math.max(0, daysBetween(d.it.createdAt.slice(0, 10), d.m.date)));
  const actions = Object.values(ctx.d.actions).filter(a => a.status !== "CANCELLED" && (inRange(a.createdAt || a.due, from, to) || isActionOpen(a)));
  const byOwner = {};
  for (const a of actions) {
    const o = byOwner[a.owner || "—"] ||= { owner: a.owner || "—", open: 0, overdue: 0, done: 0 };
    if (a.status === "DONE") o.done++; else { o.open++; if (isOverdue(a, ctx.today)) o.overdue++; }
  }
  const closed = items.filter(i => i.status === "CLOSED" && inRange(i.closedDate, from, to));
  const audit = Object.values(ctx.d.audit).filter(e => inRange(e.at, from, to)).sort((a, b) => b.at.localeCompare(a.at));
  const requests = [];
  for (const [uid, doc] of Object.entries(ctx.d.requests || {})) for (const r of Object.values(doc || {})) if (r && r.title && inRange(r.submittedAt, from, to)) requests.push({ ...r, uid });
  return {
    from, to, meetings, received, decisions, outcomes, finals, hcApproved, hcRequested, closed, audit, requests,
    avgCycle: cycle.length ? Math.round(cycle.reduce((s, x) => s + x, 0) / cycle.length) : null,
    openNow: Object.values(ctx.d.items).filter(i => isItemOpen(i) && !i.archived).length,
    owners: Object.values(byOwner).sort((a, b) => b.overdue - a.overdue || b.open - a.open),
    actionsOpen: actions.filter(a => a.status !== "DONE").length,
    actionsOverdue: actions.filter(a => isOverdue(a, ctx.today)).length,
  };
}

const stat = (l, v, n = "") => `<div class="kpi static"><span class="kpi-l">${esc(l)}</span><span class="kpi-v">${v}</span>${n ? `<span class="kpi-n">${esc(n)}</span>` : ""}</div>`;
const outcomeTone = o => (["Approved", "Approved with conditions", "Endorsed by circulation", "Recommended to EXCO"].includes(o) ? "ok" : o === "Rejected" ? "bad" : o ? "warn" : "neutral");

export function reportsView(ctx) {
  const { from, to } = ctx.ui.report;
  const r = reportData(ctx, from, to);
  const tbl = (head, rows, empty) => rows.length
    ? `<div class="table-scroll"><table class="grid compact"><thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
    : `<p class="empty">${empty}</p>`;
  return `${pageHeader({ title: "Reports", sub: "Everything the committee did in a period: requests, meetings, decisions, follow-up and the activity log.",
      actions: ctx.s.downloads ? btn("Full report (Word)", "report.word", { kind: "primary", ic: "download" }) : "" })}
  <form class="filterbar report-period" data-form="report.period" novalidate>
    <label class="fb"><span>From</span><input type="date" name="from" value="${esc(from)}" data-action="filter.report" data-key="from"></label>
    <label class="fb"><span>To</span><input type="date" name="to" value="${esc(to)}" data-action="filter.report" data-key="to"></label>
    <div class="seg" role="group" aria-label="Quick periods">${[["month", "This month"], ["quarter", "This quarter"], ["year", "This year"]].map(([k, l]) => `<button type="button" class="seg-b" data-action="report.quick" data-period="${k}">${l}</button>`).join("")}</div>
  </form>
  <section class="kpi-strip report-kpis">
    ${stat("Requests received", r.received.length, `${r.hcRequested} positions requested`)}
    ${stat("Meetings held", r.meetings.length)}
    ${stat("Decisions recorded", r.decisions.length, `${r.finals.length} final`)}
    ${stat("Positions approved", r.hcApproved)}
    ${stat("Request to decision", r.avgCycle == null ? "—" : `${r.avgCycle} d`, "Average, final decisions")}
    ${stat("Items closed", r.closed.length, `${r.openNow} open today`)}
  </section>
  <div class="cols-2">
    <section class="card"><div class="card-h"><h2>Decisions by outcome</h2>${ctx.s.downloads ? btn("Decision log (CSV)", "report.csv", { kind: "ghost", ic: "download", data: { kind: "decisions" } }) : ""}</div>
      ${tbl(["Outcome", "Count"], r.outcomes.filter(([, n]) => n).map(([o, n]) => `<tr><td>${badge(o, outcomeTone(o))}</td><td class="num">${n}</td></tr>`), "No decisions recorded in this period.")}</section>
    <section class="card"><div class="card-h"><h2>Follow-up by responsible</h2>${ctx.s.downloads ? btn("Actions (CSV)", "report.csv", { kind: "ghost", ic: "download", data: { kind: "actions" } }) : ""}</div>
      ${tbl(["Responsible", "Open", "Overdue", "Done"], r.owners.map(o => `<tr><td>${esc(o.owner)}</td><td class="num">${o.open}</td><td class="num">${o.overdue ? `<b class="t-bad">${o.overdue}</b>` : 0}</td><td class="num">${o.done}</td></tr>`), "No actions in this period.")}</section>
  </div>
  <section class="card"><div class="card-h"><h2>Decision log</h2><span class="hint">${r.decisions.length} decisions</span></div>
    ${tbl(["Meeting", "Item", "Department", "Outcome", "Positions", "Decision"], r.decisions.map(d => `<tr><td>${fmtDate(d.m.date)}<div class="hint">${esc(d.m.ref)}</div></td><td><span class="ref">${esc(d.it.ref)}</span><div>${esc(d.it.title)}</div></td><td>${esc(d.it.dept)}</td><td>${d.mn.outcome ? badge(d.mn.outcome, outcomeTone(d.mn.outcome)) : "—"}</td><td class="num">${d.mn.hcApproved ?? "—"}</td><td>${esc(d.mn.decision || "")}</td></tr>`), "No decisions recorded in this period.")}</section>
  <section class="card"><div class="card-h"><h2>Meetings</h2></div>
    ${tbl(["Date", "Meeting", "Items", "Present", "Minutes"], r.meetings.map(m => `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.title)}<div class="hint">${esc(m.ref)}</div></td><td class="num">${m.agenda.length}</td><td class="num">${Object.values(m.attendance || {}).filter(s => s === "Present").length || "—"}</td><td>${m.status === "archived" ? badge(`Final v${m.version}`, "ok") : m.version ? badge(`v${m.version} under review`, "warn") : badge("Not circulated", "neutral")}</td></tr>`), "No meetings in this period.")}</section>
  <section class="card"><div class="card-h"><h2>Activity log</h2>${ctx.s.downloads ? btn("Activity log (CSV)", "report.csv", { kind: "ghost", ic: "download", data: { kind: "audit" } }) : ""}</div>
    <p class="hint">Every change made in WPC Hub, newest first. ${r.audit.length} entries in this period${r.audit.length > 15 ? "; the 15 latest are shown, the CSV has all" : ""}.</p>
    ${tbl(["When", "Who", "Record", "What"], r.audit.slice(0, 15).map(e => `<tr><td>${fmtDateTime(e.at)}</td><td>${esc(ctx.name(e.by))}</td><td><span class="ref">${esc(e.ref || e.entity)}</span></td><td>${esc(e.action)}${e.detail ? `<div class="hint">${esc(e.detail)}</div>` : ""}</td></tr>`), "No activity in this period.")}</section>`;
}

const csvCell = v => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(ctx, kind) {
  const { from, to } = ctx.ui.report;
  const r = reportData(ctx, from, to);
  let rows;
  if (kind === "decisions") rows = [["Meeting date", "Meeting", "Item ref", "Item", "Department", "Category", "Positions requested", "Outcome", "Positions approved", "Decision"], ...r.decisions.map(d => [d.m.date, d.m.ref, d.it.ref, d.it.title, d.it.dept, d.it.category, d.it.hcRequested ?? "", d.mn.outcome || "", d.mn.hcApproved ?? "", d.mn.decision || ""])];
  else if (kind === "actions") rows = [["Item ref", "Action", "Responsible", "Due", "Status", "Overdue"], ...Object.values(ctx.d.actions).filter(a => a.status !== "CANCELLED").map(a => [ctx.d.items[a.itemId]?.ref || "", a.text, a.owner, a.due, ACTION_LABELS[a.status] || a.status, isOverdue(a, ctx.today) ? "Yes" : ""])];
  else rows = [["When", "Who", "Record", "What", "Detail"], ...r.audit.map(e => [e.at, ctx.name(e.by), e.ref || e.entity, e.action, e.detail || ""])];
  return { filename: `wpc-${kind}-${from}-to-${to}.csv`, data: "﻿" + rows.map(x => x.map(csvCell).join(",")).join("\r\n") };
}

export function reportWord(ctx) {
  const { from, to } = ctx.ui.report;
  const r = reportData(ctx, from, to);
  const t = (head, rows) => rows.length ? `<table><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>${rows.join("")}</table>` : "<p>None in this period.</p>";
  return { filename: `wpc-report-${from}-to-${to}.doc`, data: `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>WPC report</title>
<style>body{font-family:Arial,sans-serif;font-size:10.5pt;color:#14202B}h1{font-size:16pt;color:#0B2A3C}h2{font-size:12pt;color:#0B6E69;margin-top:16pt;border-bottom:1px solid #C6CFD7}table{border-collapse:collapse;width:100%}td,th{border:1px solid #C6CFD7;padding:4pt;vertical-align:top;text-align:left}th{background:#EEF2F5}.small{font-size:8.5pt;color:#485765}</style></head><body>
<p class="small">Workforce Planning Committee · Generated ${esc(new Date().toLocaleString("en-GB"))} from WPC Hub</p>
<h1>Committee report: ${esc(fmtDate(from))} to ${esc(fmtDate(to))}</h1>
<h2>Summary</h2>${t(["Measure", "Value"], [["Requests received", r.received.length], ["Positions requested", r.hcRequested], ["Meetings held", r.meetings.length], ["Decisions recorded", r.decisions.length], ["Final decisions", r.finals.length], ["Positions approved", r.hcApproved], ["Average days, request to final decision", r.avgCycle ?? "—"], ["Items closed", r.closed.length], ["Items open today", r.openNow], ["Open actions", r.actionsOpen], ["Overdue actions", r.actionsOverdue]].map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`))}
<h2>Decisions by outcome</h2>${t(["Outcome", "Count"], r.outcomes.filter(([, n]) => n).map(([o, n]) => `<tr><td>${esc(o)}</td><td>${n}</td></tr>`))}
<h2>Decision log</h2>${t(["Meeting", "Item", "Department", "Outcome", "Positions approved", "Decision"], r.decisions.map(d => `<tr><td>${esc(d.m.date)}<br><span class="small">${esc(d.m.ref)}</span></td><td><b>${esc(d.it.ref)}</b> ${esc(d.it.title)}</td><td>${esc(d.it.dept)}</td><td>${esc(d.mn.outcome || "—")}</td><td>${esc(d.mn.hcApproved ?? "—")}</td><td>${esc(d.mn.decision || "")}</td></tr>`))}
<h2>Meetings</h2>${t(["Date", "Meeting", "Items", "Present", "Minutes"], r.meetings.map(m => `<tr><td>${esc(m.date)}</td><td>${esc(m.title)} (${esc(m.ref)})</td><td>${m.agenda.length}</td><td>${Object.values(m.attendance || {}).filter(s => s === "Present").length}</td><td>${m.status === "archived" ? `Final v${m.version}` : m.version ? `v${m.version} under review` : "Not circulated"}</td></tr>`))}
<h2>Follow-up by responsible</h2>${t(["Responsible", "Open", "Overdue", "Done"], r.owners.map(o => `<tr><td>${esc(o.owner)}</td><td>${o.open}</td><td>${o.overdue}</td><td>${o.done}</td></tr>`))}
<h2>Department requests</h2>${t(["Submitted", "Request", "Department", "Positions"], r.requests.map(q => `<tr><td>${esc((q.submittedAt || "").slice(0, 10))}</td><td>${esc(q.title)}</td><td>${esc(q.dept)}</td><td>${esc(q.hcRequested ?? "")}</td></tr>`))}
<h2>Activity log</h2>${t(["When", "Who", "Record", "What"], r.audit.map(e => `<tr><td>${esc(new Date(e.at).toLocaleString("en-GB"))}</td><td>${esc(ctx.name(e.by))}</td><td>${esc(e.ref || e.entity)}</td><td>${esc(e.action)}${e.detail ? ` <span class="small">${esc(e.detail)}</span>` : ""}</td></tr>`))}
</body></html>` };
}

export function quickPeriod(kind, today) {
  const [y, m] = today.split("-").map(Number);
  if (kind === "month") return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
  if (kind === "quarter") { const q = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${String(q).padStart(2, "0")}-01`, to: today }; }
  return { from: `${y}-01-01`, to: today };
}
