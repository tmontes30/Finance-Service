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

**Storage cache:** `Storage.get{Expenses,Incomes,Accounts,Categories}()` keep an in-memory per-collection cache (the promise is cached so parallel reads share one query). Every write method is wrapped at the bottom of `storage.js` to invalidate its collection before and after the write. `Storage.invalidateAll()` runs when the app returns after >60s in background (`visibilitychange` in `app.js`) so changes made from other devices show up. If you add a new write method, add it to that wrapper list.

**Dates:** always use `localISODate(d?)` (defined in `data.js`) for `YYYY-MM-DD`. Never `toISOString()` — it is UTC, and in Chile after ~21:00 it returns tomorrow's date.

**Firestore data model:** everything lives under `users/{uid}` — isolation is by document path, not a `user_id` filter column. `users/{uid}` itself holds the profile (`nombre`, `apellido`, `rut`, `telefono`, `email`) and the settings fields (`currency`, `dashboardPeriod`, `projIncome`, `projExpenses`, `projSnapshotPatrimony`, `projSnapshotDate`, `budgetAmount`, `budgetMode`). Subcollections `users/{uid}/expenses`, `.../incomes`, `.../accounts`, `.../categories` hold the corresponding records, same `id`s as `genId()` generates. Security rules (`firestore.rules`, must be published in Firebase Console → Firestore → Rules) allow read/write only when `request.auth.uid == uid`.

**Routing:** `Router` object in `app.js` shows/hides `#view-{name}` elements and calls each module's `render()`. Active view is `Router._current` (string). `Router.refresh()` re-renders only the current view — call it after any save/delete (other views render when navigated to).

**Account balance:** Stored directly on the `accounts` row and mutated by `Storage.adjustAccountBalance()` whenever an expense or income is added, updated, or deleted. There is no derived calculation. Planned expenses (`isPlanned: true`) do NOT adjust account balances.
**Incomes:** A first-class entity (table: `incomes`) linked to an account. Adding income increases account balance; deleting reverses it. The `accounts.js` view renders both the account list and the income history for each account (`#income-history-section`).

**Account balance adjustment:** When editing an account (tap its row), a "Ajustar saldo" section appears below the balance field. The user picks `+ Sumar` or `− Restar`, enters an amount, and sees a live preview (`$X + $Y = $Z`). On save, `finalBalance = storedBalance ± delta`. This is for reconciling investment accounts without recording the change as income or expense. The current balance during edit is stored in `Accounts._editingBalance`.

## Key Conventions

- **Firebase credentials** are in `js/config.js` (`FIREBASE_CONFIG` — public web config, safe to commit; protected by Firestore security rules, not secrecy).
- **Firestore security rules** are in `firestore.rules` — must be manually published in Firebase Console → Firestore Database → Rules after any change (editing the file locally does nothing on its own).
- **UI patterns:** Modals and toast notifications are managed through `ui.js`. Use `UI.confirm(message, onConfirm, { okLabel, danger })` / `UI.toast()` for user feedback. Open/close every modal with `UI.openModal(id, { onClose })` / `UI.closeModal(id)` — never set `style.display` directly (the helpers handle the stack, animation, body scroll lock, swipe-to-dismiss and the iOS keyboard viewport). Buttons with `data-close="modal-id"` close automatically; ESC closes the top modal.
- **Icons:** SVG sprite at the top of `<body>` in `index.html` (`<symbol id="i-NAME">`). In HTML: `<svg class="i"><use href="#i-NAME"/></svg>`; in JS: `UI.icon('NAME')`. No emoji in UI chrome. New icons go in the sprite (stroke-based, 24×24, lucide style). `ACCOUNT_TYPES[type].svg` names the icon of each account type.
- **Lists:** rows are `.tx-row` inside `.list-group` (iOS inset grouped). `UI.txIcon(color, content)` draws the colored leading icon. Tapping a row opens its edit sheet; delete lives inside the edit sheet (`#btn-expense-delete`, `#btn-income-delete`, `#btn-account-delete`).
- **Language:** The UI is in **neutral Spanish** (no Argentine voseo). Use `tú` forms: "quieres", "puedes", "ingresa", "define" — never "querés", "podés", "ingresá", "definí".
- **Theme:** `Theme` object in `app.js`; preference `'dark' | 'light' | 'system'` persisted to `localStorage` (`financeTheme`), chosen in the Ajustes sheet (`#theme-segment`). An inline script in `<head>` applies it before first paint. Tokens are defined in `:root` (dark) and overridden in `[data-theme="light"]` in `css/main.css`, including `--chart-*` (charts) and `--hero-*` (purple hero card). **Never hardcode colors** — always use `var(--color-*)`. Chart.js reads colors via `Dashboard._theme()` (getComputedStyle); on theme change `Dashboard.resetCharts()` + `Projection.resetChart()` destroy the charts so they are rebuilt with the new colors. `meta[name=theme-color]` is synced to `--color-bg`.
- **Predefined categories:** 8 default categories (`PREDEFINED_CATEGORIES` in `data.js`) are seeded into the database on first login. `ACCOUNT_TYPES` (6 types) is a client-side constant only, never stored in DB.
- **`PatrimonioToggle`** in `app.js` persists wealth-masking state to `localStorage` (`patrimonioHidden`).
- **Favicon / PWA:** Inline SVG favicon in `<head>`. `icons/apple-touch-icon.png` (180), `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` + `manifest.webmanifest` let users "Agregar a pantalla de inicio" on iPhone and run it standalone (`apple-mobile-web-app-status-bar-style: black-translucent`, so safe-area padding matters). No service worker.

## Gastos Previstos

A "Gasto Previsto" is an expense the user knows will happen in a future month — registered now to track it in the expense flow, but **it does not deduct from account balances yet**. This distinction must be clear in any UI copy.

Key behaviours:
- Planned expenses do not deduct from account balances (money hasn't moved yet).
- `updateExpense` compares old/new `isPlanned` state to correctly apply or reverse balance adjustments.
- In `projection.js`, planned expenses for future months are subtracted as one-off deductions from the projected line (`plannedThisMonth` per month key); excluded from real-line reconstruction. Each month object carries `plannedThisMonth` so the detail table adds it to Gastos and Balance columns.
- **Dashboard filtering:** `dashboard.js` excludes planned expenses whose month ≠ selected month at the top of `render()`. Monthly stat uses `date.startsWith(selKey)` — never `>= monthFrom` — to prevent future dates leaking into current month totals.
- In the expenses list, planned expenses are grouped under "Previsto · <Mes Año>" with a yellow `.planned-badge` ("Previsto"; flat lists and the dashboard show `Previsto MM/YYYY`).
- The expense sheet toggle ("Gasto previsto") shows a hint explaining the concept; when on, a `type="month"` picker (labelled "¿En qué mes va a ocurrir?", defaults to next month) replaces the date field; `date` is set to `YYYY-MM-01` on save.
- Expenses list segmented control `#type-segment`: Todos / Realizados / Previstos (`Expenses._type`).
- Field: `isPlanned` on each `users/{uid}/expenses/{id}` document.

## Firestore Field Notes

Firestore is schemaless — new fields just get written, no migration step needed (unlike the old Postgres `ALTER TABLE`). Fields currently expected on `users/{uid}` (settings, written via `Storage.saveSettings()`):
- `projIncome`, `projExpenses` — projection monthly parameters
- `projSnapshotPatrimony`, `projSnapshotDate` — frozen projection baseline
- `budgetAmount` — user-defined monthly budget (`null` = not set)
- `budgetMode` — `'manual'` or `'auto'` (default `'auto'`)

## Dashboard

- **Layout (mobile):** greeting + large title → purple hero card (patrimonio + net savings of the selected month in `#hero-sub`) → month navigator → "Gastado este mes" card (`#stat-cards`: big `#stat-month`, budget bar, mini stats Hoy / Ingresos del mes / En el año) → "Últimos gastos" (`#recent-list`, 5 most recent of the selected month, tap to edit) → charts. Desktop (≥1024px) splits into two columns (`.dash-grid`).
- **Month navigation:** `Dashboard._monthOffset` (0 = current month, negative = past). `‹`/`›` arrows update offset and re-render. All stats filter to the selected month (`selKey = YYYY-MM`). The `›` arrow is disabled when on the current month. Charts shift their 12-month window based on `selDate`.
- **Period selector** (Mes / 3M / Año / Todo, `#period-selector`) lives in the "Por categoría" card header because it only affects that chart. Hidden when `_monthOffset !== 0`.
- **Category chart** uses `monthExpenses` (filtered to `selKey`) when `_monthOffset !== 0`. Doughnut with the total in the center (`#donut-total`) and an HTML legend (`#category-legend`, top 5 + "Otras").
- **Chart axes** use `Dashboard._compact()` ($1,2M / $450k) so they fit on iPhone; tooltips show full amounts and full month names.
- **Charts:**
  - Monthly bar (12 months, shifts with `selDate`)
  - Category doughnut (respects selected month)
  - Net savings bar (`_renderSavingsChart`) — income minus real expenses per month for last 12 months, green/red per month. Always uses current date, not `selDate`. Canvas `#chart-savings`.
  - Accounts section: income vs expenses (6 months) and balance per account (height grows with the number of accounts).

## Auth / Login

### Splash Screen
- `#splash-screen` (`.splash-screen`) is shown by default on page load (`z-index: 10000`, above everything).
- `#auth-screen` starts with `display:none` — the splash covers it during session restore.
- After login, `auth.js` calls `setUserProfile(name, email)` (app.js), which fills the avatars (`[data-avatar]` initials), the Ajustes profile and the dashboard greeting.
- `Auth._hideSplash()` adds `.splash-hidden` (opacity → 0, transition 0.4s) then removes the element after 420ms. Called after the first `onAuthStateChanged` resolution, regardless of whether a session exists.
- Design: full-screen `--color-bg` background, purple app icon with ⚡ (pulse animation) and three bouncing dots (`@keyframes splash-dot`).

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
- Flat full-screen layout (no card) with the app icon, large 16px inputs (required so iOS doesn't zoom) and a show/hide password button (`.password-reveal`).

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
- **Dashboard integration:** `Dashboard._renderBudgetInsight(data)` renders `#budget-insight` (inside the month card), `#budget-months-tag` and a "Te quedan $X / Te pasaste por $X" footer. Called with `Budget.getEffectiveBudget(_allExpenses)`. Shows `'manual'` badge or `'N mes(es)'` badge. **No daily-rate projection footer** — linear extrapolation is misleading since large one-off expenses (credit cards, subscriptions) cluster at month start. Hidden when `_monthOffset !== 0`.
- **Progress bar color:** green < 51%, amber 51–84%, red ≥ 85%.

## Presupuesto Tab (`js/budget-view.js`)

- `#view-budget`, rendered by `BudgetView.render()`. On iPhone it shares the "Plan" tab with Proyección: both views have a `.plan-switch` segmented control (`.plan-switch-btn[data-view]`), and the tab remembers the last one used (`Router._lastPlan`).
- **Budget mode toggle:** Manual (user sets amount) vs Automático (uses `Budget.compute()`). Saved to `settings.budgetMode` + `settings.budgetAmount`.
- **Computed hint:** always shows the auto-computed estimate as a reference regardless of mode.
- **Category insights** (`_renderCategoryInsights`): shows last ≤6 complete months of real expenses grouped by category. Per category: % of total, avg/month, last month value, and a peak-month note if a month had 1.5× the last month's spend. Sorted by avg desc.
- **Monthly summary** (`_renderMonthlySummary`): rows (`.month-row`, not a table — tables overflowed on iPhone) for the last 7 months with total, count, and a progress bar + difference vs the effective budget (manual amount or auto estimate). Green = under, red = over.

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

Las categorías **no tienen pestaña propia**: se gestionan en una hoja (`#modal-categories`) que se abre desde Ajustes (fila `#btn-toggle-categories`, con el total en `#categories-count-badge`) o desde el botón "Categorías" de la vista Gastos en escritorio (`#btn-open-categories`). `Categories.open()` abre la hoja y renderiza.

- **Agregar:** fila con `#new-cat-color`, `#new-cat-name`, `#btn-save-category`. Enter en el input también guarda.
- **Lista:** filas `.tx-row.cat-row` con inicial de color, nombre, contador de gastos, editar (lápiz) y eliminar (papelera). Las predefinidas no tienen botón eliminar; una categoría con gastos tampoco se puede eliminar.
- **Editar inline:** `_startEdit(id)` reemplaza el contenido de la fila con color + nombre + guardar/cancelar.
- En el formulario de gasto las categorías se eligen con chips (`#expense-category-chips`); el valor va en el input oculto `#expense-category`.

## Responsive / Mobile (iPhone-first)

The base CSS is **mobile-first** (designed for iPhone). `css/responsive.css` adds `≥600px` (tablet: centered dialogs instead of bottom sheets, 2-col charts) and `≥1024px` (desktop: top navbar, two-column dashboard/plan), plus a `≤375px` tweak for iPhone SE/mini. Hover styles only apply under `@media (hover: hover) and (pointer: fine)`.

- **Viewport:** `viewport-fit=cover`; safe areas via `--safe-top/bottom/left/right` (`env(safe-area-inset-*)`). Header, tab bar, sheets and toasts all pad for the notch / Dynamic Island and the home indicator.
- **Inputs:** every input/select is ≥16px (`1rem`) — smaller sizes make iOS Safari zoom on focus. Money fields use `inputmode="numeric"` + `UI.attachMoneyFormat`. Touch targets are ≥44px.
- **Tab bar** (`.tabbar`, phone/tablet only): Inicio · Gastos · ➕ (`#btn-fab`, opens the new-expense sheet) · Cuentas · Plan (`data-group="plan"` → Presupuesto/Proyección). Tapping the active tab scrolls to top.
- **Header** (`#app-header`, phone/tablet only): transparent over the large view title; turns into a blurred bar with the compact title (`#mobile-view-name`, from `Router._viewNames`) after scrolling 36px (`Header` in `app.js`). Right side: avatar button → Ajustes.
- **Desktop navbar** (`.navbar`, ≥1024px): links, "+ Agregar" (`#btn-add-expense`) and avatar (`#btn-open-settings`).
- **Ajustes sheet** (`#modal-settings`): profile, theme (Oscuro/Claro/Auto), "Ocultar patrimonio" (synced with `PatrimonioToggle`), Categorías, Exportar CSV, Cerrar sesión (`#btn-logout`, asks for confirmation).
- **Sheets:** on phones every modal is a bottom sheet (`.modal` slides up, `.sheet-grabber`, drag the header down to dismiss). The overlay follows `visualViewport` (`--vvh`, `--vv-top`) so the sheet sits above the iOS keyboard. Footer buttons are full-width and padded for the home indicator. `UI.confirm` renders as an iOS action sheet.
- **Keyboard on open:** iOS only shows the keyboard if `focus()` happens inside the tap. `UI.focusWithKeyboard(el)` focuses a hidden proxy input synchronously and then moves focus to the real field; `openExpenseModal` / `Accounts.openIncomeModal` do their synchronous setup first and only then await data.
- **Gasto ↔ Ingreso:** the new-expense and new-income sheets have a segmented switch at the top (`#expense-kind-switch`, `#income-kind-switch`) that swaps sheets keeping the typed amount. The last account used for an expense is preselected (`localStorage.lastAccountId`).
- **Expenses view:** live search (`#filter-text`), filters sheet (`#modal-filters`: sort field, category, dates, amounts), removable active-filter chips, list grouped by day with daily totals, "Mostrar más" (40 per page), and "Seleccionar" mode with a floating `.bulk-bar` for bulk delete.
- **Logo click:** `#navbar-brand` click → `Router.navigate('dashboard')`.
