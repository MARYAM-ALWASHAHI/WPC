// In-memory stand-in for the claude.ai runtime (db, user, room, downloads), used only by the E2E harness.
(function () {
  const seed = window.__SEED || {};
  const store = JSON.parse(JSON.stringify(seed));
  const subs = [];
  const ME = window.__ME || { id: "u_sec", name: "Test Secretary", editor: true };
  const PEOPLE = [{ id: "u_sec", name: "Test Secretary" }, { id: "u_mem", name: "Member One" }];
  const snap = col => {
    const docs = Object.entries(store).filter(([k]) => k.split("/").length === 2 && k.startsWith(col + "/"))
      .map(([k, v]) => ({ id: k.split("/")[1], exists: true, data: () => JSON.parse(JSON.stringify(v)) }));
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const fire = () => setTimeout(() => subs.forEach(([c, f]) => f(snap(c))), 0);
  const doc = path => ({
    get: async () => ({ exists: !!store[path], data: () => store[path] && JSON.parse(JSON.stringify(store[path])) }),
    set: async d => { if (window.__FAIL_WRITES) throw { code: "invalid_argument", message: "denied" }; store[path] = JSON.parse(JSON.stringify(d)); fire(); },
    update: async d => { if (!store[path]) throw { code: "invalid_argument" }; store[path] = { ...store[path], ...d }; fire(); },
    delete: async () => { delete store[path]; fire(); },
    acquire: async () => ({ acquired: true }),
  });
  const db = { doc, collection: c => ({ onSnapshot: (f) => { subs.push([c, f]); setTimeout(() => f(snap(c)), 5); return () => {}; }, doc: id => doc(c + "/" + id) }) };
  const user = {
    me: async () => ({ id: ME.id, name: ME.name, avatarUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", isOwner: true, canEdit: ME.editor }),
    canEdit: async () => ME.editor,
    profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: (PEOPLE.find(p => p.id === i) || {}).name || "" }])),
    search: async q => PEOPLE.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).map(p => ({ ...p, avatarUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" })),
  };
  const downloads = { save: async req => { window.__DOWNLOADS = (window.__DOWNLOADS || []).concat([req.filename]); return { status: "saved" }; } };
  window.__mockStore = store;
  window.__mockFire = fire;
  window.claude = { use: async n => ({ db, user, downloads }[n] || null) };
})();
