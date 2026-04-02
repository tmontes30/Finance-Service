/* BudgetView — Presupuesto tab */

const BudgetView = {

  /* ---------- Init ---------- */

  init() {
    document.getElementById('btn-save-budget').addEventListener('click', () => this._save());

    document.querySelectorAll('.budget-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => this._setModeUI(btn.dataset.mode));
    });
  },

  /* ---------- Render ---------- */

  async render() {
    const [allExpenses, categories] = await Promise.all([
      Data.getExpenses(), Data.getCategories()
    ]);

    const settings    = Data.getSettings();
    const currentMode = settings.budgetMode || 'auto';

    // Restore saved state
    this._setModeUI(currentMode);
    if (settings.budgetAmount != null) {
      document.getElementById('budget-manual-amount').value = settings.budgetAmount;
    }

    // Computed budget hint (always shown as reference)
    const computed  = Budget.compute(allExpenses);
    const hintEl    = document.getElementById('budget-computed-hint');
    const hintValEl = document.getElementById('budget-computed-value');
    const hintNoteEl = document.getElementById('budget-computed-note');
    if (computed) {
      hintEl.style.display    = 'block';
      hintValEl.textContent   = Data.formatAmount(computed.budget);
      hintNoteEl.textContent  = `(basado en ${computed.monthsUsed} mes${computed.monthsUsed > 1 ? 'es' : ''} de historial)`;
    } else {
      hintEl.style.display = 'none';
    }

    // How many past months do we have?
    const now        = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const pastReal   = allExpenses.filter(e => !e.isPlanned && e.date.slice(0, 7) < currentKey);
    const pastMonths = new Set(pastReal.map(e => e.date.slice(0, 7)));

    const noHistEl    = document.getElementById('budget-no-history');
    const insightsEl  = document.getElementById('budget-insights-section');
    const emptyEl     = document.getElementById('budget-empty');

    const hasAnyExpenses = allExpenses.filter(e => !e.isPlanned).length > 0;

    if (!hasAnyExpenses) {
      emptyEl.style.display    = 'block';
      insightsEl.style.display = 'none';
      noHistEl.style.display   = 'none';
      return;
    }

    emptyEl.style.display = 'none';

    if (pastMonths.size === 0) {
      noHistEl.style.display  = 'flex';
      document.getElementById('budget-no-history-text').textContent =
        'Cuando tengas al menos 1 mes completo de historial verás el análisis por categoría.';
      insightsEl.style.display = 'none';
    } else {
      noHistEl.style.display   = 'none';
      insightsEl.style.display = 'block';
      this._renderCategoryInsights(allExpenses, categories);
      this._renderMonthlySummary(allExpenses);
    }
  },

  /* ---------- Mode UI ---------- */

  _setModeUI(mode) {
    document.querySelectorAll('.budget-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    document.getElementById('budget-manual-section').style.display =
      mode === 'manual' ? 'block' : 'none';
    document.getElementById('budget-auto-section').style.display =
      mode === 'auto' ? 'block' : 'none';
  },

  /* ---------- Save ---------- */

  async _save() {
    const activeBtn = document.querySelector('.budget-mode-btn.active');
    const mode      = activeBtn ? activeBtn.dataset.mode : 'auto';
    const rawAmount = parseFloat(document.getElementById('budget-manual-amount').value);
    const amount    = mode === 'manual' && !isNaN(rawAmount) && rawAmount > 0 ? rawAmount : null;

    if (mode === 'manual' && amount == null) {
      UI.toast('Ingresá un monto mayor a cero', 'error');
      return;
    }

    await Data.updateSettings({ budgetMode: mode, budgetAmount: amount });
    UI.toast('Presupuesto guardado', 'success');
    // Refresh the hint
    await this.render();
  },

  /* ---------- Category insights ---------- */

  _renderCategoryInsights(expenses, categories) {
    const now        = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const catMap     = Object.fromEntries(categories.map(c => [c.id, c]));

    // Past months with data — up to 6, most recent first
    const allPastKeys = [...new Set(
      expenses
        .filter(e => !e.isPlanned && e.date.slice(0, 7) < currentKey)
        .map(e => e.date.slice(0, 7))
    )].sort().reverse().slice(0, 6);

    const n = allPastKeys.length;
    if (n === 0) return;

    document.getElementById('budget-cat-months').textContent =
      `últimos ${n} mes${n > 1 ? 'es' : ''}`;

    // Real expenses in those months
    const recentExp = expenses.filter(e =>
      !e.isPlanned && allPastKeys.includes(e.date.slice(0, 7))
    );
    const totalAll = recentExp.reduce((s, e) => s + e.amount, 0);

    // Group by category → by month
    const byCategory = {};
    recentExp.forEach(e => {
      if (!byCategory[e.categoryId]) byCategory[e.categoryId] = {};
      const mo = e.date.slice(0, 7);
      byCategory[e.categoryId][mo] = (byCategory[e.categoryId][mo] || 0) + e.amount;
    });

    // Build rows
    const rows = Object.entries(byCategory).map(([catId, monthData]) => {
      const total = Object.values(monthData).reduce((a, b) => a + b, 0);
      const avg   = total / n;
      const pct   = totalAll > 0 ? (total / totalAll) * 100 : 0;
      // Last complete month (most recent)
      const lastMonthKey = allPastKeys[0];
      const lastMonth    = monthData[lastMonthKey] || 0;
      // Month with peak spending
      const peakEntry    = Object.entries(monthData).sort((a, b) => b[1] - a[1])[0];
      const peakLabel    = peakEntry
        ? new Date(peakEntry[0] + '-15').toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
        : '';
      return { catId, cat: catMap[catId], total, avg, pct, lastMonth, lastMonthKey, peakAmt: peakEntry ? peakEntry[1] : 0, peakLabel };
    }).sort((a, b) => b.avg - a.avg);

    const maxAvg    = rows[0]?.avg || 1;
    const lastLabel = allPastKeys[0]
      ? new Date(allPastKeys[0] + '-15').toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
      : '';

    document.getElementById('budget-cat-container').innerHTML = rows.map(r => {
      const cat      = r.cat || { name: 'Sin categoría', color: '#94a3b8' };
      const barWidth = Math.round((r.avg / maxAvg) * 100);
      const isPeak   = r.peakLabel !== lastLabel && r.peakAmt > r.lastMonth * 1.5;

      return `
        <div class="budget-cat-row">
          <div class="budget-cat-header">
            <span class="budget-cat-name">
              <span class="category-dot" style="background:${cat.color}"></span>
              ${this._esc(cat.name)}
            </span>
            <span class="budget-cat-pct" style="color:${cat.color}">${r.pct.toFixed(1)}%</span>
          </div>
          <div class="budget-cat-bar-track">
            <div class="budget-cat-bar-fill"
                 style="width:${barWidth}%;background:${cat.color}30;border-right:3px solid ${cat.color}99">
            </div>
          </div>
          <div class="budget-cat-stats">
            <span class="budget-cat-avg">${Data.formatAmount(r.avg)}<span class="budget-cat-unit">/mes prom.</span></span>
            <span class="budget-cat-last">
              ${lastLabel}: ${Data.formatAmount(r.lastMonth)}
              ${isPeak ? `<span class="budget-peak-note">pico en ${r.peakLabel}</span>` : ''}
            </span>
          </div>
        </div>`;
    }).join('');
  },

  /* ---------- Monthly summary ---------- */

  _renderMonthlySummary(expenses) {
    const settings    = Data.getSettings();
    const budget      = settings.budgetMode === 'manual' && settings.budgetAmount != null
      ? settings.budgetAmount : null;
    const now         = new Date();
    const rows        = [];

    for (let i = 0; i <= 6; i++) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mo  = expenses.filter(e => !e.isPlanned && e.date.startsWith(key));
      const total = mo.reduce((s, e) => s + e.amount, 0);
      if (total === 0 && i > 0) continue;

      const raw   = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
      const label = raw.charAt(0).toUpperCase() + raw.slice(1);

      let vsStr = '—', vsClass = '';
      if (budget != null) {
        const diff = total - budget;
        vsStr  = (diff >= 0 ? '+' : '') + Data.formatAmount(diff);
        vsClass = diff >= 0 ? 'stat-neg' : 'stat-pos';
      }

      rows.push({ label, total, txCount: mo.length, isCurrent: i === 0, vsStr, vsClass });
    }

    if (!rows.length) {
      document.getElementById('budget-monthly-container').innerHTML =
        '<p class="budget-empty-note">Sin datos aún.</p>';
      return;
    }

    const hasVs = budget != null;
    document.getElementById('budget-monthly-container').innerHTML = `
      <table class="budget-monthly-table">
        <thead>
          <tr>
            <th>Mes</th>
            <th>Total gastado</th>
            ${hasVs ? '<th>vs Presupuesto</th>' : ''}
            <th>Transacciones</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr${r.isCurrent ? ' class="budget-row-current"' : ''}>
              <td>${r.label}${r.isCurrent ? ' <span class="proj-now-badge">hoy</span>' : ''}</td>
              <td>${Data.formatAmount(r.total)}</td>
              ${hasVs ? `<td class="${r.vsClass}">${r.vsStr}</td>` : ''}
              <td class="budget-tx-count">${r.txCount} tx</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  },

  /* ---------- Helpers ---------- */

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
