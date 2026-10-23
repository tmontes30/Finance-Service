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
4. Feature modules (`dashboard.js`, `expenses.js`, `accounts.js`, `categories.js`, `plan.js`, `export.js`); `budget.js` is the pure budget algorithm used by Dashboard and Plan

**Data flow:** Feature modules call `Data.*` → `Storage.*` → Firestore API.

**Storage cache:** `Storage.get{Expenses,Incomes,Accounts,Categories}()` keep an in-memory per-collection cache (the promise is cached so parallel reads share one query). Every write method is wrapped at the bottom of `storage.js` to invalidate its collection before and after the write. `Storage.invalidateAll()` runs when the app returns after >60s in background (`visibilitychange` in `app.js`) so changes made from other devices show up. If you add a new write method, add it to that wrapper list.

**Dates:** always use `localISODate(d?)` (defined in `data.js`) for `YYYY-MM-DD`. Never `toISOString()` — it is UTC, and in Chile after ~21:00 it returns tomorrow's date.

**Firestore data model:** everything lives under `users/{uid}` — isolation is by document path, not a `user_id` filter column. `users/{uid}` itself holds the profile (`nombre`, `apellido`, `rut`, `telefono`, `email`) and the settings fields (`currency`, `dashboardPeriod`, `projIncome`, `projExpenses`, `projSnapshotPatrimony`, `projSnapshotDate`, `budgetAmount`, `budgetMode`). Subcollections `users/{uid}/expenses`, `.../incomes`, `.../accounts`, `.../categories`, `.../plans` (fixed cash-flow plans) and `.../snapshots` (monthly real patrimony, doc id `YYYY-MM`) hold the corresponding records, same `id`s as `genId()` generates. Security rules (`firestore.rules`, must be published in Firebase Console → Firestore → Rules) allow read/write only when `request.auth.uid == uid`.

**Routing:** views are `dashboard`, `expenses`, `accounts`, `plan`. `Router` object in `app.js` shows/hides `#view-{name}` elements (shown view gets `style.display = ''` so CSS can make it a grid) and calls each module's `render()`. Active view is `Router._current` (string). `Router.refresh()` re-renders only the current view — call it after any save/delete (other views render when navigated to).

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
- **Brand / logo:** "Pulso" — a gold pulse line that ends rising, on a near-black tile. Single source: `icons/logo.svg` (used via `<img class="logo-img">` in the sidebar, login and splash, and as the SVG favicon). PNG icons in `icons/` are rendered from that file (maskable one at 80%). The logo is self-contained (own background); the app UI keeps the blue primary (`--color-primary`, `--hero-gradient`), deliberately not purple (that's the Momentum app).
- **Favicon / PWA:** Inline SVG favicon in `<head>`. `icons/apple-touch-icon.png` (180), `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` + `manifest.webmanifest` let users "Agregar a pantalla de inicio" on iPhone and run it standalone (`apple-mobile-web-app-status-bar-style: black-translucent`, so safe-area padding matters). No service worker.

## Gastos Previstos

A "Gasto Previsto" is an expense the user knows will happen in a future month — registered now to track it in the expense flow, but **it does not deduct from account balances yet**. This distinction must be clear in any UI copy.

Key behaviours:
- Planned expenses do not deduct from account balances (money hasn't moved yet).
- `updateExpense` compares old/new `isPlanned` state to correctly apply or reverse balance adjustments.
- In `plan.js`, planned expenses in future months are subtracted as one-off deductions in that month of each plan's projection (frozen in `points` when the plan is fixed) and in the live preview; excluded from the real-line reconstruction.
- **Dashboard filtering:** `dashboard.js` excludes planned expenses whose month ≠ selected month at the top of `render()`. Monthly stat uses `date.startsWith(selKey)` — never `>= monthFrom` — to prevent future dates leaking into current month totals.
- In the expenses list, planned expenses are grouped under "Previsto · <Mes Año>" with a yellow `.planned-badge` ("Previsto"; flat lists and the dashboard show `Previsto MM/YYYY`).
- The expense sheet toggle ("Gasto previsto") shows a hint explaining the concept; when on, a `type="month"` picker (labelled "¿En qué mes va a ocurrir?", defaults to next month) replaces the date field; `date` is set to `YYYY-MM-01` on save.
- Expenses list segmented control `#type-segment`: Todos / Realizados / Previstos (`Expenses._type`).
- Field: `isPlanned` on each `users/{uid}/expenses/{id}` document.

## Firestore Field Notes

Firestore is schemaless — new fields just get written, no migration step needed (unlike the old Postgres `ALTER TABLE`). Fields currently expected on `users/{uid}` (settings, written via `Storage.saveSettings()`):
- `projIncome`, `projExpenses`, `projSnapshotPatrimony`, `projSnapshotDate` — **legacy** (old Proyección tab). On first open of Plan, `Plan._migrateLegacy()` turns them into the first saved plan and sets `plansMigrated: true`. Not written anymore.
- `plansMigrated` — boolean, see above
- `budgetAmount` — user-defined monthly budget (`null` = not set)
- `budgetMode` — `'manual'` or `'auto'` (default `'auto'`)

## Dashboard (`js/dashboard.js` + `js/analytics.js`)

`analytics.js` holds **pure computations** (no DB access); `dashboard.js` only draws. Charts follow the dataviz guide: bars ≤24px with 4px rounded ends, 2px lines, solid hairline grid, emphasis = `--chart-accent` (brand blue) and context = `--chart-muted` (gray). Categorical/sequential colors were validated with the dataviz `validate_palette.js` (light and dark surfaces) — re-run it if you change `--chart-series-*` or `--heat-*`.

- **Month navigation:** `Dashboard._monthOffset` (0 = current month, negative = past) drives everything except the hero, savings chart and 90-day analyses. `›` disabled on the current month. Month nav sits in the view header.
- **Blocks (mobile order; 12-col grid ≥1200px, 2-col ≥600px):**
  - Hero patrimonio + 12-month sparkline (`Analytics.patrimonySeries`: monthly snapshots or reconstruction) and delta vs end of last month.
  - KPI tiles (`Analytics.kpis`): Gastado (current month compares against last month **at the same day**), Ingresos, Tasa de ahorro (pts vs avg of 3 previous months), Promedio diario. Each with arrow + text delta (never color alone) and a 12-month sparkline; months before the user's first record are `null`, not 0.
  - Ritmo de gasto (`Analytics.pace`): cumulative spend this month vs last month + dashed budget line, with the budget meter (`#budget-insight`, `Budget.getEffectiveBudget`). **No end-of-month extrapolation** (large one-offs cluster at month start).
  - "Lo que vemos en tus datos" (`Analytics.insights`, max 5): budget overrun, pace vs last month, category above its average, savings rate, recurring total, weekday peak, standout expense.
  - Últimos gastos (5 of the selected month, tap to edit).
  - Categorías vs tu promedio (`categoryVsAverage`): bar = selected month, tick = average of up to 3 previous months, delta %.
  - Gasto por mes: 12 columns, selected month in accent, dashed average line.
  - Calendario de gasto (`heatmap`): 5 quantile levels (`--heat-1..5`), tap a day for the detail; defaults to the highest day.
  - ¿Qué día gastas más? (`weekday`, last 90 days, peak in accent).
  - Ahorro neto (12 months, positive/negative bars; tooltip shows % of income).
  - Gastos recurrentes (`recurring`): same normalized description in ≥3 of the last 4 complete months with amounts within 1.6×; shows monthly median and whether it was paid this month.
  - ¿En qué se va la plata? (`topSpending`, last 90 days, top 5 descriptions).
- **Charts:** `Dashboard._chart(id, config)` creates once and then swaps data/options; `resetCharts()` destroys all (used on theme change). `Plan` reuses `Dashboard._theme/_tooltip/_axes/_compact`.

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
- **Plan integration:** the Plan tab shows/edits the budget (see Plan section).
- **Dashboard integration:** `Dashboard._renderBudgetInsight(data)` renders `#budget-insight` (inside the Ritmo de gasto card) and `#budget-months-tag`. Called with `Budget.getEffectiveBudget(_allExpenses)`. Shows `'manual'` badge or `'N mes(es)'` badge. **No daily-rate projection footer** — linear extrapolation is misleading since large one-off expenses (credit cards, subscriptions) cluster at month start. Hidden when `_monthOffset !== 0`.
- **Progress bar color:** green < 51%, amber 51–84%, red ≥ 85%.

## Plan (`js/plan.js`)

Single tab that replaced the old Presupuesto and Proyección tabs. `#view-plan`, rendered by `Plan.render()`. Three blocks:

1. **Presupuesto mensual** (`#budget-card`): shows `Budget.getEffectiveBudget()` — automatic from history (outlier removal in `budget.js`) or manual (`settings.budgetMode = 'manual'`, `budgetAmount`). Progress of the current month. "Fijar monto manual" opens an inline editor (`#budget-manual-editor`); "Volver a automático" sets `budgetMode: 'auto'`. With no history and no manual amount, the editor opens by itself.
2. **Plan de flujo** (`#plan-editor`): monthly income (`#plan-income`, hint = average income of the last ≤3 complete months) and expense (`#plan-expenses`, hint = effective budget). Live preview of net/month and patrimony in 6 and 12 months (includes future planned expenses). "Fijar plan" saves a plan document.
3. **Seguimiento** (`#plan-tracking`, needs ≥1 plan):
   - Status card: real patrimony today vs what the latest plan expected today (`_expectedAt` interpolates by days). Plans <3 days old show a neutral "Plan fijado" message.
   - Chart `#chart-plans`: real line (`--chart-real`) + up to 4 latest plans (`--chart-series-1..4`, latest solid, older dashed), HTML legend `#plan-legend`. X axis from the oldest shown plan (max 12 months back) to ≥6 months ahead.
   - "Qué cambió vs tu plan anterior" (`#plan-diff-card`): latest vs previous plan — income/expense/net/base rows and the 6-month growth difference decomposed into income, expense and planned-expense effects.
   - Saved plans list (`#plans-list`) with "vs real" difference and delete.
4. **Historial de gasto** (`#budget-insights-section`, needs ≥1 complete month): category breakdown of the last ≤6 months and last-7-months rows vs the effective budget.

**Plan document** (`users/{uid}/plans/{id}`): `{ date: 'YYYY-MM-DD', base, income, expenses, points: [{ key: 'YYYY-MM', value }] × 13, createdAt }`. `points` is the projection frozen at creation time (month of `date` + 12 months, planned expenses subtracted in their month) so old plans never change.

**Real patrimony line:** `Data.recordPatrimonySnapshot()` (called on each Plan render) upserts `users/{uid}/snapshots/{YYYY-MM}` with the current total balance, so past months include investment adjustments. Months without a snapshot are reconstructed: current patrimony − incomes after that month + real expenses after that month.

## Categorías (`js/categories.js`)

Las categorías **no tienen pestaña propia**: se gestionan en una hoja (`#modal-categories`) que se abre desde Ajustes (fila `#btn-toggle-categories`, con el total en `#categories-count-badge`) o desde el botón "Categorías" de la vista Gastos en escritorio (`#btn-open-categories`). `Categories.open()` abre la hoja y renderiza.

- **Agregar:** fila con `#new-cat-color`, `#new-cat-name`, `#btn-save-category`. Enter en el input también guarda.
- **Lista:** filas `.tx-row.cat-row` con inicial de color, nombre, contador de gastos, editar (lápiz) y eliminar (papelera). Las predefinidas no tienen botón eliminar; una categoría con gastos tampoco se puede eliminar.
- **Editar inline:** `_startEdit(id)` reemplaza el contenido de la fila con color + nombre + guardar/cancelar.
- En el formulario de gasto las categorías se eligen con chips (`#expense-category-chips`); el valor va en el input oculto `#expense-category`.

## Responsive / Mobile (iPhone-first)

The base CSS is **mobile-first** (designed for iPhone). `css/responsive.css` adds `≥600px` (tablet: centered dialogs instead of bottom sheets, 2-col charts), `≥900px` (desktop/Chrome: fixed left sidebar, thin scrollbars, centered content) and `≥1200px` (two-column Dashboard, Plan and Cuentas), plus a `≤375px` tweak for iPhone SE/mini. Hover styles only apply under `@media (hover: hover) and (pointer: fine)`.

- **Viewport:** `viewport-fit=cover`; safe areas via `--safe-top/bottom/left/right` (`env(safe-area-inset-*)`). Header, tab bar, sheets and toasts all pad for the notch / Dynamic Island and the home indicator.
- **Inputs:** every input/select is ≥16px (`1rem`) — smaller sizes make iOS Safari zoom on focus. Money fields use `inputmode="numeric"` + `UI.attachMoneyFormat`. Touch targets are ≥44px.
- **Tab bar** (`.tabbar`, <900px): Inicio · Gastos · ➕ (`#btn-fab`, opens the new-expense sheet) · Cuentas · Plan. Tapping the active tab scrolls to top.
- **Header** (`#app-header`, <900px): transparent over the large view title; turns into a blurred bar with the compact title (`#mobile-view-name`, from `Router._viewNames`) after scrolling 36px (`Header` in `app.js`). Right side: avatar button → Ajustes.
- **Desktop sidebar** (`.sidebar`, ≥900px, width `--sidebar-width`): brand (`#navbar-brand`), "Agregar movimiento" (`#btn-add-expense`), nav links with icons (`.nav-link[data-view]`), and the user button (`#btn-open-settings`, name in `[data-user-name]`) that opens Ajustes.
- **Ajustes sheet** (`#modal-settings`): profile, theme (Oscuro/Claro/Auto), "Ocultar patrimonio" (synced with `PatrimonioToggle`), Categorías, Exportar CSV, Cerrar sesión (`#btn-logout`, asks for confirmation).
- **Sheets:** on phones every modal is a bottom sheet (`.modal` slides up, `.sheet-grabber`, drag the header down to dismiss). The overlay follows `visualViewport` (`--vvh`, `--vv-top`) so the sheet sits above the iOS keyboard. Footer buttons are full-width and padded for the home indicator. `UI.confirm` renders as an iOS action sheet.
- **Keyboard on open:** iOS only shows the keyboard if `focus()` happens inside the tap. `UI.focusWithKeyboard(el)` focuses a hidden proxy input synchronously and then moves focus to the real field; `openExpenseModal` / `Accounts.openIncomeModal` do their synchronous setup first and only then await data.
- **Gasto ↔ Ingreso:** the new-expense and new-income sheets have a segmented switch at the top (`#expense-kind-switch`, `#income-kind-switch`) that swaps sheets keeping the typed amount. The last account used for an expense is preselected (`localStorage.lastAccountId`).
- **Expenses view:** live search (`#filter-text`), filters sheet (`#modal-filters`: sort field, category, dates, amounts), removable active-filter chips, list grouped by day with daily totals, "Mostrar más" (40 per page), and "Seleccionar" mode with a floating `.bulk-bar` for bulk delete.
- **Logo click:** `#navbar-brand` click → `Router.navigate('dashboard')`.
