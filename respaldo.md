# Respaldo — Estado funcional de la app

> **NO modificar este archivo** a menos que el usuario lo pida explícitamente.

## Commit exacto de este respaldo

```
b0d9a05646b53774b361d411ccec6fbf968228da
```

**Rama:** `main`
**Descripción:** "Remove photo import feature" — app funcional sin importación de fotos.

## Cómo restaurar a este estado

```bash
git checkout b0d9a05646b53774b361d411ccec6fbf968228da
```

O para volver permanentemente (descartando cambios posteriores):

```bash
git reset --hard b0d9a05646b53774b361d411ccec6fbf968228da
git push --force
```

---

## Funcionalidades activas en este estado

- Dashboard con navegación por meses, gráficos (barra mensual, dona por categoría, ahorro neto)
- Gastos: lista, filtros, gastos previstos (planned), exportar CSV
- Cuentas: saldo en tiempo real, historial de ingresos, ajuste de saldo manual
- Categorías: CRUD completo, 8 categorías predefinidas
- Proyección fija (snapshot de patrimonio)
- Presupuesto: modo manual/automático, insights por categoría, resumen mensual
- Auth: login/registro/recuperación de contraseña con Supabase
- Tema oscuro/claro persistido en localStorage
- Responsive mobile con subheader, FAB y hamburger menu

## Infraestructura Supabase

- **Proyecto:** `knorxtyfnjzofnhovrjz`
- **URL:** `https://knorxtyfnjzofnhovrjz.supabase.co`
- **Anon key:** `sb_publishable_hV8hVh04WSANlytMePALNQ_dQJqW8pY`
- **Deploy:** GitHub Pages en `https://tmontes30.github.io/Finance-Service/`

### Tablas principales

| Tabla | Columnas clave |
|-------|---------------|
| `expenses` | `id, user_id, amount, category_id, description, date, account_id, is_planned, external_id` |
| `incomes` | `id, user_id, account_id, amount, description, date, external_id` |
| `accounts` | `id, user_id, name, type, balance` |
| `categories` | `id, user_id, name, color` |
| `settings` | `user_id, proj_income, proj_expenses, proj_snapshot_patrimony, proj_snapshot_date, budget_amount, budget_mode` |

### Migraciones aplicadas (ya en la DB)

```sql
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_planned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE incomes  ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(14,2);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS budget_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS proj_snapshot_patrimony NUMERIC(14,2);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS proj_snapshot_date DATE;
```

## Archivos JS cargados (en orden)

```html
<script src="js/config.js"></script>
<script src="js/storage.js"></script>
<script src="js/data.js"></script>
<script src="js/ui.js"></script>
<script src="js/budget.js"></script>
<script src="js/dashboard.js"></script>
<script src="js/expenses.js"></script>
<script src="js/categories.js"></script>
<script src="js/projection.js"></script>
<script src="js/export.js"></script>
<script src="js/budget-view.js"></script>
<script src="js/accounts.js"></script>
<script src="js/app.js"></script>
```

## Configuraciones clave

- **Budget bar colores:** verde < 51%, amarillo 51–84%, rojo ≥ 85%
- **Tema por defecto:** oscuro (`financeTheme` en localStorage)
- **Patrimonio oculto:** `patrimonioHidden` en localStorage
