# WPC Hub (prototype) — source

Live prototype: https://claude.ai/artifact/FDj8nmD2CoVFfa6XskrMkY (private; share from its Share menu).

## Files
- index.html — page shell (published body)
- css/app.css — tokens, base, shell, components, views, responsive
- js/domain.js — pure business rules: workflow, guards, signatures, stages, validation, duplicates, conflicts, sort/paginate
- js/store.js — shared database adapter: subscriptions, audited writes, optimistic concurrency, reference counter, signatures
- js/ui.js — reusable components: data table, fields, badges, panels, dialogs, toasts, icons
- js/views.js — one render function per module
- js/app.js — routing, UI state, commands, forms, minutes autosave + conflict dialog
- tests/domain.test.mjs — unit tests (20): `node --test tests/domain.test.mjs`
- tests/e2e.cjs + tests/mock-runtime.js — end-to-end, responsive, accessibility (needs Playwright + axe-core)
- js/demo-seed.js — builds the fictional example record relative to today's date (seed.json is a snapshot of its output)
- js/vendor/jspdf.umd.min.js — jsPDF 2.5.1 (MIT), shipped with the app so PDFs work without an outside script host
- tests/seed.fixture.json — the small fixed record the end-to-end tests run against

## Data collections
items, meetings, minutes (id = meetingId__itemId), actions, signatures (one doc per person), requests (one doc per requester, written only by them), intake (secretary decisions on requests), audit, config/roster (incl. quorum), counters/refs. File attachments use the assets capability (secretaries only; PDF, images, text).

## Demo on GitHub Pages
When the page runs on `*.github.io` (or with `?demo` in the URL), `js/demo-runtime.js` replaces the claude.ai runtime:
fictional seed data, saved only in the visitor's browser, nothing shared between people, no file uploads.
A banner says so and lets the presenter switch role (Secretary, Chairman, Member, Requester, Viewer) or reset the data.
On claude.ai the file does nothing. Real committee work uses the claude.ai version.

## v4 (Nov 2026)
- New light design (Plus Jakarta Sans headings, Inter text).
- Minutes: one agenda item at a time with a numbered rail, or "All items".
- Present mode: one request per screen for the committee; meeting pack and single request sheet as PDF (jsPDF 2.5.1 from cdnjs, loaded on demand).
- "Email members": prepares the email with the accepted items for the viewer's email app or clipboard. WPC Hub does not send email.
- Attendance sign-in link (e.g. DocuSign) per meeting, https only. WPC Hub links to it; it does not read signatures from DocuSign.
- Reports page (js/reports.js): period summary, decision log, meetings, follow-up by responsible, activity log; Word and CSV downloads.

## v5 (Nov 2026)
- Each agenda item opens a full **Request file**: department, category, responsible, positions, grade, budget, annual cost, effective date, full request text, documents, earlier decisions and open follow-up from earlier meetings.
- **Record the decision** is now four numbered steps: discussion, outcome, decision wording, follow-up actions.
- **What happens now** box under the meeting stepper: numbered steps for the person's role at the current stage, and who the meeting is waiting on.
- Minutes and the report download as **PDF** (fixes the blank screen phones show for the Word file). Word stays as a secondary button.
- Minutes PDF and Word now include cost, responsible and subcategory per item.
- **Email members → Open in Outlook** opens a filled Outlook on the web compose window. Nothing is sent automatically; the user presses Send.

## v6 (Nov 2026): redesign and review against the requirements
- **One light look with a navy frame.** The app no longer follows the device's dark mode, so every laptop, phone and projector shows the same screen.
- **Committee home**: next meeting with its agenda, a role-aware "Needs your attention" list, key figures, where every item stands, items by category, decisions per meeting, outcomes, departments, charter measures, latest decisions and follow-up due next.
- **Meetings**: cards for meetings in progress, a meeting header with the date, stage and primary action, and a step track.
- **Present**: opens on a cover with the agenda and totals; each item shows the request, key facts, earlier decisions, open follow-up and the committee decision. Works on a phone.
- **Minutes on screen**: "Draft minutes" / "Minutes vN" opens the formal document inside the app (summary of decisions, one section per item, signatures). PDF and Word are downloads from there.
- **Phone layout**: bottom tab bar and a slide-in menu.
- **Example record**: six monthly meetings, 21 items, minutes, actions and signatures, dated relative to today. Demo people are role names, not real people.
- jsPDF is shipped with the app instead of loaded from a CDN.
