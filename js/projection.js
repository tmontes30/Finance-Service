/* Projection — 12-month patrimony forecast vs reality */

const Projection = {
  _chart:      null,
  _avgMonthly: 0,

  init() {
    document.getElementById('btn-proj-save').addEventListener('click', () => this._save());
    document.getElementById('btn-use-avg').addEventListener('click', () => {
      if (this._avgMonthly) {
        document.getElementById('proj-expenses').value = Math.round(this._avgMonthly);
      }
    });
  },

  async render() {
    const settings = Data.getSettings();
    const income   = settings.projIncome   != null ? settings.projIncome   : '';
    const expenses = settings.projExpenses != null ? settings.projExpenses : '';

    document.getElementById('proj-income').value   = income;
    document.getElementById('proj-expenses').value = expenses;

    await this._checkHistory();

    if (income !== '' && expenses !== '') {
      await this._renderProjection(parseFloat(income), parseFloat(expenses));
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
      noHistEl.textContent   = `💡 Con ${remaining} ${remaining === 1 ? 'mes más' : 'meses más'} de historial te sugeriremos un gasto promedio mensual basado en tus datos reales.`;
      noHistEl.style.display = 'block';
      hintEl.style.display   = 'none';
    }
  },

  async _save() {
    const income   = parseFloat(document.getElementById('proj-income').value)   || 0;
    const expenses = parseFloat(document.getElementById('proj-expenses').value) || 0;
    await Data.updateSettings({ projIncome: income, projExpenses: expenses });
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

    const currentPatrimony = accounts.reduce((s, a) => s + a.balance, 0);
    const balance          = monthlyIncome - monthlyExpenses;
    const now              = new Date();
    const nowKey           = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Build 13 points: current month + 12 future months
    const months = [];
    for (let i = 0; i <= 12; i++) {
      const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y   = d.getFullYear();
      const mo  = d.getMonth() + 1;
      const key = `${y}-${String(mo).padStart(2, '0')}`;
      const isCurrent = i === 0;

      // Projected patrimony at start of this month
      const projected = parseFloat((currentPatrimony + balance * i).toFixed(2));

      // Real patrimony: reconstruct by working backwards from current balance
      // real_at_end_of_month = currentPatrimony - sum(incomes after month) + sum(expenses after month)
      let actual = null;
      if (isCurrent) {
        actual = currentPatrimony;
      } else if (key < nowKey) {
        // Past month — reconstruct
        const nextMo    = mo === 12 ? 1       : mo + 1;
        const nextY     = mo === 12 ? y + 1   : y;
        const nextStart = `${nextY}-${String(nextMo).padStart(2, '0')}-01`;

        const incomesAfter  = allIncomes.filter(x => x.date >= nextStart).reduce((s, x) => s + x.amount, 0);
        const expensesAfter = allExpenses.filter(x => x.date >= nextStart).reduce((s, x) => s + x.amount, 0);
        actual = parseFloat((currentPatrimony - incomesAfter + expensesAfter).toFixed(2));
      }

      months.push({
        key, label: this._monthLabel(y, mo),
        isCurrent, projected, actual
      });
    }

    // Summary cards
    document.getElementById('proj-sum-inicio').textContent = Data.formatAmount(currentPatrimony);

    const finalVal = months[12].projected;
    const finalEl  = document.getElementById('proj-sum-final');
    finalEl.textContent = Data.formatAmount(finalVal);
    finalEl.className   = 'proj-sum-value ' + (balance >= 0 ? 'stat-pos' : 'stat-neg');

    const balEl = document.getElementById('proj-sum-balance');
    balEl.textContent = (balance >= 0 ? '+' : '') + Data.formatAmount(balance) + '/mes';
    balEl.className   = 'proj-sum-value ' + (balance >= 0 ? 'stat-pos' : 'stat-neg');

    document.getElementById('projection-results').style.display = 'block';
    document.getElementById('projection-empty').style.display   = 'none';

    this._renderChart(months, balance);
    this._renderTable(months, monthlyIncome, monthlyExpenses, balance);
  },

  _renderChart(months, balance) {
    const labels    = months.map(m => m.label);
    const projected = months.map(m => m.projected);
    const actual    = months.map(m => m.actual);

    const isPos     = balance >= 0;
    const projColor = isPos ? 'rgba(16, 185, 129,' : 'rgba(244, 63, 94,';

    if (this._chart) {
      this._chart.data.labels                            = labels;
      this._chart.data.datasets[0].data                 = projected;
      this._chart.data.datasets[0].borderColor          = projColor + '0.65)';
      this._chart.data.datasets[0].backgroundColor      = projColor + '0.07)';
      this._chart.data.datasets[1].data                 = actual;
      this._chart.update('active');
      return;
    }

    const axisStyle = { color: '#4a5578', font: { size: 11 } };
    const gridStyle = { color: 'rgba(255,255,255,0.05)', drawBorder: false };

    this._chart = new Chart(document.getElementById('chart-projection'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label:           'Proyectado',
            data:            projected,
            borderColor:     projColor + '0.65)',
            backgroundColor: projColor + '0.07)',
            borderWidth:     2,
            borderDash:      [7, 4],
            pointRadius:     3,
            pointHoverRadius: 5,
            fill:            true,
            tension:         0.4
          },
          {
            label:               'Real',
            data:                actual,
            borderColor:         'rgba(139, 92, 246, 0.9)',
            backgroundColor:     'transparent',
            borderWidth:         2.5,
            pointRadius:         5,
            pointHoverRadius:    7,
            pointBackgroundColor:'rgba(139, 92, 246, 0.9)',
            fill:                false,
            tension:             0.4,
            spanGaps:            false
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
            labels: { color: '#8892b0', font: { size: 11 }, padding: 16, boxWidth: 10, usePointStyle: true, pointStyle: 'circle' }
          },
          tooltip: {
            backgroundColor: 'rgba(8, 10, 22, 0.92)',
            titleColor:      '#8892b0',
            bodyColor:       '#e2e8f0',
            borderColor:     'rgba(124, 58, 237, 0.4)',
            borderWidth:     1,
            padding:         10,
            cornerRadius:    8,
            displayColors:   true,
            callbacks: {
              label: ctx => ctx.parsed.y != null
                ? ` ${ctx.dataset.label}: ${Data.formatAmount(ctx.parsed.y)}`
                : null
            }
          }
        },
        scales: {
          x: { grid: gridStyle, ticks: { ...axisStyle, maxRotation: 40 }, border: { display: false } },
          y: {
            grid:   gridStyle,
            ticks:  { ...axisStyle, callback: val => Data.formatAmount(val) },
            border: { display: false }
          }
        }
      }
    });
  },

  _renderTable(months, monthlyIncome, monthlyExpenses, balance) {
    const balClass = balance >= 0 ? 'stat-pos' : 'stat-neg';
    const balStr   = (balance >= 0 ? '+' : '') + Data.formatAmount(balance);

    const rows = months.map(m => {
      const rowClass = m.isCurrent ? ' class="proj-row-current"' : '';

      const currentTag = m.isCurrent ? ' <span class="proj-now-badge">hoy</span>' : '';

      // Ingresos / Gastos / Balance cols
      const flowCols = m.isCurrent
        ? `<td class="proj-muted">—</td><td class="proj-muted">—</td><td class="proj-muted">—</td>`
        : `<td class="stat-pos">${Data.formatAmount(monthlyIncome)}</td>
           <td class="stat-neg">${Data.formatAmount(monthlyExpenses)}</td>
           <td class="${balClass}">${balStr}</td>`;

      // Real + Diff cols
      let realCols;
      if (m.actual !== null) {
        const diff      = m.actual - m.projected;
        const diffClass = diff >= 0 ? 'stat-pos' : 'stat-neg';
        const diffStr   = m.isCurrent
          ? '<span class="proj-muted">—</span>'
          : (diff >= 0 ? '+' : '') + Data.formatAmount(diff);
        realCols = `<td class="proj-patrimony">${Data.formatAmount(m.actual)}</td>
                    <td class="${m.isCurrent ? '' : diffClass}">${diffStr}</td>`;
      } else {
        realCols = `<td class="proj-muted">—</td><td class="proj-muted">—</td>`;
      }

      return `<tr${rowClass}>
        <td class="proj-month">${m.label}${currentTag}</td>
        ${flowCols}
        <td class="proj-patrimony proj-projected-val">${Data.formatAmount(m.projected)}</td>
        ${realCols}
      </tr>`;
    });

    document.getElementById('projection-table').innerHTML = `
      <thead>
        <tr>
          <th>Mes</th>
          <th>Ingresos</th>
          <th>Gastos</th>
          <th>Balance</th>
          <th>Proyectado</th>
          <th>Real</th>
          <th>Diferencia</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    `;
  }
};
