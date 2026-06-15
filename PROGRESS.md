# PharmaPOS — Implementation Progress

Living changelog of feature work on the multi-tenant pharmacy ERP + customer-facing web store. Each completed item lists: what changed, files touched, schema changes, and how to verify. Updated as milestones land.

The full milestone plan lives in [.claude/plans/stop-wrong-entry-while-parsed-wave.md](.claude/plans/stop-wrong-entry-while-parsed-wave.md).

---

## ✅ Done

### DRAP search-by-name (any brand) + on-demand fetch + superadmin bulk importer (2026-06-04)

Only RIGIX resolved before (it was cached via reg-no `011248`); brand/name lookups said "no match". Root cause: the DRAP brand typeahead was called as POST (empty) — it's a **GET** (`productView.php?search=<term>&_type=brand name` → `{results:[{id:regNo,text:brand}]}`). Fixed, so any brand now resolves.

**Connector** ([server/drap.ts](server/drap.ts)): added `getText()` GET helper + `searchDrapBrand(term)` returning lightweight `{drapRegNo, brand}` candidates. Replaced `searchDrap` with `searchDrapCandidates` (one fast request, no per-item detail). `getDrapProduct(regNo)` still does detail+upsert on pick.

**On-demand by name** ([server/index.ts](server/index.ts), [src/pages/Medicines.tsx](src/pages/Medicines.tsx), [src/lib/backend.ts](src/lib/backend.ts)): `GET /api/drap/search?brand=` returns candidates. Add-Medicine "Find product" now: catalog-first → if empty, **"Fetching from DRAP…"** spinner → brand candidates list → pick → full detail fetched + cached forever. Brand names (non-numeric) trigger DRAP (previously only reg-no did). POS scan of an unknown GTIN with a parsed product name → toasts "Found on DRAP: X — add it in Medicines". Verified: `panadol` → 18 candidates; pick → loads + caches.

**Superadmin bulk importer** ([server/drapImport.ts](server/drapImport.ts), [prisma/schema.prisma](prisma/schema.prisma) `DrapImportJob`, [src/pages/SuperAdmin.tsx](src/pages/SuperAdmin.tsx)): resumable, rate-limited worker (one DRAP request per ~1.2s) that walks 3-char brand prefixes (a–z,0–9), dedupes reg-nos against `MasterProduct`, and fetches+upserts new ones into the shared catalog. Routes `POST/GET /api/admin/drap/import/{status,start,pause,resume}` are **`requireRole('superadmin')`** (pharmacies get 403). SuperAdmin card shows live progress (% · imported · discovered · failed) with Resume/Pause/Start-fresh; resumes on server boot. Verified: ran ~14s → imported 6 products (MasterProduct 2→8), 0 failures; owner → 403.

Note: DRAP has tens of thousands of products and a "not for bulk use" disclaimer — the importer is long-running, rate-limited, abortable, and lands data in the shared `MasterProduct` catalog all tenants read.

### Smart medicine entry — scan GS1/QR → central catalog → DRAP fallback (2026-06-04)

Scanning a pharma pack now identifies the product and auto-fills batch/expiry/MRP; first-time medicines pull their master from a shared cross-pharmacy catalog, backed by DRAP. Plan: [.claude/plans/now-the-barcode-and-encapsulated-pony.md](.claude/plans/now-the-barcode-and-encapsulated-pony.md).

**Part A — GS1 / FBR QR parsing** ([src/lib/gs1.ts](src/lib/gs1.ts) + [gs1.test.ts](src/lib/gs1.test.ts))
- `parseScannedCode()` decodes GS1 AIs (01 GTIN, 10 batch, 11 mfg, 17 expiry, 21 serial) with a date-validated boundary heuristic for separator-less batches (so `BAF176` isn't split at its internal "17"), plus best-effort FBR-tail (name/pack/MRP). Never throws. `gtinMatches` (EAN-13 ↔ GTIN-14), `toDateInputValue`. 8 unit checks pass via `npx tsx src/lib/gs1.test.ts` (test files excluded from `tsconfig.app.json`).
- POS ([src/pages/POS.tsx](src/pages/POS.tsx)): `handleBarcodeLookup` → exact-match → GTIN match (`findByGtin`) → catalog/DRAP hint → substring. `handleMedicineSelect(…, preferBatchNumber)` **auto-selects the exact scanned batch** (overrides FEFO; strict-FEFO warns + holds; expired/missing → toast + FEFO).
- Add-Medicine scan dialog ([Medicines.tsx](src/pages/Medicines.tsx)) stores the **GTIN** (not the variable string) and auto-fills opening-stock batch/expiry/mfg/MRP. Receive-PO ([PurchaseOrders.tsx](src/pages/PurchaseOrders.tsx)) gains a per-row "Scan pack" filling batch/expiry/MRP (+ new `manufactureDate` on `ReceiveItem`). Shared `useScanToFill` hook.

**Part B — Central shared catalog** ([prisma/schema.prisma](prisma/schema.prisma), [server/catalog.ts](server/catalog.ts))
- Global (non-tenant) `MasterProduct` + `MasterProductGtin` tables (pack GTINs normalized to 14 digits). `Medicine.masterProductId?`/`drapRegNo?` link back. Only product master is shared — pricing/stock/rack stay per-tenant.
- `lookupByGtin` / `searchCatalog` / `upsertProduct` (trust rule: `contributed` never overwrites `drap`/`verified`) / `contributeFromMedicine`. Routes `GET /api/catalog/by-gtin`, `/api/catalog/search`; `POST /api/medicines` contributes manual adds. Verified: a medicine with a GTIN becomes catalog-resolvable by 14- and 13-digit GTIN.

**Part C — DRAP fallback** ([server/drap.ts](server/drap.ts))
- Discovered endpoint: `POST eapp.dra.gov.pk/productView.php` `webRegNo=<regNo>` → HTML; parser extracts brand, reg no/date, company, dosage form, route, composition (generic/strength/unit/ATC) and pack-size **GTINs**. 8s timeout, never throws. (Brand select2 typeahead needs server state we can't reproduce → reg-no is the reliable path.)
- Routes `GET /api/drap/product?regNo=`, `/api/drap/search` — each **upserts into the central catalog** so DRAP is hit at most once per product across all pharmacies. Add-Medicine "Find product" panel searches catalog-first, DRAP fallback, pre-fills master, leaves pricing/stock/rack manual, shows "DRAP provisional — verify".
- Verified live: `/api/drap/product?regNo=011248` → RIGIX 10mg / Cetirizine / AGP / GTIN 8961101540760, cached and then resolvable via `/api/catalog/by-gtin`.

Caveats: separator-less batch parsing is best-effort (GTIN always parses); DRAP data is provisional and scraping may break if the site changes — manual entry always works.

### Per-branch inventory + cross-branch availability (Part 2 of multi-branch) (2026-06-02)

Each branch now holds its own stock, and you can search which branch has a medicine that's out of stock locally. Chose **separate stock per branch**; POS sells only from the active branch's stock (cross-branch search surfaces where else it's available, for transfer).

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `Batch.branchId String?` + relation to `Branch` (+ `Branch.batches`), index `[tenantId, branchId, medicineId]`. `db push` applied; existing batches **backfilled** to each tenant's first (main) branch.

**Backend** ([server/index.ts](server/index.ts), [server/serializers.ts](server/serializers.ts))
- Batch serializer exposes `branchId`; `batchCreateSchema` + bulk import accept it (bulk takes a top-level `branchId`).
- New `GET /api/stock/by-branch?medicineId=` → per-branch `{ quantity, batches }` + `unassigned`. Powers the availability search.

**Frontend** ([src/store/index.ts](src/store/index.ts), [src/types/index.ts](src/types/index.ts))
- `Batch.branchId`. Stock is branch-scoped via a new `inActiveBranch()` filter applied to `getMedicineStock` / `getBatchesByMedicine` / FEFO helpers / expiring-batch + low-stock alerts — so quantities, POS search/FEFO and alerts reflect the active branch. `addBatch` defaults `branchId` to the active branch; bulk import sends it; Medicines/PurchaseOrders batch creation inherits it through `addBatch`.
- New [src/components/BranchStockDialog.tsx](src/components/BranchStockDialog.tsx) — search a medicine, see per-branch quantities, "You're here" tag, and a Switch button for branches that have stock. Triggered from the POS search bar (store icon) and the Inventory header ("Branch availability").

Verify (curl, all green): `/stock/by-branch?medicineId=9` → Lahore 13 / Karachi 0; create a batch with `branchId:'2'` → stored on branch 2; re-query → Lahore 13 / Karachi 40.

Known follow-ups: switching branch mid-cart doesn't clear the cart; reconcile/reports are still tenant-wide (not yet branch-filtered); inter-branch stock *transfer* records aren't modeled yet (the search supports a manual transfer decision).

### Branch switcher + per-branch views (Part 1 of multi-branch) (2026-06-02)

The header "branch" was a static label and the POS hardcoded `branchId: '1'`. Made branch context real so the owner can switch the branch they're working in and see each branch's snapshot.

**Auth store** ([src/store/index.ts](src/store/index.ts))
- New persisted `activeBranchId` + `setActiveBranch`. `setBranches` defaults it to the user's home branch (or first), preserving a valid existing choice; `logout` clears it.

**Header** ([src/components/Header.tsx](src/components/Header.tsx))
- Branch label → working dropdown listing all branches with access badges (Active / Read / No access, disabled where access is none), plus a "Manage branches…" link. Picking one sets the active branch. New i18n keys `header.switchBranch` / `header.noBranches`.

**POS** ([src/pages/POS.tsx](src/pages/POS.tsx))
- New `posBranchId = activeBranchId || homeBranch || '1'`. Sales (both "save for cashier" and completed) and shift-open now record against it instead of the hardcoded `'1'`.

**Day-close** ([src/pages/DayClose.tsx](src/pages/DayClose.tsx)) defaults its branch to the active branch.

**Branches page** ([src/pages/Branches.tsx](src/pages/Branches.tsx), [server/index.ts](server/index.ts))
- New `GET /api/branches/stats` → per-branch `{ salesToday, salesCount, openShifts, staff }`. Each branch card shows the live snapshot + a "Switch to this branch" button (or "Currently active").

Verify (curl): `/branches/stats` returns per-branch sales/shift/staff (e.g. Karachi shows `openShifts: 1`).

**NOTE — still pending (Part 2):** cross-branch *stock* search ("which branch has this medicine?") needs per-branch inventory. `Batch`/`Medicine` are currently tenant-wide (no `branchId`), so stock is shared across branches. That migration (branchId on batches + branch-aware POS/FEFO/reconcile/import + the availability search) is the next step, pending a decision on the inventory model (separate-per-branch vs shared).

### Day-close rebuilt as a shift-driven flow (2026-06-02)

Replaced the manual "type opening + closing cash" form with the real workflow: start a shift (opening balance only) → it shows as **Pending close** → close it (counted closing balance). The day opens with the first shift and closes with the last; the owner/manager finalizes with the Z-report close, after which shift figures lock.

**Backend** ([server/index.ts](server/index.ts))
- New `PATCH /api/shift-sessions/:id` — owner/manager (or the shift's own user) can correct `openingCash`/`closingCash`/`notes`. Returns `409` once a day-close exists for that branch+day (figures frozen).

**Frontend** ([src/pages/DayClose.tsx](src/pages/DayClose.tsx), [src/lib/backend.ts](src/lib/backend.ts))
- Page rebuilt: branch/date picker, **Start shift** (opening cash only, today + no open shift), a **Pending close** banner for the open shift, a shifts table (Opened/Opening/Closed/Closing/Sales/Status with "day open"/"day close" tags), and a **Finalize the day** card pre-filled from first/last shift (editable override, owner/manager only). Start/Close/Edit shift dialogs; `updateShiftSession()` client helper.
- Once the day is closed the finalize card shows a locked state and edits are blocked.
- **Post-close rollover:** Start shift stays available even after the day is closed; a shift opened after a close is attributed to the *next* business day (server helpers `shiftsForBusinessDay` / `localDayStr`; new `GET /api/shift-sessions/by-business-day`). The PATCH lock only freezes a shift a close actually captured (close posted at/after it opened), so a rolled-forward shift remains editable until its own day closes. After starting a shift on an already-closed today, the page jumps to tomorrow to show it.

Verify (curl, all green): start shift (opening 3000) → status `open`; edit open shift opening cash → `200`; close (closing 9200) → status `closed`; `day-cash` derives opening/closing; post day-close → `201`; subsequent shift edit → `409 locked`. With today already closed: a new shift appears under tomorrow's business day (not today) and stays editable (`200`).

### Day-close opening/closing cash auto-derived from shifts (2026-06-02)

The day-end close made the owner re-type opening and closing cash even though the cashiers already entered them when opening/closing their shifts. Now those numbers come from the shift sessions.

**Backend** ([server/index.ts](server/index.ts))
- New `deriveDayCashFromShifts(tId, branchId, dayStart, dayEnd)` — opening cash = first shift opened that day; closing cash = last shift closed that day (one drawer across shifts). Returns `{ openingCash, closingCash, shiftCount, openShiftCount }`.
- New `GET /api/shift-sessions/day-cash?branchId=&date=` exposes it.
- `POST /api/day-closes` now falls back to the derived figures when the form omits them, and records `shiftCount` / `openShiftCount` in `summary`.

**Frontend** ([src/pages/DayClose.tsx](src/pages/DayClose.tsx), [src/lib/backend.ts](src/lib/backend.ts))
- On branch/date change, `fetchDayCash()` pre-fills the opening/closing cash inputs. A note shows how many shifts they came from (and warns if any are still open). Hand-editing a figure stops the auto-fill (override); fields reset after posting.

Verify (curl): open a shift (opening 5000) → `day-cash` reports `openingCash 5000, openShiftCount 1`; close it (closing 7500) → `openingCash 5000, closingCash 7500, openShiftCount 0`.

### Salesman model — single seller account, PIN-attributed prints, self dashboard (2026-06-02)

Pharmacy logs in on every terminal with one shared seller account; individual salesmen identify themselves with a POS username + 4-digit PIN to make and print sales. Their performance is measured off those prints (sales − returns).

**Receipt** ([src/pages/POS.tsx](src/pages/POS.tsx), [src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx))
- Dropped the separate "Sold by" line. A single **"Printed by"** line now shows the PIN-verified salesman (`salesPersonName`), falling back to the logged-in account only if no PIN was captured. Mobile receipt prints the same line.

**Add User — role-default permissions** ([src/pages/Users.tsx](src/pages/Users.tsx))
- New `roleDefaultPermissions` map. Picking a role on the add/edit form now **pre-ticks that role's baseline permissions** (owner/superadmin full; manager full except read/update on users+settings; cashier/salesman/pharmacist/accountant scoped sets). The owner adds or removes from there. Initial form + `resetForm` seed the cashier default.

**Add User — salesman POS login** ([src/pages/Users.tsx](src/pages/Users.tsx), [server/index.ts](server/index.ts))
- Add-user dialog gained an optional **POS username + 4-digit PIN** block (POS roles only). Sent to `POST /api/users`; `userMutationSchema` accepts `salesUsername` + `salesPin`, applied only when the role can operate the register, PIN stored hashed. P2002 message widened to cover username collisions. PATCH strips raw `salesPin` (PIN edits still go through the dedicated `/sales-pin` endpoints).
- A salesman is therefore a User with email+password (own login → dashboard) **and** salesUsername+PIN (POS attribution). They change their own PIN from My Profile (existing flow).

**My Profile — salesman dashboard** ([src/pages/MyProfile.tsx](src/pages/MyProfile.tsx), [server/index.ts](server/index.ts), [src/lib/backend.ts](src/lib/backend.ts))
- New `GET /api/me/performance` — aggregates the caller's own sales (attributed via `Sale.salesPersonId`) with returns subtracted, bucketed **today / this month / all-time** (`salesCount`, `salesTotal`, `returnsTotal`, `netTotal`, `itemsSold`).
- New **"My Performance"** card on My Profile renders the three buckets; `fetchMyPerformance()` client wrapper added.

Verify (curl, all green):
- Create salesman with `salesUsername`+`salesPin` → `201`, `salesPinSet:true`; `verify-pin` returns the salesman.
- Completed sale attributed to them → `/me/performance` reports `salesCount 1, salesTotal 100, itemsSold 2, netTotal 100`.

Verify (UI): Users → Add User → pick a role → permission grid is pre-ticked; for a POS role, set POS username+PIN. Sign in as that salesman → My Profile shows My Performance + the PIN-change card. POS receipt shows only "Printed by: <salesman>".

### Fix — sales never decremented stock / overselling possible (2026-06-02)

**Bug:** A medicine with 200 in stock could be sold in quantities of 2000. Root cause: `POST /api/sales` only created the sale row — it **never validated available stock and never decremented `Batch.quantity`**. The frontend store (`addSale`) is fire-and-forget and also never touched stock. So selling never reduced inventory, and nothing capped the quantity.

**Backend** ([server/index.ts](server/index.ts))
- New `decrementStockForSale(tx, tenantId, items)` helper. Sums demand per batch, then does a conditional `updateMany({ where: { quantity: { gte: need } }, data: { quantity: { decrement: need } } })` — an atomic check-and-decrement that also guards against two terminals overselling the same batch in a race. Zero rows matched → throws `InsufficientStockError`.
- Treats `batch.quantity` in the same unit as the sale line `quantity`, matching the FEFO check, the stock display, and the existing sale-return restock path.
- `POST /api/sales` now wraps stock decrement + sale create + income ledger in one `$transaction` when `status='completed'` (pending/cart-saves don't touch stock). `InsufficientStockError` → `409`.
- `PATCH /api/sales/:id` decrements on the pending → completed transition (cashier "collect bill" flow), using the stored sale items. Also `409` on insufficient stock.

**Frontend** ([src/pages/POS.tsx](src/pages/POS.tsx))
- New `setCartQuantity()` clamps cart-line edits (typed value + the "+" button) to the batch's available quantity; toasts `pos.stockCapped`.
- `handleAddFromBatch()` caps the added quantity to `batch.quantity − already-in-cart`; refuses when nothing is left.
- New i18n key `stockCapped` (en/ar/ur) — [src/lib/i18n.ts](src/lib/i18n.ts).

Verify (curl, all green):
- Normal completed sale qty 2 → `201`, batch 13 → 11.
- Oversell qty 99999 → `409 "Insufficient stock for Insulin (batch INS-CRIT): 11 in stock, 99999 requested"`, stock unchanged.
- Pending sale → stock unchanged; PATCH pending → completed → stock drops by the sold qty.

Verify (UI): POS → add an item, type a cart quantity above stock → it snaps down to the available number with a toast; the "+" button stops at stock.

### Local development environment (2026-05-28)

Brought the project up locally from a Hostinger-style production `.env`.

- Switched runtime to Node 24 via nvm (Vite 7 requires ≥ 20.19 — system Node 18 wouldn't start it).
- Provisioned local MySQL DB `pharmapos_saas` and user `pharmapos / pharmapos_password`.
- Backed up the production-leaning `.env` to `.env.local-backup-*` and wrote a local `.env`.
- Ran `npx prisma db push` to sync the schema.
- Started API ([npm run api:dev](package.json#L8)) and Vite ([npm run dev](package.json#L7)).
- Fixed `VITE_API_URL` to include `/api` suffix — the frontend was hitting `:4000/auth/login` (404) instead of `:4000/api/auth/login`.
- Fixed `FRONTEND_ORIGIN=http://localhost:5173` — the API was accepting requests but CORS blocked the browser's read of the response (Prisma logs showed `UPDATE User SET lastLogin` even though the UI said "login failed").

Files: [.env](.env), [.env.local-backup-*](.env.local-backup-1779995466).

Verify: `curl -s http://127.0.0.1:4000/health` → `{"ok":true,...}`; `curl -s -I http://localhost:5173` → 200.

### Demo login users (2026-05-28)

The `/demo` page hard-codes `owner|manager|cashier|pharmacist@demo-pharmacy.pk` with PIN `Demo1234!`, but the seeded DB only had `@pharmapos.pk` users.

- Ran a one-off Prisma upsert to create the four `@demo-pharmacy.pk` users with bcrypt-hashed `Demo1234!` under the `demo-pharmacy` tenant.

Files: temp script (deleted after running).

Verify: `curl -s -X POST http://127.0.0.1:4000/api/auth/login -H "Content-Type: application/json" -d '{"tenantSlug":"demo-pharmacy","email":"owner@demo-pharmacy.pk","password":"Demo1234!"}'` → JWT.

### Salesperson PIN flow (2026-05-28)

Pharmacy logs in once on the POS terminal under any account. At the receipt step, the salesperson enters their **username + 4-digit PIN** and the sale is recorded under their name. Receipts show "Sold by: <name>".

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `User.salesUsername String?` + `@@unique([tenantId, salesUsername])`
- `User.salesPinHash String?` (bcrypt)
- `Sale.salesPersonId String?` + `Sale.salesPersonName String?` (name snapshotted so receipts survive user deletion)

**Backend** ([server/index.ts](server/index.ts))
- `PATCH /api/users/me/sales-pin` — current user sets/changes own PIN; proves possession with account password OR existing PIN
- `PATCH /api/users/:id/sales-pin/reset` — owner/manager resets a staff PIN
- `DELETE /api/users/:id/sales-pin` — owner/manager clears a PIN
- `POST /api/sales/verify-pin` — body `{username, pin}` → returns `{userId, name, role}`, rate-limited (10/min/tenant+IP)
- `POST /api/sales` — `status: 'completed'` now requires `salesPersonId`; server re-verifies role + tenant and snapshots `salesPersonName`
- `SALES_ROLES = {owner, manager, cashier, salesman, pharmacist}`
- Bootstrap + users list include `salesUsername` + `salesPinSet: boolean` (hash never crosses the wire)

**Frontend**
- [src/lib/backend.ts](src/lib/backend.ts) — `setOwnSalesPin`, `adminResetSalesPin`, `adminClearSalesPin`, `verifySalesPin`
- [src/pages/POS.tsx](src/pages/POS.tsx) — `<PinDialog>` opens before sale creation; only when `paidBy === 'seller'` (cashier/pending sales skip the gate); receipt shows "Sold by: <name>"
- [src/pages/MyProfile.tsx](src/pages/MyProfile.tsx) — new page at `/my-profile`; user sets own username + PIN with their account password or current PIN as proof
- [src/pages/Users.tsx](src/pages/Users.tsx) — new "POS PIN" column showing ✓/username when set; key icon to reset, × to clear
- [src/components/Header.tsx](src/components/Header.tsx) — profile dropdown navigates to `/my-profile`

Verify (curl): see backend smoke in conversation. Verify (UI): demo login `owner` → `Profile` → set PIN → POS → checkout → "Confirm Sale" dialog → receipt shows "Sold by: Demo Owner".

### M1 — Data quality & POS display polish (2026-05-28)

Mostly additive. Smallest blast radius from the plan.

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `Medicine.reorderActive Boolean @default(true)` — when false, drops out of low-stock alert calculation
- `Medicine.barcodeImageUrl String? @db.MediumText` — scanned/photographed barcode (data URL)

**Server validation** ([server/index.ts](server/index.ts))
- `superRefine` cross-field guards applied to both create and patch:
  - `purchaseRate ≤ mrp` — catches inverted-price typos (top cause of "wrong entry" reports)
  - `reorderLevel ≤ maxStock`, `reorderQuantity ≤ maxStock`
- Schema accepts `reorderActive` + `barcodeImageUrl`

**New medicine categories & dosage forms** ([src/types/index.ts](src/types/index.ts), [src/pages/Medicines.tsx](src/pages/Medicines.tsx))
- Categories added: caplets, ampoules, infusions, granules, surgical, medical_instruments, shampoo, soap
- Dosage forms added: caplet, ampoule, infusion, granules, surgical, medical_instrument, shampoo, soap
- Updated `categorize()` so new forms get sensible packaging hierarchies (caplet→tablet, ampoule/infusion→injection, granules→sachet, soap→tube, shampoo→liquid)

**Add-medicine form** ([src/pages/Medicines.tsx](src/pages/Medicines.tsx))
- **Duplicate guard** — on submit, checks `name + strength + dosageForm` against active medicines; shows warn dialog with the existing record + "Add anyway" option (does not hard-block)
- **Reorder-active checkbox** — controls whether this medicine triggers low-stock alerts
- **Auto-suggest reorder qty** — "Suggest N" button beside Reorder Qty; computes `Math.ceil(avgDailySales × 30)` from last-30-day sales velocity, clamped to maxStock; only shown in edit mode
- **Barcode scan dialog** — opens an input ready for USB scanner keystrokes; Enter writes the code; manual typing also works
- **Barcode image upload** — file input + preview thumbnail + remove button; uses existing [src/lib/image.ts](src/lib/image.ts) `processUploadedFile()`

**POS display** ([src/pages/POS.tsx](src/pages/POS.tsx))
- Search-result rows now show a meta line with **Pack / Exp / Distributor / Reg** (DRAP), drawn from FEFO suggested batch + supplier name lookup
- Shelf/rack stays on its own line

**General Ledger viewer** ([src/pages/Ledger.tsx](src/pages/Ledger.tsx))
- New `/ledger` route — table of all `LedgerEntry` rows with date-range (today/week/month/quarter/YTD/custom), type, reference filters
- Inflow / Outflow / Net summary cards
- Running balance per row
- CSV export via existing [src/lib/csv.ts](src/lib/csv.ts) `exportToCSV()`
- Added to sidebar nav ([src/components/Sidebar.tsx](src/components/Sidebar.tsx)) with new `nav.ledger` i18n key

**Alerts engine** ([src/store/index.ts](src/store/index.ts))
- `getLiveLowStockAlerts()` now filters by `m.reorderActive ?? true` so silenced medicines disappear from alerts

**Mobile parity** ([src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx))
- Search rows show strength + Pack + Exp + Distributor + Reg + Shelf/Rack (same data, mobile typography)

Verify:
- API: `purchase > MRP` rejected with `400 "Purchase rate cannot exceed MRP"` on both POST and PATCH
- Bootstrap: ledger entries present (4 in demo); new fields persist
- UI: add a Caplet → save; toggle reorder-active off → drops off /alerts; POS row shows chips; /ledger has rows + CSV export works

---

### M2 — Pricing model + discounts (2026-05-28)

Trade Price visibility for the salesperson, plus per-payment-method default fee/discount.

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `Medicine.tradePrice Float?` — optional default trade price
- `Batch.tradePrice Float?` — optional per-batch override (different distributor → different TP)

**Server validation** ([server/index.ts](server/index.ts))
- New cross-field guard `tradePrice ≤ mrp` on both medicine create and patch — verified end-to-end

**Server serializers** ([server/serializers.ts](server/serializers.ts))
- `medicine.tradePrice` and `batch.tradePrice` flow through the API

**Types** ([src/types/index.ts](src/types/index.ts))
- `Medicine.tradePrice?: number`, `Batch.tradePrice?: number`
- New `AppSettings` fields:
  - `showPurchasePriceOnPOS / Roles` — role allow-list for the cost column
  - `showTradePriceOnPOS / Roles` — role allow-list for TP
  - `showSalePriceOnPOS / Roles` — role allow-list for sale price
  - `paymentMethodDefaults` — per-method `{feePercent?, discountPercent?}`

**Defaults** ([src/store/index.ts](src/store/index.ts))
- Cost hidden from non-managers; TP + Sale visible to all POS-eligible roles by default

**Helpers** ([src/lib/posPricing.ts](src/lib/posPricing.ts) — new)
- `resolveTradePrice(batch, medicine)` — falls back batch → medicine → salePrice
- `getVisiblePrices(settings, role)` — returns `{purchase, trade, sale}` flags
- `paymentMethodDefault(settings, method)` — returns `{feePercent, discountPercent}` for the selected method (zero defaults)
- Owner / superadmin always see all three prices regardless of flags

**Settings UI** ([src/pages/Settings.tsx](src/pages/Settings.tsx))
- Owner-only "POS price visibility" card with a Switch + role-chip allow-list per price (purchase / trade / sale)
- Owner+manager "Payment method defaults" card with Fee % / Discount % inputs for cash / card / jazzcash / easypaisa / bank_transfer

**Desktop POS** ([src/pages/POS.tsx](src/pages/POS.tsx))
- Cart row shows a Cost / TP chip line under the unit-price × qty row, gated by `visiblePrices`. TP includes a "max disc Rs. X" headroom hint.
- Batch picker dialog shows TP per batch + Cost per batch, gated by role.
- Per-line discount picker — small dropdown of active line-level `DiscountRule`s (Settings → Discount Rules); pick to apply the rule's % to the line.
- Payment dialog: when the selected method has configured fee/discount, auto-shows the adjustment + final payable. Cash-received hint shows the payable amount. `Complete Payment` button uses the adjusted payable for paidAmount / change calculation. Adjustment is recorded on the sale via `notes` ("Collected by Seller — Paid (card surcharge +Rs. X)").

**Add/edit medicine** ([src/pages/Medicines.tsx](src/pages/Medicines.tsx))
- Pricing section gets a "Trade Price" input alongside MRP

**Mobile POS** ([src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx))
- Search rows show `TP Rs. X` in the meta line when TP is set

Verify (curl, all green):
- `tradePrice > MRP` rejected: `400 "Trade price cannot exceed MRP"`
- Medicine + Batch persist tradePrice and round-trip through bootstrap

Verify (UI):
1. Refresh tab.
2. **Settings → POS price visibility** (owner) — toggle each price, pick role chips. Confirm POS hides/shows accordingly.
3. **Settings → Payment method defaults** — set Card surcharge 2 %.
4. **POS** → add a medicine with a TP set. Confirm the chip line on cart shows TP + max-discount headroom. Confirm cart row resolves batch TP override over medicine default.
5. **POS payment dialog** → pick Card → see "Card/processing surcharge +2 % +Rs. X" + "Payable Rs. Y". The Pay & Print PIN dialog uses the new payable.

---

### M3 — Distributor mapping + multi-source (2026-05-28)

Largest pure-data milestone of the plan. Three new models, supplier visit-day schedule, and four frontend surfaces.

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- New `MedicineSupplier` — `tenantId, medicineId, supplierId, lastTradePrice?, lastReceivedAt?, isPrimary, notes?` + unique `[tenantId, medicineId, supplierId]`
- New `PurchaseInvoice` — `tenantId, purchaseId, supplierInvoiceNumber, imageUrl?, totalAmount, receivedAt, notes?` (multi-invoice partial GRN)
- New `PurchaseReturn` — `tenantId, returnNumber, supplierId, purchaseId?, returnDate, items Json, totalAmount, reason, stockAdjusted, status, notes?`
- `Supplier.visitDays Json?` — optional weekly schedule
- Tenant cascading relations wired for all three

**Server validation + endpoints** ([server/index.ts](server/index.ts))
- `medicineSupplierCreateSchema` / patch, plus CRUD: `GET/POST/PATCH/DELETE /api/medicine-suppliers`
- `purchaseInvoiceCreateSchema` + `GET /api/purchase-invoices?purchaseId=X`, `POST`, `DELETE`
- `purchaseReturnCreateSchema` + `GET /api/purchase-returns`, `POST` — transactionally decrements batch quantity when `stockAdjusted=true`, writes a negative-amount `LedgerEntry`, and an `AuditLog` row
- `supplierCreateSchema.visitDays` accepts `('mon'|'tue'|...|'sun')[]`
- `/api/bootstrap` now returns `medicineSuppliers`, `purchaseInvoices`, `purchaseReturns`

**Serializers** ([server/serializers.ts](server/serializers.ts))
- New `medicineSupplier`, `purchaseInvoice`, `purchaseReturn`; `supplier` exposes `visitDays`

**Types** ([src/types/index.ts](src/types/index.ts))
- `WeekDay`, `Supplier.visitDays?`, `MedicineSupplier`, `PurchaseInvoice`, `PurchaseReturnItem`, `PurchaseReturn`
- `AppSettings.supplierVisitDaysEnabled?: boolean`

**Stores** ([src/store/index.ts](src/store/index.ts), [src/App.tsx](src/App.tsx))
- `useSupplierStore` now holds `medicineSuppliers`, `purchaseInvoices`, `purchaseReturns` with optimistic add/update/remove helpers + read helpers (`suppliersForMedicine`, `medicinesForSupplier`, `invoicesForPurchase`)
- Bootstrap hydrates the three new collections; mutations flow through `persistCreate/Update/Delete` to the API
- Default `supplierVisitDaysEnabled: false`

**Backend client** ([src/lib/backend.ts](src/lib/backend.ts))
- `BootstrapResponse` extended with the three optional new arrays

**PurchaseOrders** ([src/pages/PurchaseOrders.tsx](src/pages/PurchaseOrders.tsx))
- **Distributor-scoped medicine picker** — once a supplier is chosen on the create-PO dialog, the medicine search dropdown splits into two groups:
  - "Mapped to <Supplier>" — medicines already linked via `MedicineSupplier`
  - "Add new from <Supplier>" — unmapped hits; selecting auto-creates the mapping
- **Multi-invoice GRN** — when a partial delivery is recorded with an invoice number, a new `PurchaseInvoice` row is created. The View dialog shows a "Supplier invoices" table listing each invoice with its number, received date, amount, and scan view.
- **Return to Supplier dialog** — new red button in View dialog (visible for `received` / `partial` POs). Per-item quantity entry, reason dropdown (damaged / expired / wrong / excess / quality / other), notes, and a "Also reduce shelf stock now" checkbox (off = "record only" when supplier rejects). Posting creates a `PurchaseReturn`, decrements batches, writes ledger + audit entries.

**POS** ([src/pages/POS.tsx](src/pages/POS.tsx))
- Batch picker shows a distributor chip on each row so the cashier can pick "Pfizer batch vs GSK batch" when the same medicine has multiple sources.

**Suppliers + Dashboard** ([src/pages/Suppliers.tsx](src/pages/Suppliers.tsx), [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx))
- Add/edit dialog: visit-day chip selector (`mon`–`sun`), gated on `supplierVisitDaysEnabled`
- Suppliers list: visit-day badges next to each name
- Dashboard: "Today's expected suppliers" card showing distributors scheduled for today's weekday

**Settings** ([src/pages/Settings.tsx](src/pages/Settings.tsx))
- New owner/manager card "Distributor visit schedule" with the toggle

**Mobile** ([src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx))
- Batch picker shows distributor chip per row

Verify (curl, all green):
- `POST /api/purchase-returns` with empty items → `400` with field error
- `POST /api/purchase-returns` (real batch, qty 2) → `201`, batch quantity decremented 12 → 10
- `POST /api/purchase-invoices` against an existing PO → `201` with the new id
- `POST /api/medicine-suppliers` twice with the same `(medicineId, supplierId)` → second call `409 "already mapped"`
- `PATCH /api/suppliers/:id { visitDays: ["mon","wed","fri"] }` round-trips through bootstrap
- Bootstrap returns the three new collections

Verify (UI):
1. Refresh.
2. **Settings → Distributor visit schedule** — toggle on.
3. **Suppliers** → edit a supplier → pick `mon` / `wed` → save. Confirm chips appear next to the name on the list.
4. **Dashboard** → if today matches a picked day, the "Today's expected suppliers" card shows up.
5. **PurchaseOrders → New PO** — pick a supplier; search medicines. First time, all hits are in "Add new". After adding one, future POs show it under "Mapped to <supplier>".
6. **PurchaseOrders → Receive** for an existing PO with a supplier invoice number — confirm a new row appears under "Supplier invoices" in the View dialog after closing.
7. **PurchaseOrders → View → Return to Supplier** — pick qtys, reason, post → confirm Suppliers ledger shows a negative entry and batch stock dropped.
8. **POS → search a medicine** → batch picker now shows the supplier name chip on each row.

---

### M4 — Audit, reconcile, stock import (2026-05-28)

Three independent additions that share a small backend footprint.

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `ReconcileRun` — `tenantId, scope, scopeValue?, status, startedAt, completedAt?, notes?, createdBy, postedBy?` (scope ∈ `all | category | shelf | medicine | supplier`; status ∈ `open | posted | cancelled`)
- `ReconcileEntry` — `tenantId, runId, medicineId, batchId?, systemQty, countedQty, variance, notes?` (per-batch counted snapshot)

**Backend** ([server/index.ts](server/index.ts), [server/serializers.ts](server/serializers.ts))
- `GET /api/audit-logs` — manager+, filters by `from / to / userId / module / action / q / limit` (`details` substring search). Reads from the long-existing `AuditLog` table.
- `GET /api/reconcile-runs` — list runs
- `POST /api/reconcile-runs` — start a new open run
- `GET /api/reconcile-runs/:id/entries`, `POST /api/reconcile-runs/:id/entries` — entry list + upsert (identified by `(runId, medicineId, batchId|null)` tuple). Variance computed server-side.
- `POST /api/reconcile-runs/:id/post` — transactional: for each entry with `variance ≠ 0`, updates the batch quantity, accumulates value impact (variance × purchasePrice), writes one summary `LedgerEntry` (type `income` for overage, `expense` for shortage), writes an `AuditLog` row, marks run `posted`. Rejects re-posting.
- `DELETE /api/reconcile-runs/:id` — cancels an open run (sets `cancelled`); rejects on posted runs.
- `POST /api/batches/bulk` — bulk batch import. Accepts up to 2000 rows, resolves `medicineBarcode → medicine.id` and `supplierName → supplier.id` with pre-loaded maps, creates batches, returns per-row success/failure with error messages.
- New serializers: `auditLog`, `reconcileRun`, `reconcileEntry`

**Types** ([src/types/index.ts](src/types/index.ts))
- `ReconcileScope`, `ReconcileStatus`, `ReconcileRun`, `ReconcileEntry`

**Backend client** ([src/lib/backend.ts](src/lib/backend.ts))
- `fetchAuditLogs`, `fetchReconcileRuns`, `createReconcileRun`, `fetchReconcileEntries`, `upsertReconcileEntry`, `postReconcileRun`, `cancelReconcileRun`, `bulkImportBatches` (+ DTO interfaces)

**Audit page** ([src/pages/Audit.tsx](src/pages/Audit.tsx) — new, `/audit` route)
- Date-range picker (today / week / month / YTD / custom), module filter, free-text `details` search
- Scoped audit chips: "Audit a medicine…" / "Audit a supplier…" → narrows displayed rows by substring match on details + accepts `?medicineId=` / `?supplierId=` deep-links
- CSV export via existing `exportToCSV()` helper
- Manager+ only; added to sidebar with `nav.audit` i18n key

**Reconcile page** ([src/pages/Reconcile.tsx](src/pages/Reconcile.tsx) — new, `/reconcile` route)
- Two-column layout: runs list (open / posted / cancelled) on left, run editor on right
- "Start new run" dialog picks the scope: whole inventory / one category / one shelf substring / one medicine / one distributor
- Editor lists every batch the scope matches; numeric count input per row with live variance pill
- Summary chips: # entered, total overage, total shortage
- "Post adjustments" button (transactional via backend); "Cancel" for open runs
- Posted runs are read-only with an amber warning banner
- Added to sidebar with `nav.reconcile` i18n key

**Bulk batch import** ([src/pages/Inventory.tsx](src/pages/Inventory.tsx))
- New "Batch template" button — downloads `stock-batches-template.csv` with the canonical columns `medicineBarcode, batchNumber, expiryDate, manufacturingDate, quantity, purchasePrice, tradePrice, salePrice, mrp, supplierName, location`
- New "Import batches" button — opens the existing CSV file picker, posts to `/api/batches/bulk`, surfaces per-row success/error counts in a toast

**Mobile reconcile** ([src/mobile/pages/MobileReconcile.tsx](src/mobile/pages/MobileReconcile.tsx) — new)
- Reachable from MobileMore → "Stock-take / Reconcile"
- Auto-resumes any open run, or starts a new "whole inventory" run
- Barcode-scan input (USB scanner or typed name fallback) finds a medicine, then exposes its active batches with a numeric count input each
- Variance badge per batch updates live; recent-counts list at the bottom shows last 6 entries
- Post button writes via the same transactional backend endpoint

Verify (curl, all green):
- `GET /api/audit-logs?limit=5` returns recent entries
- `POST /api/reconcile-runs` → 201 with id; `POST .../entries` returns variance; `POST .../post` flips status to `posted`
- Batch quantity moves from 10 → 13 after a +3 entry
- Ledger entry "Stock-take adjustment (all) — overage" written for Rs. 1350 (3 × purchasePrice 450)
- `POST /api/batches/bulk` with 1 row using `medicineBarcode` creates the batch (`created=1 failed=0`)
- Audit log now contains a `RECONCILE_POST` entry

Verify (UI):
1. Hard refresh.
2. **/audit** (sidebar → Audit) — pick "This week" range; should populate. Click "Audit a medicine…" → pick → only rows mentioning that medicine remain. Export CSV.
3. **/reconcile** → "Start new run" → "Single medicine" → pick → open run. Type a count for one of its batches; variance badge appears. Click "Post adjustments" → batch quantity adjusts on the Inventory page.
4. **Inventory → "Batch template"** downloads CSV. Open it, fill a row with a real `medicineBarcode`, save, click **"Import batches"** → toast confirms create/fail counts.
5. **Mobile (resize browser to < 768 px)** → More tab → "Stock-take / Reconcile" → resumes the open run; scan / type a name; enter counts; Post.

---

### M5 — Persisted notifications + flash bell + mobile parity (2026-05-28)

Replaces the previously toast-only / compute-live-only alerts with a real per-tenant `Notification` table, polled by the frontend, with role and per-user scoping (incl. the per-salesperson channel from the PIN flow shipped earlier).

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `Notification` — `tenantId, scope ('tenant'|'user'|'role'), userId?, role?, title, body?, severity, kind, link?, dismissedAt?, createdAt`
- Indexes: `(tenantId, dismissedAt)`, `(tenantId, userId)`, `(tenantId, role)` so the per-user query is constant-time

**Backend** ([server/index.ts](server/index.ts), [server/serializers.ts](server/serializers.ts))
- `GET /api/notifications` — auth required; returns active rows where `scope='tenant'` OR (`scope='user'` AND `userId=me`) OR (`scope='role'` AND `role=myRole`). `?includeDismissed=1` to include dismissed.
- `POST /api/notifications/:id/dismiss` — sets `dismissedAt = now()`. Authorised via the same scope filter so users can't dismiss notifications they aren't entitled to see.
- `POST /api/notifications/dismiss-all` — bulk dismiss within the caller's visible set.
- New `emitNotification(client, input)` helper — accepts either `prisma` OR a transaction client so callers inside `$transaction` get atomic creation. Fire-and-forget; failures log + continue (a broken emit must never roll back the underlying business action).
- New `notification` serializer

**Emitters wired** (all run inside the existing $transaction blocks)
- **Supplier payment** → `kind: payment, scope: role, role: owner`, link `/suppliers`
- **Purchase return** → `kind: purchase_return, scope: role, role: owner`, severity `warning`, link `/purchase-orders`
- **Reconcile post** → `kind: reconcile, scope: role, role: owner`, severity `warning` when |net|>1000 else `info`, link `/reconcile`
- **Sale return** → two notifications: one `scope: user, userId: sale.salesPersonId` to the original salesperson (their PIN-attributed sale was returned), one `scope: role, role: owner` summary

**Types + client** ([src/types/index.ts](src/types/index.ts), [src/lib/backend.ts](src/lib/backend.ts))
- `NotificationScope`, `NotificationSeverity`, `NotificationKind`, `NotificationRow`
- `fetchNotifications(includeDismissed?)`, `dismissNotification(id)`, `dismissAllNotifications()`

**Store** ([src/store/index.ts](src/store/index.ts))
- `useNotificationStore` (persisted only `lastSeenAt` — survives refresh):
  - `notifications[]`, `lastSeenAt`, `pulseAt`, `loading`, `permission`
  - `refresh()` — fetches active, diffs against current list. New ids (when list was already non-empty) trigger `pulseAt` and a browser `Notification` if permission granted AND tab is hidden (`document.visibilityState !== 'visible'`).
  - `dismiss(id)` / `dismissAll()` — optimistic UI update before the network call
  - `markAllSeen()` — bumps `lastSeenAt` to the newest createdAt
  - `requestBrowserPermission()` — wraps `Notification.requestPermission()`

**App polling** ([src/App.tsx](src/App.tsx))
- After auth: `refresh()` immediately, then every 30s, plus on every tab refocus (`visibilitychange`)

**Header bell** ([src/components/Header.tsx](src/components/Header.tsx))
- New icon swap: `<BellRing>` (emerald, animate-pulse) for ~3s after `pulseAt` bumps; `<Bell>` otherwise
- Red badge count = unseen-persisted + computed-live (expiry + low stock)
- Dropdown width 96 (was 80) to fit timestamps + dismiss button per row
- Per-row icon by kind (Receipt / Wallet / ClipboardCheck / RotateCw / MessageSquare)
- Clicking a row navigates to `n.link` (if set) so the deep-link routes through e.g. `/suppliers` for a payment alert
- Inline blue opt-in banner when `Notification.permission === 'default'` → calls `requestBrowserPermission()`
- "Dismiss all" link top-right of dropdown
- Opening the dropdown calls `markAllSeen()` so the badge stops counting items you've now glanced at

**Mobile**
- [src/mobile/components/BottomNav.tsx](src/mobile/components/BottomNav.tsx) — "More" tab badge now includes unseen persisted notifications
- [src/mobile/pages/MobileNotifications.tsx](src/mobile/pages/MobileNotifications.tsx) — new fullscreen page; severity-coloured cards, kind icons, per-row dismiss, "Clear" (= dismiss all), refresh button
- [src/mobile/pages/MobileMore.tsx](src/mobile/pages/MobileMore.tsx) — new top "Notifications" row with unread count badge; mounts the fullscreen component on tap

Verify (curl, all green):
- 0 active initially (expected — earlier returns/reconciles ran before the M5 emitters were wired)
- `POST /api/suppliers/:id/payment` → triggers an owner-scoped notification: `kind: payment`, title `"Payment Rs. 100 to Abbott Pakistan"`
- `POST /api/notifications/:id/dismiss` returns 200; subsequent list omits the row
- Cashier (different role) sees 0 rows — role-based scope filter excludes owner-only notifications
- `POST /api/notifications/dismiss-all` returns `{ dismissed: N }`

Verify (UI):
1. Hard refresh, sign in as Owner.
2. Bell shows the existing count (will tick up as you trigger events).
3. Take a sale return for any completed sale → wait <30s → Bell pulses + a new persisted notification appears in the dropdown.
4. Click the "Enable" link in the blue banner → grant browser permission; subsequent notifications when the tab is hidden fire OS-level pushes.
5. Resize <768 px → BottomNav "More" badge counts persisted+live; tap "Notifications" → fullscreen list; tap dismiss per-row or "Clear".
6. Sign out, sign in as Cashier — owner-only notifications hidden. Trigger a sale return as them → only the per-salesperson notification appears (and only if the cashier was the salesperson on that sale).

---

### M6 — Per-branch RBAC + shift close + day-end close (2026-05-28)

The plan's highest-risk milestone (permission model is load-bearing). Done with back-compat in mind: existing data (users with only a single `branchId` or none) keeps working until an owner explicitly assigns per-branch grants.

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `User.branchAccess Json?` — array of `{ branchId, access: 'read' | 'full' }`. Null = legacy fallback to single-branch + role rules.
- `ShiftSession` — `tenantId, branchId, userId, userName, openedAt, openingCash, closedAt?, closingCash?, salesTotal, returnsTotal, status, notes?` (status `open|closed`)
- `DayClose` — `tenantId, branchId, businessDate, closedBy, closedByName, closedAt, openingCash?, closingCash?, salesTotal, returnsTotal, expensesTotal, summary Json, notes?` (summary holds `byMethod`, taxTotal, discountTotal, salesCount, fbrSubmitted, fbrFailed)

**Backend** ([server/index.ts](server/index.ts), [server/serializers.ts](server/serializers.ts))
- New helpers:
  - `getBranchAccess(tenantId, userId, branchId)` returns `'none' | 'read' | 'full'`. Honors explicit `branchAccess` list first; falls back to legacy single-`branchId` rule; superadmin always `'full'`; owners default to `'full'` when no explicit list; users with no branch at all keep `'full'` for back-compat.
  - `requireBranchWrite(getId)` middleware reads `branchId` from the request and rejects `read`/`none` levels with 403.
- Wired into `POST /api/sales` and `POST /api/purchases` (the highest-impact branch-scoped writes).
- `PATCH /api/users/:id` rejects `branchAccess` field with 403 unless caller is `owner` or `superadmin`.
- `userMutationSchema` accepts the new `branchAccess` array.
- New endpoints:
  - `GET /api/shift-sessions?status=&branchId=`, `GET /api/shift-sessions/current`
  - `POST /api/shift-sessions/open` (requires `full` branch access; one open shift per user max; 409 on duplicate open)
  - `POST /api/shift-sessions/:id/close` (only the shift owner or owner/manager can close; computes salesTotal/returnsTotal from the time window + branch + salesperson; writes AuditLog)
  - `GET /api/day-closes?branchId=`, `POST /api/day-closes` (manager+; transactional in spirit: aggregates sales/returns/expenses for the business date + branch, writes one row with `summary.byMethod`, writes AuditLog)
- New serializers: `shiftSession`, `dayClose`; `publicUser` exposes `branchAccess`

**Types + AppSettings** ([src/types/index.ts](src/types/index.ts))
- `UserBranchAccess`, `ShiftSession`, `DayCloseSummary`, `DayClose`
- `User.branchAccess?: UserBranchAccess[]`
- `AppSettings.shiftCloseEnabled?`, `AppSettings.dayCloseEnabled?`

**Client + store** ([src/lib/backend.ts](src/lib/backend.ts), [src/store/index.ts](src/store/index.ts))
- New wrappers: `fetchOpenShift`, `listShiftSessions`, `openShift`, `closeShift`, `fetchDayCloses`, `postDayClose`
- `useAuthStore.branchAccessFor(branchId)` + `canWriteBranch(branchId)` — same precedence as the server helper, so UI can hide actions the API would reject

**Settings UI** ([src/pages/Settings.tsx](src/pages/Settings.tsx))
- Owner-only "Shift & day-end close" card with two switches: `shiftCloseEnabled`, `dayCloseEnabled`

**Users page** ([src/pages/Users.tsx](src/pages/Users.tsx))
- Owner-only "Branch access" section in the add/edit dialog. Per-branch chip group `none | read | full`. Empty list = legacy fallback.

**POS** ([src/pages/POS.tsx](src/pages/POS.tsx))
- Status chip next to the title (settings-gated): "Shift open · since HH:MM" (emerald, click to close) or "No shift · open one" (amber, click to open).
- `handlePayClick` gates on `currentShift` when shift close is on; opens the open-shift dialog instead of the PIN modal when no shift exists.
- New "Open shift" dialog with opening-cash input; new "Close shift" dialog showing opening cash + closing-cash input. Both call the new backend endpoints.

**Day-end close page** ([src/pages/DayClose.tsx](src/pages/DayClose.tsx) — new, `/day-close`)
- Renders an empty state with link to Settings when `dayCloseEnabled` is off.
- Form: branch + business date + opening cash + closing cash + notes → posts day-close, then refreshes the list below.
- Recent closes table with sales / returns / closing cash / posted-by columns.
- "Print" button per row produces a thermal-printer-shaped Z-report HTML window (sales, returns, taxes, byMethod, opening/closing cash, expected-vs-counted variance, FBR submitted/failed counts).
- Wired into sidebar with `nav.dayClose` i18n key (owner/manager only).

**Mobile parity** ([src/mobile/pages/MobileMore.tsx](src/mobile/pages/MobileMore.tsx))
- Shift card at the top of "More" tab (settings-gated). Tap to open (prompt for opening cash) or close (prompt for closing cash); reuses the desktop endpoints.

Verify (curl, all green):
- `POST /api/shift-sessions/open` → 201 with `status: 'open'`
- Second open while one's active → `409 "A shift is already open"`
- `POST /api/shift-sessions/:id/close` → 200, `status: 'closed'`, `salesTotal` computed
- `POST /api/day-closes` → 201, `summary: { byMethod: { cash: 10 }, salesCount: 1, ... }`
- Set cashier `branchAccess: [{branchId:'1', access:'read'}]` → cashier `POST /api/sales` returns `403 "Read-only access on this branch"`
- Manager attempting to PATCH `branchAccess` → `403 "Only owners can manage branch access"`

Verify (UI):
1. **Settings → Shift & day-end close** (owner) — toggle both on.
2. **POS** — see "No shift · open one" chip; click → opening cash dialog; submit → chip turns green.
3. Add items, Pay & Print as Seller → PIN dialog runs as before. Sale persists.
4. Click the green chip → close-shift dialog with opening cash readout + closing cash input → confirm.
5. **/day-close** — pick today, post → list populates. "Print" shows a Z-report window.
6. **Users → edit cashier** (as owner) — set Branch access for branch "1" to **read**. Sign in as cashier → POS Pay → 403 from the server (the cart attempt fails). Switch back to **full** to restore.
7. Mobile (<768px) → More tab → shift card mirrors the desktop chip.

---

### M7 — Wholesale connector (stubs) + outbox + inbox + auto-PO + customer-return polish (2026-05-28)

The wholesale ERP doesn't exist yet, so the integration is **scaffolded** end-to-end (partner CRUD, outbox emitter on every relevant event, inbox storage, signed inbound webhook) but real HTTP delivery is intentionally a stub. Swapping to real fetch + signature is a one-function change at `deliverOutboxEvent`. Hospital and clinic partner types fall out of the same scaffolding for free.

**Schema** ([prisma/schema.prisma](prisma/schema.prisma))
- `Partner` — `tenantId, type ('wholesale'|'hospital'|'clinic'), name, baseUrl?, apiKeyEncrypted?, inboundSecret?, isActive, notes?, lastSyncAt?` — API keys encrypted with the existing FBR token helper
- `OutboxEvent` — `tenantId, partnerId?, event, payload Json, status ('pending'|'sent'|'failed'|'skipped'), retries, lastError?, nextAttemptAt?, sentAt?`
- `Thread` — `tenantId, partnerId?, subject, lastMessageAt, unreadCount` + indexed by `lastMessageAt`
- `Message` — `tenantId, threadId, senderType, senderName?, body, attachmentUrl?, readAt?`

**Backend** ([server/index.ts](server/index.ts), [server/serializers.ts](server/serializers.ts))
- `emitOutbox(client, opts)` helper — writes one outbox row per active partner. Accepts prisma OR a tx client so emitters are atomic with the business action.
- `POST/PATCH/DELETE /api/partners` — owner+ CRUD. `apiKey` is encrypted on the way in (reuses `encryptToken` from FBR module); `apiKeySet` / `inboundSecretSet` booleans are the only signals back.
- `GET /api/outbox?status=` — manager+ list. `POST /api/outbox/process` — manual stub worker; logs each row and marks `failed` with a placeholder error (no real HTTP).
- Outbox emitters wired into:
  - `POST /api/purchases` → `purchase_order.created`
  - `POST /api/purchase-returns` → `purchase_return.created`
  - `POST /api/threads` and `POST /api/threads/:id/messages` → `inbox_message.sent`
  - Auto-PO worker → one `purchase_order.created` per draft
- Inbox: `GET /api/threads`, `POST /api/threads` (create + first message), `GET /api/threads/:id/messages` (auto-marks inbound read), `POST /api/threads/:id/messages` (reply)
- Inbound webhook stub: `POST /api/webhooks/wholesale/inbound` — accepts `{ tenantSlug, partnerId?, threadId?, subject?, body, senderName? }`. Verifies the partner's `inboundSecret` against `?signature=` or `x-pharmapos-signature` header. Creates or appends to a thread, sets `senderType` from the partner's type, bumps `unreadCount`, and emits an M5 owner notification with `kind: wholesale`.
- `POST /api/auto-po/run?force=1` — scans `Medicine` rows where `currentStock < reorderLevel × autoPoTriggerPercent` and `reorderActive !== false`, groups by primary `MedicineSupplier` (M3), drafts one PO per supplier with `status: 'draft'` and a generated `AUTOPO-…` number. Refuses to run when `autoPoEnabled` is off unless `?force=1`.

**Types + AppSettings** ([src/types/index.ts](src/types/index.ts))
- `Partner`, `OutboxEvent`, `InboxThread`, `InboxMessage`, `MessageSenderType`, `PartnerType`, `OutboxStatus`
- `AppSettings.autoPoEnabled?`, `AppSettings.autoPoTriggerPercent?` (default 1.0)
- Defaults: auto-PO off

**Backend client** ([src/lib/backend.ts](src/lib/backend.ts))
- Partner CRUD: `fetchPartners`, `createPartner`, `updatePartner`, `deletePartner`
- Outbox: `fetchOutbox`, `processOutbox`
- Inbox: `fetchThreads`, `createThread`, `fetchThreadMessages`, `postThreadMessage`
- Auto-PO: `runAutoPo(force)`

**Settings UI** ([src/pages/Settings.tsx](src/pages/Settings.tsx))
- Owner-only "Auto purchase orders" card — toggle + trigger multiplier input (0.5 ≤ x ≤ 5)

**Partners page** ([src/pages/Partners.tsx](src/pages/Partners.tsx) — new, `/partners`)
- Partners table (name, type, base URL, configured ✓/—, last sync, status, edit/delete)
- Outbox panel with status filter and "Process pending" button + an explicit amber banner that "Real HTTP delivery is stubbed"
- Add/edit dialog with API key + signature fields (passwords don't echo back on edit)
- Owner/manager only, behind sidebar entry `nav.partners`

**Inbox page** ([src/pages/Inbox.tsx](src/pages/Inbox.tsx) — new, `/inbox`)
- Two-pane layout: thread list left (unread badge per thread), message stream right
- Chat-bubble layout with tenant/wholesale/hospital/clinic/system sender types
- "New message" dialog with optional partner selector
- Reply textarea + Send (emits outbox event)
- Sidebar entry `nav.inbox` (all logged-in users)

**Purchase Orders** ([src/pages/PurchaseOrders.tsx](src/pages/PurchaseOrders.tsx))
- New "Auto-PO" button (indigo, Sparkles icon) — owner/manager only when `autoPoEnabled` is on. Toasts the result ("N draft POs created" or "no drafts; M of N skipped because no primary supplier").

**Customer return polish** ([src/pages/Sales.tsx](src/pages/Sales.tsx))
- Return dialog: new "Return all remaining" button auto-fills max quantities for every line
- New per-line "Restock?" checkbox column — defaults to the global flag; toggling overrides for that line
- Server `restockInventory` is sent as `true` only when EVERY returned line opts in (any opt-out flips it to false)

Verify (curl, all green):
- `POST /api/partners` → 201, `inboundSecretSet: true`
- Thread create → emits `inbox_message.sent` outbox row
- `POST /api/webhooks/wholesale/inbound?signature=BOGUS` → `401 "Invalid signature"`
- Same with correct signature → 201, new `senderType: 'wholesale'` message appears in `GET /api/threads/:id/messages` (now 2 messages: tenant + wholesale)
- `POST /api/outbox/process` → stub processes pending, marks them failed
- `POST /api/auto-po/run` (auto-PO disabled) → `400 "Auto-PO is disabled in settings"`
- `POST /api/auto-po/run?force=1` → 200 with `draftsCreated`, `medicinesEvaluated`, `skippedNoSupplier` counts

Verify (UI):
1. Hard refresh.
2. **/partners** — Add a wholesale partner. Confirm "api key ✓" and "signature ✓" badges. The outbox panel shows the amber stub banner.
3. **/inbox → New message** — pick the partner, write a subject + body → outbox table gets a new `inbox_message.sent` pending row.
4. Simulate inbound: `curl -X POST http://127.0.0.1:4000/api/webhooks/wholesale/inbound?signature=<your secret> -d '{"tenantSlug":"demo-pharmacy","partnerId":"<p>","threadId":"<t>","body":"Confirmed","senderName":"WH"}'`. The bell pulses, the thread shows the new message, header notification appears.
5. **Settings → Auto purchase orders** — toggle on, set trigger multiplier 1.0.
6. **Purchase Orders** — new **Auto-PO** button appears. Click → toast tells you how many drafts landed. Drafts show up at the top of the list.
7. **Sales → ⤿ Return** on a completed sale — new "Return all remaining" button auto-fills the table; toggle per-line "Restock?" to opt one item out; submit → server stores `restockInventory: false` because of the opt-out.

---

### M8 — Mobile parity backfill (2026-05-28)

Closes the gap between the desktop flows and what mobile users could do without picking up a laptop. Per the original choice in the plan, **extends `src/mobile/`** rather than refactoring desktop dialogs. Backend already supported everything below — this milestone is purely frontend / UX.

**Mobile receipt print/share** ([src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx))
- `handleMobilePrint(sale)`: tries `navigator.share({ title, text })` first — phones offer Print, Save-as-PDF, AirDrop, email, chat targets from one sheet. Honors `AbortError` so user-dismissed shares don't fall through to the popup.
- Fallback for browsers without Web Share: opens a thermal-ticket-shaped window with proper escape + `@media print { padding: 0 }` and triggers `window.print()`.
- Wired into the existing receipt sheet's "Print Ticket" button (was previously a placebo toast — `Print / Share` label now).

**Mobile quick-add customer** ([src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx))
- When the customer search dropdown shows no matches, a new **"+ Add as new customer"** button appears. Auto-fills name vs. phone from the typed query (detects numeric prefix → phone field).
- Sheet captures name, phone, optional CNIC. Submits via `addCustomer` and immediately selects the new row for the current cart.

**Mobile quick-add medicine** ([src/mobile/pages/MobileInventory.tsx](src/mobile/pages/MobileInventory.tsx))
- New **"Quick add"** button (top-right of the Inventory header).
- Sheet captures essentials: brand + generic + category + dosage form + strength + MRP + min-stock alert. Defaults dosage form to `tablet`, category to `tablets`. Auto-builds a single base unit.
- Includes a note "Use desktop for full FBR fields, pricing tiers and units." so users know where to find the advanced editor.
- Categories list mirrors the M1 expanded set (caplets, ampoules, infusions, granules, surgical, shampoo, soap, etc.).

**Mobile quick-add supplier** ([src/mobile/pages/MobileMore.tsx](src/mobile/pages/MobileMore.tsx))
- New **"Add supplier"** row in the More menu, amber-themed.
- Sheet captures name + contact person + phone + city + payment terms days. Address defaults to `—` so the legacy supplier shape still validates.
- Full credit-limit / NTN / GST editing stays on desktop.

**Mobile inbox** ([src/mobile/pages/MobileInbox.tsx](src/mobile/pages/MobileInbox.tsx) — new)
- Two-screen mobile flow: list of threads with unread badges → tap to drill into chat view (back chevron closes the chat, second tap closes the inbox).
- Chat bubbles: tenant messages right-aligned emerald, partner messages left-aligned grey.
- Reply Textarea + send button — emits the same outbox event as desktop.
- "New" button opens a bottom sheet with recipient/subject/body inputs.
- Reachable from MobileMore → "Inbox" row with red unread badge polled every 60s via `fetchThreads()` aggregation.

**Mobile quick PO** — deliberately deferred. Full PO management (supplier-mapped picker, multi-line item entry, payment terms, GRN flow, multi-invoice partial deliveries) doesn't fit well on a phone keyboard. MobileMore's existing "Suppliers Management" item already directs users to desktop. Tell me if you want a minimal "Quick reorder" mobile dialog (one supplier + one med + qty + submit) and I'll add it.

Verify (UI):
1. Hard refresh on a mobile viewport (resize browser <768 px or open in phone DevTools).
2. **POS** → add items, complete a sale → receipt sheet → **Print / Share** opens the OS share menu (or a print window). Save as PDF works in Chrome/Safari.
3. **POS → customer search** → type a phone that doesn't match → **"+ Add as new customer"** appears → fill sheet → new customer is added and immediately selected.
4. **Stock tab → Quick add** → fill name + strength + MRP → save → new medicine appears in the list and on POS search.
5. **More → Add supplier** → fill sheet → save → new supplier shows up on POS batch picker / supplier ledger.
6. **More → Inbox** → list opens; pick a thread (or use **+ New** to create one) → reply → outbox row appears in `/partners` on desktop.

Files touched: [src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx), [src/mobile/pages/MobileInventory.tsx](src/mobile/pages/MobileInventory.tsx), [src/mobile/pages/MobileMore.tsx](src/mobile/pages/MobileMore.tsx), [src/mobile/pages/MobileInbox.tsx](src/mobile/pages/MobileInbox.tsx) (new), plus this changelog.

---

### Post-M8 follow-ups (2026-05-28)

Four pieces called out in M8's "what's open" list, all shipped together.

#### M7 outbox real HTTP delivery ([server/index.ts](server/index.ts))

The stub worker is replaced with real `fetch`. Each pending row resolves the partner, builds `POST {baseUrl}/webhooks/{event-with-dots-as-slashes}` with:
- `content-type: application/json`
- `x-pharmapos-event: {event}`
- `x-pharmapos-signature: HMAC-SHA256(partner.inboundSecret, body).hex`
- Body: `{ tenantId, event, payload, sentAt }`

10s timeout via `AbortController`. Exponential backoff (1m → 5m → 30m → 2h → 12h) on failure; after 5 retries the row is locked to `status: 'failed'` for human review. Marks `sent` on 2xx + populates `sentAt`. New `processOutboxBatch(tenantId, limit)` helper is independent of the request lifecycle so a future scheduler can call it. New endpoint `POST /api/outbox/:id/retry` resets a row for manual re-queue.

Verified end-to-end against `https://httpbin.org/anything` — `sent=1`, `status: 'sent'`, `sentAt` populated.

#### Web Push (M5.1)

**Schema** ([prisma/schema.prisma](prisma/schema.prisma)) — `PushSubscription` model: `tenantId, userId, endpoint (unique per tenant), p256dh, authKey, userAgent?, lastUsed?`.

**Server** ([server/index.ts](server/index.ts))
- `web-push` npm package installed, VAPID keys generated and wired in [.env](.env) (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY`)
- `GET /api/push/vapid-key` — exposes the public key to the frontend at runtime
- `POST /api/push/subscribe` — upsert per `(tenantId, endpoint)`. Updates `userId` when same device re-subscribes under a different login.
- `POST /api/push/unsubscribe` — removes the row scoped to caller's `userId`
- `POST /api/push/test` — sends a sample push to the caller's subscriptions; useful as a one-click sanity check.
- `sendPushForNotification(input)` is called from inside the existing `emitNotification` helper via `setImmediate` so push failures never slow down the originating action. Resolves which userIds match `tenant | user | role` scope, looks up their active subscriptions, and dispatches in parallel. 404/410 deliveries (dead endpoints) auto-prune the row.

**Frontend**
- [public/sw.js](public/sw.js) — service worker. Handles `push` events with `showNotification`, and `notificationclick` events to focus an existing tab via `postMessage({ type: 'NAV', link })` or open a new one.
- [src/store/index.ts](src/store/index.ts) — `useNotificationStore.requestBrowserPermission()` now also registers the SW and subscribes via `PushManager.subscribe()` using the VAPID key (env first, fetch fallback). New `unregisterPush()` action removes the subscription on logout. `urlBase64ToUint8Array()` helper converts the VAPID base64-url key to a `BufferSource`.
- [src/App.tsx](src/App.tsx) — `DataInitializer` re-runs `requestBrowserPermission()` on every auth load when `Notification.permission === 'granted'` (refreshes the subscription endpoint, which can rotate per device). Listens for SW `NAV` messages and forwards them to React Router instead of letting the SW do a hard `window.location.assign`.
- [src/components/Header.tsx](src/components/Header.tsx) — new "Send test" pill in the bell dropdown when push permission is granted; calls `/api/push/test` and toasts the dispatch result.

Verified: VAPID key endpoint returns the public key, subscribe → returns 201, send-test against a fake endpoint correctly reports `failed=1` (web-push attempted the POST), unsubscribe returns 200.

#### Ledger writers ([server/index.ts](server/index.ts))

Four new ledger emit sites so the General Ledger viewer fills out beyond supplier-payment / reconcile / purchase-return.

| Event | Ledger row |
|---|---|
| `POST /api/sales` with `status: 'completed'` | `income / sale / totalAmount` |
| `PATCH /api/sales/:id` flipping to `'completed'` | `income / sale / totalAmount` (guarded against duplicate on idempotent saves) |
| `POST /api/sale-returns` | `expense / sale / totalAmount` — paired with the original sale via `referenceId` |
| `POST /api/purchases` with `status: 'ordered'` or `'received'` | `payable / purchase / totalAmount` |
| `POST /api/expenses` | `expense / expense / amount` — category captured in description for free-text filtering |

Verified end-to-end: ledger now shows `by type: { payable: 2, expense: 4, income: 4 }` and `by referenceType: { purchase: 3, expense: 3, sale: 3, payment: 1 }` after exercising every writer. The `/ledger` page now reflects real revenue + expense activity per tenant.

#### Polish + bug-bash

- `npx tsc -p tsconfig.server.json --noEmit` — clean
- `npx tsc -p tsconfig.app.json --noEmit` — clean
- Fixed pre-existing bugs surfaced during type-check:
  - [src/components/Sidebar.tsx](src/components/Sidebar.tsx) — duplicate `ClipboardList` import (was added twice during M4/M6)
  - [src/App.tsx](src/App.tsx) — `Partners` and `Inbox` page imports had gone missing (overwritten by an earlier edit); routes were defined but components were undeclared
  - [src/pages/PurchaseOrders.tsx](src/pages/PurchaseOrders.tsx) — `Checkbox` was used in the M3 purchase-return dialog but never imported
  - [src/pages/Medicines.tsx](src/pages/Medicines.tsx) — barcode-image upload was assigning an `UploadResult` object where a string was expected (`processUploadedFile` returns `{ dataUrl, ... }`, not the data URL string directly)
  - [src/pages/Settings.tsx](src/pages/Settings.tsx) — payment-method defaults setter widened `feePercent` / `discountPercent` to `number | null` but the underlying `AppSettings` type only allows `number | undefined`; reworked the merge so nulls cleanly delete instead of leaking through
  - [src/store/index.ts](src/store/index.ts) — `PushManager.subscribe`'s `applicationServerKey` complained about `Uint8Array<ArrayBufferLike>`; added a `BufferSource` cast
  - [src/mobile/pages/MobileMore.tsx](src/mobile/pages/MobileMore.tsx) — bare `<X />` usages that hadn't been migrated when I aliased `X as XIcon` for the M8 supplier sheet
  - [src/mobile/pages/MobileMore.tsx](src/mobile/pages/MobileMore.tsx) — `tenant?.companyName` doesn't exist on `Tenant`; uses `tenant?.name`
  - [src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx) and [src/mobile/pages/MobileSales.tsx](src/mobile/pages/MobileSales.tsx) — `paymentMethods` was being treated as `string[]` instead of `PaymentMethod[]` (the runtime shape was already correct; just the type narrowing was wrong)
  - [src/lib/mockSeed.ts](src/lib/mockSeed.ts) — schema drift from M2/M3/M5 had left the offline-only mock returning old shapes; loosened with a final `as unknown as BootstrapResponse` cast so the offline fallback still loads
  - [src/lib/i18n.ts](src/lib/i18n.ts) — Arabic and Urdu translation dicts were missing the M0/M1–M7 keys (salesperson PIN, new nav entries). Added English fallback strings so the type checker is happy; runtime already had a fallback in `createTranslator()`.
- Curl-smoked 22 read endpoints — all 200 (one transient 500 from MySQL connection-pool exhaustion during the smoke barrage itself; not a code bug, resolved on retry)
- `/sw.js` is served correctly by Vite's static handler

Files touched this round: [server/index.ts](server/index.ts), [server/serializers.ts](server/serializers.ts), [prisma/schema.prisma](prisma/schema.prisma), [src/types/index.ts](src/types/index.ts), [src/lib/backend.ts](src/lib/backend.ts), [src/store/index.ts](src/store/index.ts), [src/App.tsx](src/App.tsx), [src/components/Header.tsx](src/components/Header.tsx), [src/components/Sidebar.tsx](src/components/Sidebar.tsx), [src/pages/Settings.tsx](src/pages/Settings.tsx), [src/pages/PurchaseOrders.tsx](src/pages/PurchaseOrders.tsx), [src/pages/Medicines.tsx](src/pages/Medicines.tsx), [src/mobile/pages/MobileMore.tsx](src/mobile/pages/MobileMore.tsx), [src/mobile/pages/MobilePOS.tsx](src/mobile/pages/MobilePOS.tsx), [src/mobile/pages/MobileSales.tsx](src/mobile/pages/MobileSales.tsx), [src/lib/mockSeed.ts](src/lib/mockSeed.ts), [src/lib/i18n.ts](src/lib/i18n.ts), [public/sw.js](public/sw.js) (new), [.env](.env), [.env.example](.env.example), [package.json](package.json) (web-push + @types/web-push deps), plus this changelog.

---

## 🚧 In progress

(nothing currently in flight)

---

## ✅ Done — 2026-05-29 — Coverage-audit follow-ups (mobile-responsive, branch RBAC extension, login audit + bulk supplier import, wholesale inbound PO)

**What changed**

Four hardening items surfaced by the post-M8 coverage audit, all shipped against the M1–M8 base.

1. **Mobile-responsive dialog base** — hardened the shadcn [DialogContent](src/components/ui/dialog.tsx) primitive so every dialog in the app gets mobile-safe defaults without touching the ~30 callers. Base classes now include `max-[639px]:!max-w-[calc(100vw-1rem)]` (mobile-only width cap with `!important` so caller's bare `max-w-2xl` etc. cannot defeat it via twMerge), `max-h-[95vh] overflow-y-auto` (tall dialogs scroll on phones), and `p-4 sm:p-6` (responsive padding). All callers that pass `max-w-*` still work — the mobile cap only kicks in below 640 px.
2. **Branch RBAC extended to remaining write endpoints** — added `assertBranchWrite(req, res, branchId)` inline helper next to the existing `requireBranchWrite` middleware in [server/index.ts](server/index.ts). Used where the branch can only be resolved by looking up a parent record. Applied to:
   - `POST /api/sale-returns` (resolves via `sale.branchId`)
   - `POST /api/purchase-invoices` (resolves via `purchase.branchId`)
   - `POST /api/purchase-returns` (resolves via `purchase.branchId` when `purchaseId` is provided)
   - `PATCH /api/sales/:id` (resolves via `sale.branchId`)
   - `PATCH /api/purchases/:id` (resolves via `purchase.branchId`)
3. **Login audit log** — `POST /api/auth/login` now writes `LOGIN_SUCCESS` and `LOGIN_FAILED` rows to `AuditLog` with `module: 'auth'`, the resolved tenant + user, IP address from `x-forwarded-for` or socket, and a `details` string describing the outcome (wrong password, inactive user, password not set). Unknown-email attempts skip the write because `AuditLog.tenantId` is FK-required.
4. **Bulk supplier import** — new `supplierBulkSchema` + `POST /api/suppliers/bulk` endpoint that mirrors the `POST /api/batches/bulk` pattern: per-row results, case-insensitive name dedupe against the tenant's existing suppliers. Frontend wrapper [bulkImportSuppliers](src/lib/backend.ts) consumed by [Suppliers.tsx](src/pages/Suppliers.tsx) `handleImportSuppliers` — uploads via the new endpoint, refetches `bootstrap` to refresh the local store, falls back to the legacy per-row `addSupplier` path if the bulk endpoint is unreachable (offline mode).
5. **Wholesale inbound PO consumer** — new `POST /api/webhooks/wholesale/po`. Counterpart to the M7 `purchase_order.created` outbox event so a wholesale ERP can push proposed POs back. Verifies HMAC-SHA256 against `partner.inboundSecret` using the raw request body (express.json's `verify` callback now stashes raw bytes on the request so the canonical payload is signed, not a re-serialized one). Resolves medicines by `medicineBarcode` or `medicineId` (mirrors the bulk-batch resolver), falls back to a synthetic line with `unresolved: true` for unknowns so the owner can map them after acceptance. Creates a `Purchase` with `status: 'draft'`, writes an `AuditLog` row (`WHOLESALE_PO_INBOUND`), and emits an owner-scoped Notification with the unresolved count.

**Files touched**

- [src/components/ui/dialog.tsx](src/components/ui/dialog.tsx) — DialogContent base hardened
- [server/index.ts](server/index.ts) — `assertBranchWrite` helper; branch checks in five endpoints; login audit writer; `supplierBulkSchema` + bulk endpoint; raw-body capture in `express.json({ verify })`; `wholesaleInboundPoSchema` + `POST /api/webhooks/wholesale/po`
- [src/lib/backend.ts](src/lib/backend.ts) — `BulkSupplierRow`, `BulkSupplierResult`, `bulkImportSuppliers()`
- [src/pages/Suppliers.tsx](src/pages/Suppliers.tsx) — `handleImportSuppliers` now uses the bulk endpoint with offline fallback

**Schema changes**

None — all additive on existing models (`AuditLog`, `Supplier`, `Purchase`).

**Verification**

- `npx tsc -p tsconfig.app.json --noEmit` clean
- `npx tsc -p tsconfig.server.json --noEmit` clean
- Curl smoke:
  - `POST /api/auth/login` (good creds) → `LOGIN_SUCCESS` row appears in `/api/audit-logs?action=LOGIN_SUCCESS`
  - `POST /api/auth/login` (bad creds) → `LOGIN_FAILED` row appears in `/api/audit-logs?action=LOGIN_FAILED` with IP
  - `POST /api/suppliers/bulk` with 3 fresh rows → all 3 created
  - Re-run same payload → 3 dedupe failures returned, all `created: 0`
  - `POST /api/webhooks/wholesale/po` with correct HMAC → 201 + draft purchase + audit + notification
  - Same with wrong / missing signature → 401
  - `PATCH /api/purchases/:id` for owner with full branch access → 200 (regression check that the new `assertBranchWrite` doesn't false-block)

**Known limitations**

- The legacy `POST /api/webhooks/wholesale/inbound` (inbox message) still uses a simple secret-equality check rather than full HMAC. The new `/wholesale/po` endpoint uses real HMAC; consider migrating the inbox stub to match before pointing a real partner at it.
- Bulk supplier dedupe is name-based (case-insensitive). Two suppliers with the same name but different NTNs / phones would collide. If that turns out to be common, switch to NTN or phone as the dedupe key.

---

## 📋 Planned (high-level)

Each milestone is detailed in [.claude/plans/stop-wrong-entry-while-parsed-wave.md](.claude/plans/stop-wrong-entry-while-parsed-wave.md).

- **M3 — Distributor mapping & multi-source**: MedicineSupplier join, supplier-filtered medicine picker in PO, multi-distributor POS picker, visit-day schedule, multi-invoice GRN, purchase return to supplier
- **M4 — Audit, reconcile, stock import**: AuditLog viewer, single-medicine / single-supplier scoped audits, ReconcileRun + ReconcileEntry, bulk batch import template
- **M5 — Notifications**: persisted Notification model, per-salesperson scoping, header bell flash + browser Notification API stub
- **M6 — Branch RBAC + shift / day-end close**: per-branch `read | full | none`, ShiftSession, DayClose, settings-gated toggles
- **M7 — Wholesale connector stubs + auto-PO + customer-return polish**: Outbox webhook scaffold, Thread+Message inbox, auto-PO from reorder
- **M8 — Mobile parity backfill**: missing mobile dialog/form variants, mobile receipt print via Share sheet

---

## How to add to this file

When something completes, append a dated section under "✅ Done" with: short description, files touched (using `[file](path)` markdown links), schema changes if any, and a one-line verification command or UI walk-through.
