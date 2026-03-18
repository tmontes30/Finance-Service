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

**Module initialization order** (defined in `app.js`):
1. `auth.js` — Supabase session management; redirects to login if unauthenticated
2. `storage.js` — CRUD wrapper around the Supabase JS client
3. `data.js` — Business logic and in-memory caching layer on top of `storage.js`
4. Feature modules (`dashboard.js`, `expenses.js`, `accounts.js`, `categories.js`, `projection.js`, `export.js`)

**Data flow:** Feature modules call `Data.*` → `Storage.*` → Supabase API. Caching lives in `data.js`.

**Routing:** `app.js` handles SPA navigation by showing/hiding sections; no URL routing library is used.

## Key Conventions

- **Supabase credentials** are in `js/config.js` (public anon key — safe to commit).
- **Row Level Security** is enabled on all tables; users can only access their own rows. Schema and RLS policies are in `supabase-schema.sql`.
- **UI patterns:** Modals and toast notifications are managed through `ui.js`. Use `UI.showModal()` / `UI.showToast()` for user feedback.
- **Language:** The UI is in Spanish.
- **Theme:** Dark purple/blue theme defined via CSS custom properties in `css/main.css`. Extend via those variables, not hardcoded colors.
- **Predefined data:** 8 default expense categories and 6 account types are seeded in `data.js` and are not stored in the database — they are merged with user-created items at runtime.
