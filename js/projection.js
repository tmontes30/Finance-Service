/* Projection — 12-month patrimony forecast vs reality */

const Projection = {
  _chart:      null,
  _avgMonthly: 0,

  init() {
    document.getElementById('btn-proj-save').addEventListener('click', () => this._save());
    document.getElementById('btn-use-avg').addEventListener('click', () => {
      if (this._avgMonthly) {
        document.getElementById('proj-expenses').value = UI.formatMoney(Math.round(this._avgMonthly));
      }
    });
    document.getElementById('btn-reset-snapshot').addEventListener('click', () => {
      UI.confirm(
        '¿Actualizar la base de proyección al patrimonio actual? Esto reinicia el punto de partida.',
        async () => {
          await Data.resetProjectionSnapshot();
          const s = Data.getSettings();
          UI.toast('Base de proyección actualizada', 'success');
          await this._renderProjection(s.projIncome, s.projExpenses);
        }
      );
    });
  },

  async render() {
    const settings = Data.getSettings();
    const income   = settings.projIncome   != null ? settings.projIncome   : '';
    const expenses = settings.projExpenses != null ? settings.projExpenses : '';

    document.getElementById('proj-income').value   = income !== '' ? UI.formatMoney(income) : '';
    document.getElementById('proj-expenses').value = expenses !== '' ? UI.formatMoney(expenses) : '';

    await this._checkHistory();

    if (income !== '' && expenses !== '') {
      await this._renderProjection(Number(income), Number(expenses));
    } else {
      document.getElementById('projection-results').style.display = 'none';
      document.getElementById('projection-empty').style.display   = 'block';
    }
  },

  async _checkHistory() {
    const allExpenses = await Data.getExpenses();
    const months      = new Set(allExpenses.map(e => e.date.slice(0, 7)));
    const hintEl      = document.getElementById('projection-avg-hint');
    const noHistEl    = document.getElementById('projection-no-hist');

    if (months.size >= 6) {
      const total      = allExpenses.reduce((s, e) => s + e.amount, 0);
      this._avgMonthly = total / months.size;
      document.getElementById('projection-avg-value').textContent = Data.formatAmount(this._avgMonthly);
      hintEl.style.display   = 'flex';
      noHistEl.style.display = 'none';
    } else {
      const remaining        = 6 - months.size;
      noHistEl.textContent   = `Con ${remaining} ${remaining === 1 ? 'mes más' : 'meses más'} de historial te sugeriremos un gasto promedio mensual basado en tus datos reales.`;
      noHistEl.style.display = 'block';
      hintEl.style.display   = 'none';
    }
  },

  async _save() {
    const income   = UI.parseMoney(document.getElementById('proj-income').value)   || 0;
    const expenses = UI.parseMoney(document.getElementById('proj-expenses').value) || 0;
    const isFirst  = Data.getSettings().projSnapshotPatrimony == null;
    await Data.updateSettings({ projIncome: income, projExpenses: expenses });
    if (isFirst) {
      await Data.resetProjectionSnapshot();
      UI.toast('Proyección guardada. Patrimonio actual tomado como base fija.', 'success');
    } else {
      UI.toast('Parámetros actualizados.', 'success');
    }
    await this._renderProjection(income, expenses);
  },

  _monthLabel(y, m) {
    const d   = new Date(y, m - 1, 1);
    const raw = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  },

  async _renderProjection(monthlyIncome, monthlyExpenses) {
    const [accounts, allExpenses, allIncomes] = await Promise.all([
      Data.getAccounts(), Data.getExpenses(), Data.getIncomes()
    ]);

    const settings         = Data.getSettings();
    const currentPatrimony = accounts.reduce((s, a) => s + a.balance, 0);
    // Use frozen snapshot as base; fall back to live value if no snapshot yet
    const projBase         = settings.projSnapshotPatrimony != null
      ? settings.projSnapshotPatrimony
      : currentPatrimony;
    const balance          = monthlyIncome - monthlyExpenses;
    const now              = new Date();
    const nowKey           = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Separate real vs planned expenses
    const realExpenses    = allExpenses.filter(e => !e.isPlanned);
    const plannedExpenses = allExpenses.filter(e =>  e.isPlanned);

    // Build 13 points: current month + 12 future months (projected computed cumulatively)
    let runningProjected = projBase;
    const months = [];
    for (let i = 0; i <= 12; i++) {
      const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y   = d.getFullYear();
      const mo  = d.getMonth() + 1;
      const key = `${y}-${String(mo).padStart(2, '0')}`;
      const isCurrent = i === 0;

      let projected;
      let plannedThisMonth = 0;
      if (i === 0) {
        projected = parseFloat(projBase.toFixed(2));
      } else {
        // Subtract any planned one-off expenses for this future month
        plannedThisMonth = plannedExpenses
          .filter(e => e.date.slice(0, 7) === key)
          .reduce((s, e) => s + e.amount, 0);
        runningProjected += balance - plannedThisMonth;
        projected = parseFloat(runningProjected.toFixed(2));
      }

      // Real patrimony: reconstruct using real (non-planned) expenses only
      let actual = null;
      if (isCurrent) {
        actual = currentPatrimony;
      } else if (key < nowKey) {
        // Past month — reconstruct
        const nextMo    = mo === 12 ? 1     : mo + 1;
        const nextY     = mo === 12 ? y + 1 : y;
        const nextStart = `${nextY}-${String(nextMo).padStart(2, '0')}-01`;

        const incomesAfter  = allIncomes.filter(x => x.date >= nextStart).reduce((s, x) => s + x.amount, 0);
        const expensesAfter = realExpenses.filter(x => x.date >= nextStart).reduce((s, x) => s + x.amount, 0);
        actual = parseFloat((currentPatrimony - incomesAfter + expensesAfter).toFixed(2));
      }

      months.push({
        key, label: this._monthLabel(y, mo),
        isCurrent, projected, actual, plannedThisMonth
      });
    }

    // Trend card
    const trendEl   = document.getElementById('proj-trend-card');
    const trendText = document.getElementById('proj-trend-text');
    const trendIcon = document.getElementById('proj-trend-icon');
    if (balance > 0) {
      trendIcon.innerHTML   = UI.icon('trend-up');
      trendText.textContent = `Tu patrimonio crece ${Data.formatAmount(balance)} por mes. En 12 meses tendrás ${Data.formatAmount(months[12].projected)}.`;
      trendEl.className     = 'proj-trend-card proj-trend-up';
      trendEl.style.display = 'flex';
    } else if (balance < 0) {
      const monthsLeft = projBase > 0 ? projBase / Math.abs(balance) : 0;
      trendIcon.innerHTML   = UI.icon('trend-down');
      trendText.textContent = `Tu patrimonio cae ${Data.formatAmount(Math.abs(balance))} por mes.${monthsLeft > 0 && monthsLeft < 36 ? ` A este ritmo, los ahorros se agotan en ~${Math.round(monthsLeft)} meses.` : ' Revisa tus gastos.'}`;
      trendEl.className     = 'proj-trend-card proj-trend-down';
      trendEl.style.display = 'flex';
    } else {
      trendEl.style.display = 'none';
    }

    // Show snapshot info
    const infoEl   = document.getElementById('proj-snapshot-info');
    const resetBtn = document.getElementById('btn-reset-snapshot');
    const earlyNote = document.getElementById('proj-early-income-note');
    if (settings.projSnapshotDate) {
      infoEl.textContent      = `Base fija desde el ${Data.formatDate(settings.projSnapshotDate)}: ${Data.formatAmount(projBase)}`;
      infoEl.style.display    = 'block';
      resetBtn.style.display  = '';
      earlyNote.style.display = 'flex';
    } else {
      infoEl.style.display    = 'none';
      resetBtn.style.display  = 'none';
      earlyNote.style.display = 'none';
    }

    // Summary cards
    document.getElementById('proj-sum-inicio').textContent = Data.formatAmount(projBase);

    const balEl = document.getElementById('proj-sum-balance');
    balEl.textContent = (balance >= 0 ? '+' : '') + Data.formatAmount(balance) + '/mes';
    balEl.className   = 'proj-sum-value ' + (balance >= 0 ? 'stat-pos' : 'stat-neg');

    document.getElementById('projection-results').style.display = 'block';
    document.getElementById('projection-empty').style.display   = 'none';

    this._renderHorizons(months, projBase);
    this._renderChart(months, balance);
  },

  _renderHorizons(months, projBase) {
    [3, 6, 12].forEach(h => {
      const projected     = months[h].projected;
      const delta         = projected - projBase;
      const plannedCount  = months.slice(1, h + 1).filter(m => m.plannedThisMonth > 0).length;

      document.getElementById(`proj-h${h}`).textContent  = Data.formatAmount(projected);

      const deltaEl = document.getElementById(`proj-h${h}-delta`);
      deltaEl.textContent = (delta >= 0 ? '+' : '') + Data.formatAmount(delta);
      deltaEl.className   = 'proj-horizon-delta ' + (delta >= 0 ? 'stat-pos' : 'stat-neg');

      const noteEl = document.getElementById(`proj-h${h}-note`);
      noteEl.textContent = plannedCount > 0
        ? `${plannedCount} gasto${plannedCount > 1 ? 's' : ''} previsto${plannedCount > 1 ? 's' : ''} incluido${plannedCount > 1 ? 's' : ''}`
        : '';
    });
  },

  resetChart() {
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  },

  _renderChart(months, balance) {
    const labels    = months.map(m => {
      const [y, mo] = m.key.split('-').map(Number);
      return new Date(y, mo - 1, 1).toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
    });
    const projected = months.map(m => m.projected);
    const t         = Dashboard._theme();
    const color     = balance >= 0 ? t.pos : t.neg;

    if (this._chart) {
      this._chart.data.labels                      = labels;
      this._chart.data.datasets[0].data            = projected;
      this._chart.data.datasets[0].borderColor     = color;
      this._chart.data.datasets[0].pointBackgroundColor = color;
      this._chart.$months = months;
      this._chart.update();
      return;
    }

    const canvas = document.getElementById('chart-projection');
    const grad   = canvas.getContext('2d').createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, t.barTo);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    this._chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label:                'Patrimonio proyectado',
          data:                 projected,
          borderColor:          color,
          backgroundColor:      grad,
          pointBackgroundColor: color,
          borderWidth:          2.5,
          pointRadius:          0,
          pointHoverRadius:     5,
          pointHitRadius:       16,
          fill:                 true,
          tension:              0.35
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...Dashboard._tooltip(t),
            callbacks: {
              title: items => this._chart.$months[items[0].dataIndex].label,
              label: ctx => Data.formatAmount(ctx.parsed.y)
            }
          }
        },
        scales: Dashboard._axes(t, { beginAtZero: false })
      }
    });
    this._chart.$months = months;
  }
};
