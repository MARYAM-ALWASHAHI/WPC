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
- tests/domain.test.mjs — unit tests (18): `node --test tests/domain.test.mjs`
- tests/e2e.cjs + tests/mock-runtime.js — end-to-end, responsive, accessibility (needs Playwright + axe-core)
- seed.json — the fictional example records

## Data collections
items, meetings, minutes (id = meetingId__itemId), actions, signatures (one doc per person), requests (one doc per requester, written only by them), intake (secretary decisions on requests), audit, config/roster (incl. quorum), counters/refs. File attachments use the assets capability (secretaries only; PDF, images, text).
