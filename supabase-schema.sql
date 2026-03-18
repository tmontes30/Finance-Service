c-- ================================================================
-- Mis Gastos — Supabase Schema
-- Ejecuta esto en: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- Categorías
CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#6366f1',
  is_predefined BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cuentas bancarias / inversiones
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'bank',
  balance    NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes      TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gastos
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL,
  category_id TEXT NOT NULL,
  account_id  TEXT,
  description TEXT NOT NULL DEFAULT '',
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ingresos
CREATE TABLE IF NOT EXISTS incomes (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configuración del usuario
CREATE TABLE IF NOT EXISTS settings (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  currency         TEXT NOT NULL DEFAULT '$',
  dashboard_period TEXT NOT NULL DEFAULT 'month',
  version          INTEGER NOT NULL DEFAULT 1
);

-- ---- Row Level Security (cada usuario solo ve sus propios datos) ----
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_categories" ON categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_accounts"   ON accounts   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_expenses"   ON expenses   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_incomes"    ON incomes    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_settings"   ON settings   FOR ALL USING (auth.uid() = user_id);

-- ---- Migraciones (ejecutar si las tablas ya existen) ----
-- Gastos previstos
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_planned BOOLEAN NOT NULL DEFAULT FALSE;

-- Proyección fija + parámetros de proyección
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS proj_income             NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS proj_expenses           NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS proj_snapshot_patrimony NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS proj_snapshot_date      DATE;
