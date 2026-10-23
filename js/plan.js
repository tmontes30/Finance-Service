/* Plan — presupuesto del mes + plan de flujo + seguimiento real vs planes guardados.
   Un "plan" es una foto fija: ingreso y gasto mensual + patrimonio del día en que se fijó,
   con su proyección a 12 meses congelada en `points`. Así se puede comparar cada plan
   contra lo que realmente pasó y contra los planes anteriores. */

const Plan = {
  _chart:         null,
  _editingBudget: false,
  _prefilled:     false,
  _patrimony:     0,
  _planned:       [],
  _MAX_ON_CHART:  4,

  /* ---------- Init ---------- */

  init() {
    ['plan-income', 'plan-expenses'].forEach(id => {
      UI.attachMoneyFormat(id);
      document.getElementById(id).addEventListener('input', () => this._updatePreview());
    });
    ['plan-income-hint', 'plan-expenses-hint'].forEach(id => {
      const btn = document.getElementById(id);
      btn.addEventListener('click', () => {
        document.getElementById(btn.dataset.target).value = UI.formatMoney(Number(btn.dataset.value));
        this._updatePreview();
      });
    });
    document.getElementById('btn-plan-save').addEventListener('click', () => this._savePlan());

    // Presupuesto
    document.getElementById('btn-budget-edit').addEventListener('click', () => this._openBudgetEditor());
    document.getElementById('btn-budget-cancel').addEventListener('click', () => {
      this._editingBudget = false;
      this._renderBudget(this._expenses || []);
    });
    document.getElementById('btn-save-budget').addEventListener('click', () => this._saveManualBudget());
    document.getElementById('budget-manual-amount').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this._saveManualBudget(); }
    });
    document.getElementById('btn-budget-auto').addEventListener('click', async () => {
      await Data.updateSettings({ budgetMode: 'auto' });
      UI.toast('Presupuesto automático activado', 'success');
      this._renderBudget(this._expenses || []);
    });

    // Eliminar planes
    document.getElementById('plans-list').addEventListener('click', e => {
      const del = e.target.closest('[data-delete-plan]');
      if (del) this._deletePlan(del.dataset.deletePlan);
    });
  },

  /* ---------- Render ---------- */

  async render() {
    const [expenses, incomes, accounts, categories] = await Promise.all([
      Data.getExpenses(), Data.getIncomes(), Data.getAccounts(), Data.getCategories()
    ]);
    this._expenses  = expenses;
    this._patrimony = accounts.reduce((s, a) => s + a.balance, 0);
    this._planned   = expenses.filter(e => e.isPlanned);

    try { await Data.recordPatrimonySnapshot(this._patrimony); } catch (_) { /* no crítico */ }
    await this._migrateLegacy(expenses);

    const [plans, snapshots] = await Promise.all([Data.getPlans(), Data.getSnapshots()]);

    this._renderBudget(expenses);
    this._renderEditor(expenses, incomes, plans);
    this._renderTracking(plans, expenses, incomes, snapshots);
    this._renderHistory(expenses, categories);
  },

  resetChart() {
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  },

  /* =========================================================
     PRESUPUESTO
     ========================================================= */

  _renderBudget(expenses) {
    const settings = Data.getSettings();
    const computed = Budget.compute(expenses);
    const isManual = settings.budgetMode === 'manual' && settings.budgetAmount != null;
    const eff      = Budget.getEffectiveBudget(expenses);

    document.getElementById('budget-source-pill').textContent =
      isManual ? 'Manual' : computed ? 'Automático' : 'Sin definir';
    document.getElementById('budget-amount').textContent = eff ? Data.formatAmount(eff.budget) : '—';

    const n = computed ? computed.monthsUsed : 0;
    document.getElementById('budget-source-text').textContent = isManual
      ? (computed ? `Monto fijado por ti. Según tu historial gastas ${Data.formatAmount(computed.budget)} al mes.` : 'Monto fijado por ti.')
      : computed
        ? `Calculado con tus últimos ${n} mes${n > 1 ? 'es' : ''} de gasto real, sin contar compras excepcionales.`
        : 'Aún no tienes un mes completo de historial. Fija un monto manual para empezar.';

    // Avance del mes
    const progress = document.getElementById('budget-progress');
    if (eff && eff.budget > 0) {
      progress.style.display = '';
      const pct   = Math.min(eff.pct, 100);
      const color = eff.pct < 51 ? 'var(--color-success)' : eff.pct < 85 ? 'var(--color-warning)' : 'var(--color-danger)';
      const fill  = document.getElementById('plan-budget-fill');
      fill.style.width = `${pct}%`;
      fill.style.background = color;
      document.getElementById('plan-budget-spent').textContent = `${Data.formatAmount(eff.currentSpend)} gastado este mes`;
      const left   = eff.budget - eff.currentSpend;
      const leftEl = document.getElementById('plan-budget-left');
      leftEl.textContent = left >= 0 ? `Quedan ${Data.formatAmount(left)}` : `Te pasaste ${Data.formatAmount(-left)}`;
      leftEl.style.color = left >= 0 ? '' : 'var(--color-danger)';
      leftEl.style.fontWeight = '600';
    } else {
      progress.style.display = 'none';
    }

    // Editor manual: abierto si lo pidió o si no hay ningún presupuesto posible
    const showEditor = this._editingBudget || (!computed && !isManual);
    document.getElementById('budget-manual-editor').style.display = showEditor ? '' : 'none';
    document.getElementById('budget-links').style.display = showEditor ? 'none' : '';
    document.querySelector('#btn-budget-edit span').textContent = isManual ? 'Cambiar monto' : 'Fijar monto manual';
    document.getElementById('btn-budget-auto').style.display = isManual && computed ? '' : 'none';
    document.getElementById('btn-budget-cancel').style.display = (computed || isManual) ? '' : 'none';
    if (showEditor && !document.getElementById('budget-manual-amount').value) {
      const pre = settings.budgetAmount || (computed ? Math.round(computed.budget) : '');
      document.getElementById('budget-manual-amount').value = pre ? UI.formatMoney(pre) : '';
    }
  },

  _openBudgetEditor() {
    this._editingBudget = true;
    document.getElementById('budget-manual-amount').value = '';
    this._renderBudget(this._expenses || []);
    UI.focusWithKeyboard(document.getElementById('budget-manual-amount'), 60);
  },

  async _saveManualBudget() {
    const amount = UI.parseMoney(document.getElementById('budget-manual-amount').value);
    if (!(amount > 0)) { UI.toast('Ingresa un monto mayor a cero', 'error'); return; }
    await Data.updateSettings({ budgetMode: 'manual', budgetAmount: amount });
    this._editingBudget = false;
    UI.toast('Presupuesto guardado', 'success');
    this._renderBudget(this._expenses || []);
    this._updateHints();
  },

  /* =========================================================
     EDITOR DE PLAN
     ========================================================= */

  _monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  _addMonths(key, n) {
    const [y, m] = key.split('-').map(Number);
    return this._monthKey(new Date(y, m - 1 + n, 1));
  },

  // Promedio de ingresos de los últimos 3 meses completos que tuvieron ingresos
  _avgIncome(incomes) {
    const current = this._monthKey(new Date());
    const byMonth = {};
    incomes.forEach(i => {
      const k = i.date.slice(0, 7);
      if (k < current) byMonth[k] = (byMonth[k] || 0) + i.amount;
    });
    const keys = Object.keys(byMonth).sort().reverse().slice(0, 3);
    if (!keys.length) return null;
    return { value: Math.round(keys.reduce((s, k) => s + byMonth[k], 0) / keys.length), months: keys.length };
  },

  _renderEditor(expenses, incomes, plans) {
    const eff    = Budget.getEffectiveBudget(expenses);
    const avgInc = this._avgIncome(incomes);
    this._defaults = { income: avgInc, budget: eff ? Math.round(eff.budget) : null };

    // Prellenar una sola vez por sesión (para no pisar lo que el usuario está escribiendo)
    if (!this._prefilled) {
      const latest = plans[plans.length - 1];
      const inc = latest ? latest.income : avgInc ? avgInc.value : '';
      const exp = latest ? latest.expenses : eff ? Math.round(eff.budget) : '';
      document.getElementById('plan-income').value   = inc !== '' ? UI.formatMoney(inc) : '';
      document.getElementById('plan-expenses').value = exp !== '' ? UI.formatMoney(exp) : '';
      this._prefilled = true;
    }
    this._updateHints();
    this._updatePreview();
  },

  _updateHints() {
    const d = this._defaults || {};
    const eff = Budget.getEffectiveBudget(this._expenses || []);
    const setHint = (id, target, value, text) => {
      const btn = document.getElementById(id);
      if (value == null) { btn.style.display = 'none'; return; }
      btn.style.display = '';
      btn.dataset.target = target;
      btn.dataset.value  = value;
      btn.textContent    = text;
    };
    setHint('plan-income-hint', 'plan-income', d.income ? d.income.value : null,
      d.income ? `Usar promedio: ${Data.formatAmount(d.income.value)}` : '');
    const budget = eff ? Math.round(eff.budget) : null;
    setHint('plan-expenses-hint', 'plan-expenses', budget,
      budget ? `Usar presupuesto: ${Data.formatAmount(budget)}` : '');
  },

  _plannedIn(fromKey, months) {
    const keys = new Set(Array.from({ length: months }, (_, i) => this._addMonths(fromKey, i + 1)));
    const list = this._planned.filter(e => keys.has(e.date.slice(0, 7)));
    return { sum: list.reduce((s, e) => s + e.amount, 0), count: list.length };
  },

  // Proyección congelada: 13 puntos (mes del plan + 12 meses)
  _project(base, income, expenses, isoDate) {
    const startKey = isoDate.slice(0, 7);
    const net = income - expenses;
    const points = [{ key: startKey, value: Math.round(base) }];
    let v = base;
    for (let i = 1; i <= 12; i++) {
      const key = this._addMonths(startKey, i);
      const planned = this._planned.filter(e => e.date.slice(0, 7) === key).reduce((s, e) => s + e.amount, 0);
      v += net - planned;
      points.push({ key, value: Math.round(v) });
    }
    return points;
  },

  _updatePreview() {
    const income   = UI.parseMoney(document.getElementById('plan-income').value);
    const expenses = UI.parseMoney(document.getElementById('plan-expenses').value);
    const netEl    = document.getElementById('plan-preview-net');
    const v6El     = document.getElementById('plan-preview-6');
    const v12El    = document.getElementById('plan-preview-12');
    const note     = document.getElementById('plan-preview-note');

    if (!income && !expenses) {
      netEl.textContent = v6El.textContent = v12El.textContent = '—';
      netEl.className = 'plan-preview-value';
      note.textContent = '';
      return;
    }
    const points = this._project(this._patrimony, income, expenses, localISODate());
    const net    = income - expenses;
    netEl.textContent = `${net >= 0 ? '+' : ''}${Data.formatAmount(net)}`;
    netEl.className   = 'plan-preview-value ' + (net >= 0 ? 'amount-pos' : 'amount-neg');
    v6El.textContent  = Data.formatAmount(points[6].value);
    v12El.textContent = Data.formatAmount(points[12].value);

    const p12 = this._plannedIn(points[0].key, 12);
    note.textContent = p12.count
      ? `Incluye ${p12.count} gasto${p12.count > 1 ? 's' : ''} previsto${p12.count > 1 ? 's' : ''} por ${Data.formatAmount(p12.sum)}. Parte de tu patrimonio de hoy: ${Data.formatAmount(this._patrimony)}.`
      : `Parte de tu patrimonio de hoy: ${Data.formatAmount(this._patrimony)}.`;
  },

  async _savePlan() {
    const income   = UI.parseMoney(document.getElementById('plan-income').value);
    const expenses = UI.parseMoney(document.getElementById('plan-expenses').value);
    if (!income && !expenses) { UI.toast('Ingresa tu ingreso y gasto mensual', 'error'); return; }

    const btn = document.getElementById('btn-plan-save');
    btn.disabled = true;
    try {
      const date = localISODate();
      await Data.addPlan({
        date, base: Math.round(this._patrimony), income, expenses,
        points: this._project(this._patrimony, income, expenses, date)
      });
      UI.toast('Plan fijado', 'success');
      await this.render();
      document.getElementById('plan-tracking').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      UI.toast('Error al guardar el plan: ' + (err.message || err), 'error');
    } finally {
      btn.disabled = false;
    }
  },

  _deletePlan(id) {
    UI.confirm('¿Eliminar este plan guardado? Dejará de aparecer en la comparación.', async () => {
      await Data.deletePlan(id);
      UI.toast('Plan eliminado', 'success');
      await this.render();
    });
  },

  // La proyección antigua (settings.proj*) pasa a ser el primer plan guardado
  async _migrateLegacy(expenses) {
    const s = Data.getSettings();
    if (s.plansMigrated) return;
    const plans = await Data.getPlans();
    if (!plans.length && s.projSnapshotPatrimony != null && s.projSnapshotDate &&
        s.projIncome != null && s.projExpenses != null) {
      const [y, m, d] = s.projSnapshotDate.split('-').map(Number);
      await Data.addPlan({
        date: s.projSnapshotDate,
        base: Math.round(s.projSnapshotPatrimony),
        income: s.projIncome,
        expenses: s.projExpenses,
        points: this._project(s.projSnapshotPatrimony, s.projIncome, s.projExpenses, s.projSnapshotDate),
        createdAt: new Date(y, m - 1, d).getTime()
      });
    }
    await Data.updateSettings({ plansMigrated: true });
  },

  /* =========================================================
     SEGUIMIENTO
     ========================================================= */

  // Valor esperado por un plan en una fecha (interpolado por días dentro del mes)
  _expectedAt(plan, isoDate) {
    const [y1, m1, d1] = plan.date.split('-').map(Number);
    const [y2, m2, d2] = isoDate.split('-').map(Number);
    const elapsed = (y2 - y1) * 12 + (m2 - m1) + (d2 - d1) / 30.44;
    const pts = plan.points;
    if (elapsed <= 0) return pts[0].value;
    const idx = Math.floor(elapsed);
    if (idx >= pts.length - 1) {
      return pts[pts.length - 1].value + (elapsed - (pts.length - 1)) * (plan.income - plan.expenses);
    }
    const frac = elapsed - idx;
    return pts[idx].value + (pts[idx + 1].value - pts[idx].value) * frac;
  },

  _daysSince(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
  },

  _planLabel(plan) {
    return `Plan del ${Data.formatDate(plan.date)}`;
  },

  _colors() {
    const cs = getComputedStyle(document.documentElement);
    const v  = n => cs.getPropertyValue(n).trim();
    return {
      real:   v('--chart-real'),
      series: [v('--chart-series-1'), v('--chart-series-2'), v('--chart-series-3'), v('--chart-series-4')],
      muted:  v('--color-text-muted')
    };
  },

  _renderTracking(plans, expenses, incomes, snapshots) {
    const tracking = document.getElementById('plan-tracking');
    const empty    = document.getElementById('plan-empty');
    if (!plans.length) {
      tracking.style.display = 'none';
      empty.style.display    = '';
      this.resetChart();
      return;
    }
    tracking.style.display = '';
    empty.style.display    = 'none';

    const today  = localISODate();
    const latest = plans[plans.length - 1];
    const shown  = plans.slice(-this._MAX_ON_CHART);
    const colors = this._colors();
    // El plan más reciente siempre usa el color de marca; los anteriores, los siguientes
    const colorOf = {};
    [...shown].reverse().forEach((p, i) => { colorOf[p.id] = colors.series[i]; });

    this._renderStatus(latest, today);
    this._renderChart(shown, colorOf, colors, expenses, incomes, snapshots);
    this._renderDiff(plans);
    this._renderPlansList(plans, colorOf, colors, today);
  },

  _renderStatus(plan, today) {
    const icon  = document.getElementById('plan-status-icon');
    const title = document.getElementById('plan-status-title');
    const sub   = document.getElementById('plan-status-sub');
    const card  = document.getElementById('plan-status');
    const days  = this._daysSince(plan.date);

    if (days < 3) {
      const g6 = plan.points[6].value - plan.points[0].value;
      card.className = 'status-card status-neutral';
      icon.innerHTML = UI.icon('calendar');
      title.textContent = days === 0 ? 'Plan fijado hoy' : `Plan fijado hace ${days} día${days > 1 ? 's' : ''}`;
      sub.textContent = `Si lo cumples, en 6 meses tendrás ${Data.formatAmount(plan.points[6].value)} (${g6 >= 0 ? '+' : ''}${Data.formatAmount(g6)}). Vuelve en unos días para ver cómo vas.`;
      return;
    }

    const expected = this._expectedAt(plan, today);
    const diff     = this._patrimony - expected;
    const tol      = Math.max(10000, Math.abs(expected) * 0.01);
    if (Math.abs(diff) <= tol) {
      card.className = 'status-card status-neutral';
      icon.innerHTML = UI.icon('check');
      title.textContent = 'Vas justo en tu plan';
    } else if (diff > 0) {
      card.className = 'status-card status-good';
      icon.innerHTML = UI.icon('trend-up');
      title.textContent = `Vas ${Data.formatAmount(diff)} sobre tu plan`;
    } else {
      card.className = 'status-card status-bad';
      icon.innerHTML = UI.icon('trend-down');
      title.textContent = `Vas ${Data.formatAmount(-diff)} bajo tu plan`;
    }
    sub.textContent = `Según tu plan del ${Data.formatDate(plan.date)} deberías tener ${Data.formatAmount(expected)} hoy. Tienes ${Data.formatAmount(this._patrimony)}.`;
  },

  _realSeries(keys, expenses, incomes, snapshots) {
    return Analytics.patrimonySeries(keys, this._patrimony, expenses, incomes, snapshots);
  },

  _renderChart(shown, colorOf, colors, expenses, incomes, snapshots) {
    const current = this._monthKey(new Date());
    const earliest = shown.map(p => p.points[0].key).sort()[0];
    let startKey = earliest < this._addMonths(current, -2) ? earliest : this._addMonths(current, -2);
    if (startKey < this._addMonths(current, -12)) startKey = this._addMonths(current, -12);
    const lastPlanKey = shown.map(p => p.points[p.points.length - 1].key).sort().reverse()[0];
    const endKey = lastPlanKey > this._addMonths(current, 6) ? lastPlanKey : this._addMonths(current, 6);

    const keys = [];
    for (let k = startKey; k <= endKey; k = this._addMonths(k, 1)) keys.push(k);
    const labels = keys.map(k => {
      const [y, m] = k.split('-').map(Number);
      const lbl = new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
      return m === 1 ? `${lbl} ${String(y).slice(2)}` : lbl;
    });

    const realData = this._realSeries(keys, expenses, incomes, snapshots);
    const t = Dashboard._theme();
    const latestId = shown[shown.length - 1].id;

    const datasets = [
      ...shown.map(p => {
        const map = Object.fromEntries(p.points.map(pt => [pt.key, pt.value]));
        const isLatest = p.id === latestId;
        return {
          label: this._planLabel(p),
          data: keys.map(k => map[k] != null ? map[k] : null),
          borderColor: colorOf[p.id],
          backgroundColor: colorOf[p.id],
          borderWidth: isLatest ? 2.5 : 1.75,
          borderDash: isLatest ? [] : [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.25,
          spanGaps: false,
          order: isLatest ? 1 : 2
        };
      }),
      {
        label: 'Real',
        data: realData,
        borderColor: colors.real,
        backgroundColor: colors.real,
        borderWidth: 3,
        pointRadius: realData.map((v, i) => keys[i] === current ? 4.5 : 0),
        pointHoverRadius: 5,
        tension: 0.25,
        order: 0
      }
    ];

    // Leyenda HTML (más legible que la de Chart.js en pantallas chicas)
    document.getElementById('plan-legend').innerHTML =
      `<span class="legend-item"><span class="legend-line" style="background:${colors.real}"></span>Real</span>` +
      [...shown].reverse().map(p =>
        `<span class="legend-item"><span class="legend-line${p.id === latestId ? '' : ' dashed'}" style="--c:${colorOf[p.id]}"></span>${this._planLabel(p).replace('Plan del ', '')}${p.id === latestId ? ' · actual' : ''}</span>`
      ).join('');

    this.resetChart();
    this._chart = new Chart(document.getElementById('chart-plans'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...Dashboard._tooltip(t),
            displayColors: true,
            itemSort: (a, b) => b.parsed.y - a.parsed.y,
            filter: item => item.parsed.y != null,
            callbacks: {
              title: items => UI.monthLabel(keys[items[0].dataIndex]),
              label: ctx => ` ${ctx.dataset.label === 'Real' ? 'Real' : ctx.dataset.label.replace('Plan del ', 'Plan ')}: ${Data.formatAmount(ctx.parsed.y)}`
            }
          }
        },
        scales: Dashboard._axes(t, { beginAtZero: false })
      }
    });
  },

  _renderDiff(plans) {
    const card = document.getElementById('plan-diff-card');
    if (plans.length < 2) { card.style.display = 'none'; return; }
    card.style.display = '';
    const a = plans[plans.length - 2];
    const b = plans[plans.length - 1];
    const netA = a.income - a.expenses;
    const netB = b.income - b.expenses;
    const g6 = p => p.points[6].value - p.points[0].value;
    const gA = g6(a), gB = g6(b), dG = gB - gA;

    // Descomposición del cambio en crecimiento a 6 meses
    const byIncome   = 6 * (b.income - a.income);
    const byExpenses = -6 * (b.expenses - a.expenses);
    const byPlanned  = dG - byIncome - byExpenses;

    const fmtSigned = v => `${v >= 0 ? '+' : '−'}${Data.formatAmount(Math.abs(v))}`;
    const parts = [];
    if (Math.abs(byIncome) >= 1)   parts.push(`${fmtSigned(byIncome)} por ${byIncome >= 0 ? 'mayor' : 'menor'} ingreso`);
    if (Math.abs(byExpenses) >= 1) parts.push(`${fmtSigned(byExpenses)} por ${byExpenses >= 0 ? 'menor' : 'mayor'} gasto`);
    if (Math.abs(byPlanned) >= 1)  parts.push(`${fmtSigned(byPlanned)} por gastos previstos`);

    document.getElementById('plan-diff-summary').textContent = Math.abs(dG) < 1
      ? `En 6 meses ambos planes crecen lo mismo (${fmtSigned(gB)}).`
      : `En 6 meses tu plan actual crece ${fmtSigned(gB)}, ${Data.formatAmount(Math.abs(dG))} ${dG > 0 ? 'más' : 'menos'} que el plan del ${Data.formatDate(a.date)} (${fmtSigned(gA)}).` +
        (parts.length ? ` Diferencia: ${parts.join(', ')}.` : '');

    const row = (label, from, to, goodWhenUp) => {
      const d = to - from;
      const cls = Math.abs(d) < 1 ? '' : (d > 0) === goodWhenUp ? 'amount-pos' : 'amount-neg';
      return `
        <div class="diff-row">
          <span class="diff-label">${label}</span>
          <span class="diff-values">${Data.formatAmount(from)} → <strong>${Data.formatAmount(to)}</strong></span>
          <span class="diff-delta ${cls}">${Math.abs(d) < 1 ? 'igual' : fmtSigned(d)}</span>
        </div>`;
    };
    document.getElementById('plan-diff-rows').innerHTML =
      row('Ingreso mensual', a.income, b.income, true) +
      row('Gasto mensual', a.expenses, b.expenses, false) +
      row('Ahorro mensual', netA, netB, true) +
      row('Patrimonio inicial', a.base, b.base, true);
  },

  _renderPlansList(plans, colorOf, colors, today) {
    document.getElementById('plans-count').textContent = `${plans.length} plan${plans.length !== 1 ? 'es' : ''}`;
    const latestId = plans[plans.length - 1].id;
    document.getElementById('plans-list').innerHTML = [...plans].reverse().map(p => {
      const net  = p.income - p.expenses;
      const days = this._daysSince(p.date);
      let vs = '';
      if (days >= 3) {
        const diff = this._patrimony - this._expectedAt(p, today);
        vs = `<div class="tx-amount ${diff >= 0 ? 'amount-pos' : 'amount-neg'}">${diff >= 0 ? '+' : '−'}${Dashboard._compact(Math.abs(diff)).replace('-', '')}<span class="tx-amount-sub">vs real</span></div>`;
      }
      return `
        <div class="tx-row plan-row">
          <span class="plan-swatch" style="background:${colorOf[p.id] || colors.muted}"></span>
          <div class="tx-main">
            <div class="tx-title">${this._planLabel(p)}${p.id === latestId ? ' <span class="now-badge">Actual</span>' : ''}</div>
            <div class="tx-sub">Ingreso ${Data.formatAmount(p.income)} · Gasto ${Data.formatAmount(p.expenses)} · ${net >= 0 ? '+' : ''}${Data.formatAmount(net)}/mes</div>
          </div>
          ${vs}
          <button class="row-icon-btn danger" data-delete-plan="${p.id}" aria-label="Eliminar plan">${UI.icon('trash')}</button>
        </div>`;
    }).join('');
  },

  /* =========================================================
     HISTORIAL DE GASTO (antes en la pestaña Presupuesto)
     ========================================================= */

  _renderHistory(expenses, categories) {
    const current = this._monthKey(new Date());
    const pastMonths = new Set(expenses.filter(e => !e.isPlanned && e.date.slice(0, 7) < current).map(e => e.date.slice(0, 7)));
    const section = document.getElementById('budget-insights-section');
    if (!pastMonths.size) { section.style.display = 'none'; return; }
    section.style.display = '';
    this._renderCategoryInsights(expenses, categories);
    this._renderMonthlySummary(expenses);
  },

  _renderCategoryInsights(expenses, categories) {
    const currentKey = this._monthKey(new Date());
    const catMap     = Object.fromEntries(categories.map(c => [c.id, c]));

    const allPastKeys = [...new Set(
      expenses.filter(e => !e.isPlanned && e.date.slice(0, 7) < currentKey).map(e => e.date.slice(0, 7))
    )].sort().reverse().slice(0, 6);
    const n = allPastKeys.length;
    if (n === 0) return;

    document.getElementById('budget-cat-months').textContent = `Últimos ${n} mes${n > 1 ? 'es' : ''}`;

    const recentExp = expenses.filter(e => !e.isPlanned && allPastKeys.includes(e.date.slice(0, 7)));
    const totalAll  = recentExp.reduce((s, e) => s + e.amount, 0);

    const byCategory = {};
    recentExp.forEach(e => {
      if (!byCategory[e.categoryId]) byCategory[e.categoryId] = {};
      const mo = e.date.slice(0, 7);
      byCategory[e.categoryId][mo] = (byCategory[e.categoryId][mo] || 0) + e.amount;
    });

    const shortLabel = key => new Date(key + '-15').toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }).replace('.', '');
    const lastLabel  = shortLabel(allPastKeys[0]);

    const rows = Object.entries(byCategory).map(([catId, monthData]) => {
      const total = Object.values(monthData).reduce((a, b) => a + b, 0);
      const peak  = Object.entries(monthData).sort((a, b) => b[1] - a[1])[0];
      return {
        cat: catMap[catId], avg: total / n,
        pct: totalAll > 0 ? (total / totalAll) * 100 : 0,
        lastMonth: monthData[allPastKeys[0]] || 0,
        peakAmt: peak ? peak[1] : 0, peakLabel: peak ? shortLabel(peak[0]) : ''
      };
    }).sort((a, b) => b.avg - a.avg);

    const maxAvg = rows[0]?.avg || 1;
    document.getElementById('budget-cat-container').innerHTML = rows.map(r => {
      const cat    = r.cat || { name: 'Sin categoría', color: '#94a3b8' };
      const isPeak = r.peakLabel !== lastLabel && r.peakAmt > r.lastMonth * 1.5;
      return `
        <div class="budget-cat-row">
          <div class="budget-cat-header">
            <span class="budget-cat-name"><span class="category-dot" style="background:${cat.color}"></span>${UI._esc(cat.name)}</span>
            <span class="budget-cat-pct">${r.pct.toFixed(0)}%</span>
          </div>
          <div class="budget-cat-bar-track">
            <div class="budget-cat-bar-fill" style="width:${Math.round(r.avg / maxAvg * 100)}%;background:${cat.color}"></div>
          </div>
          <div class="budget-cat-stats">
            <span class="budget-cat-avg">${Data.formatAmount(r.avg)}<span class="budget-cat-unit">/mes prom.</span></span>
            <span class="budget-cat-last">${lastLabel}: ${Data.formatAmount(r.lastMonth)}${isPeak ? `<span class="budget-peak-note">pico en ${r.peakLabel}</span>` : ''}</span>
          </div>
        </div>`;
    }).join('');
  },

  _renderMonthlySummary(expenses) {
    const effective = Budget.getEffectiveBudget(expenses);
    const budget    = effective ? effective.budget : null;
    const isManual  = Data.getSettings().budgetMode === 'manual';
    const now       = new Date();
    const rows      = [];

    for (let i = 0; i <= 6; i++) {
      const key   = this._monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
      const mo    = expenses.filter(e => !e.isPlanned && e.date.startsWith(key));
      const total = mo.reduce((s, e) => s + e.amount, 0);
      if (total === 0 && i > 0) continue;
      rows.push({ label: UI.monthLabel(key), total, txCount: mo.length, isCurrent: i === 0 });
    }

    document.getElementById('budget-monthly-container').innerHTML = rows.map(r => {
      let vsHTML = '<div></div>', barHTML = '';
      if (budget) {
        const diff = r.total - budget;
        const pct  = Math.min(100, r.total / budget * 100);
        vsHTML  = `<div class="month-row-vs ${diff > 0 ? 'stat-neg' : 'stat-pos'}">${diff > 0 ? '+' : '−'}${Data.formatAmount(Math.abs(diff))} ${diff > 0 ? 'sobre' : 'bajo'} ${isManual ? 'presupuesto' : 'estimado'}</div>`;
        barHTML = `<div class="month-row-bar"><span class="${diff > 0 ? 'over' : ''}" style="width:${pct.toFixed(1)}%"></span></div>`;
      }
      return `
        <div class="month-row">
          <div class="month-row-name">${r.label}${r.isCurrent ? ' <span class="now-badge">En curso</span>' : ''}</div>
          <div class="month-row-total">${Data.formatAmount(r.total)}</div>
          <div class="month-row-meta">${r.txCount} gasto${r.txCount !== 1 ? 's' : ''}</div>
          ${vsHTML}
          ${barHTML}
        </div>`;
    }).join('');
  }
};
