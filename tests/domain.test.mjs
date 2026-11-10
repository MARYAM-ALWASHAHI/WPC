// Unit tests for the domain layer. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as D from "../js/domain.js";

const meeting = (o = {}) => D.normalizeMeeting({ id: "m1", ref: "M-2026-01", status: "preparation", agenda: [], members: [], ...o });

test("legacy meeting statuses are normalised", () => {
  assert.equal(D.normalizeMeeting({ id: "a", status: "draft" }).status, "preparation");
  assert.equal(D.normalizeMeeting({ id: "a", status: "ready" }).status, "circulated");
  assert.deepEqual(D.normalizeMeeting({ id: "a" }).agenda, []);
});

test("meeting transitions follow the workflow and guards", () => {
  const ctx = { minutes: {}, items: { i1: { ref: "WPC-2026-001" } }, sigDocs: {} };
  assert.deepEqual(D.guardTransition(meeting(), "agenda_issued", ctx), ["Add at least one agenda item."]);
  assert.equal(D.guardTransition(meeting({ agenda: ["i1"] }), "agenda_issued", ctx).length, 0);
  assert.match(D.guardTransition(meeting(), "circulated", ctx)[0], /cannot move/);
  const drafting = meeting({ status: "drafting", agenda: ["i1"], members: [] });
  const p = D.guardTransition(drafting, "circulated", ctx);
  assert.ok(p.some(x => /member/.test(x)) && p.some(x => /WPC-2026-001/.test(x)));
  ctx.minutes["m1__i1"] = { decision: "Approved" };
  assert.equal(D.guardTransition({ ...drafting, members: ["u1"] }, "circulated", ctx).length, 0);
});

test("signature state is version-bound and separate from item status", () => {
  const m = meeting({ status: "circulated", version: 2, members: ["a", "b"], chairman: "c" });
  const sigs = { a: { m1: { v: 2, status: "signed" } }, b: { m1: { v: 1, status: "signed" } } };
  const s = D.signatureState(m, sigs);
  assert.equal(s.signed, 1); assert.equal(s.pending, 1); assert.equal(s.allSigned, false);
  assert.equal(D.meetingPhase(m, sigs).key, "signing");
  sigs.b.m1 = { v: 2, status: "signed" };
  assert.equal(D.meetingPhase(m, sigs).key, "awaiting_chair");
  sigs.c = { "m1:chair": { v: 2, status: "approved" } };
  assert.equal(D.meetingPhase(m, sigs).key, "approved");
  sigs.a.m1 = { v: 2, status: "correction", comment: "fix" };
  assert.equal(D.meetingPhase(m, sigs).key, "correction");
});

test("archive is blocked until approval", () => {
  const m = meeting({ status: "circulated", version: 1, members: ["a"], chairman: "c" });
  const ctx = { minutes: {}, items: {}, sigDocs: { a: { m1: { v: 1, status: "signed" } } } };
  assert.equal(D.guardTransition(m, "archived", ctx).length, 1);
  ctx.sigDocs.c = { "m1:chair": { v: 1, status: "approved" } };
  assert.equal(D.guardTransition(m, "archived", ctx).length, 0);
});

test("item stage is derived from meetings, minutes and actions", () => {
  const item = { id: "i1", status: "OPEN" };
  const ctx = { meetings: {}, minutes: {}, actions: {} };
  assert.equal(D.itemStage(item, ctx), "Submitted");
  ctx.meetings.m1 = meeting({ agenda: ["i1"], date: "2026-11-11" });
  assert.equal(D.itemStage(item, ctx), "Scheduled");
  ctx.minutes["m1__i1"] = { discussion: "x" };
  assert.equal(D.itemStage(item, ctx), "Under discussion");
  ctx.minutes["m1__i1"].decision = "Approved";
  assert.equal(D.itemStage(item, ctx), "Decided");
  ctx.actions.a1 = { itemId: "i1", status: "OPEN" };
  assert.equal(D.itemStage(item, ctx), "In follow-up");
  assert.equal(D.itemStage({ ...item, status: "CLOSED" }, ctx), "Closed");
});

test("references never reuse a number", () => {
  assert.equal(D.nextRefNumber("item", 2026, 5, ["WPC-2026-003"]), 6);
  assert.equal(D.nextRefNumber("item", 2026, 2, ["WPC-2026-009", "WPC-2025-050"]), 10);
  assert.equal(D.formatRef("item", 2026, 7), "WPC-2026-007");
  assert.equal(D.formatRef("meeting", 2026, 3), "M-2026-03");
});

test("duplicate detection flags similar open items in the same category", () => {
  const items = [
    { id: "a", status: "OPEN", category: "Expatriate contract renewal", title: "(Example) Renewal of expatriate contract: Senior Reduction Engineer" },
    { id: "b", status: "CLOSED", category: "Expatriate contract renewal", title: "Renewal of expatriate contract: Senior Reduction Engineer" },
    { id: "c", status: "OPEN", category: "Manpower requirement", title: "Senior Reduction Engineer renewal" },
  ];
  const d = D.findDuplicates({ category: "Expatriate contract renewal", title: "Renewal of contract for Senior Reduction Engineer" }, items);
  assert.deepEqual(d.map(x => x.item.id), ["a"]);
  assert.equal(D.findDuplicates({ category: "Expatriate contract renewal", title: "Lab chemist renewal" }, items).length, 0);
});

test("validation rejects incomplete records", () => {
  assert.deepEqual(Object.keys(D.validateItem({})).sort(), ["category", "dept", "owner", "request", "title"]);
  assert.ok(D.validateItem({ title: "Valid title", category: "Other", sub: "Wrong", dept: "HR", owner: "HR", request: "Long enough request" }).sub);
  assert.deepEqual(D.validateItem({ title: "Valid title", category: "Other", sub: "Other", dept: "HR", owner: "HR", request: "Long enough request" }), {});
  assert.ok(D.validateAction({ text: "Do it", owner: "HR", due: "2026-01-01" }, "2026-11-10").due);
  assert.deepEqual(D.validateAction({ text: "Do it", owner: "HR", due: "2026-12-01" }, "2026-11-10"), {});
  const closure = D.validateClosure({ closedDate: "2026-12-31", evidence: "short" }, { id: "i1" }, [{ itemId: "i1", status: "OPEN" }], "2026-11-10");
  assert.ok(closure.closedDate && closure.evidence && closure.actions);
});

test("three-way conflict detection", () => {
  assert.deepEqual(D.detectConflict("a", "b", "a"), { conflict: false, value: "b" });
  assert.deepEqual(D.detectConflict("a", "a", "c"), { conflict: false, value: "c" });
  assert.deepEqual(D.detectConflict("a", "x", "x"), { conflict: false, value: "x" });
  assert.equal(D.detectConflict("a", "b", "c").conflict, true);
});

test("sorting and pagination", () => {
  const rows = [{ r: "WPC-2026-010" }, { r: "WPC-2026-002" }, { r: null }, { r: "WPC-2026-001" }];
  assert.deepEqual(D.sortRows(rows, "r").map(x => x.r), ["WPC-2026-001", "WPC-2026-002", "WPC-2026-010", null]);
  assert.deepEqual(D.sortRows(rows, "r", "desc").map(x => x.r), ["WPC-2026-010", "WPC-2026-002", "WPC-2026-001", null]);
  const p = D.paginate(Array.from({ length: 23 }, (_, i) => i), 3, 10);
  assert.deepEqual([p.page, p.pages, p.from, p.to, p.rows.length], [3, 3, 21, 23, 3]);
  assert.equal(D.paginate([], 5, 10).page, 1);
});

test("snapshot and diff capture what members sign", () => {
  const m = meeting({ status: "drafting", agenda: ["i1"], version: 1 });
  const ctx = { items: { i1: { id: "i1", ref: "WPC-2026-001", title: "T", category: "Other", dept: "HR" } }, minutes: { m1__i1: { decision: "A" } }, actions: { a: { itemId: "i1", meetingId: "m1", text: "Do", status: "OPEN" }, b: { itemId: "i1", meetingId: "m1", text: "No", status: "CANCELLED" } } };
  const s2 = D.buildSnapshot(m, ctx, "t");
  assert.equal(s2.v, 2); assert.equal(s2.items[0].actions.length, 1);
  const s1 = { ...s2, items: [{ ...s2.items[0], decision: "B" }] };
  assert.deepEqual(D.diffSnapshots(s1, s2).map(d => d.field), ["decision"]);
});

test("roles map share level and roster", () => {
  const roster = { chairman: "c", members: ["m"] };
  assert.equal(D.roleOf("x", true, roster), "Secretary");
  assert.equal(D.roleOf("c", false, roster), "Chairman");
  assert.equal(D.roleOf("m", false, roster), "Member");
  assert.equal(D.roleOf("z", false, roster), "Viewer");
});

test("overdue uses calendar dates", () => {
  assert.equal(D.isOverdue({ status: "OPEN", due: "2026-11-09" }, "2026-11-10"), true);
  assert.equal(D.isOverdue({ status: "DONE", due: "2026-11-09" }, "2026-11-10"), false);
  assert.equal(D.isOverdue({ status: "IN_PROGRESS", due: "2026-11-10" }, "2026-11-10"), false);
  assert.equal(D.daysBetween("2026-11-05", "2026-11-10"), 5);
});

test("a person who is both member and Chairman keeps two separate entries", () => {
  const m = meeting({ status: "circulated", version: 1, members: ["u"], chairman: "u" });
  const sigs = { u: { m1: { v: 1, status: "signed" }, "m1:chair": { v: 1, status: "approved" } } };
  assert.equal(D.meetingPhase(m, sigs).key, "approved");
  assert.equal(D.sigKey("m1", "chairman"), "m1:chair");
});
