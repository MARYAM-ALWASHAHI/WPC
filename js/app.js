/**
 * WPC Hub — application controller.
 * Owns routing, UI state, the render loop and every user command (registered in COMMANDS).
 */
import * as D from "./domain.js";
import { state, connect, onChange, saveDoc, nextRef, newId, audit, writeSignature, errorMessage, setPresence, WriteError } from "./store.js";
import { esc, icon, toast, openPanel, closePanel, panelOpen, confirmDialog, readForm, msg, btn, panelHead } from "./ui.js";
import * as V from "./views.js";

/* ---------- UI state (per viewer, not shared) ---------- */
const TABLE = (sort, dir = "asc") => ({ sort, dir, page: 1, size: 25 });
const ITEM_FILTER = () => ({ q: "", status: "open", cat: "", dept: "", stage: "", owner: "", month: "", pending: false, overdue: false, archived: false });
const ui = {
  route: "dashboard", meetingId: null, meetingTab: "agenda", openItem: null,
  itemFilter: ITEM_FILTER(),
  actionFilter: { status: "active", owner: "", overdue: false },
  auditFilter: { q: "", entity: "" },
  tables: { items: TABLE("ref", "desc"), meetings: TABLE("date", "desc"), actions: TABLE("due"), audit: TABLE("at", "desc") },
};
const ROUTES = { dashboard: V.dashboard, meetings: null, items: V.itemsView, actions: V.actionsView, review: V.reviewView, records: V.recordsView, admin: V.adminView };
const NAV = [["dashboard", "Overview", "dashboard"], ["meetings", "Meetings", "meeting"], ["items", "Agenda items", "items"], ["actions", "Actions", "actions"], ["review", "Review and signatures", "sign"], ["records", "Historical records", "history"], ["admin", "Users and permissions", "users"]];

/* ---------- names ---------- */
const names = {};
let resolving = false;
function name(uid) {
  if (!uid) return "Unknown";
  if (!(uid in names)) { names[uid] = ""; queueResolve(); }
  return names[uid] || (uid === state.session.myId ? (state.session.me?.name || "You") : "Committee member");
}
function queueResolve() {
  if (resolving || !state.session.user) return;
  resolving = true;
  setTimeout(async () => {
    const ids = Object.keys(names);
    try { const ps = await state.session.user.profiles(ids); let changed = false; for (const id of ids) { const n = ps[id]?.name || ""; if (n && names[id] !== n) { names[id] = n; changed = true; } } if (changed) render(); } catch (_) { /* names are cosmetic */ }
    resolving = false;
  }, 30);
}

/* ---------- context passed to views ---------- */
function ctx() {
  const s = state.session;
  const role = D.roleOf(s.myId, s.isEditor, state.data.roster);
  return { d: state.data, s, ui, role, today: D.isoToday(), name, presence: state.presence };
}

/* ---------- render ---------- */
let deferred = false;
function render() {
  const ae = document.activeElement;
  if (ae && (ae.dataset?.minute || ae.closest?.(".inline-form") || ae.id === "member-q" || ae.id === "roster-q")) { deferred = true; return; }
  deferred = false;
  const c = ctx();
  renderShell(c);
  const main = document.getElementById("main");
  const y = window.scrollY;
  if (!state.session.ready) main.innerHTML = loading("Connecting to the committee record…");
  else if (state.error === "standalone" || state.error === "nodb") main.innerHTML = `<div class="card">${msg("error", "<b>The shared record is not available.</b> Open WPC Hub on claude.ai while signed in. Nothing shown here would be saved.")}</div>`;
  else if (!Object.values(state.loaded).every(Boolean) && !Object.keys(state.data.items).length) main.innerHTML = loading(state.loadSlow ? "The record is taking longer than usual. Check your connection; data appears as soon as it arrives." : "Loading the committee record…");
  else {
    let html;
    if (ui.route === "meetings") { const m = ui.meetingId && state.data.meetings[ui.meetingId]; html = m ? V.meetingDetail(c, m) : V.meetingsView(c); }
    else html = (ROUTES[ui.route] || V.dashboard)(c);
    if (state.error === "partial") html = msg("warn", "Part of the record could not be loaded. Reload the page.") + html;
    main.innerHTML = html;
  }
  window.scrollTo(0, y);
  if (ui.openItem && panelOpen() && document.querySelector('.panel[data-kind="item"]')) refreshItemPanel();
}
const loading = text => `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`;

function renderShell(c) {
  const tasks = V.myReviewTasks(c).length;
  const overdue = Object.values(state.data.actions).filter(a => D.isOverdue(a, c.today)).length;
  const counts = { review: tasks, actions: overdue };
  document.getElementById("nav").innerHTML = NAV.map(([k, l, ic]) => `<a href="#${k}" class="${ui.route === k ? "on" : ""}" ${ui.route === k ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span>${counts[k] ? `<span class="nav-count ${k === "actions" ? "bad" : ""}">${counts[k]}</span>` : ""}</a>`).join("");
  const u = document.getElementById("user");
  u.innerHTML = state.session.me ? `<span class="avatar"><img src="${esc(state.session.me.avatarUrl)}" alt=""></span><span class="u-meta"><span class="u-name"></span><span class="u-role">${esc(c.role)}</span></span>` : "";
  const n = u.querySelector(".u-name"); if (n) n.textContent = state.session.me?.name || "You";
  const live = document.getElementById("live");
  live.innerHTML = state.session.db ? `${icon("live")}<span>Live shared record</span>` : `${icon("alert")}<span>Not connected</span>`;
  live.className = `live ${state.session.db ? "on" : "off"}`;
}

/* ---------- routing ---------- */
function route() {
  const h = (location.hash || "#dashboard").slice(1);
  ui.route = h in ROUTES ? h : "dashboard";
  if (ui.route !== "meetings") ui.meetingId = null;
  closePanel(); ui.openItem = null;
  render();
  document.getElementById("main").focus({ preventScroll: true });
}
const go = to => { if (location.hash === `#${to}`) route(); else location.hash = to; };

/* ---------- write wrapper ---------- */
async function run(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok, "ok"); return r ?? true; }
  catch (e) { console.warn(e); toast(errorMessage(e), "error"); return false; }
}
const requireSecretary = () => { if (ctx().role !== "Secretary") { toast("Only secretaries can make this change.", "error"); return false; } return true; };

/* ---------- item panel ---------- */
function openItem(id) { const it = state.data.items[id]; if (!it) return; ui.openItem = id; openPanel(V.itemPanel(ctx(), it), it.ref, { size: "lg" }); document.querySelector("#layer .panel").dataset.kind = "item"; }
function refreshItemPanel() {
  const it = state.data.items[ui.openItem]; const p = document.querySelector('#layer .panel[data-kind="item"]');
  if (!it || !p) return;
  if (p.contains(document.activeElement) && document.activeElement.matches("input,textarea")) return;
  const st = p.scrollTop; p.innerHTML = V.itemPanel(ctx(), it); p.scrollTop = st;
}

/* ====================================================================== */
/* Commands                                                              */
/* ====================================================================== */
const COMMANDS = {
  "layer.close": () => { closePanel(); ui.openItem = null; },
  "nav.go": el => go(el.dataset.to),
  "nav.items": el => { ui.itemFilter = { ...ITEM_FILTER(), status: "", ...JSON.parse(el.dataset.filter) }; ui.tables.items.page = 1; go("items"); },
  "nav.actions": el => { ui.actionFilter = { status: "active", owner: "", overdue: false, ...JSON.parse(el.dataset.filter || "{}") }; go("actions"); },
  "table.sort": el => { const t = ui.tables[el.dataset.table]; if (t.sort === el.dataset.key) t.dir = t.dir === "asc" ? "desc" : "asc"; else { t.sort = el.dataset.key; t.dir = "asc"; } t.page = 1; render(); },
  "table.page": el => { ui.tables[el.dataset.table].page = +el.dataset.page; render(); },
  "filter.clear": () => { ui.itemFilter = ITEM_FILTER(); ui.itemFilter.status = ""; render(); },
  "copy": async el => { const ta = document.getElementById(el.dataset.target); try { await navigator.clipboard.writeText(ta.value); toast("Copied", "ok"); } catch (_) { ta.select(); toast("Text selected. Press Ctrl+C to copy."); } },

  /* items */
  "item.open": el => openItem(el.dataset.id),
  "item.new": el => { if (!requireSecretary()) return; openPanel(V.itemForm(ctx(), null, { meetingId: el.dataset.meeting || "" }), "New agenda item"); },
  "item.edit": el => { if (!requireSecretary()) return; const it = state.data.items[el.dataset.id]; ui.openItem = null; openPanel(V.itemForm(ctx(), it), `Edit ${it.ref}`); },
  "item.reopen": async el => { const it = state.data.items[el.dataset.id]; if (await run(() => saveDoc("items", it.id, { status: "OPEN", closedDate: "", evidence: "", closedBy: "" }, { baseRev: it.rev || 0 }), `${it.ref} reopened`)) audit("item", it.id, "Reopened", "", it.ref); },
  "item.archive": async el => { const it = state.data.items[el.dataset.id]; if (await confirmDialog({ title: `Archive ${it.ref}?`, body: "<p>The item leaves the working lists. It stays in the record and can be restored.</p>", confirm: "Archive" }) && await run(() => saveDoc("items", it.id, { archived: true }, { baseRev: it.rev || 0 }), `${it.ref} archived`)) { audit("item", it.id, "Archived", "", it.ref); closePanel(); } },
  "item.unarchive": async el => { const it = state.data.items[el.dataset.id]; if (await run(() => saveDoc("items", it.id, { archived: false }, { baseRev: it.rev || 0 }), `${it.ref} restored`)) audit("item", it.id, "Restored from archive", "", it.ref); },

  /* meetings */
  "meeting.new": () => { if (!requireSecretary()) return; openPanel(V.meetingForm(ctx(), null), "New meeting"); },
  "meeting.edit": el => openPanel(V.meetingForm(ctx(), state.data.meetings[el.dataset.id]), "Edit meeting"),
  "meeting.open": el => { ui.meetingId = el.dataset.id; ui.meetingTab = "agenda"; closePanel(); if (ui.route !== "meetings") location.hash = "meetings"; else render(); },
  "meeting.back": (el, e) => { e.preventDefault(); ui.meetingId = null; render(); },
  "meeting.tab": el => { ui.meetingTab = el.dataset.tab; render(); },
  "meeting.transition": el => transition(state.data.meetings[el.dataset.id], el.dataset.to),
  "agenda.add": async el => { const sel = document.getElementById("add-item"); if (!sel.value) return toast("Select an item to add."); await changeAgenda(el.dataset.id, a => a.includes(sel.value) ? a : [...a, sel.value], `Added ${state.data.items[sel.value]?.ref}`); },
  "agenda.bringAll": async el => { const m = state.data.meetings[el.dataset.id]; const add = Object.values(state.data.items).filter(i => D.isItemOpen(i) && !i.archived && !m.agenda.includes(i.id)).map(i => i.id); await changeAgenda(m.id, a => [...a, ...add.filter(x => !a.includes(x))], `${add.length} open items brought forward`); },
  "agenda.remove": async el => { const it = state.data.items[el.dataset.item]; const hasMin = state.data.minutes[`${el.dataset.id}__${it.id}`]; if (hasMin && !(await confirmDialog({ title: `Remove ${it.ref} from the agenda?`, body: "<p>Minutes already recorded for this item in this meeting stay in the history but will not appear in the circulated minutes.</p>", confirm: "Remove", tone: "danger" }))) return; await changeAgenda(el.dataset.id, a => a.filter(x => x !== it.id), `Removed ${it.ref}`); },
  "member.remove": async el => { const m = state.data.meetings[el.dataset.id]; if (await run(() => saveDoc("meetings", m.id, { members: m.members.filter(u => u !== el.dataset.user) }, { force: true }), "Member removed")) audit("meeting", m.id, "Removed signer", name(el.dataset.user), m.ref); },
  "member.add": async el => { const m = state.data.meetings[el.dataset.id]; const u = el.dataset.user; if (m.members.includes(u)) return; if (await run(() => saveDoc("meetings", m.id, { members: [...m.members, u] }, { force: true }), "Member added")) audit("meeting", m.id, "Added signer", name(u), m.ref); },

  /* signatures */
  "sig.sign": async el => { const m = state.data.meetings[el.dataset.id]; if (await confirmDialog({ title: `Sign minutes v${m.version}?`, body: `<p>You confirm that version ${m.version} of the minutes of <b>${esc(m.title)}</b> is accurate. Your name and the time are recorded.</p>`, confirm: `Sign v${m.version}` })) await run(() => writeSignature(m, "signed", "member"), `You signed v${m.version}`); },
  "sig.approve": async el => { const m = state.data.meetings[el.dataset.id]; if (await confirmDialog({ title: `Approve minutes v${m.version}?`, body: "<p>As Chairman you give final approval. The secretaries can then archive the minutes.</p>", confirm: "Approve" })) await run(() => writeSignature(m, "approved", "chairman"), "Minutes approved"); },
  "sig.correct": el => { const m = state.data.meetings[el.dataset.id]; openPanel(`${panelHead("Request a correction", `${esc(m.title)} · v${m.version}`)}<div class="panel-body"><form class="form" data-form="sig.correct" data-id="${esc(m.id)}" novalidate><div class="field wide"><label for="corr">What should change?<span class="req">*</span></label><textarea id="corr" name="corr" rows="5" required placeholder="Name the item reference and the wording to change"></textarea></div><div class="form-actions wide">${btn("Cancel", "layer.close")}${btn("Send correction request", null, { kind: "primary", type: "submit" })}</div></form></div>`, "Request a correction"); },

  /* actions */
  "action.status": () => {},

  /* roster */
  "roster.remove": async el => {
    const r = state.data.roster; const next = el.dataset.role === "chairman" ? { ...r, chairman: null } : { ...r, members: r.members.filter(u => u !== el.dataset.user) };
    if (await run(() => saveRoster(next), "Roster updated")) audit("roster", "roster", `Removed ${el.dataset.role}`, name(el.dataset.user), "Roster");
  },
  "roster.add": async el => {
    const role = document.getElementById("roster-role").value, u = el.dataset.user, r = state.data.roster;
    const next = role === "chairman" ? { ...r, chairman: u, members: (r.members || []).filter(x => x !== u) } : { ...r, members: [...new Set([...(r.members || []), u])], chairman: r.chairman === u ? null : r.chairman };
    if (await run(() => saveRoster(next), "Roster updated")) audit("roster", "roster", `Added ${role}`, name(u), "Roster");
  },

  /* data export (for IT handover) */
  "data.export": async () => {
    const dl = state.session.downloads; if (!dl) return toast("Downloads are not available in this view.", "error");
    const data = { exportedAt: new Date().toISOString(), schema: "wpc-hub/2", ...Object.fromEntries(["items", "meetings", "minutes", "actions", "audit"].map(k => [k, Object.values(state.data[k])])), signatures: state.data.sigs, roster: state.data.roster };
    try { await dl.save({ filename: `wpc-hub-export-${D.isoToday()}.json`, data: JSON.stringify(data, null, 2) }); } catch (e) { if (e?.code !== "dismissed" && e?.code !== "declined") toast("Export was not saved.", "error"); }
  },
  "data.exportCsv": async () => {
    const dl = state.session.downloads; if (!dl) return toast("Downloads are not available in this view.", "error");
    const c = ctx(); const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = ["ref", "title", "category", "sub", "dept", "owner", "status", "stage", "createdAt", "closedDate", "evidence", "request"];
    const rows = Object.values(state.data.items).map(it => cols.map(k => q(k === "stage" ? D.itemStage(it, c.d) : it[k])).join(","));
    try { await dl.save({ filename: `wpc-items-${D.isoToday()}.csv`, data: "﻿" + [cols.join(","), ...rows].join("\r\n") }); } catch (e) { if (e?.code !== "dismissed" && e?.code !== "declined") toast("Export was not saved.", "error"); }
  },
};

/* withdraw needs the reason before the dialog closes */
COMMANDS["item.withdraw"] = async el => {
  const it = state.data.items[el.dataset.id];
  let reason = "";
  const host = document.getElementById("dialog");
  const capture = () => { reason = host.querySelector("#withdraw-reason")?.value.trim() || reason; };
  host.addEventListener("input", capture);
  const ok = await confirmDialog({ title: `Withdraw ${it.ref}?`, body: `<p>The item is closed without implementation. Record the reason (required).</p><textarea id="withdraw-reason" rows="3" aria-label="Reason for withdrawal"></textarea>`, confirm: "Withdraw item", tone: "danger" });
  host.removeEventListener("input", capture);
  if (!ok) return;
  if (reason.length < 5) return toast("Enter a reason of at least 5 characters to withdraw the item.", "error");
  if (await run(() => saveDoc("items", it.id, { status: "WITHDRAWN", closedDate: D.isoToday(), evidence: reason, closedBy: state.session.myId }, { baseRev: it.rev || 0 }), `${it.ref} withdrawn`)) audit("item", it.id, "Withdrawn", reason, it.ref);
};

async function saveRoster(next) {
  const cur = state.data.roster;
  return saveDoc("config", "roster", { chairman: next.chairman || null, members: next.members || [] }, { create: !cur.rev, force: true });
}

async function changeAgenda(mid, fn, ok) {
  const m = state.data.meetings[mid];
  if (!D.canEditAgenda(m)) return toast("The agenda is locked at this stage.", "error");
  // re-read inside saveDoc is not enough for arrays: apply fn to the fresh copy
  return run(async () => {
    const snap = await state.session.db.doc(`meetings/${mid}`).get();
    const fresh = D.normalizeMeeting({ ...snap.data(), id: mid });
    const agenda = fn(fresh.agenda);
    await saveDoc("meetings", mid, { agenda }, { baseRev: fresh.rev || 0 });
    audit("meeting", mid, "Agenda changed", ok, m.ref);
  }, ok);
}

async function transition(m, to) {
  if (!requireSecretary()) return;
  const c = ctx();
  const problems = D.guardTransition(m, to, { minutes: state.data.minutes, items: state.data.items, sigDocs: state.data.sigs });
  if (problems.length) {
    openPanel(`${panelHead("This step cannot be completed yet")}<div class="panel-body">${msg("error", `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`)}${btn("Close", "layer.close")}</div>`, "Validation");
    return;
  }
  const labels = { agenda_issued: ["Issue the agenda?", "The agenda becomes read-only until you revise it.", "Issue agenda"], in_session: ["Start the meeting?", "Live minute-taking opens for all secretaries.", "Start meeting"], drafting: m.status === "circulated" ? ["Revise the minutes?", `Version ${m.version} is withdrawn from signature. You will circulate version ${m.version + 1} and every member signs again.`, "Revise minutes"] : ["End the meeting?", "The meeting is recorded as held. You can keep editing the minutes before circulating.", "End meeting"], circulated: [`Circulate minutes v${m.version + 1}?`, "The minutes are frozen as this version. Members see a signature request when they open WPC Hub. No email is sent.", "Circulate"], archived: ["Archive the approved minutes?", "The meeting record is locked. Agenda items keep their own status.", "Archive"], preparation: ["Revise the agenda?", "The agenda opens for changes again.", "Revise agenda"] };
  const [title, body, confirm] = labels[to];
  if (!(await confirmDialog({ title, body: `<p>${esc(body)}</p>`, confirm }))) return;
  const patch = { status: to };
  const at = new Date().toISOString();
  if (to === "drafting" && m.status === "in_session") patch.heldAt = at;
  if (to === "circulated") {
    const snap = D.buildSnapshot(m, { items: state.data.items, minutes: state.data.minutes, actions: state.data.actions }, at);
    Object.assign(patch, { version: snap.v, snapshot: snap, versions: [...m.versions, { v: snap.v, at, by: state.session.myId }], snapshots: { ...(m.snapshots || {}), [snap.v]: snap } });
  }
  if (to === "archived") patch.archivedAt = at;
  if (await run(() => saveDoc("meetings", m.id, patch, { baseRev: m.rev || 0 }), `${m.title}: ${D.MEETING_STATES[to].label}`)) {
    audit("meeting", m.id, `Status: ${D.MEETING_STATES[m.status].label} → ${D.MEETING_STATES[to].label}`, to === "circulated" ? `v${patch.version}` : "", m.ref);
  }
  void c;
}

/* ====================================================================== */
/* Forms                                                                 */
/* ====================================================================== */
const FORMS = {
  "item.create": async (form, v) => {
    const errors = D.validateItem(v);
    if (Object.keys(errors).length) return openPanel(V.itemForm(ctx(), null, { meetingId: form.dataset.meeting, errors, values: v }), "New agenda item");
    const dupes = D.findDuplicates({ ...v, id: "" }, Object.values(state.data.items));
    if (dupes.length && !form.dataset.dupeok) return openPanel(V.itemForm(ctx(), null, { meetingId: form.dataset.meeting, values: v, dupes }), "New agenda item");
    await run(async () => {
      const ref = await nextRef("item"); const id = newId();
      await saveDoc("items", id, { ...v, id, ref, status: "OPEN", archived: false, createdAt: D.isoToday(), createdBy: state.session.myId }, { create: true });
      audit("item", id, "Created", `${v.category} / ${v.sub}`, ref);
      const mid = form.dataset.meeting;
      if (mid) await changeAgenda(mid, a => [...a, id], `Added ${ref} to the agenda`);
      closePanel(); toast(`${ref} created`, "ok");
    });
  },
  "item.update": async (form, v) => {
    const it = state.data.items[form.dataset.id];
    const errors = D.validateItem(v);
    if (Object.keys(errors).length) return openPanel(V.itemForm(ctx(), it, { errors, values: v }), "Edit item");
    try {
      await saveDoc("items", it.id, v, { baseRev: +form.dataset.rev });
      const changed = ["title", "category", "sub", "dept", "owner", "request"].filter(k => (it[k] || "") !== v[k]);
      audit("item", it.id, "Edited", changed.join(", "), it.ref);
      toast(`${it.ref} saved`, "ok"); openItem(it.id);
    } catch (e) {
      if (e.code !== "conflict") return toast(errorMessage(e), "error");
      const ok = await confirmDialog({ title: "This item changed while you were editing", body: `<p>${esc(name(e.current.updatedBy))} saved a change at ${new Date(e.current.updatedAt).toLocaleTimeString("en-GB")}. Overwrite their version with yours, or cancel and review their changes first.</p>`, confirm: "Overwrite with mine", tone: "danger" });
      if (ok && await run(() => saveDoc("items", it.id, v, { force: true }), `${it.ref} saved`)) { audit("item", it.id, "Edited (overwrote a concurrent change)", "", it.ref); openItem(it.id); }
    }
  },
  "item.close": async (form, v) => {
    const it = state.data.items[form.dataset.id];
    const errors = D.validateClosure(v, it, Object.values(state.data.actions), D.isoToday());
    if (Object.keys(errors).length) {
      form.querySelectorAll(".err").forEach(n => n.remove());
      for (const [k, t] of Object.entries(errors)) { const fld = form.querySelector(`[name="${k}"]`)?.closest(".field"); if (fld) { fld.classList.add("has-error"); fld.insertAdjacentHTML("beforeend", `<div class="err">${esc(t)}</div>`); } else form.insertAdjacentHTML("afterbegin", `<div class="err" role="alert">${esc(t)}</div>`); }
      return;
    }
    if (await run(() => saveDoc("items", it.id, { status: "CLOSED", closedDate: v.closedDate, evidence: v.evidence, closedBy: state.session.myId }, { baseRev: it.rev || 0 }), `${it.ref} closed`)) audit("item", it.id, "Closed", v.evidence, it.ref);
  },
  "meeting.create": async (form, v) => {
    const errors = D.validateMeeting(v);
    if (Object.keys(errors).length) return openPanel(V.meetingForm(ctx(), null, { errors, values: v }), "New meeting");
    const dup = Object.values(state.data.meetings).find(m => m.date === v.date && m.status !== "archived");
    if (dup && !(await confirmDialog({ title: "A meeting already exists on this date", body: `<p>${esc(dup.title)} is on ${esc(v.date)}. Create another one anyway?</p>`, confirm: "Create anyway" }))) return;
    await run(async () => {
      const ref = await nextRef("meeting"); const id = newId();
      const agenda = v.bring ? Object.values(state.data.items).filter(i => D.isItemOpen(i) && !i.archived).map(i => i.id) : [];
      const members = v.roster ? [...(state.data.roster.members || [])] : [];
      await saveDoc("meetings", id, { id, ref, title: v.title, date: v.date, chairman: v.chairman || null, status: "preparation", version: 0, agenda, members, versions: [], createdAt: new Date().toISOString(), createdBy: state.session.myId }, { create: true });
      audit("meeting", id, "Created", `${agenda.length} items brought forward`, ref);
      closePanel(); ui.meetingId = id; ui.meetingTab = "agenda"; go("meetings"); toast(`${ref} created`, "ok");
    });
  },
  "meeting.update": async (form, v) => {
    const m = state.data.meetings[form.dataset.id];
    const errors = D.validateMeeting(v);
    if (Object.keys(errors).length) return openPanel(V.meetingForm(ctx(), m, { errors, values: v }), "Edit meeting");
    if (await run(() => saveDoc("meetings", m.id, { title: v.title, date: v.date, chairman: v.chairman || null }, { baseRev: +form.dataset.rev }), "Meeting saved")) { audit("meeting", m.id, "Edited details", "", m.ref); closePanel(); }
  },
  "action.create": async (form, v) => {
    const errBox = form.querySelector("[data-err]");
    const errors = D.validateAction(v, D.isoToday());
    if (Object.keys(errors).length) { errBox.textContent = Object.values(errors).join(" "); return; }
    errBox.textContent = "";
    const id = newId(); const it = state.data.items[form.dataset.item];
    if (await run(() => saveDoc("actions", id, { id, itemId: form.dataset.item, meetingId: form.dataset.meeting, text: v.text, owner: v.owner, due: v.due, status: "OPEN", createdAt: new Date().toISOString() }, { create: true }), "Action added")) {
      audit("action", id, "Created", `${v.text} · ${v.owner} · due ${v.due}`, it?.ref); form.reset(); deferred && render();
    }
  },
  "sig.correct": async (form, v) => {
    if (!v.corr || v.corr.length < 5) { form.querySelector(".field").classList.add("has-error"); return toast("Describe the correction you need.", "error"); }
    const m = state.data.meetings[form.dataset.id];
    const me = state.session.myId;
    const role = m.members.includes(me) && !D.sigFor(m, me, state.data.sigs) ? "member" : m.chairman === me ? "chairman" : "member";
    if (await run(() => writeSignature(m, "correction", role, v.corr), "Correction request sent to the secretaries")) closePanel();
  },
};

/* ---------- minutes: autosave with conflict detection ---------- */
const editBase = {}; // key|field -> value when editing started
async function saveMinute(el) {
  const key = el.dataset.minute, f = el.dataset.field, mine = el.value;
  const base = editBase[`${key}|${f}`] ?? (state.data.minutes[key]?.[f] || "");
  delete editBase[`${key}|${f}`];
  if (mine === base) return;
  const [mid, iid] = key.split("__");
  try {
    const ref = state.session.db.doc(`minutes/${key}`);
    const snap = await ref.get();
    const cur = snap.exists ? snap.data() : { meetingId: mid, itemId: iid };
    const theirs = cur[f] || "";
    const r = D.detectConflict(base, mine, theirs);
    let value = r.value;
    if (r.conflict) {
      const choice = await conflictDialog(name(cur.updatedBy), theirs, mine);
      if (choice === "theirs") { el.value = theirs; render(); return; }
      value = choice === "both" ? `${theirs}\n${mine}` : mine;
    }
    await ref.set({ ...cur, meetingId: mid, itemId: iid, [f]: value, rev: (cur.rev || 0) + 1, updatedBy: state.session.myId, updatedAt: new Date().toISOString() });
    audit("minutes", key, `Edited ${f === "decision" ? "recommendation / decision" : "discussion"}`, value.slice(0, 120), state.data.items[iid]?.ref);
  } catch (e) { toast(errorMessage(e), "error"); }
}
function conflictDialog(who, theirs, mine) {
  return new Promise(resolve => {
    const host = document.getElementById("dialog");
    host.innerHTML = `<div class="scrim"></div><div class="dialog wide" role="alertdialog" aria-modal="true" aria-labelledby="cf-t"><h2 id="cf-t">${esc(who)} changed this text while you were typing</h2>
      <div class="compare"><div><span class="lbl">Their version (saved)</span><p class="pre">${esc(theirs || "—")}</p></div><div><span class="lbl">Your version</span><p class="pre">${esc(mine || "—")}</p></div></div>
      <div class="dialog-actions"><button class="btn secondary" data-c="theirs">Keep theirs</button><button class="btn secondary" data-c="both">Keep both</button><button class="btn primary" data-c="mine">Use mine</button></div></div>`;
    host.querySelector('[data-c="both"]').focus();
    host.onclick = e => { const b = e.target.closest("[data-c]"); if (b) { host.innerHTML = ""; resolve(b.dataset.c); } };
  });
}

/* ---------- people pickers ---------- */
async function peopleSearch(input, menuId, exclude, action, extra = {}) {
  const menu = document.getElementById(menuId); const user = state.session.user;
  if (!menu || !user) return;
  let hits = []; try { hits = await user.search(input.value || ""); } catch (_) { /* search unavailable */ }
  hits = hits.filter(h => !exclude.includes(h.id));
  menu.innerHTML = "";
  if (!hits.length) { menu.hidden = !input.value; if (input.value) menu.innerHTML = `<div class="menu-empty">No matching people in your organisation.</div>`; return; }
  for (const h of hits) {
    names[h.id] = h.name;
    const b = document.createElement("button"); b.type = "button"; b.dataset.action = action; b.dataset.user = h.id;
    for (const [k, v] of Object.entries(extra)) b.dataset[k] = v;
    const img = document.createElement("img"); img.src = h.avatarUrl; img.alt = ""; const sp = document.createElement("span"); sp.textContent = h.name;
    b.append(img, sp); menu.appendChild(b);
  }
  menu.hidden = false;
}

/* ====================================================================== */
/* Event wiring (one delegated listener per event type)                  */
/* ====================================================================== */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  const nav = e.target.closest("#nav a");
  if (nav && nav.getAttribute("href") === location.hash) { e.preventDefault(); route(); return; }
  if (!el || el.disabled) return;
  const cmd = COMMANDS[el.dataset.action];
  if (!cmd) return;
  if (el.tagName === "SELECT" || el.tagName === "INPUT") return; // handled by change/input
  if (el.tagName === "A") e.preventDefault();
  cmd(el, e);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && panelOpen() && !document.getElementById("dialog").innerHTML) { closePanel(); ui.openItem = null; }
  if (e.key === "Enter" && e.target.matches("tr[data-action]")) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("change", async e => {
  const el = e.target;
  const a = el.dataset.action;
  if (a === "filter.items") { ui.itemFilter[el.dataset.key] = el.type === "checkbox" ? el.checked : el.value; ui.tables.items.page = 1; render(); }
  else if (a === "filter.actions") { ui.actionFilter[el.dataset.key] = el.type === "checkbox" ? el.checked : el.value; ui.tables.actions.page = 1; render(); }
  else if (a === "filter.audit") { ui.auditFilter[el.dataset.key] = el.value; ui.tables.audit.page = 1; render(); }
  else if (a === "table.size") { const t = ui.tables[el.dataset.table]; t.size = +el.value; t.page = 1; render(); }
  else if (a === "form.category") { const sub = el.form.querySelector('[name="sub"]'); sub.innerHTML = D.CATEGORIES[el.value].map(s => `<option>${esc(s)}</option>`).join(""); }
  else if (a === "action.status") {
    const act = state.data.actions[el.dataset.id]; const to = el.value;
    if (await run(() => saveDoc("actions", act.id, { status: to, doneDate: to === "DONE" ? D.isoToday() : "" }, { baseRev: act.rev || 0 }), `Action: ${D.ACTION_LABELS[to]}`)) audit("action", act.id, `Status: ${D.ACTION_LABELS[act.status]} → ${D.ACTION_LABELS[to]}`, act.text, state.data.items[act.itemId]?.ref);
    else el.value = act.status;
  }
});
let searchTimer;
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.action === "filter.items" && el.type === "search") { clearTimeout(searchTimer); searchTimer = setTimeout(() => { ui.itemFilter.q = el.value; ui.tables.items.page = 1; const pos = el.selectionStart; render(); const n = document.querySelector('input[data-key="q"]'); n?.focus(); n?.setSelectionRange(pos, pos); }, 200); }
  if (el.dataset.action === "filter.audit") { clearTimeout(searchTimer); searchTimer = setTimeout(() => { ui.auditFilter.q = el.value; ui.tables.audit.page = 1; const pos = el.selectionStart; render(); const n = document.querySelector('[data-action="filter.audit"][data-key="q"]'); n?.focus(); n?.setSelectionRange(pos, pos); }, 200); }
  if (el.dataset.action === "member.search") { const m = state.data.meetings[el.dataset.id]; peopleSearch(el, "member-menu", m.members, "member.add", { id: m.id }); }
  if (el.dataset.action === "roster.search") { const r = state.data.roster; peopleSearch(el, "roster-menu", [...(r.members || []), r.chairman].filter(Boolean), "roster.add"); }
});
document.addEventListener("focusin", e => {
  const el = e.target;
  if (el.dataset?.minute) { editBase[`${el.dataset.minute}|${el.dataset.field}`] = state.data.minutes[el.dataset.minute]?.[el.dataset.field] || ""; setPresence(el.dataset.minute); }
  if (el.dataset?.action === "member.search") { const m = state.data.meetings[el.dataset.id]; peopleSearch(el, "member-menu", m.members, "member.add", { id: m.id }); }
  if (el.dataset?.action === "roster.search") { const r = state.data.roster; peopleSearch(el, "roster-menu", [...(r.members || []), r.chairman].filter(Boolean), "roster.add"); }
});
document.addEventListener("focusout", e => {
  const el = e.target;
  if (el.dataset?.minute) { setPresence(null); saveMinute(el).finally(() => { if (deferred) setTimeout(render, 0); }); }
  else if (deferred) setTimeout(() => { if (!document.activeElement?.closest?.(".inline-form, .picker")) render(); }, 150);
  if (el.id === "member-q" || el.id === "roster-q") setTimeout(() => { document.querySelectorAll(".menu").forEach(m => { if (!m.contains(document.activeElement)) m.hidden = true; }); }, 200);
});
document.addEventListener("submit", e => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const handler = FORMS[form.dataset.form];
  if (!handler) return;
  const v = readForm(form);
  form.querySelectorAll("[type=checkbox]").forEach(cb => { v[cb.name] = cb.checked; });
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  Promise.resolve(handler(form, v)).finally(() => { if (submit && document.contains(submit)) submit.disabled = false; });
});
window.addEventListener("hashchange", route);

/* ---------- boot ---------- */
onChange(render);
route();
connect().catch(err => { console.error(err); state.session.ready = true; state.error = "nodb"; render(); });

/* Exposed for the end-to-end test harness only. */
window.__wpc = { state, ui, D };
