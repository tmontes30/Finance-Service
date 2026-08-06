# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

This is a **static SPA** with no build system. Development is done by editing files directly and refreshing the browser. All dependencies (Firebase compat SDK v10, Chart.js v4.4.0) are loaded via CDN in `index.html`.

To run locally, serve the files with any static file server, e.g.:
```bash
npx serve .
# or
python -m http.server 8080
```

## Architecture

The app is a vanilla JS single-page application backed by Firebase (Firestore + Auth).

**Module initialization order** (defined in `auth.js` `_setupApp()`):
1. `auth.js` — initializes the Firebase app, listens to `onAuthStateChanged`, calls `Storage.init` + `Data.init`, then navigates to dashboard
2. `storage.js` — CRUD wrapper around the Firestore compat client; documents already use camelCase field names (no snake_case translation needed)
3. `data.js` — Business logic on top of `storage.js`; handles balance side-effects for expenses/incomes
4. Feature modules (`dashboard.js`, `expenses.js`, `accounts.js`, `categories.js`, `projection.js`, `export.js`, `budget-view.js`)

**Data flow:** Feature modules call `Data.*` → `Storage.*` → Firestore API.

**Firestore data model:** everything lives under `users/{uid}` — isolation is by document path, not a `user_id` filter column. `users/{uid}` itself holds the profile (`nombre`, `apellido`, `rut`, `telefono`, `email`) and the settings fields (`currency`, `dashboardPeriod`, `projIncome`, `projExpenses`, `projSnapshotPatrimony`, `projSnapshotDate`, `budgetAmount`, `budgetMode`). Subcollections `users/{uid}/expenses`, `.../incomes`, `.../accounts`, `.../categories` hold the corresponding records, same `id`s as `genId()` generates. Security rules (`firestore.rules`, must be published in Firebase Console → Firestore → Rules) allow read/write only when `request.auth.uid == uid`.

**Routing:** `Router` object in `app.js` shows/hides `#view-{name}` elements and calls each module's `render()`. Active view is `Router._current` (string).

**Account balance:** Stored directly on the `accounts` row and mutated by `Storage.adjustAccountBalance()` whenever an expense or income is added, updated, or deleted. There is no derived calculation. Planned expenses (`isPlanned: true`) do NOT adjust account balances.

**Incomes:** A first-class entity (table: `incomes`) linked to an account. Adding income increases account balance; deleting reverses it. The `accounts.js` view renders both the account list and the income history for each account (`#income-history-section`).

**Account balance adjustment:** When editing an account (⚙️), a "Ajustar saldo" section appears below the balance field. The user picks `+ Sumar` or `− Restar`, enters an amount, and sees a live preview (`$X + $Y = $Z`). On save, `finalBalance = storedBalance ± delta`. This is for reconciling investment accounts without recording the change as income or expense. The current balance during edit is stored in `Accounts._editingBalance`.

## Key Conventions

- **Firebase credentials** are in `js/config.js` (`FIREBASE_CONFIG` — public web config, safe to commit; protected by Firestore security rules, not secrecy).
- **Firestore security rules** are in `firestore.rules` — must be manually published in Firebase Console → Firestore Database → Rules after any change (editing the file locally does nothing on its own).
- **UI patterns:** Modals and toast notifications are managed through `ui.js`. Use `UI.confirm()` / `UI.toast()` for user feedback.
- **Language:** The UI is in **neutral Spanish** (no Argentine voseo). Use `tú` forms: "quieres", "puedes", "ingresa", "define" — never "querés", "podés", "ingresá", "definí".
- **Theme:** Dark/light toggle persisted to `localStorage` (`financeTheme`). CSS vars are defined in `:root` (dark) and overridden in `[data-theme="light"]` in `css/main.css`. **Never hardcode colors** — always use `var(--color-*)`. For Chart.js colors that can't use CSS vars, read them at render time with `getComputedStyle(document.documentElement).getPropertyValue('--color-surface')`.
- **Predefined categories:** 8 default categories (`PREDEFINED_CATEGORIES` in `data.js`) are seeded into the database on first login. `ACCOUNT_TYPES` (6 types) is a client-side constant only, never stored in DB.
- **`PatrimonioToggle`** in `app.js` persists wealth-masking state to `localStorage` (`patrimonioHidden`).
- **Favicon:** Inline SVG in `<head>` — purple rounded square with ⚡, no external file needed.

## Gastos Previstos

A "Gasto Previsto" is an expense the user knows will happen in a future month — registered now to track it in the expense flow, but **it does not deduct from account balances yet**. This distinction must be clear in any UI copy.

Key behaviours:
- Planned expenses do not deduct from account balances (money hasn't moved yet).
- `updateExpense` compares old/new `isPlanned` state to correctly apply or reverse balance adjustments.
- In `projection.js`, planned expenses for future months are subtracted as one-off deductions from the projected line (`plannedThisMonth` per month key); excluded from real-line reconstruction. Each month object carries `plannedThisMonth` so the detail table adds it to Gastos and Balance columns.
- **Dashboard filtering:** `dashboard.js` excludes planned expenses whose month ≠ selected month at the top of `render()`. Monthly stat uses `date.startsWith(selKey)` — never `>= monthFrom` — to prevent future dates leaking into current month totals.
- A yellow `.planned-badge` shows the target month (`YYYY/MM`) in the expenses list.
- The expense modal checkbox shows a hint explaining the concept; when checked, a `type="month"` picker (labelled "¿En qué mes va a ocurrir?") replaces the date field; `date` is set to `YYYY-MM-01` on save.
- Expenses list filter: "Solo previstos (futuros)" / "Solo reales (realizados)".
- Field: `isPlanned` on each `users/{uid}/expenses/{id}` document.

## Firestore Field Notes

Firestore is schemaless — new fields just get written, no migration step needed (unlike the old Postgres `ALTER TABLE`). Fields currently expected on `users/{uid}` (settings, written via `Storage.saveSettings()`):
- `projIncome`, `projExpenses` — projection monthly parameters
- `projSnapshotPatrimony`, `projSnapshotDate` — frozen projection baseline
- `budgetAmount` — user-defined monthly budget (`null` = not set)
- `budgetMode` — `'manual'` or `'auto'` (default `'auto'`)

## Dashboard

- **Month navigation:** `Dashboard._monthOffset` (0 = current month, negative = past). `‹`/`›` arrows update offset and re-render. All stats filter to the selected month (`selKey = YYYY-MM`). The `›` arrow is disabled when on the current month. Charts shift their 12-month window based on `selDate`.
- **Period selector** (Este mes / 3 meses / Año / Todo) is hidden when `_monthOffset !== 0` — it doesn't make sense for past months.
- **Category chart** uses `monthExpenses` (filtered to `selKey`) when `_monthOffset !== 0`, so navigating to a past month shows that month's category breakdown.
- **Chart theme awareness:** When the theme toggle is clicked and `Router._current === 'dashboard'`, `Dashboard.render()` is called to refresh charts with the new theme's surface color.
- **Charts:**
  - Monthly bar (12 months, shifts with `selDate`)
  - Category doughnut (respects selected month)
  - Net savings bar (`_renderSavingsChart`) — income minus real expenses per month for last 12 months, green/red per month. Always uses current date, not `selDate`. Canvas `#chart-savings`.

## Auth / Login

### Splash Screen
- `#splash-screen` (`.splash-screen`) is shown by default on page load (`z-index: 10000`, above everything).
- `#auth-screen` starts with `display:none` — the splash covers it during session restore.
- `Auth._hideSplash()` adds `.splash-hidden` (opacity → 0, transition 0.4s) then removes the element after 420ms. Called after the first `onAuthStateChanged` resolution, regardless of whether a session exists.
- Design: full-screen `--color-bg` background, large ⚡ with pulse animation, "Finance" gradient text, three bouncing dots (`@keyframes splash-dot`).

### Forgot Password Flow
- "¿Olvidaste tu contraseña?" button (`#auth-forgot-link`) is visible in login mode only (hidden in register mode via `authToggle` click handler).
- Clicking it hides `#auth-form` + toggle + itself, shows `#auth-forgot-section` and changes title.
- "← Volver" (`#btn-forgot-back`) reverses that.
- Send handler calls `Auth.sendPasswordReset(email)` → `firebase.auth().sendPasswordResetEmail(email, { url: 'https://tmontes30.github.io/Finance-Service/', handleCodeInApp: true })`.
- Firebase redirects back to the app with `?mode=resetPassword&oobCode=...` in the URL instead of firing an auth event. `Auth.init()` detects those params on load, strips them via `history.replaceState`, calls `verifyPasswordResetCode` and shows `#auth-recovery-section` directly (before the normal login/dashboard branching).
- Save handler calls `Auth.updatePassword(newPassword)` → `confirmPasswordReset(oobCode, newPassword)` then `signInWithEmailAndPassword` with the recovered email. The already-attached `onAuthStateChanged` listener picks up the resulting sign-in and runs `_setupApp()` automatically, same as a normal login.
- **Firebase Console required:** the redirect domain (`tmontes30.github.io`) must be listed under Authentication → Settings → Authorized domains, or `sendPasswordResetEmail` fails.

### Registration Security
- Confirm password field (`#auth-password-confirm`, `register-only`) validated on submit before calling Firebase.
- Minimum 8 characters enforced on frontend (Firebase's own minimum is 6 — the 8-char rule is app-side only).
- Password strength bar (`#password-strength`, `.strength-bar-fill`) appears while typing in register mode: Débil (<8), Buena (8+ with number), Fuerte (8+ with number + symbol). Driven by `input` listener on `#auth-password`.
- `Auth.signupWithEmail()` creates the Firebase user, writes `nombre`/`apellido`/`rut`/`telefono`/`email` to `users/{uid}` in Firestore, then explicitly signs the user back out (`_suppressAuthEvents` flag prevents the transient sign-in from triggering `_setupApp()`) — registration requires an explicit login afterward, matching the pre-migration UX.
- `_mapAuthError()` in `app.js` maps Firebase `error.code` values (`auth/wrong-password`, `auth/email-already-in-use`, etc.), not message substrings.

### Visual
- `#auth-screen` background: `radial-gradient` with subtle purple tint.
- `.auth-card`: `border-top: 3px solid var(--color-primary)`, `box-shadow: 0 8px 32px rgba(0,0,0,0.25)`.

## Budget Prediction (`js/budget.js`)

- `Budget.compute(allExpenses)` — pure function, no DB calls.
- **Algorithm:** groups real (non-planned) expenses by month, takes last 1–3 complete months.
  - **Per-month dominant-transaction removal:** if a single transaction accounts for > 50% of that month's total, it is removed before summing (e.g. a one-off vehicle purchase). This avoids removing legitimate large recurring expenses (rent, credit cards) which rarely exceed 50% of total. IQR-based per-transaction removal was replaced because it incorrectly filtered out large-but-normal expenses when most transactions are small.
  - **Inter-month outlier removal:** when 3 months available, months where `|total − mean| > 1.5 × stdDev` are excluded.
- **Returns:** `{ budget, monthsUsed, currentSpend, pct, daysLeft, projected, delta }`.
- `Budget.getEffectiveBudget(allExpenses)` — used by the dashboard. Checks `settings.budgetMode`:
  - `'manual'`: uses `settings.budgetAmount` as the budget; recomputes `pct` and `delta` against that amount. Adds `isManual: true` and `computedBudget` (the auto estimate) to the result.
  - `'auto'`: returns `Budget.compute()` result unchanged.
  - Works even with no history (returns current-month spending vs manual amount).
- **Dashboard integration:** `Dashboard._renderBudgetInsight(data)` renders `#budget-insight` card. Called with `Budget.getEffectiveBudget(_allExpenses)`. Shows `'manual'` badge or `'N mes(es)'` badge. **No daily-rate projection footer** — linear extrapolation is misleading since large one-off expenses (credit cards, subscriptions) cluster at month start. Hidden when `_monthOffset !== 0`.
- **Progress bar color:** green < 51%, amber 51–84%, red ≥ 85%.

## Presupuesto Tab (`js/budget-view.js`)

- 6th nav tab, `#view-budget`, rendered by `BudgetView.render()`.
- **Budget mode toggle:** Manual (user sets amount) vs Automático (uses `Budget.compute()`). Saved to `settings.budgetMode` + `settings.budgetAmount`.
- **Computed hint:** always shows the auto-computed estimate as a reference regardless of mode.
- **Category insights** (`_renderCategoryInsights`): shows last ≤6 complete months of real expenses grouped by category. Per category: % of total, avg/month, last month value, and a peak-month note if a month had 1.5× the last month's spend. Sorted by avg desc.
- **Monthly summary** (`_renderMonthlySummary`): table of last 7 months with total and vs-budget column (only when a budget is set). Green = under budget, red = over.

## Proyección Fija (Frozen Projection)

- On first save of projection parameters, `Data.resetProjectionSnapshot()` stores current total patrimony + today's date in `settings` (`proj_snapshot_patrimony`, `proj_snapshot_date`).
- `_renderProjection()` uses this frozen base for the projected line.
- Reset manually via "↺ Actualizar base" button. Subsequent saves of income/expenses do NOT overwrite the snapshot.
- **Horizon cards** (`#proj-h3`, `#proj-h6`, `#proj-h12`): show projected patrimony at 3, 6, 12 months with delta vs today. 12-month card has purple border. Replaces the old month-by-month detail table.
- **Simplified chart:** single projected line only (no "Real" overlay). Canvas `#chart-projection`.
- **Trend card** (`#proj-trend-card`): ↗ (green) or ↘ (red) with plain-language text — months until depletion if negative balance, 12-month target if positive.
- **Early income warning** (`#proj-early-income-note`): shown when a snapshot exists. Warns about advance salary inflating the base.
- **Projection subtitle:** `.view-subtitle` under the h1 header.

## Categorías (`js/categories.js`)

Las categorías **no tienen pestaña propia** — están integradas como panel colapsable al inicio de la vista Gastos (`#view-expenses`).

- **Toggle:** `#btn-toggle-categories` muestra/oculta `#categories-panel-body`. El badge `#categories-count-badge` muestra el total de categorías.
- **Agregar:** fila inline con `#new-cat-name`, `#new-cat-color`, `#btn-save-category`. Enter en el input también guarda.
- **Lista:** chips compactos (`.cat-chip`) con swatch de color, nombre, contador de gastos, botón editar (✏️) y eliminar (✕). Las predefinidas no tienen botón eliminar.
- **Editar inline:** `_startEdit(id)` reemplaza el nombre del chip con inputs en línea.
- **Router:** `'categories'` fue eliminado de `Router._views` y `_viewNames`. `Categories.render()` ya no se llama desde el Router — se llama al abrir el panel.

## Responsive / Mobile

- Breakpoints: `≤900px` (tablet), `≤640px` (mobile), `≤380px` (very small) — all in `css/responsive.css`.
- **Mobile navbar:** Single-row `[⚡] [scrollable tabs] [☰]`. On mobile `.brand-name` ("Finance") is hidden — only the ⚡ icon shows — to maximise tab space. The 🌙 theme toggle is also hidden from the navbar (`display: none !important`) and moved to the mobile subheader instead.
- **Mobile subheader** (`.mobile-subheader`, `#mobile-subheader`): `position: fixed; top: var(--nav-height); height: 40px`. Shows the current view name on the left and the 🌙 theme toggle on the right. `Router.navigate()` updates `#mobile-view-name`. The dashboard shows "Finance" (not "Dashboard") here — defined in `Router._viewNames`. Main content has extra `margin-top: calc(56px + 40px)` on mobile to account for this bar. View `h1` headings and `.view-subtitle` are hidden on mobile (`.view-header > h1 { display: none }`); `.view-title-group` (budget view wrapper div) is also hidden.
- **Hamburger dropdown** (`#navbar-dropdown`): floating card (`padding: 0.4rem`, inner items use `border-radius: var(--radius)`, no per-item borders). Contains 5 nav tabs (`.nav-link-drop[data-view]`) — Dashboard, Cuentas, Gastos, Proyección, Presupuesto — then a subtle divider (`.navbar-dropdown-divider`), then "Agregar Gasto" y "Salir". Nav links wired via `querySelectorAll('.nav-link-drop[data-view]')` in `app.js`. **Categorías fue eliminada del nav** — vive dentro de la vista Gastos.
- **FAB** (`#btn-fab`): 58px purple circle with `+`, `position: fixed` bottom-right, `z-index: 500`. Outside `#app-wrapper` (end of `<body>`) so `position: fixed` works reliably on iOS Safari. Shown via `.fab-active` class toggled in `auth._hideAuth()` / `auth._showAuth()`; only visible on mobile via `@media (max-width: 640px)`. **FAB hides when expense modal opens** (`UI.openExpenseModal` removes `.fab-active`; `closeExpenseModal` restores it).
- **Modal scroll:** `.modal` uses `display:flex; flex-direction:column; max-height:90vh`. Only `.modal-body` has `overflow-y:auto` — header and footer (Save button) always visible.
- **Modal sizing:** Reduced padding (header `0.9rem 1.25rem`, body `1.1rem 1.25rem`, footer `0.75rem 1.25rem`). Inputs/selects inside modal use `font-size: 0.875rem; padding: 0.4rem 0.65rem` for a compact feel.
- **Logo click:** `#navbar-brand` click → `Router.navigate('dashboard')`.
