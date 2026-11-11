// Fictional example record for WPC Hub: six monthly meetings, their items, minutes, actions and signatures.
// Dates are computed from "today" so the example always looks current. No real people, positions or figures.
// Used by the demo (js/demo-runtime.js) and by tools that load the example into a new shared record.
(function (root) {
  const iso = d => d.toISOString().slice(0, 10);
  const shift = (today, days) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
  const monthName = s => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

  // [key, title, category, subcategory, department, responsible, request, positions, grade, budget, annual cost, submitted (days from today), effective (days)]
  const ITEMS = [
    ["i01", "Renewal of expatriate contract: Senior Reduction Engineer", "Expatriate contract renewal", "Renewal on same terms", "Potline", "HR Manager", "Potline asks to renew the contract of one expatriate Senior Reduction Engineer for 2 years. The role covers pot-control tuning and no qualified successor is ready yet. A successor plan is attached to the request.", 1, "Grade 12", "Budgeted", 42000, -160, 50],
    ["i02", "Two Process Technicians for the Casthouse shift pattern", "Manpower requirement", "New position (budgeted)", "Casthouse", "Casthouse Manager", "Two budgeted technician positions to cover the move from a 3-crew to a 4-crew shift pattern in the casting area.", 2, "Grade 8", "Budgeted", 18000, -158, -60],
    ["i03", "Job title change: Planner to Maintenance Planner", "Organisation development", "Job title change", "Maintenance", "OD Superintendent", "Align the job title with the approved job description. No change in grade, pay or reporting line.", null, "", "Not applicable", null, -155, -110],
    ["i04", "Scaffolding contractor for the shutdown, 12 workers", "New contractor request", "New contractor", "Maintenance", "Maintenance Manager", "Contractor manpower for the planned shutdown: 12 scaffolders for 3 months. Covered by the shutdown budget.", 12, "", "Budgeted", 54000, -128, -75],
    ["i05", "Replacement: Shift Supervisor, Carbon baking", "Manpower requirement", "Replacement", "Carbon", "Carbon Manager", "Replace a Shift Supervisor who retired. The position is in the approved structure.", 1, "Grade 10", "Budgeted", 21600, -126, -70],
    ["i06", "Move Quality Lab reporting line to Operations", "Organisation development", "Reporting line change", "Quality", "OD Superintendent", "Lab Supervisor to report to the Operations Manager instead of the Quality Manager, so sampling follows the production schedule.", null, "", "Not applicable", null, -124, -40],
    ["i07", "One Reliability Engineer, non-budgeted", "Manpower requirement", "New position (non-budgeted)", "Maintenance", "Maintenance Manager", "One non-budgeted Reliability Engineer to lead the critical-equipment programme. Cost to be funded from savings on contractor hours.", 1, "Grade 11", "Non-budgeted", 30000, -98, 20],
    ["i08", "Extension of canteen services contractor headcount", "New contractor request", "Change in contractor headcount", "HR", "HR Manager", "Increase the canteen contractor from 18 to 22 staff to cover the second dining hall.", 4, "", "Budgeted", 9600, -96, -45],
    ["i09", "Renewal of expatriate contract: Power Plant Specialist", "Expatriate contract renewal", "Renewal with changes", "Power Plant", "HR Manager", "Renew for 1 year instead of 2, with a training obligation for the national successor.", 1, "Grade 13", "Budgeted", 48000, -94, 10],
    ["i10", "New position in structure: Energy Efficiency Lead", "Organisation development", "New position in structure", "Power Plant", "OD Superintendent", "Create one position to own the energy efficiency roadmap across Power Plant and Potline.", 1, "Grade 12", "Non-budgeted", 36000, -92, 60],
    ["i11", "Three Operators for Potline, replacement of leavers", "Manpower requirement", "Replacement", "Potline", "Potline Manager", "Replace three operators who left in the last quarter. Positions are in the approved structure.", 3, "Grade 6", "Budgeted", 21600, -66, -20],
    ["i12", "Grade review: Laboratory Analysts", "Organisation development", "Grade review", "Quality", "OD Superintendent", "Review the grade of four Laboratory Analysts after the job evaluation exercise.", 4, "Grade 7", "Non-budgeted", 7200, -64, 30],
    ["i13", "IT service desk contractor, contract extension", "New contractor request", "Contract extension", "IT", "IT Manager", "Extend the service desk contract for 12 months with the same headcount of 5.", 5, "", "Budgeted", 33000, -62, -10],
    ["i14", "Transfer: Safety Advisor from Casthouse to Carbon", "Manpower requirement", "Transfer", "HSE", "HSE Manager", "Transfer one Safety Advisor to cover the new baking furnace. Casthouse cover is confirmed.", 1, "Grade 9", "Budgeted", null, -60, -15],
    ["i15", "Non-renewal: expatriate Procurement Specialist", "Expatriate contract renewal", "Non-renewal", "Supply Chain", "HR Manager", "The national successor is ready. Supply Chain asks not to renew and to confirm the successor in the role.", 1, "Grade 11", "Budgeted", null, -34, 40],
    ["i16", "Two Maintenance Planners for the new CMMS rollout", "Manpower requirement", "New position (budgeted)", "Maintenance", "Maintenance Manager", "Two budgeted planners to run work-order planning when the new maintenance system goes live.", 2, "Grade 9", "Budgeted", 26400, -33, 45],
    ["i17", "Finance: Cost Analyst, non-budgeted", "Manpower requirement", "New position (non-budgeted)", "Finance", "Finance Manager", "One Cost Analyst to support monthly manpower cost reporting to the committee.", 1, "Grade 9", "Non-budgeted", 14400, -32, 60],
    ["i18", "One Safety Officer for the Carbon area", "Manpower requirement", "New position (budgeted)", "Carbon", "Carbon Manager", "One budgeted Safety Officer to cover the new baking furnace shift.", 1, "Grade 9", "Budgeted", 15000, -12, 70],
    ["i19", "Renewal of expatriate contract: Casthouse Metallurgist", "Expatriate contract renewal", "Renewal on same terms", "Casthouse", "HR Manager", "Renew for 2 years. Alloy development work continues through next year and the successor is in year one of the development plan.", 1, "Grade 12", "Budgeted", 43200, -10, 80],
    ["i20", "Contractor for anode rodding shop, 8 workers", "New contractor request", "New contractor", "Carbon", "Carbon Manager", "Eight contractor workers for 6 months while the rodding shop upgrade is commissioned.", 8, "", "Non-budgeted", 28800, -9, 30],
    ["i21", "Job title change: HR Officer to HR Business Partner", "Organisation development", "Job title change", "HR", "OD Superintendent", "Align three job titles with the new HR operating model. No change in grade.", null, "", "Not applicable", null, -8, 30],
  ];
  // meeting key, days from today, status, [item key, discussion, outcome, positions approved, decision, [action text, responsible, due (days from today), status]...]
  const MEETINGS = [
    ["m1", -150, "archived", [
      ["i01", "The committee asked for the Omanisation successor plan before deciding.", "Deferred", null, "Deferred to the next meeting. Potline to present the successor plan.", [["Present the successor plan for the role", "Potline Manager", -125, "DONE"]]],
      ["i02", "Shift pattern change confirmed by Operations. Positions are in the budget.", "Approved", 2, "Approved: two Process Technicians.", [["Open the two vacancies and start recruitment", "HR Manager", -120, "DONE"]]],
      ["i03", "No objections.", "Approved", null, "Approved. Title to change from the first of next month.", [["Update the title in the HR system and issue the letter", "OD Superintendent", -130, "DONE"]]],
    ]],
    ["m2", -120, "archived", [
      ["i01", "Successor plan presented: a national engineer will be ready in 18 months.", "Approved with conditions", 1, "Approved: renew for 2 years, on condition that the successor plan is reviewed every 6 months.", [["Issue the renewal letter and update the contract record", "HR Manager", -95, "DONE"], ["Report successor progress to the committee", "Potline Manager", 55, "OPEN"]]],
      ["i04", "Shutdown scope and dates confirmed. Cost is inside the shutdown budget.", "Approved", 12, "Approved: 12 contractor scaffolders for 3 months.", [["Raise the contract with Supply Chain", "Maintenance Manager", -100, "DONE"]]],
      ["i05", "Position is in the structure. Internal candidates to be considered first.", "Approved", 1, "Approved: replacement, internal candidates first.", [["Advertise internally for two weeks", "HR Manager", -100, "DONE"]]],
      ["i06", "Quality raised a concern on the independence of the lab. More detail requested.", "Returned for clarification", null, "Returned to OD: show how lab independence is kept under the new line.", [["Prepare the independence note with Quality", "OD Superintendent", -95, "DONE"]]],
    ]],
    ["m3", -90, "archived", [
      ["i06", "Independence note accepted: results are released by Quality, scheduling by Operations.", "Approved", null, "Approved: reporting line moves to Operations.", [["Publish the updated organisation chart", "OD Superintendent", -70, "DONE"]]],
      ["i07", "Members discussed the funding. Finance asked for the savings to be confirmed first.", "Deferred", null, "Deferred. Maintenance and Finance to confirm the contractor-hour savings.", [["Confirm the savings figure with Finance", "Maintenance Manager", -65, "DONE"]]],
      ["i08", "Second dining hall opens next month. Cost is covered.", "Approved", 4, "Approved: contractor headcount from 18 to 22.", [["Amend the contract headcount", "HR Manager", -70, "DONE"]]],
      ["i09", "Members agreed a shorter renewal with a clear handover plan.", "Approved with conditions", 1, "Approved: renew for 1 year with a training obligation for the successor.", [["Issue the renewal with the training clause", "HR Manager", -60, "DONE"], ["Agree the handover plan with the specialist", "Power Plant Manager", 18, "IN_PROGRESS"]]],
      ["i10", "The position changes the approved structure and is not budgeted.", "Recommended to EXCO", 1, "Recommended to EXCO for approval of the new position.", [["Prepare the EXCO paper", "OD Superintendent", -50, "DONE"]]],
    ]],
    ["m4", -60, "archived", [
      ["i07", "Finance confirmed savings cover 80% of the cost in year one.", "Approved with conditions", 1, "Approved: one Reliability Engineer, to be reviewed after 12 months.", [["Start recruitment", "HR Manager", 12, "IN_PROGRESS"]]],
      ["i11", "Replacement of leavers, no change to the structure.", "Approved", 3, "Approved: three Operators.", [["Start recruitment for three Operators", "HR Manager", -35, "DONE"]]],
      ["i12", "Job evaluation results presented. Two of the four roles meet the higher grade.", "Approved with conditions", 2, "Approved for two analysts. The other two stay at the current grade.", [["Issue grade letters to the two analysts", "OD Superintendent", -30, "DONE"]]],
      ["i13", "Service levels have been met through the year.", "Approved", 5, "Approved: extend for 12 months, same headcount.", [["Extend the contract", "IT Manager", -40, "DONE"]]],
      ["i14", "Casthouse confirmed cover.", "Approved", 1, "Approved: transfer from the first of next month.", [["Issue the transfer letter", "HR Manager", -40, "DONE"]]],
    ]],
    ["m5", -28, "circulated", [
      ["i15", "The successor has completed the development plan.", "Approved", 1, "Approved: contract not renewed, successor confirmed in the role.", [["Notify the employee and plan the handover", "HR Manager", -6, "OPEN"]]],
      ["i16", "Go-live date confirmed. Positions are budgeted.", "Approved", 2, "Approved: two Maintenance Planners.", [["Open the two vacancies", "HR Manager", 10, "OPEN"]]],
      ["i17", "Members asked whether existing Finance staff can absorb the work.", "Rejected", 0, "Not approved. Finance to cover the reporting with the current team.", []],
      ["i10", "EXCO approved the position at its last meeting.", "Approved", 1, "Noted: EXCO approval received. OD to add the position to the structure.", [["Add the position to the structure and grade it", "OD Superintendent", -3, "OPEN"]]],
    ]],
    ["m6", 5, "agenda_issued", [["i18"], ["i19"], ["i20"], ["i21"], ["i01"]]],
  ];
  const CLOSED = { i02: [-70, "Both technicians joined. Vacancies closed in the HR system."], i03: [-128, "Title updated in the HR system, letter issued."], i04: [-20, "Contract completed at the end of the shutdown."], i05: [-55, "Internal candidate appointed."], i06: [-68, "Organisation chart published."], i08: [-66, "Contract amended."], i13: [-38, "Contract extension signed."], i14: [-36, "Transfer letter issued and effective."] };

  root.__WPC_SEED = function (today, opts) {
    opts = opts || {};
    const members = opts.members || [], chairman = opts.chairman || null, secretary = opts.secretary || "";
    const year = today.slice(0, 4), out = {}, itemById = {};
    ITEMS.forEach((r, n) => {
      const [k, title, category, sub, dept, owner, request, hc, grade, budgeted, cost, created, eff] = r;
      const it = { id: "ex" + k, ref: `WPC-${year}-${String(n + 1).padStart(3, "0")}`, title, category, sub, dept, owner, request, status: "OPEN", createdAt: shift(today, created), example: true, hcRequested: hc, grade, budgeted, annualCost: cost, effectiveDate: shift(today, eff), attachments: [] };
      if (CLOSED[k]) Object.assign(it, { status: "CLOSED", closedDate: shift(today, CLOSED[k][0]), evidence: CLOSED[k][1], closedBy: secretary });
      if (k === "i06") it.returned = true;
      itemById[k] = it; out["items/" + it.id] = it;
    });
    let actionN = 0;
    MEETINGS.forEach((r, n) => {
      const [k, off, status0, rows] = r;
      const status = status0 === "circulated" && !members.length ? "drafting" : status0;
      const date = shift(today, off), id = "ex" + k;
      const m = { id, ref: `M-${year}-${String(n + 1).padStart(2, "0")}`, title: `WPC Meeting, ${monthName(date)}`, date, time: "09:00", location: "Admin Building, Meeting Room 2", status, version: 0, agenda: rows.map(x => "ex" + x[0]), members: members.slice(), chairman, versions: [], attendance: {}, example: true };
      const done = status === "archived" || status === "circulated" || status === "drafting";
      if (done) { members.forEach((u, i) => { m.attendance[u] = (n + i) % 5 === 4 ? "Apology" : "Present"; }); if (chairman) m.attendance[chairman] = "Present"; }
      const snapItems = [];
      rows.forEach(([ik, discussion, outcome, hcApproved, decision, acts]) => {
        const it = itemById[ik];
        const mine = (acts || []).map(([text, owner, due, st]) => { const a = { id: "exa" + (++actionN), itemId: it.id, meetingId: id, text, owner, due: shift(today, due), status: st }; if (st === "DONE") a.doneDate = shift(today, due - 2); out["actions/" + a.id] = a; return a; });
        if (outcome) out[`minutes/${id}__${it.id}`] = { meetingId: id, itemId: it.id, discussion, outcome, hcApproved, decision, updatedAt: date + "T10:00:00Z", updatedBy: secretary, rev: 1 };
        snapItems.push({ id: it.id, ref: it.ref, title: it.title, category: it.category, sub: it.sub, dept: it.dept, owner: it.owner, request: it.request, annualCost: it.annualCost, hcRequested: it.hcRequested, grade: it.grade, budgeted: it.budgeted, effectiveDate: it.effectiveDate, outcome: outcome || "", hcApproved: hcApproved ?? null, discussion: discussion || "", decision: decision || "", actions: mine.map(a => ({ text: a.text, owner: a.owner, due: a.due })) });
      });
      if (status === "archived" || status === "circulated") {
        const at = shift(today, off + 2) + "T09:00:00Z";
        m.version = 1; m.versions = [{ v: 1, at, by: secretary }];
        m.snapshot = { v: 1, at, time: m.time, location: m.location, attendance: { ...m.attendance }, items: snapItems };
        m.snapshots = { 1: m.snapshot };
        if (status === "archived") m.archivedAt = shift(today, off + 9) + "T09:00:00Z";
        // Archived: everyone signed and the Chairman approved. Under review: the first member has not signed yet.
        members.forEach((u, i) => {
          if (status === "circulated" && (i === 0 || i === 3)) return;
          const sat = shift(today, off + 3 + (i % 3)) + "T08:30:00Z";
          const doc = out["signatures/" + u] = out["signatures/" + u] || {};
          doc[id] = { v: 1, status: "signed", role: "member", at: sat, comment: "", history: [{ v: 1, status: "signed", role: "member", at: sat, comment: "" }] };
        });
        if (chairman && status === "archived") {
          const cat = shift(today, off + 7) + "T11:00:00Z";
          const doc = out["signatures/" + chairman] = out["signatures/" + chairman] || {};
          doc[id + ":chair"] = { v: 1, status: "approved", role: "chairman", at: cat, comment: "", history: [{ v: 1, status: "approved", role: "chairman", at: cat, comment: "" }] };
        }
      }
      out["meetings/" + id] = m;
    });
    out["counters/refs"] = { ["item" + year]: ITEMS.length, ["meeting" + year]: MEETINGS.length };
    if (opts.requester) out["requests/" + opts.requester] = {
      r1: { title: "Two Crane Operators for the Casthouse despatch bay", category: "Manpower requirement", sub: "New position (budgeted)", dept: "Casthouse", owner: "Casthouse Manager", request: "Two budgeted Crane Operators for the second despatch bay, which opens next quarter.", hcRequested: 2, grade: "Grade 7", budgeted: "Budgeted", annualCost: 16800, effectiveDate: shift(today, 75), status: "submitted", submittedAt: shift(today, -2) + "T07:30:00Z", updatedAt: shift(today, -2) + "T07:30:00Z", example: true },
      r2: { title: "Extension of the insulation contractor, 6 workers", category: "New contractor request", sub: "Contract extension", dept: "Maintenance", owner: "Maintenance Manager", request: "Extend the insulation contract by 4 months to finish the duct work.", hcRequested: 6, grade: "", budgeted: "Budgeted", annualCost: 14400, effectiveDate: shift(today, 40), status: "submitted", submittedAt: shift(today, -1) + "T09:10:00Z", updatedAt: shift(today, -1) + "T09:10:00Z", example: true },
    };
    if (members.length || chairman) out["config/roster"] = { chairman, members: members.slice(), quorum: opts.quorum ?? null };
    return out;
  };
})(typeof window !== "undefined" ? window : globalThis);
