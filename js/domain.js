/**
 * WPC Hub — domain layer.
 * Pure functions only: no DOM, no storage. Everything here is unit-tested (tests/domain.test.mjs).
 */

export const CATEGORIES = Object.freeze({
  "Manpower requirement": ["New position (budgeted)", "New position (non-budgeted)", "Replacement", "Transfer"],
  "Expatriate contract renewal": ["Renewal on same terms", "Renewal with changes", "Non-renewal"],
  "New contractor request": ["New contractor", "Contract extension", "Change in contractor headcount"],
  "Organisation development": ["Reporting line change", "Job title change", "New position in structure", "Grade review"],
  "Other": ["Other"],
});

export const DEPARTMENTS = Object.freeze(["Operations", "Potline", "Carbon", "Casthouse", "Power Plant", "Maintenance",
  "Quality", "Finance", "HR", "IT", "Supply Chain", "HSE", "Other"]);

/* ---------- Decisions: one structured outcome per item per meeting ---------- */
/** "open" outcomes keep the item in front of the committee; "final" outcomes decide it. */
export const OUTCOMES = Object.freeze({
  "Approved":                    "final",
  "Approved with conditions":    "final",
  "Recommended to EXCO":         "final",
  "Endorsed by circulation":     "final",
  "Rejected":                    "final",
  "Deferred":                    "open",
  "Returned for clarification":  "open",
});
export const isFinalOutcome = o => OUTCOMES[o] === "final";
export const BUDGETED = ["", "Budgeted", "Non-budgeted", "Not applicable"];

/* ---------- Meeting workflow (BPMN lanes: Secretary, Member, Chairman) ---------- */
export const MEETING_STATES = Object.freeze({
  preparation:   { label: "Preparation",        order: 0 },
  agenda_issued: { label: "Agenda issued",      order: 1 },
  in_session:    { label: "In session",         order: 2 },
  drafting:      { label: "Minutes drafting",   order: 3 },
  circulated:    { label: "Under review",       order: 4 },
  archived:      { label: "Archived",           order: 6 },
});

/** Allowed secretary transitions: from -> { to: guardName } */
export const MEETING_TRANSITIONS = Object.freeze({
  preparation:   { agenda_issued: "issueAgenda" },
  agenda_issued: { in_session: "startSession", preparation: null },
  in_session:    { drafting: "endSession" },
  drafting:      { circulated: "circulate" },
  circulated:    { drafting: null, archived: "archive" },
  archived:      {},
});

/** Data written before workflow v2 used draft/ready. */
export function normalizeMeeting(m) {
  if (!m) return m;
  const legacy = { draft: "preparation", ready: "circulated" };
  const status = legacy[m.status] || m.status || "preparation";
  return { ...m, status, agenda: m.agenda || [], members: m.members || [], versions: m.versions || [], version: m.version || 0 };
}

export const canEditAgenda = m => m.status === "preparation" || m.status === "in_session";
export const canEditMinutes = m => m.status === "in_session" || m.status === "drafting";

/* ---------- Signatures (kept separate from item status) ---------- */
/** sigDocs: { [userId]: { [meetingId]: {v, status, role, at, comment, history} } } */
/** A member signature and a Chairman approval are separate entries, even for the same person. */
export const sigKey = (meetingId, role = "member") => role === "chairman" ? `${meetingId}:chair` : meetingId;
export function sigFor(m, userId, sigDocs, role = "member") {
  const entry = sigDocs?.[userId]?.[sigKey(m.id, role)];
  return entry && entry.v === m.version ? entry : null;
}

export function signatureState(m, sigDocs) {
  const rows = (m.members || []).map(u => ({ user: u, sig: sigFor(m, u, sigDocs) }));
  const signed = rows.filter(r => r.sig?.status === "signed").length;
  const corrections = rows.filter(r => r.sig?.status === "correction");
  const chair = m.chairman ? sigFor(m, m.chairman, sigDocs, "chairman") : null;
  const chairCorrection = chair?.status === "correction" ? [{ user: m.chairman, sig: chair }] : [];
  return {
    rows, signed, total: rows.length, pending: rows.length - signed,
    corrections: [...corrections, ...chairCorrection],
    allSigned: rows.length > 0 && signed === rows.length,
    chairApproved: chair?.status === "approved",
  };
}

/** The phase a person sees. Workflow status + signatures => one label. */
export function meetingPhase(m, sigDocs) {
  if (m.status !== "circulated") return { key: m.status, label: MEETING_STATES[m.status]?.label || m.status };
  const s = signatureState(m, sigDocs);
  if (s.corrections.length) return { key: "correction", label: "Correction requested" };
  if (!s.allSigned) return { key: "signing", label: `Signatures ${s.signed}/${s.total}` };
  if (!m.chairman) return { key: "signed", label: "Signed, no Chairman set" };
  if (!s.chairApproved) return { key: "awaiting_chair", label: "Awaiting Chairman approval" };
  return { key: "approved", label: "Approved" };
}

export const awaitingSignature = (m, sigDocs) => m.status === "circulated" && ["signing", "correction"].includes(meetingPhase(m, sigDocs).key);

/* ---------- Guards: return a list of blocking problems (empty = allowed) ---------- */
export function guardTransition(m, to, ctx) {
  const problems = [];
  const allowed = MEETING_TRANSITIONS[m.status] || {};
  if (!(to in allowed)) return [`A meeting in “${MEETING_STATES[m.status]?.label}” cannot move to “${MEETING_STATES[to]?.label}”.`];
  const guard = allowed[to];
  if (guard === "issueAgenda" && !m.agenda.length) problems.push("Add at least one agenda item.");
  if (guard === "circulate") {
    if (!m.members.length) problems.push("Add at least one committee member who signs.");
    for (const id of m.agenda) {
      const mn = ctx.minutes[`${m.id}__${id}`];
      if (!mn?.outcome) problems.push(`${ctx.items[id]?.ref || id}: choose the decision outcome.`);
    }
  }
  if (guard === "archive") {
    const ph = meetingPhase(m, ctx.sigDocs).key;
    if (!["approved", "signed"].includes(ph)) problems.push("Minutes can be archived only after all members sign and the Chairman approves.");
  }
  return problems;
}

/* ---------- Items ---------- */
export const ITEM_STAGES = ["Submitted", "Scheduled", "Under discussion", "Deferred", "Decided", "In follow-up", "Closed", "Withdrawn"];

/** Minutes of one item, newest meeting first, each with its meeting. */
export function itemMinutes(item, ctx) {
  return Object.values(ctx.meetings).filter(m => m.agenda.includes(item.id))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(m => ({ m, mn: ctx.minutes[`${m.id}__${item.id}`] })).filter(x => x.mn);
}
/** The latest recorded outcome (structured), or null. */
export function latestOutcome(item, ctx) {
  return itemMinutes(item, ctx).find(x => x.mn.outcome) || null;
}

export function itemStage(item, ctx) {
  if (item.status === "WITHDRAWN") return "Withdrawn";
  if (item.status === "CLOSED") return "Closed";
  const meetings = Object.values(ctx.meetings).filter(m => m.agenda.includes(item.id)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const mins = meetings.map(m => ctx.minutes[`${m.id}__${item.id}`]).filter(Boolean);
  const last = mins.find(x => x.outcome || x.decision?.trim());
  if (last?.outcome && !isFinalOutcome(last.outcome)) {
    return meetings.some(m => ["preparation", "agenda_issued", "in_session"].includes(m.status) && !ctx.minutes[`${m.id}__${item.id}`]?.outcome) ? "Scheduled" : "Deferred";
  }
  const decided = !!last;
  if (decided) {
    const open = Object.values(ctx.actions).some(a => a.itemId === item.id && isActionOpen(a));
    return open ? "In follow-up" : "Decided";
  }
  if (mins.some(x => x.discussion?.trim())) return "Under discussion";
  if (meetings.some(m => ["preparation", "agenda_issued", "in_session"].includes(m.status))) return "Scheduled";
  return "Submitted";
}

export const isItemOpen = it => it.status !== "CLOSED" && it.status !== "WITHDRAWN";

/* ---------- Actions ---------- */
export const ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
export const ACTION_LABELS = { OPEN: "Open", IN_PROGRESS: "In progress", DONE: "Done", CANCELLED: "Cancelled" };
export const isActionOpen = a => a.status === "OPEN" || a.status === "IN_PROGRESS";
export const isOverdue = (a, today) => isActionOpen(a) && !!a.due && a.due < today;
export function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO + "T00:00:00Z") - Date.parse(fromISO + "T00:00:00Z")) / 864e5);
}

/* ---------- References ---------- */
export function formatRef(kind, year, n) {
  return kind === "item" ? `WPC-${year}-${String(n).padStart(3, "0")}` : `M-${year}-${String(n).padStart(2, "0")}`;
}
/** Next free number: max(counter, highest existing ref of that year) + 1. Never reuses a number. */
export function nextRefNumber(kind, year, counter, existingRefs) {
  const re = kind === "item" ? new RegExp(`^WPC-${year}-(\\d+)$`) : new RegExp(`^M-${year}-(\\d+)$`);
  let max = counter || 0;
  for (const r of existingRefs) { const m = re.exec(r || ""); if (m && +m[1] > max) max = +m[1]; }
  return max + 1;
}

/* ---------- Duplicate detection ---------- */
const STOP = new Set(["the", "of", "for", "and", "to", "a", "an", "in", "on", "example", "new"]);
export function tokens(s) {
  return new Set(String(s || "").toLowerCase().replace(/\(example\)/g, " ").split(/[^a-z0-9؀-ۿ]+/).filter(w => w.length > 2 && !STOP.has(w)));
}
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
/** Open items in the same category whose title is similar (Jaccard >= 0.5) or the same department+subcategory+title stem. */
export function findDuplicates(candidate, items, threshold = 0.5) {
  return items.filter(it => it.id !== candidate.id && isItemOpen(it) && !it.archived && it.category === candidate.category)
    .map(it => ({ item: it, score: similarity(it.title, candidate.title) }))
    .filter(x => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/* ---------- Validation ---------- */
export function validateItem(v) {
  const e = {};
  if (!v.title || v.title.trim().length < 5) e.title = "Enter a title of at least 5 characters.";
  else if (v.title.length > 150) e.title = "Keep the title under 150 characters.";
  if (!CATEGORIES[v.category]) e.category = "Choose a category.";
  else if (!CATEGORIES[v.category].includes(v.sub)) e.sub = "Choose a subcategory that belongs to the category.";
  if (!DEPARTMENTS.includes(v.dept)) e.dept = "Choose the requesting department.";
  if (!v.owner || v.owner.trim().length < 2) e.owner = "Enter who is Responsible (a role is enough).";
  if (!v.request || v.request.trim().length < 10) e.request = "Describe the request in at least 10 characters.";
  if (v.hcRequested !== undefined && v.hcRequested !== "" && !/^\d{1,4}$/.test(String(v.hcRequested))) e.hcRequested = "Enter a whole number of positions.";
  if (v.annualCost !== undefined && v.annualCost !== "" && !/^\d{1,9}(\.\d{1,3})?$/.test(String(v.annualCost))) e.annualCost = "Enter an amount in OMR, digits only.";
  if (v.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveDate)) e.effectiveDate = "Use a valid date.";
  if (v.budgeted && !BUDGETED.includes(v.budgeted)) e.budgeted = "Choose from the list.";
  return e;
}
/** Manpower facts stored on an item. Numbers stay strings in forms and become numbers here. */
export function itemFacts(v) {
  const n = x => (x === "" || x == null ? null : Number(x));
  return { hcRequested: n(v.hcRequested), grade: (v.grade || "").trim(), budgeted: v.budgeted || "", annualCost: n(v.annualCost), effectiveDate: v.effectiveDate || "" };
}

/* ---------- Charter KPIs (WPC Process Automation charter) ---------- */
/**
 * cycle: average days from submission to the first final outcome.
 * firstTime: share of decided items never returned for clarification.
 * aged: open items older than 30 days.
 */
export function charterKpis(ctx, today) {
  const items = Object.values(ctx.items).filter(i => !i.archived);
  const decided = [];
  for (const it of items) {
    const mins = itemMinutes(it, ctx).slice().reverse(); // oldest first
    const first = mins.find(x => isFinalOutcome(x.mn.outcome));
    if (!first || !it.createdAt || !first.m.date) continue;
    decided.push({ it, days: Math.max(0, daysBetween(it.createdAt.slice(0, 10), first.m.date)), returned: !!it.returned || mins.some(x => x.mn.outcome === "Returned for clarification") });
  }
  const open = items.filter(isItemOpen);
  const age = it => it.createdAt ? daysBetween(it.createdAt.slice(0, 10), today) : 0;
  return {
    decidedCount: decided.length,
    cycleDays: decided.length ? Math.round(decided.reduce((s, x) => s + x.days, 0) / decided.length) : null,
    firstTimePct: decided.length ? Math.round(100 * decided.filter(x => !x.returned).length / decided.length) : null,
    aged30: open.filter(it => age(it) > 30).length,
    ageBuckets: [["0–30 days", 0, 30], ["31–60 days", 31, 60], ["61–90 days", 61, 90], ["Over 90 days", 91, Infinity]].map(([l, a, b]) => [l, open.filter(it => age(it) >= a && age(it) <= b).length]),
  };
}
export function outcomeCounts(ctx) {
  const counts = Object.fromEntries(Object.keys(OUTCOMES).map(o => [o, 0]));
  for (const mn of Object.values(ctx.minutes)) if (mn.outcome && counts[mn.outcome] !== undefined && ctx.meetings[mn.meetingId]) counts[mn.outcome]++;
  return Object.entries(counts);
}
/** Positions requested on open items vs approved (latest final outcome with an approved headcount). */
export function headcountTotals(ctx) {
  let requested = 0, approved = 0;
  for (const it of Object.values(ctx.items)) {
    if (it.archived || it.status === "WITHDRAWN") continue;
    requested += Number(it.hcRequested) || 0;
    const lo = latestOutcome(it, ctx);
    if (lo && isFinalOutcome(lo.mn.outcome) && lo.mn.outcome !== "Rejected") approved += Number(lo.mn.hcApproved) || 0;
  }
  return { requested, approved };
}

/* ---------- Attendance and quorum ---------- */
export const ATTENDANCE = ["Present", "Apology", "Absent"];
/** quorum: number of committee people who must be present (from config); null = not set. */
export function quorumState(m, quorum) {
  const present = Object.values(m.attendance || {}).filter(s => s === "Present").length;
  if (!quorum) return { present, required: null, met: null };
  return { present, required: quorum, met: present >= quorum };
}
export function validateAction(v, today) {
  const e = {};
  if (!v.text || v.text.trim().length < 3) e.text = "Describe the action.";
  if (!v.owner || v.owner.trim().length < 2) e.owner = "Enter who is Responsible.";
  if (!v.due) e.due = "Choose a due date.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.due)) e.due = "Use a valid date.";
  else if (today && v.due < today && !v.allowPast) e.due = "The due date is in the past.";
  return e;
}
export function validateMeeting(v) {
  const e = {};
  if (!v.title || v.title.trim().length < 3) e.title = "Enter a meeting title.";
  if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) e.date = "Choose the meeting date.";
  if (v.attendanceLink && !/^https:\/\/[^\s"'<>]+$/i.test(v.attendanceLink.trim())) e.attendanceLink = "Enter a full link that starts with https://";
  return e;
}
export function validateClosure(v, item, actions, today) {
  const e = {};
  if (!v.closedDate) e.closedDate = "Choose the closure date.";
  else if (v.closedDate > today) e.closedDate = "The closure date cannot be in the future.";
  if (!v.evidence || v.evidence.trim().length < 10) e.evidence = "Record the supporting evidence (at least 10 characters).";
  const open = actions.filter(a => a.itemId === item.id && isActionOpen(a));
  if (open.length) e.actions = `${open.length} follow-up action${open.length > 1 ? "s are" : " is"} still open. Complete or cancel ${open.length > 1 ? "them" : "it"} first.`;
  return e;
}

/* ---------- Concurrency: three-way check for a single text field ---------- */
/** base = value when the editor started; mine = value being saved; theirs = value now stored. */
export function detectConflict(base, mine, theirs) {
  if (theirs === base) return { conflict: false, value: mine };
  if (theirs === mine) return { conflict: false, value: mine };
  if (mine === base) return { conflict: false, value: theirs };
  return { conflict: true, base, mine, theirs };
}

/* ---------- Lists: filter, sort, paginate ---------- */
export function sortRows(rows, key, dir = "asc", accessor) {
  const get = accessor || (r => r[key]);
  const mul = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * mul;
    return String(x).localeCompare(String(y), "en", { numeric: true }) * mul;
  });
}
export function paginate(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages, total: rows.length, from: rows.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, rows.length) };
}

/* ---------- Minutes snapshot (the version members sign) ---------- */
export function buildSnapshot(m, ctx, at) {
  return {
    v: (m.version || 0) + 1, at,
    time: m.time || "", location: m.location || "", attendance: { ...(m.attendance || {}) },
    items: m.agenda.map(id => ctx.items[id]).filter(Boolean).map(it => {
      const mn = ctx.minutes[`${m.id}__${it.id}`] || {};
      return {
        id: it.id, ref: it.ref, title: it.title, category: it.category, sub: it.sub || "", dept: it.dept, request: it.request || "",
        hcRequested: it.hcRequested ?? null, grade: it.grade || "", budgeted: it.budgeted || "", effectiveDate: it.effectiveDate || "",
        outcome: mn.outcome || "", hcApproved: mn.hcApproved ?? null,
        discussion: mn.discussion || "", decision: mn.decision || "",
        actions: Object.values(ctx.actions).filter(a => a.itemId === it.id && a.meetingId === m.id && a.status !== "CANCELLED")
          .map(a => ({ text: a.text, owner: a.owner || "", due: a.due || "" })),
      };
    }),
  };
}
/** Field-level differences between two snapshots, for the version comparison view. */
export function diffSnapshots(prev, next) {
  if (!prev) return [];
  const out = [];
  const byId = Object.fromEntries(prev.items.map(i => [i.id, i]));
  for (const it of next.items) {
    const p = byId[it.id];
    if (!p) { out.push({ ref: it.ref, field: "item", change: "added" }); continue; }
    for (const f of ["outcome", "hcApproved", "discussion", "decision"]) if ((p[f] || "") !== (it[f] || "")) out.push({ ref: it.ref, field: f, before: p[f], after: it[f] });
    if (JSON.stringify(p.actions) !== JSON.stringify(it.actions)) out.push({ ref: it.ref, field: "actions", change: "changed" });
  }
  for (const p of prev.items) if (!next.items.some(i => i.id === p.id)) out.push({ ref: p.ref, field: "item", change: "removed" });
  return out;
}

/* ---------- Roles ---------- */
export const ROLES = ["Secretary", "Chairman", "Member", "Requester", "Viewer"];
/** isEditor = share level Editor/Owner (db admin). Roster decides Chairman / Member.
 *  canWrite = Contributor level (may write their own records): a department requester. */
export function roleOf(userId, isEditor, roster, canWrite = false) {
  if (isEditor) return "Secretary";
  if (roster?.chairman && roster.chairman === userId) return "Chairman";
  if ((roster?.members || []).includes(userId)) return "Member";
  return canWrite === true ? "Requester" : "Viewer";
}
export const PERMISSIONS = [
  ["Submit a request to the committee", ["Secretary", "Chairman", "Member", "Requester"]],
  ["Accept or return submitted requests", ["Secretary"]],
  ["Create and edit agenda items, attach documents", ["Secretary"]],
  ["Record attendance", ["Secretary"]],
  ["Create meetings and manage the agenda", ["Secretary"]],
  ["Record live minutes and actions", ["Secretary"]],
  ["Circulate minutes and issue new versions", ["Secretary"]],
  ["Sign minutes or request a correction", ["Member", "Chairman"]],
  ["Give final approval of minutes", ["Chairman"]],
  ["Archive approved minutes", ["Secretary"]],
  ["Close, withdraw or archive items", ["Secretary"]],
  ["Update follow-up action status", ["Secretary"]],
  ["Manage committee roster", ["Secretary"]],
  ["View dashboard, items, minutes and history", ["Secretary", "Chairman", "Member", "Requester", "Viewer"]],
  ["Export data", ["Secretary"]],
];

/* ---------- Dates ---------- */
export function isoToday(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
