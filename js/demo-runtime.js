// Demo mode for hosting outside claude.ai (GitHub Pages, or any URL with ?demo).
// It stands in for the claude.ai runtime so the page can be shown without a backend:
// fictional seed data, kept only in this browser (localStorage), no sharing between people,
// no file uploads and no live presence. On claude.ai this file does nothing.
(function () {
  const isDemo = /github\.io$/.test(location.hostname) || /[?&]demo\b/.test(location.search);
  if (!isDemo || window.claude) return;

  const KEY = "wpc-hub-demo-v1", ROLE_KEY = "wpc-hub-demo-role";
  const PEOPLE = [
    { id: "u_sec", email: "demo.secretary@example.com", name: "Demo Secretary" },
    { id: "u_chair", email: "demo.chairman@example.com", name: "Demo Chairman" },
    { id: "u_mem", email: "demo.member@example.com", name: "Demo Member" },
    { id: "u_req", email: "demo.requester@example.com", name: "Demo Requester (Carbon)" },
    { id: "u_view", email: "demo.viewer@example.com", name: "Demo Viewer" },
  ];
  const ROLES = {
    Secretary: { id: "u_sec", editor: true, write: true },
    Chairman: { id: "u_chair", editor: false, write: true },
    Member: { id: "u_mem", editor: false, write: true },
    Requester: { id: "u_req", editor: false, write: true },
    Viewer: { id: "u_view", editor: false, write: false },
  };
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private window: demo still works until reload */ } },
    del: k => { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const roleName = ROLES[ls.get(ROLE_KEY)] ? ls.get(ROLE_KEY) : "Secretary";
  const ME = { ...ROLES[roleName], name: PEOPLE.find(p => p.id === ROLES[roleName].id).name };
  const clone = x => JSON.parse(JSON.stringify(x));

  let store = null;
  const subs = [];
  const save = () => ls.set(KEY, JSON.stringify(store));
  const load = async () => {
    if (store) return store;
    const saved = ls.get(KEY);
    if (saved) { try { store = JSON.parse(saved); return store; } catch (_) { /* fall through to seed */ } }
    let seed = {};
    try { seed = await (await fetch("seed.json", { cache: "no-store" })).json(); } catch (_) {}
    seed["config/roster"] = seed["config/roster"] || { chairman: "u_chair", members: ["u_mem"], quorum: null };
    store = seed; save(); return store;
  };
  const snap = col => {
    const docs = Object.entries(store).filter(([k]) => k.split("/").length === 2 && k.startsWith(col + "/"))
      .map(([k, v]) => ({ id: k.split("/")[1], exists: true, data: () => clone(v) }));
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const fire = () => { save(); setTimeout(() => subs.forEach(([c, f]) => f(snap(c))), 0); };
  const denied = () => { throw { code: "permission_denied", message: "Not allowed for this demo role" }; };
  const canWritePath = path => {
    if (ME.editor) return !path.startsWith("requests/") || path === "requests/" + ME.id;
    if (path.startsWith("signatures/")) return path === "signatures/" + ME.id;
    if (path.startsWith("requests/")) return ME.write && path === "requests/" + ME.id;
    return false;
  };
  const doc = path => ({
    get: async () => { await load(); return { exists: !!store[path], data: () => store[path] && clone(store[path]) }; },
    set: async d => { await load(); if (!canWritePath(path)) denied(); store[path] = clone(d); fire(); },
    update: async d => { await load(); if (!canWritePath(path)) denied(); if (!store[path]) throw { code: "not_found" }; store[path] = { ...store[path], ...clone(d) }; fire(); },
    delete: async () => { await load(); if (!canWritePath(path)) denied(); delete store[path]; fire(); },
    acquire: async () => ({ acquired: true }),
  });
  const db = {
    doc,
    collection: c => ({
      onSnapshot: f => { subs.push([c, f]); load().then(() => f(snap(c))); return () => {}; },
      doc: id => doc(c + "/" + id),
    }),
  };
  const avatar = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="14" fill="#5b7083"/></svg>');
  const user = {
    me: async () => ({ id: ME.id, name: ME.name, avatarUrl: avatar, isOwner: ME.editor, canEdit: ME.editor }),
    canEdit: async () => ME.editor,
    can: name => (name === "data.write" ? ME.write : null),
    profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: (PEOPLE.find(p => p.id === i) || {}).name || "", email: (PEOPLE.find(p => p.id === i) || {}).email || null }])),
    search: async q => PEOPLE.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).map(p => ({ ...p, avatarUrl: avatar })),
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return { status: "saved" };
    },
  };
  window.__WPC_DEMO = true;
  window.claude = { use: async n => ({ db, user, downloads }[n] || null) };

  // Demo banner: says plainly what this is, and lets the presenter switch role or reset the data.
  const bar = () => {
    const el = document.createElement("div");
    el.className = "demo-bar";
    el.setAttribute("role", "note");
    el.innerHTML = `<b>Demo</b><span>Fictional data, saved only in this browser. Nothing is shared with other people.</span>
      <label>View as <select aria-label="Demo role">${Object.keys(ROLES).map(r => `<option ${r === roleName ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      <button type="button">Reset demo data</button>`;
    el.querySelector("select").addEventListener("change", e => { ls.set(ROLE_KEY, e.target.value); location.reload(); });
    el.querySelector("button").addEventListener("click", () => { ls.del(KEY); location.reload(); });
    document.body.prepend(el);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bar); else bar();
})();
