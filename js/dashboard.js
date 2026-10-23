/* Dashboard — resumen, últimos gastos y gráficos Chart.js */

const Dashboard = {
  _period:        'month',
  _monthOffset:   0,
  _monthlyChart:  null,
  _categoryChart: null,
  _accountsChart: null,
  _flowChart:     null,
  _savingsChart:  null,

  /* ---------- Init ---------- */

  init() {
    if (window.Chart) {
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.font.size   = 11;
    }

    this._period = Data.getSettings().dashboardPeriod || 'month';
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === this._period);
      btn.addEventListener('click', async () => {
        if (btn.dataset.period === this._period) return;
        document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b === btn));
        this._period = btn.dataset.period;
        await this.render();
        Data.updateSettings({ dashboardPeriod: this._period });
      });
    });

    document.getElementById('btn-month-prev').addEventListener('click', async () => {
      this._monthOffset--;
      await this.render();
    });
    document.getElementById('btn-month-next').addEventListener('click', async () => {
      if (this._monthOffset >= 0) return;
      this._monthOffset++;
      await this.render();
    });

    document.getElementById('btn-add-first').addEventListener('click', () => UI.openExpenseModal());
  },

  /* ---------- Tema de gráficos (colores leídos de las variables CSS) ---------- */

  _theme() {
    const cs = getComputedStyle(document.documentElement);
    const v  = name => cs.getPropertyValue(name).trim();
    return {
      grid:         v('--chart-grid'),
      tick:         v('--chart-tick'),
      tooltipBg:    v('--chart-tooltip-bg'),
      tooltipTitle: v('--chart-tooltip-title'),
      tooltipBody:  v('--chart-tooltip-body'),
      border:       v('--color-border-strong'),
      surface:      v('--color-surface'),
      barFrom:      v('--chart-bar-from'),
      barTo:        v('--chart-bar-to'),
      pos:          v('--chart-pos'),
      neg:          v('--chart-neg'),
      muted:        v('--color-text-muted')
    };
  },

  _tooltip(t) {
    return {
      backgroundColor: t.tooltipBg,
      titleColor:      t.tooltipTitle,
      bodyColor:       t.tooltipBody,
      borderColor:     t.border,
      borderWidth:     1,
      padding:         10,
      cornerRadius:    10,
      displayColors:   false,
      titleFont:       { weight: '500' },
      bodyFont:        { weight: '600', size: 13 }
    };
  },

  _axes(t, { beginAtZero = true, compactY = true } = {}) {
    return {
      x: {
        grid:   { display: false },
        ticks:  { color: t.tick, maxRotation: 0, autoSkip: true, autoSkipPadding: 6 },
        border: { display: false }
      },
      y: {
        beginAtZero,
        grid:   { color: t.grid },
        ticks:  { color: t.tick, maxTicksLimit: 5, callback: val => compactY ? this._compact(val) : Data.formatAmount(val) },
        border: { display: false }
      }
    };
  },

  // $1.250.000 → $1,3M · $45.000 → $45k (para ejes en pantallas chicas)
  _compact(val) {
    const n = Math.abs(val), sign = val < 0 ? '-' : '';
    if (n >= 1e6) return `${sign}$${(n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
    if (n >= 1e3) return `${sign}$${Math.round(n / 1e3)}k`;
    return `${sign}$${Math.round(n)}`;
  },

  resetCharts() {
    ['_monthlyChart', '_categoryChart', '_accountsChart', '_flowChart', '_savingsChart'].forEach(k => {
      if (this[k]) { this[k].destroy(); this[k] = null; }
    });
  },

  _monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  // Últimos 12 (o n) meses terminando en refDate: [{ key, short, long }]
  _monthsBack(refDate, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
      out.push({
        key:   this._monthKey(d),
        short: d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', ''),
        long:  UI.monthLabel(this._monthKey(d))
      });
    }
    return out;
  },

  /* ---------- Period helpers ---------- */

  _periodFrom(period) {
    const now = new Date();
    if (period === 'month')   return `${this._monthKey(now)}-01`;
    if (period === '3months') return `${this._monthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1))}-01`;
    if (period === 'year')    return `${now.getFullYear()}-01-01`;
    return null; // 'all'
  },

  _filterByPeriod(expenses, period) {
    const from = this._periodFrom(period);
    return from ? expenses.filter(e => e.date >= from) : expenses;
  },

  /* ---------- Render ---------- */

  async render() {
    const [_allExpenses, allIncomes, accounts, categories] = await Promise.all([
      Data.getExpenses(), Data.getIncomes(), Data.getAccounts(), Data.getCategories()
    ]);
    const now = new Date();
    const currentMonthKey = this._monthKey(now);
    // Los gastos previstos no se muestran hasta que su mes sea el mes en curso
    const allExpenses = _allExpenses.filter(e => !e.isPlanned || e.date.startsWith(currentMonthKey));

    // Navegación por mes
    const selDate = new Date(now.getFullYear(), now.getMonth() + this._monthOffset, 1);
    const selKey  = this._monthKey(selDate);
    const navLabel = document.getElementById('month-nav-label');
    navLabel.textContent = UI.monthLabel(selKey);
    navLabel.classList.toggle('month-nav-current', this._monthOffset === 0);
    document.getElementById('btn-month-next').disabled = this._monthOffset >= 0;

    // Patrimonio
    const patrimonio = accounts.reduce((s, a) => s + a.balance, 0);
    document.getElementById('stat-patrimonio').textContent = Data.formatAmount(patrimonio);
    PatrimonioToggle.applyTo('stat-patrimonio');

    const monthIncome   = allIncomes.filter(i => i.date.startsWith(selKey)).reduce((s, i) => s + i.amount, 0);
    const monthExpenses = allExpenses.filter(e => e.date.startsWith(selKey));
    const monthExpTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const monthRealExp  = monthExpenses.filter(e => !e.isPlanned).reduce((s, e) => s + e.amount, 0);

    const heroSub = document.getElementById('hero-sub');
    if (accounts.length === 0) {
      heroSub.textContent = 'Agrega tus cuentas para ver tu patrimonio';
    } else if (monthIncome || monthRealExp) {
      const net = monthIncome - monthRealExp;
      heroSub.textContent = `${net >= 0 ? '+' : ''}${Data.formatAmount(net)} de ahorro neto ${this._monthOffset === 0 ? 'este mes' : 'ese mes'}`;
    } else {
      heroSub.textContent = '';
    }

    // Estado vacío
    const isEmpty = allExpenses.length === 0;
    document.getElementById('dashboard-empty').style.display = isEmpty ? 'block' : 'none';
    ['month-nav', 'stat-cards', 'recent-list', 'charts-grid'].forEach(id => {
      document.getElementById(id).style.display = isEmpty ? 'none' : '';
    });
    document.querySelector('#view-dashboard .section-header').style.display = isEmpty ? 'none' : '';
    if (isEmpty) {
      document.getElementById('accounts-analysis-section').style.display = 'none';
      return;
    }

    // Stats del mes
    const todayTotal = this._monthOffset === 0
      ? allExpenses.filter(e => e.date === localISODate()).reduce((s, e) => s + e.amount, 0)
      : null;
    document.getElementById('stat-today').textContent = todayTotal !== null ? Data.formatAmount(todayTotal) : '—';
    document.getElementById('stat-month').textContent = Data.formatAmount(monthExpTotal);
    document.getElementById('stat-month-income').textContent = Data.formatAmount(monthIncome);
    const yearFrom = `${selDate.getFullYear()}-01-01`;
    document.getElementById('stat-year').textContent = Data.formatAmount(
      allExpenses.filter(e => e.date >= yearFrom && e.date.slice(0, 7) <= selKey).reduce((s, e) => s + e.amount, 0)
    );

    // Presupuesto: solo mes actual, con historial completo (incluye previstos para Budget)
    if (this._monthOffset === 0) {
      this._renderBudgetInsight(Budget.getEffectiveBudget(_allExpenses));
    } else {
      document.getElementById('budget-insight').style.display = 'none';
      document.getElementById('budget-months-tag').style.display = 'none';
    }

    // El selector de período solo aplica al mes actual
    document.getElementById('period-selector').style.display = this._monthOffset !== 0 ? 'none' : '';
    const categoryExpenses = this._monthOffset !== 0
      ? monthExpenses
      : this._filterByPeriod(allExpenses, this._period);

    this._renderRecent(monthExpenses, categories, accounts, _allExpenses);
    this._renderCategoryChart(categoryExpenses, categories);
    this._renderMonthlyChart(allExpenses, selDate);
    this._renderSavingsChart(allExpenses, allIncomes);
    this._renderAccountsSection(accounts, allExpenses, allIncomes);
  },

  _renderBudgetInsight(data) {
    const el  = document.getElementById('budget-insight');
    const tag = document.getElementById('budget-months-tag');
    if (!data) { el.style.display = 'none'; tag.style.display = 'none'; return; }

    el.style.display  = 'block';
    tag.style.display = '';

    const pct   = Math.min(data.pct, 100);
    const color = data.pct < 51 ? 'var(--color-success)'
                : data.pct < 85 ? 'var(--color-warning)'
                : 'var(--color-danger)';

    document.getElementById('budget-bar-fill').style.width      = `${pct}%`;
    document.getElementById('budget-bar-fill').style.background = color;
    tag.textContent = data.isManual
      ? 'Presupuesto manual'
      : `Estimado · ${data.monthsUsed} mes${data.monthsUsed > 1 ? 'es' : ''}`;
    document.getElementById('budget-text-spent').textContent = `de ${Data.formatAmount(data.budget)}`;
    document.getElementById('budget-text-pct').textContent   = `${Math.round(data.pct)}%`;
    document.getElementById('budget-text-pct').style.color   = color;

    const left   = data.budget - data.currentSpend;
    const footer = document.getElementById('budget-text-footer');
    footer.textContent = left >= 0
      ? `Te quedan ${Data.formatAmount(left)} este mes`
      : `Te pasaste por ${Data.formatAmount(-left)}`;
    footer.style.color = left >= 0 ? 'var(--color-text-secondary)' : 'var(--color-danger)';
  },

  /* ---------- Últimos gastos ---------- */

  _renderRecent(monthExpenses, categories, accounts, rawExpenses) {
    const list   = document.getElementById('recent-list');
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const accMap = Object.fromEntries(accounts.map(a => [a.id, a]));
    const recent = [...monthExpenses]
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.createdAt - a.createdAt))
      .slice(0, 5);

    if (!recent.length) {
      list.innerHTML = `<div class="tx-row"><div class="tx-main"><div class="tx-sub">Sin gastos registrados en este mes.</div></div></div>`;
      return;
    }
    list.innerHTML = recent.map(e => Expenses.rowHTML(e, catMap, accMap, { showDate: true })).join('');
    list.querySelectorAll('.tx-row[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const exp = rawExpenses.find(x => x.id === row.dataset.id);
        if (exp) UI.openExpenseModal(exp);
      });
    });
  },

  /* ---------- Doughnut: por categoría ---------- */

  _renderCategoryChart(expenses, categories) {
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const totals = {};
    expenses.forEach(e => { totals[e.categoryId] = (totals[e.categoryId] || 0) + e.amount; });

    let rows = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([id, amt]) => ({ name: catMap[id]?.name || 'Sin categoría', color: catMap[id]?.color || this._theme().muted, amt }));
    // Más de 6 → agrupar el resto en "Otras"
    if (rows.length > 6) {
      const rest = rows.slice(5).reduce((s, r) => s + r.amt, 0);
      rows = [...rows.slice(0, 5), { name: 'Otras', color: this._theme().muted, amt: rest }];
    }
    const total = rows.reduce((s, r) => s + r.amt, 0);
    document.getElementById('donut-total').textContent = Data.formatAmount(total);

    document.getElementById('category-legend').innerHTML = rows.length
      ? rows.map(r => `
          <div class="legend-row">
            <span class="legend-dot" style="background:${r.color}"></span>
            <span class="legend-name">${UI._esc(r.name)}</span>
            <span class="legend-pct">${total ? Math.round(r.amt / total * 100) : 0}%</span>
            <span class="legend-amt">${Data.formatAmount(r.amt)}</span>
          </div>`).join('')
      : `<p class="budget-empty-note">Sin gastos en este período.</p>`;

    const t      = this._theme();
    const labels = rows.map(r => r.name);
    const data   = rows.map(r => r.amt);
    const colors = rows.map(r => r.color);

    if (this._categoryChart) {
      const ds = this._categoryChart.data.datasets[0];
      this._categoryChart.data.labels = labels;
      ds.data = data; ds.backgroundColor = colors; ds.borderColor = t.surface;
      this._categoryChart.update();
      return;
    }

    this._categoryChart = new Chart(document.getElementById('chart-category'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: t.surface, hoverOffset: 6, borderRadius: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { animateScale: true, duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltip(t),
            callbacks: { label: ctx => ` ${ctx.label}: ${Data.formatAmount(ctx.parsed)}` }
          }
        }
      }
    });
  },

  /* ---------- Barras: gasto por mes ---------- */

  _renderMonthlyChart(allExpenses, refDate) {
    const months = this._monthsBack(refDate, 12);
    const data   = months.map(m => allExpenses.filter(e => e.date.startsWith(m.key)).reduce((s, e) => s + e.amount, 0));
    const labels = months.map(m => m.short);

    if (this._monthlyChart) {
      this._monthlyChart.data.labels           = labels;
      this._monthlyChart.data.datasets[0].data = data;
      this._monthlyChart.$months = months;
      this._monthlyChart.update();
      return;
    }

    const t      = this._theme();
    const canvas = document.getElementById('chart-monthly');
    const grad   = canvas.getContext('2d').createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, t.barFrom);
    grad.addColorStop(1, t.barTo);

    this._monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Gasto', data, backgroundColor: grad, borderRadius: 6, borderSkipped: false, maxBarThickness: 28 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltip(t),
            callbacks: {
              title: items => this._monthlyChart.$months[items[0].dataIndex].long,
              label: ctx => Data.formatAmount(ctx.parsed.y)
            }
          }
        },
        scales: this._axes(t)
      }
    });
    this._monthlyChart.$months = months;
  },

  /* ---------- Ahorro neto (últimos 12 meses) ---------- */

  _renderSavingsChart(allExpenses, allIncomes) {
    const months  = this._monthsBack(new Date(), 12);
    const savings = months.map(m => {
      const inc = allIncomes.filter(x => x.date.startsWith(m.key)).reduce((s, x) => s + x.amount, 0);
      const exp = allExpenses.filter(x => x.date.startsWith(m.key) && !x.isPlanned).reduce((s, x) => s + x.amount, 0);
      return inc - exp;
    });
    const t      = this._theme();
    const colors = savings.map(v => v >= 0 ? t.pos : t.neg);
    const labels = months.map(m => m.short);

    if (this._savingsChart) {
      this._savingsChart.data.labels                      = labels;
      this._savingsChart.data.datasets[0].data            = savings;
      this._savingsChart.data.datasets[0].backgroundColor = colors;
      this._savingsChart.$months = months;
      this._savingsChart.update();
      return;
    }

    this._savingsChart = new Chart(document.getElementById('chart-savings'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Ahorro neto', data: savings, backgroundColor: colors, borderRadius: 6, borderSkipped: false, maxBarThickness: 28 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltip(t),
            callbacks: {
              title: items => this._savingsChart.$months[items[0].dataIndex].long,
              label: ctx => `${ctx.parsed.y >= 0 ? '+' : ''}${Data.formatAmount(ctx.parsed.y)}`
            }
          }
        },
        scales: this._axes(t, { beginAtZero: false })
      }
    });
    this._savingsChart.$months = months;
  },

  /* ---------- Análisis de cuentas ---------- */

  _renderAccountsSection(accounts, allExpenses, allIncomes) {
    const section = document.getElementById('accounts-analysis-section');
    if (!accounts.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    this._renderFlowChart(allExpenses, allIncomes);
    this._renderAccountsBalanceChart(accounts);
  },

  _renderAccountsBalanceChart(accounts) {
    const sorted   = [...accounts].sort((a, b) => b.balance - a.balance);
    const labels   = sorted.map(a => a.name);
    const data     = sorted.map(a => a.balance);
    const colors   = sorted.map(a => a.color);
    document.getElementById('accounts-chart-wrapper').style.height = `${Math.max(140, sorted.length * 44 + 30)}px`;

    if (this._accountsChart) {
      this._accountsChart.data.labels                      = labels;
      this._accountsChart.data.datasets[0].data            = data;
      this._accountsChart.data.datasets[0].backgroundColor = colors;
      this._accountsChart.update();
      this._accountsChart.resize();
      return;
    }

    const t = this._theme();
    this._accountsChart = new Chart(document.getElementById('chart-accounts-balance'), {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false, maxBarThickness: 22 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: { ...this._tooltip(t), callbacks: { label: ctx => Data.formatAmount(ctx.parsed.x) } }
        },
        scales: {
          x: { grid: { color: t.grid }, ticks: { color: t.tick, maxTicksLimit: 4, callback: val => this._compact(val) }, border: { display: false } },
          y: { grid: { display: false }, ticks: { color: t.tick, callback: function (val) {
            const l = this.getLabelForValue(val);
            return l.length > 14 ? l.slice(0, 13) + '…' : l;
          } }, border: { display: false } }
        }
      }
    });
  },

  /* ---------- Ingresos vs gastos (6 meses) ---------- */

  _renderFlowChart(allExpenses, allIncomes) {
    const months      = this._monthsBack(new Date(), 6);
    const labels      = months.map(m => m.short);
    const incomeData  = months.map(m => allIncomes.filter(x => x.date.startsWith(m.key)).reduce((s, x) => s + x.amount, 0));
    const expenseData = months.map(m => allExpenses.filter(x => x.date.startsWith(m.key)).reduce((s, x) => s + x.amount, 0));

    if (this._flowChart) {
      this._flowChart.data.labels           = labels;
      this._flowChart.data.datasets[0].data = incomeData;
      this._flowChart.data.datasets[1].data = expenseData;
      this._flowChart.$months = months;
      this._flowChart.update();
      return;
    }

    const t = this._theme();
    this._flowChart = new Chart(document.getElementById('chart-flow'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos', data: incomeData,  backgroundColor: t.pos, borderRadius: 5, borderSkipped: false, maxBarThickness: 18 },
          { label: 'Gastos',   data: expenseData, backgroundColor: t.neg, borderRadius: 5, borderSkipped: false, maxBarThickness: 18 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: t.tick, padding: 14, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle' }
          },
          tooltip: {
            ...this._tooltip(t),
            displayColors: true,
            callbacks: {
              title: items => this._flowChart.$months[items[0].dataIndex].long,
              label: ctx => ` ${ctx.dataset.label}: ${Data.formatAmount(ctx.parsed.y)}`
            }
          }
        },
        scales: this._axes(t)
      }
    });
    this._flowChart.$months = months;
  }
};
