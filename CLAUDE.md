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

**Account balance:** Stored directly on the `accounts` row and mutated by `Storage.adjustAccountBalance()` whenever an expense or income is added, updated, or deleted. There is no derived calculation.

**Incomes:** A first-class entity (table: `incomes`) linked to an account. Adding income increases account balance; deleting reverses it. The `accounts.js` view renders both incomes and expenses for an account.

## Key Conventions

- **Supabase credentials** are in `js/config.js` (public anon key — safe to commit).
- **Row Level Security** is enabled on all tables; users can only access their own rows. Schema and RLS policies are in `supabase-schema.sql`.
- **UI patterns:** Modals and toast notifications are managed through `ui.js`. Use `UI.showModal()` / `UI.showToast()` for user feedback.
- **Language:** The UI is in Spanish.
- **Theme:** Dark purple/blue theme defined via CSS custom properties in `css/main.css`. Extend via those variables, not hardcoded colors.
- **Predefined categories:** 8 default categories (`PREDEFINED_CATEGORIES` in `data.js`) are seeded into the database on first login. `ACCOUNT_TYPES` (6 types) is a client-side constant only, never stored in DB.
- **`PatrimonioToggle`** in `app.js` persists wealth-masking state to `localStorage` (`patrimonioHidden`) and toggles display of `#stat-patrimonio` and `#accounts-total`.
