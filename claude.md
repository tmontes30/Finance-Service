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

**Routing:** `Router` object in `app.js` shows/hides `#view-{name}` elements and calls each module's `render()`.

**Account balance:** Stored directly on the `accounts` row and mutated by `Storage.adjustAccountBalance()` whenever an expense or income is added, updated, or deleted. There is no derived calculation. Planned expenses (`isPlanned: true`) do NOT adjust account balances.

**Incomes:** A first-class entity (table: `incomes`) linked to an account. Adding income increases account balance; deleting reverses it.

## Key Conventions

- **Supabase credentials** are in `js/config.js` (public anon key — safe to commit).
- **Row Level Security** is enabled on all tables; users can only access their own rows. Schema and RLS policies are in `supabase-schema.sql`. New columns are added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` at the bottom of that file.
- **UI patterns:** Modals and toast notifications are managed through `ui.js`. Use `UI.confirm()` / `UI.toast()` for user feedback.
- **Language:** The UI is in Spanish.
- **Theme:** Dark purple/blue theme defined via CSS custom properties in `css/main.css`. Extend via those variables, not hardcoded colors.
- **Predefined categories:** 8 default categories (`PREDEFINED_CATEGORIES` in `data.js`) are seeded into the database on first login. `ACCOUNT_TYPES` (6 types) is a client-side constant only, never stored in DB.
- **`PatrimonioToggle`** in `app.js` persists wealth-masking state to `localStorage` (`patrimonioHidden`) and toggles display of `#stat-patrimonio` and `#accounts-total`.

## Gastos Previstos

Expenses can be marked as **planned** (`isPlanned: true`). Key behaviours:
- Planned expenses do not deduct from account balances (money hasn't moved yet).
- `updateExpense` compares old/new `isPlanned` state to correctly apply or reverse balance adjustments.
- In `projection.js`, planned expenses for future months are subtracted as one-off deductions from the projected line; they are excluded from the real-line reconstruction.
- A yellow `.planned-badge` is rendered in the expenses list row showing the target month (`YYYY/MM`).
- The expense modal has a "Gasto Previsto" checkbox; when checked, a `type="month"` picker replaces the date field and `date` is set to `YYYY-MM-01` of the chosen month on save.

## Proyección Fija (Frozen Projection)

- On the first save of projection parameters, `Data.resetProjectionSnapshot()` stores the current total patrimony + today's date in `settings` (`proj_snapshot_patrimony`, `proj_snapshot_date`).
- `_renderProjection()` uses this frozen base for the projected line; subsequent account balance changes only affect the "Real" line.
- `Data.resetProjectionSnapshot()` can be called again (via the "↺ Actualizar base" button) to manually reset the baseline.
- Subsequent saves of income/expenses do NOT overwrite the snapshot — only the explicit reset does.

## DB Schema Notes

The `settings` table has these projection-related columns (added via migration, not in the original `CREATE TABLE`):
- `proj_income`, `proj_expenses` — monthly parameters
- `proj_snapshot_patrimony`, `proj_snapshot_date` — frozen baseline for projection

The `expenses` table has:
- `is_planned BOOLEAN NOT NULL DEFAULT FALSE`

## Responsive / Mobile

- Breakpoints: `≤900px` (tablet), `≤640px` (mobile), `≤380px` (very small) — all in `css/responsive.css`.
- On mobile, the `navbar-add-btn` (the existing "+ Agregar Gasto" button) is shown as a compact dark pill in the navbar. The user's display name (`nav-user-email`) is hidden to save space.
- The `mobile-add-btn` inside the expenses view is also shown on mobile as a secondary shortcut.
