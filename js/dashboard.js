/* Dashboard — KPIs, ritmo de gasto, hallazgos y análisis visual.
   Los cálculos viven en analytics.js; aquí solo se dibuja.
   Estilo de gráficos (guía dataviz): barras ≤24px con punta redondeada de 4px,
   líneas de 2px, grilla hairline sólida, énfasis = azul de marca y contexto = gris. */

const Dashboard = {
  _monthOffset: 0,
  _charts:      {},   // id del canvas → instancia Chart
  _heat:        null,

  /* ---------- Init ---------- */

  init() {
    if (window.Chart) {
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.font.size   = 11;
    }

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

    document.getElementById('heatmap').addEventListener('click', e => {
      const cell = e.target.closest('.heat-cell[data-day]');
      if (cell) this._showDay(Number(cell.dataset.day));
    });
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
      accent:       v('--chart-accent'),
      mutedBar:     v('--chart-muted'),
      muted:        v('--color-text-muted'),
      secondary:    v('--color-text-secondary'),
      onHero:       v('--color-on-hero'),
      onHeroSoft:   v('--color-on-hero-soft')
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
        grid:   { color: t.grid, lineWidth: 1 },
        ticks:  { color: t.tick, maxTicksLimit: 5, callback: val => compactY ? this._compact(val) : Data.formatAmount(val) },
        border: { display: false }
      }
    };
  },

  // $1.250.000 → $1,3M · $45.000 → $45k (para ejes y espacios chicos)
  _compact(val) {
    const n = Math.abs(val), sign = val < 0 ? '-' : '';
    if (n >= 1e6) return `${sign}$${(n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
    if (n >= 1e3) return `${sign}$${Math.round(n / 1e3)}k`;
    return `${sign}$${Math.round(n)}`;
  },

  resetCharts() {
    Object.values(this._charts).forEach(c => c.destroy());
    this._charts = {};
  },

  // Crea el gráfico la primera vez; después solo reemplaza datos/opciones (sin parpadeo)
  _chart(id, config) {
    const existing = this._charts[id];
    if (existing && existing.config.type === config.type) {
      existing.data    = config.data;
      existing.options = config.options;
      existing.update();
      return existing;
    }
    if (existing) existing.destroy();
    this._charts[id] = new Chart(document.getElementById(id), config);
    return this._charts[id];
  },

  _monthKey(d) {
    return Analytics.key(d);
  },

  /* ---------- Render ---------- */

  async render() {
    const [rawExpenses, incomes, accounts, categories, snapshots] = await Promise.all([
      Data.getExpenses(), Data.getIncomes(), Data.getAccounts(), Data.getCategories(), Data.getSnapshots()
    ]);
    const now        = new Date();
    const currentKey = this._monthKey(now);
    const patrimony  = accounts.reduce((s, a) => s + a.balance, 0);
    try { await Data.recordPatrimonySnapshot(patrimony); } catch (_) { /* no crítico */ }

    // Los gastos previstos no se muestran hasta que su mes sea el mes en curso
    const expenses = rawExpenses.filter(e => !e.isPlanned || e.date.startsWith(currentKey));

    const selDate   = new Date(now.getFullYear(), now.getMonth() + this._monthOffset, 1);
    const selKey    = this._monthKey(selDate);
    const isCurrent = this._monthOffset === 0;
    const navLabel  = document.getElementById('month-nav-label');
    navLabel.textContent = UI.monthLabel(selKey);
    navLabel.classList.toggle('month-nav-current', isCurrent);
    document.getElementById('btn-month-next').disabled = isCurrent;

    this._renderHero(patrimony, accounts, rawExpenses, incomes, snapshots);

    const isEmpty = expenses.length === 0;
    document.getElementById('dashboard-empty').style.display = isEmpty ? 'block' : 'none';
    document.getElementById('dash-body').classList.toggle('dash-empty', isEmpty);
    document.getElementById('month-nav').style.display = isEmpty ? 'none' : '';
    if (isEmpty) return;

    const k      = Analytics.kpis({ expenses, incomes, selKey, isCurrent });
    const pace   = Analytics.pace({ expenses, selKey, isCurrent });
    const cats   = Analytics.categoryVsAverage(expenses, categories, selKey);
    const week   = Analytics.weekday(expenses, 90);
    const recur  = Analytics.recurring(expenses, categories, currentKey);
    const budget = isCurrent ? Budget.getEffectiveBudget(rawExpenses) : null;

    this._renderKpis(k, isCurrent);
    this._renderPace(pace, budget, isCurrent, selKey);
    this._renderInsights(Analytics.insights({ k, pace, cats, week, recurring: recur, expenses, budget, isCurrent }));
    this._renderRecent(expenses.filter(e => e.date.startsWith(selKey)), categories, accounts, rawExpenses);
    this._renderCategories(cats, isCurrent);
    this._renderMonthly(k);
    this._renderHeatmap(Analytics.heatmap(expenses, selKey), isCurrent);
    this._renderWeekday(week);
    this._renderSavings(expenses, incomes, selKey);
    this._renderRecurring(recur);
    this._renderTop(Analytics.topSpending(expenses, categories, 90, 5));
  },

  /* ---------- Patrimonio ---------- */

  _renderHero(patrimony, accounts, expenses, incomes, snapshots) {
    document.getElementById('stat-patrimonio').textContent = Data.formatAmount(patrimony);
    PatrimonioToggle.applyTo('stat-patrimonio');

    const keys   = Analytics.monthKeys(this._monthKey(new Date()), 12);
    const series = Analytics.patrimonySeries(keys, patrimony, expenses, incomes, snapshots);
    const sub    = document.getElementById('hero-sub');
    if (!accounts.length) {
      sub.textContent = 'Agrega tus cuentas para ver tu patrimonio';
    } else {
      const prev = series[series.length - 2];
      const d = patrimony - prev;
      sub.innerHTML = PatrimonioToggle._hidden ? '' :
        `<span class="hero-delta">${d >= 0 ? '▲' : '▼'} ${Data.formatAmount(Math.abs(d))}</span> vs fin de ${Analytics.monthName(keys[keys.length - 2])}`;
    }
    const t = this._theme();
    this._spark('spark-patrimony', series, t.accent, t.onHeroSoft, keys);
  },

  // Mini-gráfico de tendencia (sin ejes); el último punto marcado
  _spark(id, data, color, fill, keys) {
    const last = data.length - 1;
    this._chart(id, {
      type: 'line',
      data: {
        labels: keys || data.map((_, i) => i),
        datasets: [{
          data, borderColor: color, backgroundColor: fill, fill: true,
          borderWidth: 2, tension: 0.35, spanGaps: true,
          pointRadius: data.map((_, i) => i === last ? 3.5 : 0),
          pointBackgroundColor: color, pointBorderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        layout: { padding: { top: 4, bottom: 2, left: 2, right: 4 } }
      }
    });
  },

  /* ---------- KPIs ---------- */

  // Variación con flecha + texto (nunca solo color)
  _delta(id, value, { goodWhenUp, unit = 'pct', vs }) {
    const el = document.getElementById(id);
    if (value === null || !isFinite(value)) { el.innerHTML = vs ? `<span class="kpi-vs">${vs}</span>` : ''; return; }
    const flat  = unit === 'pct' ? Math.abs(value) < 0.005 : Math.abs(value) < 0.5;
    const up    = value > 0;
    const tone  = flat ? 'flat' : (up === goodWhenUp ? 'good' : 'bad');
    const arrow = flat ? '→' : up ? '▲' : '▼';
    const txt   = unit === 'pct' ? `${Math.round(Math.abs(value) * 100)}%` : `${Math.round(Math.abs(value))} pts`;
    el.innerHTML = `<span class="delta delta-${tone}">${arrow} ${txt}</span><span class="kpi-vs">${vs}</span>`;
  },

  _renderKpis(k, isCurrent) {
    const prevName = Analytics.shortMonth(k.prevKey);
    const t = this._theme();
    const rel = (a, b) => b > 0 ? (a - b) / b : null;

    document.getElementById('stat-month').textContent = Data.formatAmount(k.spent);
    this._delta('kpi-spent-delta', rel(k.spent, k.prevSame), { goodWhenUp: false, vs: isCurrent ? `vs ${prevName} a la fecha` : `vs ${prevName}` });

    document.getElementById('stat-month-income').textContent = Data.formatAmount(k.income);
    this._delta('kpi-income-delta', rel(k.income, k.prevIncome), { goodWhenUp: true, vs: `vs ${prevName}` });

    document.getElementById('kpi-rate').textContent = k.rate === null ? '—' : `${Math.round(k.rate * 100)}%`;
    this._delta('kpi-rate-delta',
      k.rate !== null && k.avgRate !== null ? (k.rate - k.avgRate) * 100 : null,
      { goodWhenUp: true, unit: 'pts', vs: k.rate === null ? 'Sin ingresos este mes' : 'vs tu promedio' });

    document.getElementById('kpi-daily').textContent = Data.formatAmount(k.daily);
    this._delta('kpi-daily-delta', rel(k.daily, k.prevDaily), { goodWhenUp: false, vs: `vs ${prevName}` });

    const wash = t.barTo;
    this._spark('spark-spent',  k.series.spent,  t.accent, wash, k.keys);
    this._spark('spark-income', k.series.income, t.accent, wash, k.keys);
    this._spark('spark-rate',   k.series.rate,   t.accent, wash, k.keys);
    this._spark('spark-daily',  k.series.daily,  t.accent, wash, k.keys);
  },

  /* ---------- Ritmo de gasto (acumulado) + presupuesto ---------- */

  _renderPace(p, budget, isCurrent, selKey) {
    const t = this._theme();
    const prevName = Analytics.monthName(p.prevKey);
    const summary = document.getElementById('pace-summary');
    if (isCurrent) {
      const d = p.curTotal - p.prevSame;
      summary.innerHTML = `Al día ${p.upTo} llevas <strong>${Data.formatAmount(p.curTotal)}</strong>. ` +
        (p.prevSame > 0
          ? `A esta altura de ${prevName} llevabas ${Data.formatAmount(p.prevSame)} (${d <= 0 ? '▼' : '▲'} ${Data.formatAmount(Math.abs(d))}).`
          : `Sin datos de ${prevName} para comparar.`);
    } else {
      summary.innerHTML = `Gastaste <strong>${Data.formatAmount(p.curTotal)}</strong> en ${Analytics.monthName(selKey)} vs ${Data.formatAmount(p.prevTotal)} en ${prevName}.`;
    }

    this._renderBudgetInsight(budget);

    const labels = Array.from({ length: p.days }, (_, i) => i + 1);
    const datasets = [
      {
        label: 'Este mes', data: p.cur, borderColor: t.accent, backgroundColor: t.barTo,
        fill: true, borderWidth: 2, tension: 0.25, pointRadius: p.cur.map((v, i) => i === p.upTo - 1 ? 4 : 0),
        pointBackgroundColor: t.accent, pointBorderColor: t.surface, pointBorderWidth: 2, order: 1
      },
      {
        label: `Mes anterior`, data: p.prev, borderColor: t.mutedBar, backgroundColor: t.mutedBar,
        fill: false, borderWidth: 2, tension: 0.25, pointRadius: 0, order: 2
      }
    ];
    if (budget && budget.budget > 0) {
      datasets.push({
        label: 'Presupuesto', data: labels.map(() => Math.round(budget.budget)),
        borderColor: t.muted, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, fill: false, order: 3
      });
    }

    document.getElementById('pace-legend').innerHTML =
      `<span class="legend-item"><span class="legend-line" style="--c:${t.accent}"></span>${Analytics.monthName(selKey).replace(/^./, c => c.toUpperCase())}</span>` +
      `<span class="legend-item"><span class="legend-line" style="--c:${t.mutedBar}"></span>${prevName.replace(/^./, c => c.toUpperCase())}</span>` +
      (budget && budget.budget > 0 ? `<span class="legend-item"><span class="legend-line dashed" style="--c:${t.muted}"></span>Presupuesto</span>` : '');

    this._chart('chart-pace', {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltip(t), displayColors: true,
            filter: item => item.parsed.y !== null,
            callbacks: {
              title: items => `Día ${items[0].label}`,
              label: ctx => ` ${ctx.dataset.label}: ${Data.formatAmount(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          ...this._axes(t),
          x: { grid: { display: false }, border: { display: false },
               ticks: { color: t.tick, maxRotation: 0, callback: (v, i) => [1, 5, 10, 15, 20, 25, 30].includes(i + 1) ? i + 1 : '' } }
        }
      }
    });
  },

  _renderBudgetInsight(data) {
    const el  = document.getElementById('budget-insight');
    const tag = document.getElementById('budget-months-tag');
    if (!data || !(data.budget > 0)) { el.style.display = 'none'; tag.style.display = 'none'; return; }

    el.style.display  = 'block';
    tag.style.display = '';
    const pct   = Math.min(data.pct, 100);
    const color = data.pct < 51 ? 'var(--color-success)' : data.pct < 85 ? 'var(--color-warning)' : 'var(--color-danger)';
    document.getElementById('budget-bar-fill').style.width      = `${pct}%`;
    document.getElementById('budget-bar-fill').style.background = color;
    tag.textContent = data.isManual ? 'Presupuesto manual' : `Presupuesto estimado · ${data.monthsUsed} mes${data.monthsUsed > 1 ? 'es' : ''}`;
    document.getElementById('budget-text-spent').textContent = `${Math.round(data.pct)}% de ${Data.formatAmount(data.budget)}`;
    const pctEl = document.getElementById('budget-text-pct');
    const left  = data.budget - data.currentSpend;
    pctEl.textContent = left >= 0 ? `Quedan ${Data.formatAmount(left)}` : `Te pasaste ${Data.formatAmount(-left)}`;
    pctEl.style.color = left >= 0 ? 'var(--color-text)' : 'var(--color-danger)';
    document.getElementById('budget-text-footer').textContent = '';
  },

  /* ---------- Hallazgos ---------- */

  _renderInsights(list) {
    const el = document.getElementById('insight-list');
    if (!list.length) {
      el.innerHTML = `<div class="insight insight-info"><span class="insight-icon">${UI.icon('info')}</span><div><div class="insight-title">Aún no hay suficientes datos</div><div class="insight-text">Con un par de meses de gastos e ingresos verás aquí comparaciones y patrones.</div></div></div>`;
      return;
    }
    el.innerHTML = list.map(i => `
      <div class="insight insight-${i.tone}">
        <span class="insight-icon">${UI.icon(i.icon)}</span>
        <div class="insight-body">
          <div class="insight-title">${UI._esc(i.title)}</div>
          <div class="insight-text">${UI._esc(i.text)}</div>
        </div>
      </div>`).join('');
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

  /* ---------- Categorías vs promedio (barra = este mes, marca = promedio) ---------- */

  _renderCategories(cats, isCurrent) {
    const el   = document.getElementById('category-compare');
    const rows = cats.rows.filter(r => r.cur > 0 || r.avg > 0).slice(0, 6);
    document.getElementById('cats-hint').textContent = cats.monthsUsed
      ? `Promedio de ${cats.monthsUsed} mes${cats.monthsUsed > 1 ? 'es' : ''}`
      : 'Sin meses previos';
    if (!rows.length) { el.innerHTML = '<p class="budget-empty-note">Sin gastos en este mes.</p>'; return; }

    const max = Math.max(...rows.map(r => Math.max(r.cur, r.avg))) || 1;
    el.innerHTML = rows.map(r => {
      let meta = cats.monthsUsed ? `Promedio ${Data.formatAmount(r.avg)}` : '';
      if (r.delta !== null && cats.monthsUsed) {
        const up = r.delta > 0;
        const tone = Math.abs(r.delta) < 0.05 ? 'flat' : up ? 'bad' : 'good';
        meta += ` · <span class="delta delta-${tone}">${Math.abs(r.delta) < 0.05 ? '→' : up ? '▲' : '▼'} ${Math.round(Math.abs(r.delta) * 100)}%</span>`;
      } else if (cats.monthsUsed && r.avg === 0) {
        meta += ' · <span class="delta delta-flat">nuevo</span>';
      }
      return `
        <div class="cmp-row">
          <div class="cmp-head">
            <span class="cmp-name"><span class="category-dot" style="background:${r.cat.color}"></span>${UI._esc(r.cat.name)}</span>
            <span class="cmp-value">${Data.formatAmount(r.cur)}</span>
          </div>
          <div class="cmp-track">
            <span class="cmp-fill" style="width:${(r.cur / max * 100).toFixed(1)}%;background:${r.cat.color}"></span>
            ${cats.monthsUsed ? `<span class="cmp-avg" style="left:${(r.avg / max * 100).toFixed(1)}%"></span>` : ''}
          </div>
          <div class="cmp-meta">${meta}</div>
        </div>`;
    }).join('') + (isCurrent ? '<p class="cmp-note">El mes aún no termina: compara contra el promedio de un mes completo.</p>' : '');
  },

  /* ---------- Gasto por mes (énfasis en el mes seleccionado) ---------- */

  _renderMonthly(k) {
    const t      = this._theme();
    const labels = k.keys.map(key => Analytics.shortMonth(key));
    const data   = k.series.spent;
    const last   = data.length - 1;
    const prior  = data.slice(0, last).filter(v => v > 0);
    const avg    = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;

    const datasets = [{
      type: 'bar', label: 'Gasto', data,
      backgroundColor: data.map((_, i) => i === last ? t.accent : t.mutedBar),
      borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 24, order: 2
    }];
    if (avg) {
      datasets.push({
        type: 'line', label: 'Promedio', data: data.map(() => Math.round(avg)),
        borderColor: t.muted, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, order: 1
      });
    }
    this._chart('chart-monthly', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltip(t),
            callbacks: {
              title: items => UI.monthLabel(k.keys[items[0].dataIndex]),
              label: ctx => `${ctx.dataset.label}: ${Data.formatAmount(ctx.parsed.y)}`
            }
          }
        },
        scales: this._axes(t)
      }
    });
  },

  /* ---------- Calendario (mapa de calor) ---------- */

  _renderHeatmap(h, isCurrent) {
    this._heat = h;
    const today = isCurrent ? new Date().getDate() : null;
    const busiest = h.days.reduce((a, b) => (b.total > a.total ? b : a), h.days[0]);
    const active  = h.days.filter(d => d.total > 0).length;
    document.getElementById('heat-hint').textContent = `${active} de ${today || h.days.length} días con gasto`;

    const cells = [];
    for (let i = 0; i < h.firstWeekday; i++) cells.push('<span class="heat-cell heat-pad" aria-hidden="true"></span>');
    h.days.forEach(d => {
      const future = today && d.day > today;
      const cls = ['heat-cell', `h${d.level}`, future ? 'future' : '', d.day === today ? 'today' : ''].join(' ');
      const label = `${d.day}: ${d.total ? Data.formatAmount(d.total) : 'sin gastos'}`;
      cells.push(`<button class="${cls}" data-day="${d.day}" aria-label="${label}" ${future ? 'disabled' : ''}><span>${d.day}</span></button>`);
    });
    document.getElementById('heatmap').innerHTML = cells.join('');
    if (busiest && busiest.total > 0) this._showDay(busiest.day, true);
    else document.getElementById('heatmap-detail').textContent = 'Sin gastos en este mes';
  },

  _showDay(day, isDefault = false) {
    const d = this._heat && this._heat.days[day - 1];
    if (!d) return;
    document.querySelectorAll('#heatmap .heat-cell.selected').forEach(c => c.classList.remove('selected'));
    if (!isDefault) document.querySelector(`#heatmap .heat-cell[data-day="${day}"]`)?.classList.add('selected');
    document.getElementById('heatmap-detail').innerHTML = d.total
      ? `${isDefault ? 'Día más alto: ' : ''}<strong>${UI.dayLabel(d.iso)}</strong> · ${Data.formatAmount(d.total)} en ${d.count} gasto${d.count !== 1 ? 's' : ''}`
      : `<strong>${UI.dayLabel(d.iso)}</strong> · sin gastos`;
  },

  /* ---------- Día de la semana ---------- */

  _renderWeekday(w) {
    const t = this._theme();
    this._chart('chart-weekday', {
      type: 'bar',
      data: {
        labels: Analytics.WEEKDAYS_SHORT,
        datasets: [{
          label: 'Promedio', data: w.avg.map(Math.round),
          backgroundColor: w.avg.map((_, i) => i === w.peak && w.hasData ? t.accent : t.mutedBar),
          borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 24
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltip(t),
            callbacks: {
              title: items => `Los ${Analytics.WEEKDAYS_PLURAL[items[0].dataIndex]}`,
              label: ctx => `${Data.formatAmount(ctx.parsed.y)} en promedio`
            }
          }
        },
        scales: this._axes(t)
      }
    });
  },

  /* ---------- Ahorro neto (positivo/negativo) ---------- */

  _renderSavings(expenses, incomes, selKey) {
    const t    = this._theme();
    const keys = Analytics.monthKeys(this._monthKey(new Date()), 12);
    const real = Analytics.real(expenses);
    const savings = keys.map(k => Analytics.total(incomes, k) - Analytics.total(real, k));
    this._chart('chart-savings', {
      type: 'bar',
      data: {
        labels: keys.map(k => Analytics.shortMonth(k)),
        datasets: [{
          label: 'Ahorro neto', data: savings,
          backgroundColor: savings.map(v => v >= 0 ? t.pos : t.neg),
          borderRadius: 4, borderSkipped: false, maxBarThickness: 24
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltip(t),
            callbacks: {
              title: items => UI.monthLabel(keys[items[0].dataIndex]),
              label: ctx => {
                const inc = Analytics.total(incomes, keys[ctx.dataIndex]);
                const rate = inc > 0 ? ` · ${Math.round(ctx.parsed.y / inc * 100)}% de tus ingresos` : '';
                return `${ctx.parsed.y >= 0 ? '+' : ''}${Data.formatAmount(ctx.parsed.y)}${rate}`;
              }
            }
          }
        },
        scales: this._axes(t, { beginAtZero: false })
      }
    });
  },

  /* ---------- Gastos recurrentes ---------- */

  _renderRecurring(list) {
    const el = document.getElementById('recurring-list');
    const total = list.reduce((s, r) => s + r.monthly, 0);
    document.getElementById('recurring-hint').textContent = list.length ? `≈ ${Data.formatAmount(total)}/mes` : '';
    if (!list.length) {
      el.innerHTML = '<p class="card-note">Aún no detectamos gastos que se repitan cada mes. Necesitamos al menos 3 meses con la misma descripción (ej: “Netflix”, “Arriendo”).</p>';
      return;
    }
    el.innerHTML = `<div class="mini-list">${list.slice(0, 6).map(r => `
      <div class="mini-row">
        ${UI.txIcon(r.cat.color, UI.initial(r.name))}
        <div class="tx-main">
          <div class="tx-title">${UI._esc(r.name)}</div>
          <div class="tx-sub">${UI._esc(r.cat.name)} · ${r.months} de 4 meses · ${r.paidThisMonth ? 'pagado este mes' : 'pendiente este mes'}</div>
        </div>
        <div class="tx-amount">${Data.formatAmount(r.monthly)}<span class="tx-amount-sub">al mes</span></div>
      </div>`).join('')}</div>`;
  },

  /* ---------- ¿En qué se va la plata? ---------- */

  _renderTop(top) {
    const el = document.getElementById('top-list');
    if (!top.items.length) { el.innerHTML = '<p class="card-note">Sin gastos en los últimos 90 días.</p>'; return; }
    const max = top.items[0].total || 1;
    el.innerHTML = top.items.map((g, i) => `
      <div class="rank-row">
        <span class="rank-n">${i + 1}</span>
        <div class="rank-main">
          <div class="cmp-head">
            <span class="cmp-name">${UI._esc(g.name)}</span>
            <span class="cmp-value">${Data.formatAmount(g.total)}</span>
          </div>
          <div class="cmp-track"><span class="cmp-fill" style="width:${(g.total / max * 100).toFixed(1)}%;background:${g.cat.color}"></span></div>
          <div class="cmp-meta">${g.count} ${g.count === 1 ? 'vez' : 'veces'} · promedio ${Data.formatAmount(g.avg)} · ${Math.round(g.share * 100)}% del total</div>
        </div>
      </div>`).join('');
  }
};
