/* Dashboard — stat cards and Chart.js charts */

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
    const saved = Data.getSettings().dashboardPeriod || 'month';
    this._period = saved;
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === this._period);
    });

    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._period = btn.dataset.period;
        await Data.updateSettings({ dashboardPeriod: this._period });
        await this.render();
      });
    });

    document.getElementById('btn-month-prev').addEventListener('click', async () => {
      this._monthOffset--;
      await this.render();
    });
    document.getElementById('btn-month-next').addEventListener('click', async () => {
      this._monthOffset++;
      await this.render();
    });

    const btnFirst = document.getElementById('btn-add-first');
    if (btnFirst) {
      btnFirst.addEventListener('click', async () => UI.openExpenseModal());
    }
  },

  /* ---------- Period helpers ---------- */

  _periodFrom(period) {
    const now = new Date();
    if (period === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (period === '3months') {
      const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (period === 'year') {
      return `${now.getFullYear()}-01-01`;
    }
    return null; // 'all'
  },

  _filterByPeriod(expenses, period) {
    const from = this._periodFrom(period);
    if (!from) return expenses;
    return expenses.filter(e => e.date >= from);
  },

  /* ---------- Render ---------- */

  async render() {
    const [_allExpenses, allIncomes, accounts, categories] = await Promise.all([
      Data.getExpenses(), Data.getIncomes(), Data.getAccounts(), Data.getCategories()
    ]);
    // Los gastos previstos no se muestran hasta que su mes sea el mes en curso
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const allExpenses = _allExpenses.filter(e =>
      !e.isPlanned || e.date.startsWith(currentMonthKey)
    );

    // Month navigation
    const selDate = new Date(now.getFullYear(), now.getMonth() + this._monthOffset, 1);
    const selKey  = `${selDate.getFullYear()}-${String(selDate.getMonth() + 1).padStart(2, '0')}`;

    const navLabel = document.getElementById('month-nav-label');
    const rawLabel = selDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    navLabel.textContent = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    navLabel.classList.toggle('month-nav-current', this._monthOffset === 0);
    document.getElementById('btn-month-next').disabled = this._monthOffset >= 0;

    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    const emptyEl    = document.getElementById('dashboard-empty');
    const statsPrimEl = document.getElementById('stat-cards');
    const chartsEl   = document.getElementById('charts-grid');

    const patrimonio = accounts.reduce((s, a) => s + a.balance, 0);
    document.getElementById('stat-patrimonio').textContent = Data.formatAmount(patrimonio);
    PatrimonioToggle.applyTo('stat-patrimonio');

    if (allExpenses.length === 0) {
      emptyEl.style.display   = 'block';
      statsPrimEl.style.display = 'grid';
      chartsEl.style.display  = 'none';
      this._renderAccountsSection(accounts, allExpenses, allIncomes);
      return;
    }

    emptyEl.style.display    = 'none';
    statsPrimEl.style.display = 'grid';
    chartsEl.style.display   = 'grid';

    const todayStr = now.toISOString().split('T')[0];
    const yearFrom = `${selDate.getFullYear()}-01-01`;

    const monthExpenses = allExpenses.filter(e => e.date.startsWith(selKey));
    const monthExpTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

    const todayTotal = this._monthOffset === 0
      ? allExpenses.filter(e => e.date === todayStr).reduce((s, e) => s + e.amount, 0)
      : null;
    document.getElementById('stat-today').textContent = todayTotal !== null ? Data.formatAmount(todayTotal) : '—';
    document.getElementById('stat-month').textContent = Data.formatAmount(monthExpTotal);
    document.getElementById('stat-year').textContent = Data.formatAmount(
      allExpenses.filter(e => e.date >= yearFrom && e.date.slice(0, 7) <= selKey).reduce((s, e) => s + e.amount, 0)
    );

    // Period selector only makes sense on current month
    const periodSel = document.getElementById('period-selector');
    if (periodSel) periodSel.style.display = this._monthOffset !== 0 ? 'none' : 'flex';

    // Category chart uses the selected month when navigating past months
    const categoryExpenses = this._monthOffset !== 0
      ? monthExpenses
      : this._filterByPeriod(allExpenses, this._period);

    // Budget insight — only for current month, uses raw (unfiltered) expenses for history
    if (this._monthOffset === 0) {
      this._renderBudgetInsight(Budget.getEffectiveBudget(_allExpenses));
    } else {
      document.getElementById('budget-insight').style.display = 'none';
    }

    this._renderMonthlyChart(allExpenses, selDate);
    this._renderCategoryChart(categoryExpenses, categories);
    this._renderSavingsChart(allExpenses, allIncomes);
    this._renderAccountsSection(accounts, allExpenses, allIncomes);
  },

  _renderBudgetInsight(data) {
    const el = document.getElementById('budget-insight');
    if (!data) { el.style.display = 'none'; return; }

    el.style.display = 'block';

    const pct   = Math.min(data.pct, 100);
    const color = data.pct < 51 ? 'var(--color-success)'
                : data.pct < 85 ? '#f59e0b'
                : 'var(--color-danger)';

    document.getElementById('budget-bar-fill').style.width      = `${pct}%`;
    document.getElementById('budget-bar-fill').style.background = color;
    document.getElementById('budget-months-tag').textContent    = data.isManual
      ? 'manual'
      : `${data.monthsUsed} mes${data.monthsUsed > 1 ? 'es' : ''}`;
    document.getElementById('budget-text-spent').textContent    =
      `${Data.formatAmount(data.currentSpend)} de ${Data.formatAmount(data.budget)}`;
    document.getElementById('budget-text-pct').textContent      = `${Math.round(data.pct)}%`;
    document.getElementById('budget-text-pct').style.color      = color;

    document.getElementById('budget-text-footer').textContent = '';
  },

  /* ---------- Shared tooltip style ---------- */

  _tooltipDefaults() {
    return {
      backgroundColor: 'rgba(8, 10, 22, 0.92)',
      titleColor:      '#8892b0',
      bodyColor:       '#e2e8f0',
      borderColor:     'rgba(124, 58, 237, 0.4)',
      borderWidth:     1,
      padding:         10,
      cornerRadius:    8,
      displayColors:   false
    };
  },

  /* ---------- Bar chart: spending per month ---------- */

  _renderMonthlyChart(allExpenses, refDate) {
    const labels = [];
    const data   = [];
    const now    = refDate || new Date();

    for (let i = 11; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      labels.push(d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }));
      data.push(parseFloat(
        allExpenses.filter(e => e.date.startsWith(key)).reduce((s, e) => s + e.amount, 0).toFixed(2)
      ));
    }

    if (this._monthlyChart) {
      this._monthlyChart.data.labels           = labels;
      this._monthlyChart.data.datasets[0].data = data;
      this._monthlyChart.update('active');
      return;
    }

    const canvas = document.getElementById('chart-monthly');
    const gCtx   = canvas.getContext('2d');
    const grad   = gCtx.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0,   'rgba(139, 92, 246, 0.85)');
    grad.addColorStop(0.5, 'rgba(99, 102, 241, 0.35)');
    grad.addColorStop(1,   'rgba(99, 102, 241, 0.03)');

    const axisStyle = { color: '#4a5578', font: { size: 11 } };
    const gridStyle = { color: 'rgba(255,255,255,0.05)', drawBorder: false };

    this._monthlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Gasto',
          data,
          backgroundColor: grad,
          borderWidth:     0,
          borderRadius:    8,
          borderSkipped:   false
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltipDefaults(),
            callbacks: { label: ctx => ` ${Data.formatAmount(ctx.parsed.y)}` }
          }
        },
        scales: {
          x: { grid: gridStyle, ticks: axisStyle, border: { display: false } },
          y: {
            beginAtZero: true,
            grid: gridStyle,
            ticks: { ...axisStyle, callback: val => Data.formatAmount(val) },
            border: { display: false }
          }
        }
      }
    });
  },

  /* ---------- Doughnut chart: by category ---------- */

  _renderCategoryChart(expenses, categories) {
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const totals = {};
    expenses.forEach(e => { totals[e.categoryId] = (totals[e.categoryId] || 0) + e.amount; });

    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([id]) => catMap[id]?.name || id);
    const data   = sorted.map(([, amt]) => parseFloat(amt.toFixed(2)));
    const colors = sorted.map(([id]) => catMap[id]?.color || '#94a3b8');

    const surfaceColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface').trim() || '#111322';

    if (this._categoryChart) {
      this._categoryChart.data.labels                          = labels;
      this._categoryChart.data.datasets[0].data               = data;
      this._categoryChart.data.datasets[0].backgroundColor    = colors;
      this._categoryChart.data.datasets[0].borderColor        = surfaceColor;
      this._categoryChart.update('active');
      return;
    }

    this._categoryChart = new Chart(document.getElementById('chart-category'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth:  3,
          borderColor:  surfaceColor,
          hoverOffset:  10
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        cutout:              '68%',
        animation: { animateScale: true, duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#8892b0', font: { size: 11 },
              padding: 14, boxWidth: 10, usePointStyle: true, pointStyle: 'circle'
            }
          },
          tooltip: {
            ...this._tooltipDefaults(),
            displayColors: true,
            callbacks: { label: ctx => ` ${ctx.label}: ${Data.formatAmount(ctx.parsed)}` }
          }
        }
      }
    });
  },

  /* ---------- Insights section ---------- */

  _renderInsightsSection(periodExpenses, allExpenses, allIncomes, monthFrom) {
    const section = document.getElementById('dashboard-insights');
    if (!periodExpenses.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    const now = new Date();

    // Insight 1: Día de semana más activo
    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    periodExpenses.forEach(e => {
      const dow = new Date(e.date + 'T12:00:00').getDay();
      dowTotals[dow] += e.amount;
    });
    const dowNames = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
    const maxDow = dowTotals.indexOf(Math.max(...dowTotals));
    document.getElementById('insight-busy-day').innerHTML =
      `<div class="insight-icon">📅</div>
       <div class="insight-body">
         <div class="insight-value">Los ${dowNames[maxDow]}</div>
         <div class="insight-label">es cuando más gastás</div>
       </div>`;

    // Insight 2: Racha consecutiva sin gastar
    const expDates = new Set(allExpenses.map(e => e.date));
    let streak = 0;
    const checkD = new Date();
    while (streak < 365) {
      const ds = checkD.toISOString().split('T')[0];
      if (expDates.has(ds)) break;
      streak++;
      checkD.setDate(checkD.getDate() - 1);
    }
    document.getElementById('insight-streak').innerHTML =
      `<div class="insight-icon">${streak >= 3 ? '🎯' : streak === 0 ? '⚡' : '🔥'}</div>
       <div class="insight-body">
         <div class="insight-value">${streak} día${streak !== 1 ? 's' : ''}</div>
         <div class="insight-label">${streak === 0 ? 'gastaste hoy' : 'consecutivos sin gastar'}</div>
       </div>`;

    // Insight 3: Promedio por transacción
    const total = periodExpenses.reduce((s, e) => s + e.amount, 0);
    const avgTx = periodExpenses.length > 0 ? total / periodExpenses.length : 0;
    document.getElementById('insight-avg-tx').innerHTML =
      `<div class="insight-icon">💡</div>
       <div class="insight-body">
         <div class="insight-value">${Data.formatAmount(avgTx)}</div>
         <div class="insight-label">promedio por transacción · ${periodExpenses.length} total</div>
       </div>`;

    // Insight 4: Comparativa vs mes anterior
    const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevStart = `${prevFrom.getFullYear()}-${String(prevFrom.getMonth() + 1).padStart(2, '0')}-01`;
    const thisTotal = allExpenses.filter(e => e.date.startsWith(currentMonthKey)).reduce((s, e) => s + e.amount, 0);
    const prevTotal = allExpenses.filter(e => e.date >= prevStart && e.date < monthFrom).reduce((s, e) => s + e.amount, 0);
    let vsIcon, vsValue, vsLabel;
    if (prevTotal === 0) {
      vsIcon = '📊'; vsValue = '—'; vsLabel = 'sin datos del mes pasado';
    } else {
      const pct = (thisTotal - prevTotal) / prevTotal * 100;
      vsIcon  = pct <= 0 ? '🟢' : '🔴';
      vsValue = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
      vsLabel = pct <= 0 ? 'menos que el mes pasado' : 'más que el mes pasado';
    }
    document.getElementById('insight-vs-prev').innerHTML =
      `<div class="insight-icon">${vsIcon}</div>
       <div class="insight-body">
         <div class="insight-value">${vsValue}</div>
         <div class="insight-label">${vsLabel}</div>
       </div>`;
  },

  /* ---------- Net savings chart (last 12 months) ---------- */

  _renderSavingsChart(allExpenses, allIncomes) {
    const now    = new Date();
    const labels = [];
    const savings = [];

    for (let i = 11; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      labels.push(d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }));
      const inc = allIncomes.filter(x => x.date.startsWith(key)).reduce((s, x) => s + x.amount, 0);
      const exp = allExpenses.filter(x => x.date.startsWith(key) && !x.isPlanned).reduce((s, x) => s + x.amount, 0);
      savings.push(parseFloat((inc - exp).toFixed(2)));
    }

    const colors = savings.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.7)');

    if (this._savingsChart) {
      this._savingsChart.data.labels                       = labels;
      this._savingsChart.data.datasets[0].data             = savings;
      this._savingsChart.data.datasets[0].backgroundColor  = colors;
      this._savingsChart.update('active');
      return;
    }

    const axisStyle = { color: '#4a5578', font: { size: 11 } };
    const gridStyle = { color: 'rgba(255,255,255,0.05)', drawBorder: false };

    this._savingsChart = new Chart(document.getElementById('chart-savings'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Ahorro neto',
          data:            savings,
          backgroundColor: colors,
          borderWidth:     0,
          borderRadius:    6,
          borderSkipped:   false
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltipDefaults(),
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                return ` ${v >= 0 ? '+' : ''}${Data.formatAmount(v)}`;
              }
            }
          }
        },
        scales: {
          x: { grid: gridStyle, ticks: axisStyle, border: { display: false } },
          y: {
            grid:   gridStyle,
            ticks:  { ...axisStyle, callback: val => Data.formatAmount(Math.abs(val)) },
            border: { display: false }
          }
        }
      }
    });
  },

  /* ---------- Account analysis section ---------- */

  _renderAccountsSection(accounts, allExpenses, allIncomes) {
    const section = document.getElementById('accounts-analysis-section');
    if (!accounts.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    this._renderAccountsBalanceChart(accounts);
    this._renderFlowChart(allExpenses, allIncomes);
  },

  /* ---------- Horizontal bar: balance per account ---------- */

  _renderAccountsBalanceChart(accounts) {
    const labels   = accounts.map(a => a.name);
    const data     = accounts.map(a => a.balance);
    const colors   = accounts.map(a => a.color);
    const bgColors = colors.map(c => c + 'aa');

    if (this._accountsChart) {
      this._accountsChart.data.labels                       = labels;
      this._accountsChart.data.datasets[0].data            = data;
      this._accountsChart.data.datasets[0].backgroundColor = bgColors;
      this._accountsChart.data.datasets[0].borderColor     = colors;
      this._accountsChart.update('active');
      return;
    }

    const axisStyle = { color: '#4a5578', font: { size: 11 } };
    const gridStyle = { color: 'rgba(255,255,255,0.05)', drawBorder: false };

    this._accountsChart = new Chart(document.getElementById('chart-accounts-balance'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data, backgroundColor: bgColors, borderColor: colors,
          borderWidth: 2, borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        indexAxis:           'y',
        responsive:          true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltipDefaults(),
            callbacks: { label: ctx => ` ${Data.formatAmount(ctx.parsed.x)}` }
          }
        },
        scales: {
          x: {
            grid: gridStyle,
            ticks: { ...axisStyle, callback: val => Data.formatAmount(val) },
            border: { display: false }
          },
          y: { grid: { display: false }, ticks: axisStyle, border: { display: false } }
        }
      }
    });
  },

  /* ---------- Grouped bar: income vs expenses last 6 months ---------- */

  _renderFlowChart(allExpenses, allIncomes) {
    const labels      = [];
    const incomeData  = [];
    const expenseData = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      labels.push(d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }));
      incomeData.push(parseFloat(
        allIncomes.filter(x => x.date.startsWith(key)).reduce((s, x) => s + x.amount, 0).toFixed(2)
      ));
      expenseData.push(parseFloat(
        allExpenses.filter(x => x.date.startsWith(key)).reduce((s, x) => s + x.amount, 0).toFixed(2)
      ));
    }

    if (this._flowChart) {
      this._flowChart.data.labels           = labels;
      this._flowChart.data.datasets[0].data = incomeData;
      this._flowChart.data.datasets[1].data = expenseData;
      this._flowChart.update('active');
      return;
    }

    const axisStyle = { color: '#4a5578', font: { size: 11 } };
    const gridStyle = { color: 'rgba(255,255,255,0.05)', drawBorder: false };

    this._flowChart = new Chart(document.getElementById('chart-flow'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Ingresos', data: incomeData,
            backgroundColor: 'rgba(16, 185, 129, 0.75)',
            borderWidth: 0, borderRadius: 6, borderSkipped: false
          },
          {
            label: 'Gastos', data: expenseData,
            backgroundColor: 'rgba(244, 63, 94, 0.7)',
            borderWidth: 0, borderRadius: 6, borderSkipped: false
          }
        ]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#8892b0', font: { size: 11 },
              padding: 14, boxWidth: 10, usePointStyle: true, pointStyle: 'circle'
            }
          },
          tooltip: {
            ...this._tooltipDefaults(),
            displayColors: true,
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Data.formatAmount(ctx.parsed.y)}` }
          }
        },
        scales: {
          x: { grid: gridStyle, ticks: axisStyle, border: { display: false } },
          y: {
            beginAtZero: true, grid: gridStyle,
            ticks: { ...axisStyle, callback: val => Data.formatAmount(val) },
            border: { display: false }
          }
        }
      }
    });
  }
};
