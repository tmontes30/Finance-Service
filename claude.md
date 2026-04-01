# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

This is a **static SPA** with no build system. Development is done by editing files directly and refreshing the browser. All dependencies (Supabase JS v2, Chart.js v4.4.0) are loaded via CDN in `index.html`.

To run locally, serve the files with any static file server, e.g.:
```bash
npx serve .
# or
python -m http.server 8080
```

## Architecture

The app is a vanilla JS single-page application backed by Supabase (PostgreSQL + Auth).

**Module initialization order** (defined in `auth.js` `_setupApp()`):
1. `auth.js` — creates Supabase client, restores session, calls `Storage.init` + `Data.init`, then navigates to dashboard
2. `storage.js` — CRUD wrapper around the Supabase JS client; translates between JS camelCase and DB snake_case
3. `data.js` — Business logic on top of `storage.js`; handles balance side-effects for expenses/incomes
4. Feature modules (`dashboard.js`, `expenses.js`, `accounts.js`, `categories.js`, `projection.js`, `export.js`)

**Data flow:** Feature modules call `Data.*` → `Storage.*` → Supabase API.

**Routing:** `Router` object in `app.js` shows/hides `#view-{name}` elements and calls each module's `render()`. Active view is `Router._current` (string).

**Account balance:** Stored directly on the `accounts` row and mutated by `Storage.adjustAccountBalance()` whenever an expense or income is added, updated, or deleted. There is no derived calculation. Planned expenses (`isPlanned: true`) do NOT adjust account balances.

**Incomes:** A first-class entity (table: `incomes`) linked to an account. Adding income increases account balance; deleting reverses it.

## Key Conventions

- **Supabase credentials** are in `js/config.js` (public anon key — safe to commit).
- **Row Level Security** is enabled on all tables; users can only access their own rows. Schema and RLS policies are in `supabase-schema.sql`. New columns are added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` at the bottom of that file.
- **UI patterns:** Modals and toast notifications are managed through `ui.js`. Use `UI.confirm()` / `UI.toast()` for user feedback.
- **Language:** The UI is in Spanish.
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
- **Requires DB migration:** `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_planned BOOLEAN NOT NULL DEFAULT FALSE;`

## Proyección Fija (Frozen Projection)

- On first save of projection parameters, `Data.resetProjectionSnapshot()` stores current total patrimony + today's date in `settings` (`proj_snapshot_patrimony`, `proj_snapshot_date`).
- `_renderProjection()` uses this frozen base for the projected line; only the "Real" line changes with new transactions.
- Reset manually via "↺ Actualizar base" button. Subsequent saves of income/expenses do NOT overwrite the snapshot.

## DB Schema Notes

The `settings` table has projection-related columns (added via migration):
- `proj_income`, `proj_expenses` — monthly parameters
- `proj_snapshot_patrimony`, `proj_snapshot_date` — frozen baseline

The `expenses` table has:
- `is_planned BOOLEAN NOT NULL DEFAULT FALSE`

## Dashboard

- **Month navigation:** `Dashboard._monthOffset` (0 = current month, negative = past). `‹`/`›` arrows update offset and re-render. All stats filter to the selected month (`selKey = YYYY-MM`). The `›` arrow is disabled when on the current month. Charts shift their 12-month window based on `selDate`.
- **Chart theme awareness:** When the theme toggle is clicked and `Router._current === 'dashboard'`, `Dashboard.render()` is called to refresh charts with the new theme's surface color.

## Auth / Login

### Splash Screen
- `#splash-screen` (`.splash-screen`) is shown by default on page load (`z-index: 10000`, above everything).
- `#auth-screen` starts with `display:none` — the splash covers it during session restore.
- `Auth._hideSplash()` adds `.splash-hidden` (opacity → 0, transition 0.4s) then removes the element after 420ms. Called after `getSession()` resolves, regardless of whether a session exists.
- Design: full-screen `--color-bg` background, large ⚡ with pulse animation, "Finance" gradient text, three bouncing dots (`@keyframes splash-dot`).

### Forgot Password Flow
- "¿Olvidaste tu contraseña?" button (`#auth-forgot-link`) is visible in login mode only (hidden in register mode via `authToggle` click handler).
- Clicking it hides `#auth-form` + toggle + itself, shows `#auth-forgot-section` and changes title.
- "← Volver" (`#btn-forgot-back`) reverses that.
- Send handler calls `Auth.sendPasswordReset(email)` → `supabase.auth.resetPasswordForEmail` with `redirectTo: 'https://tmontes30.github.io/Finance-Service/'`.
- **Supabase dashboard required:** Add that URL in Authentication → URL Configuration → Redirect URLs.
- After clicking the reset link in the email, `onAuthStateChange` fires `PASSWORD_RECOVERY` → `Auth._showRecovery()` shows `#auth-recovery-section` with new-password + confirm fields.
- Save handler calls `Auth.updatePassword(newPassword)` → `supabase.auth.updateUser`. On success, `SIGNED_IN` fires and `_setupApp()` runs automatically.

### Registration Security
- Confirm password field (`#auth-password-confirm`, `register-only`) validated on submit before calling Supabase.
- Minimum 8 characters enforced on frontend. **Supabase dashboard:** Authentication → Policies → Minimum password length = 8 (server-side enforcement).
- Password strength bar (`#password-strength`, `.strength-bar-fill`) appears while typing in register mode: Débil (<8), Buena (8+ with number), Fuerte (8+ with number + symbol). Driven by `input` listener on `#auth-password`.

### Visual
- `#auth-screen` background: `radial-gradient` with subtle purple tint.
- `.auth-card`: `border-top: 3px solid var(--color-primary)`, `box-shadow: 0 8px 32px rgba(0,0,0,0.25)`.

## Responsive / Mobile

- Breakpoints: `≤900px` (tablet), `≤640px` (mobile), `≤380px` (very small) — all in `css/responsive.css`.
- **Mobile navbar:** Single-row `[⚡ Finance] [scrollable tabs] [🌙] [☰]`. All 5 nav tabs always visible via `overflow-x: auto; scrollbar-width: none` on `.navbar-nav`. `navbar-add-btn` and `navbar-user` are hidden on mobile.
- **Hamburger dropdown** (`#navbar-dropdown`): absolutely-positioned card (not inside `navbar-nav`) with "Agregar Gasto" and "Salir". Toggled via `e.stopPropagation()` on the hamburger; closed by `document.addEventListener('click', ...)`. Wired in `app.js`.
- **FAB** (`#btn-fab`): 58px purple circle with `+`, `position: fixed` bottom-right, `z-index: 500`. Outside `#app-wrapper` (end of `<body>`) so `position: fixed` works reliably on iOS Safari. Shown via `.fab-active` class toggled in `auth._hideAuth()` / `auth._showAuth()`; only visible on mobile via `@media (max-width: 640px)`.
- **Modal scroll:** `.modal` uses `display:flex; flex-direction:column; max-height:90vh`. Only `.modal-body` has `overflow-y:auto` — header and footer (Save button) always visible.
- **Logo click:** `#navbar-brand` click → `Router.navigate('dashboard')`.
