// End-to-end lifecycle test: item -> agenda -> live minutes -> circulation -> correction -> v2 -> signatures -> Chairman approval -> archive -> item closure.
// Run: node tests/e2e.cjs  (serves this folder on :8765 and drives Chromium with the mock runtime)
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const AXE = path.resolve(__dirname, "../../e2e/node_modules/axe-core/axe.min.js");
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "seed.fixture.json"), "utf8"));
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/test.html") {
    const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>window.__SEED=${JSON.stringify(seed)}</script><script src="tests/mock-runtime.js"></script>${page}</body></html>`);
  }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

const results = [];
const step = async (name, fn) => {
  const t = Date.now();
  try { await fn(); results.push(["PASS", name, Date.now() - t]); }
  catch (e) { results.push(["FAIL", name, Date.now() - t, e.message.split("\n")[0]]); throw e; }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const JSPDF = path.resolve(__dirname, "../../jspdf-local/node_modules/jspdf/dist/jspdf.umd.min.js");
  await page.route("https://cdnjs.cloudflare.com/ajax/libs/jspdf/**", r => r.fulfill({ path: JSPDF, contentType: "text/javascript" }));
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const confirm = async () => { await page.click("#dialog .btn.primary, #dialog .btn.danger"); await page.waitForTimeout(150); };
  const toastText = async () => (await page.locator("#toasts .toast").last().textContent()) || "";
  const fill = async (sel, v) => { await page.fill(sel, v); };

  try {
    await step("Dashboard loads with live figures", async () => {
      await page.goto("http://localhost:8765/test.html#dashboard");
      await page.waitForSelector(".kpi-strip");
      const v = await page.$$eval(".kpi-v", n => n.map(x => x.textContent));
      expect(v[0] === "4" && v[1] === "1" && v[2] === "1", `KPIs were ${v}`);
    });
    await step("Dashboard drill-down opens the filtered item list", async () => {
      await page.click('.count-link[aria-label^="1 Organisation development"]');
      await page.waitForSelector("#tbl-items");
      const rows = await page.$$eval("#tbl-items tbody tr", n => n.length);
      expect(rows === 1, `expected 1 row, got ${rows}`);
    });
    await step("Item list sorts and paginates", async () => {
      await page.click('[data-action="filter.clear"]');
      await page.click('.th-sort[data-key="ref"]');
      const first = await page.$eval("#tbl-items tbody tr td .ref", n => n.textContent);
      expect(first === "WPC-2026-001", `first after asc sort: ${first}`);
      await page.selectOption('[data-action="table.size"]', "10");
      expect((await page.textContent(".pager")).includes("1–5 of 5"), "pager text");
    });
    await step("New item: validation blocks an empty form", async () => {
      await page.click('[data-action="item.new"]');
      await page.fill("#title", "");
      await page.click('.panel [type="submit"]');
      await page.waitForSelector(".panel .field.has-error");
      const n = await page.$$eval(".panel .field.has-error", x => x.length);
      expect(n >= 3, `expected errors, got ${n}`);
    });
    await step("New item: duplicate warning, then create anyway with a unique reference", async () => {
      await fill("#title", "Renewal of expatriate contract for Senior Reduction Engineer");
      await page.selectOption("#category", "Expatriate contract renewal");
      await page.selectOption("#dept", "Potline");
      await fill("#owner", "HR Manager");
      await fill("#request", "Second renewal request for the same role, 1 year.");
      await page.click('.panel [type="submit"]');
      await page.waitForSelector(".panel .msg.warn");
      expect((await page.textContent(".panel .msg.warn")).includes("WPC-2026-001"), "duplicate names WPC-2026-001");
      await page.click('.panel [type="submit"]');
      await page.waitForTimeout(300);
      expect((await toastText()).includes("WPC-2026-006"), `toast: ${await toastText()}`);
    });
    await step("Roster: add committee member", async () => {
      await page.goto("http://localhost:8765/test.html#admin"); await page.waitForSelector("#roster-q");
      await page.focus("#roster-q"); await page.fill("#roster-q", "Test");
      await page.waitForSelector('#roster-menu button[data-user="u_sec"]');
      await page.click('#roster-menu button[data-user="u_sec"]');
      await page.waitForTimeout(250);
      expect((await page.textContent(".card")).includes("Test Secretary"), "roster shows member");
    });
    await step("New meeting brings forward all open items and roster signers", async () => {
      await page.goto("http://localhost:8765/test.html#meetings"); await page.waitForSelector('[data-action="meeting.new"]');
      await page.click('[data-action="meeting.new"]');
      await fill("#title", "WPC Meeting, December"); await fill("#date", "2026-12-09");
      await page.selectOption("#chairman", "u_sec");
      await page.click('.panel [type="submit"]');
      await page.waitForSelector(".stepper");
      expect(await page.locator(".agenda-rail .rail-item").count() === 5 && await page.locator(".minute").count() === 1, "one-item-at-a-time view with a 5-item rail");
      await page.click('.rail-item >> nth=2'); expect((await page.textContent(".agenda-focus .num-badge")).trim() === "3", "rail selects item 3");
      await page.click('[data-action="agenda.step"][data-dir="1"]'); expect((await page.textContent(".agenda-focus .num-badge")).trim() === "4", "next goes to item 4");
      await page.click('[data-action="agenda.mode"][data-mode="all"]');
      const n = await page.$$eval(".minute", x => x.length);
      expect(n === 5, `expected 5 agenda items, got ${n}`);
    });
    await step("Workflow: issue agenda, start meeting", async () => {
      await page.click('[data-to="agenda_issued"]'); await confirm();
      await page.click('[data-to="in_session"]'); await confirm();
      await page.waitForSelector("textarea[data-minute]");
      expect((await page.textContent(".stepper li.current")).includes("In session"), "stepper at In session");
    });
    await step("Live minutes autosave on leaving the field", async () => {
      const count = await page.locator('textarea[data-field="decision"]').count();
      for (let i = 0; i < count; i++) { const b = page.locator('textarea[data-field="decision"]').nth(i); await b.click(); await b.fill(`Decision ${i + 1}: recommended.`); await page.click("h1"); await page.waitForTimeout(120); }
      await page.waitForTimeout(300);
      const saved = await page.evaluate(() => Object.values(window.__mockStore).filter(x => x && x.decision && x.decision.startsWith("Decision")).length);
      expect(saved === count, `saved ${saved} of ${count}`);
    });
    await step("Structured outcome and positions approved are saved per item", async () => {
      const n = await page.locator('select[data-action="minute.outcome"]').count();
      for (let i = 0; i < n; i++) { await page.locator('select[data-action="minute.outcome"]').nth(i).selectOption(i === 1 ? "Deferred" : "Approved"); await page.waitForTimeout(150); }
      const hc = page.locator('input[data-action="minute.hc"]').first(); await hc.fill("1"); await page.click("h1"); await page.waitForTimeout(250);
      const got = await page.evaluate(() => Object.values(window.__mockStore).filter(x => x && x.meetingId && x.outcome && x.decision && x.decision.startsWith("Decision")).map(x => x.outcome));
      expect(got.length === n && got.includes("Deferred"), `outcomes ${got}`);
      expect(await page.evaluate(() => Object.values(window.__mockStore).some(x => x && x.hcApproved === 1 && x.decision?.startsWith("Decision"))), "hcApproved saved");
    });
    await step("Attendance is recorded and quorum shows only when set", async () => {
      await page.click('[data-tab="attendance"]');
      await page.waitForSelector('select[data-action="attendance.set"]');
      expect((await page.textContent(".tabpanel, main")).includes("Quorum not set"), "no assumed quorum");
      await page.locator('select[data-action="attendance.set"]').first().selectOption("Present"); await page.waitForTimeout(250);
      const att = await page.evaluate(() => Object.values(window.__mockStore).find(v => v && v.title === "WPC Meeting, December").attendance);
      expect(Object.values(att || {}).includes("Present"), `attendance ${JSON.stringify(att)}`);
      await page.click('[data-tab="agenda"]');
    });
    await step("Concurrent edit is detected and offers keep theirs / both / mine", async () => {
      const box = page.locator('textarea[data-field="discussion"]').first();
      await box.click();
      const key = await box.getAttribute("data-minute");
      await page.evaluate(k => { const d = window.__mockStore["minutes/" + k] || {}; window.__mockStore["minutes/" + k] = { ...d, discussion: "Typed by another secretary", rev: (d.rev || 0) + 1, updatedBy: "u_mem" }; }, key);
      await box.fill("My own notes");
      await page.click("h1");
      await page.waitForSelector("#dialog .compare");
      await page.click('#dialog [data-c="both"]'); await page.waitForTimeout(250);
      const v = await page.evaluate(k => window.__mockStore["minutes/" + k].discussion, key);
      expect(v === "Typed by another secretary\nMy own notes", `merged value: ${v}`);
    });
    await step("Action validation rejects a past due date, then accepts a valid one", async () => {
      const form = page.locator('form[data-form="action.create"]').first();
      await form.locator('[name="text"]').fill("Issue renewal letter");
      await form.locator('[name="owner"]').fill("HR Manager");
      await form.locator('[name="due"]').fill("2020-01-01");
      await form.locator('[type="submit"]').click();
      expect((await form.locator("[data-err]").textContent()).includes("past"), "past date error");
      await form.locator('[name="due"]').fill("2027-01-15");
      await form.locator('[type="submit"]').click(); await page.waitForTimeout(300);
      expect((await toastText()).includes("Action added"), "action added");
    });
    await step("End meeting; circulation guard requires a signer", async () => {
      await page.click('[data-to="drafting"]'); await confirm();
      await page.evaluate(() => { const m = Object.entries(window.__mockStore).find(([k, v]) => k.startsWith("meetings/") && v.title === "WPC Meeting, December"); m[1].members = []; window.__mockFire(); });
      await page.waitForTimeout(100);
      await page.click('[data-to="circulated"]');
      await page.waitForSelector(".panel .msg.error");
      expect((await page.textContent(".panel .msg.error")).includes("member"), "guard message");
      await page.click('.panel [data-action="layer.close"]');
    });
    await step("Add signer and circulate v1 (frozen snapshot)", async () => {
      await page.click('[data-tab="signatures"]');
      await page.focus("#member-q"); await page.fill("#member-q", "Test");
      await page.waitForSelector('#member-menu button[data-user="u_sec"]'); await page.click('#member-menu button[data-user="u_sec"]');
      await page.waitForTimeout(250);
      await page.click('[data-to="circulated"]'); await confirm();
      await page.click('[data-tab="agenda"]');
      await page.waitForSelector(".minutes-doc");
      expect((await page.textContent(".minutes-doc")).includes("Version 1"), "v1 doc");
      expect((await page.textContent(".minutes-doc")).includes("Deferred"), "outcome in minutes document");
    });
    await step("Present mode shows one request per screen; meeting pack PDF downloads", async () => {
      await page.click('[data-action="present.open"]'); await page.waitForSelector(".present .pr-title");
      const t1 = await page.textContent(".pr-title"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
      expect(t1 !== await page.textContent(".pr-title"), "arrow moves to the next item");
      await page.click('.present [data-action="pdf.pack"]'); await page.waitForTimeout(1500);
      const f = await page.evaluate(() => window.__DOWNLOADS || []);
      expect(f.some(x => x.endsWith("-meeting-pack.pdf")), `downloads ${f}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      expect(!(await page.locator(".present").count()), "Escape closes the presentation");
    });
    await step("Minutes download as a Word document", async () => {
      await page.click('[data-action="minutes.view"]'); await page.waitForSelector(".docview .minutes-doc"); await page.click('.docview [data-action="minutes.download"]'); await page.waitForTimeout(200);
      const f = await page.evaluate(() => window.__DOWNLOADS || []);
      expect(f.some(x => x.endsWith(".doc")), `downloads ${f}`);
      await page.click('[data-action="doc.close"]'); expect(!(await page.locator(".docview").count()), "viewer closes");
    });
    await step("Member requests a correction; secretary revises to v2", async () => {
      await page.click('[data-action="sig.correct"]');
      await fill("#corr", "Item 1: decision should state 2 years.");
      await page.click('.panel [type="submit"]'); await page.waitForTimeout(250);
      await page.waitForSelector(".msg.error");
      await page.click('.msg.error [data-to="drafting"]'); await confirm();
      await page.click('[data-to="circulated"]'); await confirm();
      await page.waitForSelector(".minutes-doc");
      expect((await page.textContent(".mhero")).includes("v2"), "now v2");
    });
    await step("Member signs v2; Chairman approves; secretary archives", async () => {
      await page.click('[data-action="sig.sign"]'); await confirm(); await page.waitForTimeout(200);
      await page.waitForSelector('[data-action="sig.approve"]');
      await page.click('[data-action="sig.approve"]'); await confirm(); await page.waitForTimeout(200);
      await page.click('[data-to="archived"]'); await confirm(); await page.waitForTimeout(200);
      expect((await page.textContent(".stepper li.current")).includes("Archived"), "archived");
      expect((await page.textContent(".msg.ok")).includes("locked"), "locked banner");
    });
    await step("Signed minutes do not close the item; closure needs actions done and evidence", async () => {
      await page.goto("http://localhost:8765/test.html#items"); await page.waitForSelector("#tbl-items");
      await page.click('#tbl-items tbody tr:has-text("WPC-2026-001")');
      await page.waitForSelector('.panel form[data-form="item.close"]');
      expect((await page.textContent(".panel .obj-status")).includes("In follow-up"), "item still open, in follow-up");
      await page.fill('.panel [name="evidence"]', "Renewal letter HR/2026/123 issued");
      await page.click('.panel form[data-form="item.close"] [type="submit"]');
      await page.waitForSelector(".panel .err");
      expect((await page.textContent(".panel form[data-form='item.close']")).includes("still open"), "blocked by open actions");
      const nSel = await page.locator(".panel select.inline-select").count();
      for (let i = 0; i < nSel; i++) { await page.locator(".panel select.inline-select").nth(i).selectOption("DONE"); await page.waitForTimeout(250); }
      await page.waitForTimeout(400);
      await page.fill('.panel [name="evidence"]', "Renewal letter HR/2026/123 issued");
      await page.click('.panel form[data-form="item.close"] [type="submit"]'); await page.waitForTimeout(400);
      expect((await page.textContent(".panel .obj-status")).includes("Closed"), "closed");
    });
    await step("Secretary attaches a PDF to an item; unsupported types are refused with advice", async () => {
      const inp = page.locator('.panel input[data-action="doc.upload"]').first();
      await inp.setInputFiles({ name: "Potline presentation.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
      await page.waitForTimeout(400);
      expect((await page.textContent(".panel .docs")).includes("Potline presentation.pdf"), "doc listed");
      await page.locator('.panel input[data-action="doc.upload"]').first().setInputFiles({ name: "slides.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: Buffer.from("x") });
      await page.waitForTimeout(300);
      expect((await toastText()).includes("PDF"), `toast ${await toastText()}`);
    });
    await step("Audit trail records the lifecycle", async () => {
      await page.goto("http://localhost:8765/test.html#records"); await page.waitForSelector("#tbl-audit");
      const txt = await page.textContent("#tbl-audit");
      for (const w of ["Closed", "Status:", "Signed minutes v2", "Chairman approved v2", "Requested correction on v1"]) expect(txt.includes(w) || (await page.evaluate(() => document.body.innerText)).includes(w), `audit missing ${w}`);
    });
    await step("Reports page summarises the period and downloads Word and CSV", async () => {
      await page.goto("http://localhost:8765/test.html#reports"); await page.waitForSelector(".report-kpis");
      expect((await page.textContent("main")).includes("Decision log"), "decision log shown");
      await page.click('[data-action="report.word"]'); await page.click('[data-action="report.csv"][data-kind="audit"]'); await page.waitForTimeout(200);
      const f = await page.evaluate(() => window.__DOWNLOADS || []);
      expect(f.some(x => /^wpc-report-.*\.doc$/.test(x)) && f.some(x => /^wpc-audit-.*\.csv$/.test(x)), `downloads ${f}`);
    });
    await step("Email to members is prepared for the email app (no email is sent)", async () => {
      await page.goto("http://localhost:8765/test.html#meetings"); await page.waitForSelector("#tbl-meetings");
      await page.click('#tbl-meetings tbody tr:has-text("November")'); await page.waitForSelector('[data-action="email.members"]');
      await page.click('[data-action="email.members"]'); await page.waitForSelector("#em-body");
      const body = await page.inputValue("#em-body"); const href = await page.getAttribute("#em-open", "href");
      expect(body.includes("WPC-2026-002") && href.startsWith("mailto:"), "email lists the agenda items and opens via mailto");
      await page.keyboard.press("Escape");
    });
    await step("Attendance sign-in link must be https and shows on the Attendance tab", async () => {
      await page.click('[data-action="meeting.edit"]'); await page.waitForSelector("#attendanceLink");
      await page.fill("#attendanceLink", "javascript:alert(1)"); await page.click('.panel [type="submit"]'); await page.waitForTimeout(200);
      expect(await page.locator(".panel .field.has-error #attendanceLink").count() === 1, "non-https link rejected");
      await page.fill("#attendanceLink", "https://demo.docusign.net/signing/example"); await page.click('.panel [type="submit"]'); await page.waitForTimeout(300);
      await page.click('[data-tab="attendance"]'); await page.waitForSelector(".sign-in-link a");
      expect((await page.getAttribute(".sign-in-link a", "href")).startsWith("https://demo.docusign.net"), "link shown");
    });
    await step("Export hands a JSON file to the viewer", async () => {
      await page.goto("http://localhost:8765/test.html#admin"); await page.waitForSelector('[data-action="data.export"]');
      await page.click('[data-action="data.export"]'); await page.click('[data-action="data.exportCsv"]'); await page.waitForTimeout(150);
      const f = (await page.evaluate(() => window.__DOWNLOADS || [])).slice(-2);
      expect(f.length === 2 && f[0].endsWith(".json") && f[1].endsWith(".csv"), `downloads ${f}`);
    });
    await step("Refused write shows a permission message and changes nothing", async () => {
      await page.goto("http://localhost:8765/test.html#items"); await page.waitForSelector("#tbl-items");
      await page.evaluate(() => { window.__FAIL_WRITES = true; });
      await page.click('[data-action="item.new"]');
      await fill("#title", "Grade review for lab supervisors"); await page.selectOption("#category", "Organisation development");
      await page.selectOption("#sub", "Grade review"); await fill("#owner", "OD"); await fill("#request", "Review grades of lab supervisor roles.");
      await page.click('.panel [type="submit"]'); await page.waitForTimeout(300);
      expect((await toastText()).includes("permission"), `toast ${await toastText()}`);
      await page.evaluate(() => { window.__FAIL_WRITES = false; });
      await page.keyboard.press("Escape");
    });
    await step("Secretary accepts a department request into a referenced item", async () => {
      await page.goto("http://localhost:8765/test.html#requests"); await page.waitForSelector("#tbl-requests");
      await page.click('[data-action="request.accept"]');
      await page.waitForSelector('.panel form[data-form="item.create"]');
      expect(await page.inputValue(".panel #hcRequested") === "1", "facts carried over");
      await page.click('.panel [type="submit"]'); await page.waitForTimeout(250);
      if (await page.locator(".panel .msg.warn").count()) { await page.click('.panel [type="submit"]'); await page.waitForTimeout(250); }
      expect(/WPC-2026-00\d/.test(await toastText()), `toast ${await toastText()}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      expect(await page.evaluate(() => Object.values(window.__mockStore).some(v => v && v.requestKey === "u_mem:r1")), "item linked to request");
      await page.waitForTimeout(200);
      expect((await page.textContent("#tbl-requests")).includes("Accepted"), "status Accepted");
    });
    await step("Requester (Contributor, not on roster) submits a request and sees only own requests", async () => {
      const p2 = await browser.newPage({ viewport: { width: 1360, height: 900 } });
      p2.on("pageerror", e => errors.push(e.message));
      await p2.addInitScript(() => { window.__ME = { id: "u_req", name: "Dept Requester", editor: false, write: true }; });
      await p2.goto("http://localhost:8765/test.html#requests"); await p2.waitForSelector('[data-action="request.new"]');
      expect((await p2.textContent(".u-role")).includes("Requester"), "role Requester");
      expect(!(await p2.textContent("main")).includes("Safety Officer"), "cannot see others' requests");
      await p2.click('[data-action="request.new"]');
      const scroll = await p2.evaluate(() => { const pn = document.querySelector(".panel"); pn.scrollTop = 1e6; const r = document.querySelector('.panel [type="submit"]').getBoundingClientRect(); return { oy: getComputedStyle(pn).overflowY, visible: r.bottom <= innerHeight && r.top >= 0 }; });
      expect(/auto|scroll/.test(scroll.oy) && scroll.visible, `submit button not reachable: ${JSON.stringify(scroll)}`);
      await p2.fill("#title", "Two lab analysts for night shift"); await p2.selectOption("#dept", "Quality"); await p2.fill("#owner", "Quality Manager");
      await p2.fill("#request", "Two analysts for the new night shift sampling."); await p2.fill("#hcRequested", "2");
      await p2.click('.panel [type="submit"]'); await p2.waitForTimeout(300);
      const r = await p2.evaluate(() => window.__mockStore["requests/u_req"]);
      expect(r && Object.values(r)[0].hcRequested === 2, `stored ${JSON.stringify(r)}`);
      await p2.close();
    });

    /* responsive + accessibility */
    for (const [w, h, route] of [[390, 844, "dashboard"], [390, 844, "items"], [390, 844, "meetings"], [390, 844, "requests"], [390, 844, "reports"], [820, 1100, "dashboard"]]) {
      await step(`No horizontal page scroll at ${w}px on ${route}`, async () => {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`http://localhost:8765/test.html#${route}`); await page.waitForTimeout(400);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(sw <= w, `scrollWidth ${sw} > ${w}`);
      });
    }
    await page.setViewportSize({ width: 1360, height: 900 });
    for (const route of ["dashboard", "items", "meetings", "requests", "review", "records", "reports", "admin"]) {
      await step(`Accessibility (axe, WCAG 2 AA) on ${route}`, async () => {
        await page.goto(`http://localhost:8765/test.html#${route}`); await page.waitForTimeout(400);
        if (route === "meetings") { await page.click('[data-action="meeting.open"] >> nth=0').catch(() => {}); await page.waitForTimeout(200); }
        await page.addScriptTag({ path: AXE });
        const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes[0].target}`));
        expect(!r.length, r.join("; "));
      });
    }
    await step("Performance: dashboard renders 300 items under 300 ms", async () => {
      await page.goto("http://localhost:8765/test.html#dashboard"); await page.waitForSelector(".kpi-strip");
      const ms = await page.evaluate(async () => {
        const s = window.__mockStore; for (let i = 0; i < 300; i++) s[`items/p${i}`] = { id: `p${i}`, ref: `WPC-2026-${500 + i}`, title: `Load test item ${i}`, category: "Other", sub: "Other", dept: "HR", owner: "HR", request: "x", status: i % 3 ? "OPEN" : "CLOSED" };
        const t = performance.now(); window.__mockFire(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => requestAnimationFrame(r)); return performance.now() - t;
      });
      expect(ms < 300, `${ms.toFixed(0)} ms`);
      global.perfMs = ms;
    });
    results[results.length - 1][3] = `${global.perfMs.toFixed(0)} ms`;
    if (process.env.SHOTS) {
      const shots = [["dashboard", 1360, 900, "light"], ["meetings", 1360, 1000, "light", true], ["items", 1360, 800, "dark"], ["dashboard", 390, 844, "light"]];
      for (const [r, w, h, scheme, openFirst] of shots) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`http://localhost:8765/test.html#${r}`); await page.waitForTimeout(400);
        if (openFirst) { await page.click('#tbl-meetings tbody tr:has-text("November")'); await page.waitForTimeout(300); }
        await page.screenshot({ path: path.join(ROOT, `shot-${r}-${w}-${scheme}.png`) });
      }
    }
  } catch (e) {
    await page.screenshot({ path: path.join(ROOT, "shot-fail.png") }).catch(() => {});
    console.log("DEBUG signatures:", JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__mockStore).filter(([k]) => k.startsWith("signatures/")))).catch(() => null)));
  }
  if (errors.length) results.push(["FAIL", "No console or page errors", 0, errors.slice(0, 3).join(" | ")]);
  else results.push(["PASS", "No console or page errors", 0]);
  for (const r of results) console.log(`${r[0]}  ${r[1]}${r[3] ? `  — ${r[3]}` : ""}`);
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${results.filter(r => r[0] === "FAIL").length} failed`);
  fs.writeFileSync(path.join(ROOT, "tests/e2e-results.json"), JSON.stringify(results, null, 1));
  await browser.close(); server.close();
})();
