/**
 * WPC Hub — data layer.
 * Wraps the shared document store: live subscriptions, the single state object,
 * audited writes, optimistic-concurrency checks and the reference counter.
 */
import { normalizeMeeting, formatRef, nextRefNumber, isoToday, sigKey } from "./domain.js";

export const COLLECTIONS = ["items", "meetings", "minutes", "actions", "signatures", "audit", "config"];

export const state = {
  data: { items: {}, meetings: {}, minutes: {}, actions: {}, sigs: {}, audit: {}, roster: { members: [], chairman: null } },
  loaded: Object.fromEntries(COLLECTIONS.map(c => [c, false])),
  session: { ready: false, db: null, user: null, room: null, downloads: null, me: null, myId: null, isEditor: false },
  presence: {},           // peerId -> { user, editing }
  loadSlow: false,
  error: null,
};

const listeners = new Set();
export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));
let scheduled = false;
export function notify() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; listeners.forEach(fn => fn()); });
}

/* ---------- boot ---------- */
export async function connect() {
  const c = window.claude;
  if (!c || typeof c.use !== "function") { state.session.ready = true; state.error = "standalone"; notify(); return; }
  const [db, user, room, downloads] = await Promise.all(["db", "user", "room", "downloads"].map(n => c.use(n).catch(() => null)));
  Object.assign(state.session, { db, user, room, downloads });
  if (user) {
    const me = await user.me();
    state.session.me = me; state.session.myId = me.id; state.session.isEditor = !!(await user.canEdit());
  }
  state.session.ready = true;
  if (!db) { state.error = "nodb"; notify(); return; }
  const timer = setTimeout(() => { state.loadSlow = true; notify(); }, 10000);
  const done = key => { state.loaded[key] = true; if (Object.values(state.loaded).every(Boolean)) { clearTimeout(timer); state.loadSlow = false; } };
  const sub = (col, apply) => db.collection(col).onSnapshot(
    snap => { apply(snap.docs); if (!snap.metadata.fromCache) done(col); notify(); },
    err => { done(col); if (err.code !== "revoked") state.error = "partial"; notify(); });
  const byId = (docs, map = x => x) => Object.fromEntries(docs.map(d => [d.id, map({ ...d.data(), id: d.data().id || d.id })]));
  sub("items", docs => { state.data.items = byId(docs); });
  sub("meetings", docs => { state.data.meetings = byId(docs, normalizeMeeting); });
  sub("minutes", docs => { state.data.minutes = Object.fromEntries(docs.map(d => [d.id, { ...d.data() }])); });
  sub("actions", docs => { state.data.actions = byId(docs); });
  sub("signatures", docs => { state.data.sigs = Object.fromEntries(docs.map(d => [d.id, { ...d.data() }])); });
  sub("audit", docs => { state.data.audit = Object.fromEntries(docs.map(d => [d.id, { ...d.data() }])); });
  sub("config", docs => { const r = docs.find(d => d.id === "roster"); state.data.roster = r ? { members: [], chairman: null, ...r.data() } : { members: [], chairman: null }; });
  if (room) {
    room.onPeers(change => {
      const p = {};
      for (const peer of change.peers || []) {
        if (peer.isMe || peer.kind !== "viewer" || !peer.presence?.editing) continue;
        p[peer.peer] = { user: peer.by || peer.presence.user || null, editing: String(peer.presence.editing) };
      }
      state.presence = p; notify();
    }, () => {});
  }
  notify();
}

/** Tell the other open views which minute block this person is typing in. Presence only, nothing persists. */
export function setPresence(editing) {
  try { state.session.room?.presence({ user: state.session.myId, editing: editing || null }); } catch (_) { /* presence is optional */ }
}

/* ---------- writes ---------- */
export class WriteError extends Error { constructor(code, message) { super(message); this.code = code; } }
const db = () => { if (!state.session.db) throw new WriteError("unavailable", "The shared record is not connected."); return state.session.db; };
const now = () => new Date().toISOString();
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);

/** Append one audit event. Failures never block the business write that caused them. */
export async function audit(entity, entityId, action, detail = "", ref = "") {
  try {
    const id = `${Date.now().toString(36)}-${newId()}`;
    await db().doc(`audit/${id}`).set({ at: now(), by: state.session.myId, entity, entityId, ref, action, detail: String(detail).slice(0, 500) });
  } catch (_) { /* audit is best effort */ }
}

/** Retry once on a transient platform error. */
async function withRetry(fn) {
  try { return await fn(); }
  catch (e) {
    if (e?.code === "unavailable") { await new Promise(r => setTimeout(r, 300 + Math.random() * 500)); return fn(); }
    throw e;
  }
}

/**
 * Optimistic-concurrency update: re-reads the document, refuses if its revision moved since `baseRev`
 * (unless force), then writes with rev+1 and stamps who changed it.
 */
export async function saveDoc(col, id, next, { baseRev, force = false, create = false } = {}) {
  return withRetry(async () => {
    const ref = db().doc(`${col}/${id}`);
    const snap = await ref.get();
    const cur = snap.exists ? snap.data() : null;
    if (!create && !cur) throw new WriteError("not_found", "This record no longer exists. It may have been removed by another secretary.");
    if (create && cur) throw new WriteError("duplicate", "A record with this id already exists.");
    if (!force && baseRev != null && cur && (cur.rev || 0) !== baseRev) {
      throw Object.assign(new WriteError("conflict", "Another secretary changed this record while you were editing."), { current: cur });
    }
    const body = { ...(cur || {}), ...next, rev: (cur?.rev || 0) + 1, updatedAt: now(), updatedBy: state.session.myId };
    await ref.set(body);
    return body;
  });
}

/** Unique, never-reused reference using a short lease on the counter document. */
export async function nextRef(kind) {
  const year = new Date().getFullYear();
  const key = `${kind}${year}`;
  const ref = db().doc("counters/refs");
  const existing = kind === "item" ? Object.values(state.data.items).map(x => x.ref) : Object.values(state.data.meetings).map(x => x.ref);
  for (let i = 0; i < 6; i++) {
    let lease = { acquired: true };
    try { lease = await ref.acquire({ holder: `${state.session.myId || "anon"}:${newId()}`, ttlMs: 4000 }); } catch (_) { /* older runtime: proceed */ }
    if (lease.acquired) {
      const snap = await ref.get();
      const d = snap.exists ? { ...snap.data() } : {};
      const n = nextRefNumber(kind, year, d[key], existing);
      await ref.set({ ...d, [key]: n });
      return formatRef(kind, year, n);
    }
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
  }
  throw new WriteError("busy", "Another secretary is creating a record. Try again in a moment.");
}

/** Signature entries live in the signer's own document; nobody else can write it. */
export async function writeSignature(meeting, status, role, comment = "") {
  const uid = state.session.myId;
  if (!uid) throw new WriteError("invalid_argument", "Sign in to sign the minutes.");
  return withRetry(async () => {
    const ref = db().doc(`signatures/${uid}`);
    const snap = await ref.get();
    const d = snap.exists ? { ...snap.data() } : {};
    const key = sigKey(meeting.id, role);
    const prev = d[key] || {};
    const at = now();
    const event = { v: meeting.version, status, role, at, comment };
    d[key] = { v: meeting.version, status, role, at, comment, history: [...(prev.history || []), event].slice(-30) };
    await ref.set(d);
  });
}

export const today = () => isoToday();

/** Human message for any write failure. */
export function errorMessage(e) {
  switch (e?.code) {
    case "invalid_argument": return "You do not have permission for this change. Secretaries need Editor access; members need Contributor access.";
    case "quota_exceeded": return "The record has reached its storage limit. Archive or export old data.";
    case "conflict": case "not_found": case "busy": case "duplicate": return e.message;
    case "revoked": return "Your access to this record was changed. Reload the page.";
    default: return "The change was not saved. Check your connection and try again.";
  }
}
