/* Analytics — cálculos puros sobre los datos del usuario (sin acceso a la BD).
   El dashboard los usa para KPIs, ritmo de gasto, comparación por categoría,
   calendario, día de la semana, gastos recurrentes, top de gastos y hallazgos.
   Regla del proyecto: nunca extrapolar el gasto diario a fin de mes (los cargos
   grandes se concentran al inicio del mes y la proyección lineal engaña). */

const Analytics = {

  WEEKDAYS:        ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  WEEKDAYS_PLURAL: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'],
  WEEKDAYS_SHORT:  ['L', 'M', 'M', 'J', 'V', 'S', 'D'],

  /* ---------- Fechas ---------- */

  key(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  addMonths(key, n) {
    const [y, m] = key.split('-').map(Number);
    return this.key(new Date(y, m - 1 + n, 1));
  },

  daysInMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  },

  // 0 = lunes … 6 = domingo
  weekdayOf(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
  },

  monthName(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long' });
  },

  shortMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
  },

  /* ---------- Básicos ---------- */

  real(expenses) {
    return expenses.filter(e => !e.isPlanned);
  },

  sum(list) {
    return list.reduce((s, x) => s + x.amount, 0);
  },

  total(list, monthKey) {
    return this.sum(list.filter(x => x.date.startsWith(monthKey)));
  },

  median(values) {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  },

  monthKeys(endKey, n) {
    return Array.from({ length: n }, (_, i) => this.addMonths(endKey, i - n + 1));
  },

  normalize(desc) {
    return (desc || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[0-9#*.,:;\-_/()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /* ---------- KPIs del mes seleccionado ---------- */

  kpis({ expenses, incomes, selKey, isCurrent }) {
    const real    = this.real(expenses);
    const prevKey = this.addMonths(selKey, -1);
    const today   = new Date();
    const dayCut  = isCurrent ? today.getDate() : this.daysInMonth(selKey);

    const spent = this.total(real, selKey);
    // El mes actual se compara contra el mes pasado "a esta misma altura"
    const prevSame = isCurrent
      ? this.sum(real.filter(e => e.date.startsWith(prevKey) && Number(e.date.slice(8, 10)) <= dayCut))
      : this.total(real, prevKey);

    const income     = this.total(incomes, selKey);
    const prevIncome = this.total(incomes, prevKey);
    const rate       = income > 0 ? (income - spent) / income : null;

    const rateOf = k => {
      const inc = this.total(incomes, k);
      return inc > 0 ? (inc - this.total(real, k)) / inc : null;
    };
    const prevRates = [1, 2, 3].map(i => rateOf(this.addMonths(selKey, -i))).filter(r => r !== null);
    const avgRate   = prevRates.length ? prevRates.reduce((a, b) => a + b, 0) / prevRates.length : null;

    const daily     = spent / Math.max(1, dayCut);
    const prevDaily = this.total(real, prevKey) / this.daysInMonth(prevKey);

    const keys = this.monthKeys(selKey, 12);
    // Meses anteriores al primer registro no son "$0": se dejan vacíos para no inventar un salto
    const firstKey = [...real, ...incomes].reduce((m, x) => (x.date.slice(0, 7) < m ? x.date.slice(0, 7) : m), selKey);
    const mask = arr => arr.map((v, i) => (keys[i] < firstKey ? null : v));
    const series = {
      spent:  keys.map(k => this.total(real, k)),
      income: keys.map(k => this.total(incomes, k)),
      rate:   keys.map(k => { const r = rateOf(k); return r === null ? null : Math.round(r * 100); }),
      daily:  keys.map((k, i) => {
        const days = i === keys.length - 1 ? Math.max(1, dayCut) : this.daysInMonth(k);
        return Math.round(this.total(real, k) / days);
      })
    };
    Object.keys(series).forEach(name => { series[name] = mask(series[name]); });

    return { selKey, prevKey, spent, prevSame, income, prevIncome, rate, avgRate, daily, prevDaily, dayCut, keys, series };
  },

  /* ---------- Ritmo: gasto acumulado día a día ---------- */

  pace({ expenses, selKey, isCurrent }) {
    const real    = this.real(expenses);
    const prevKey = this.addMonths(selKey, -1);
    const days    = Math.max(this.daysInMonth(selKey), this.daysInMonth(prevKey));
    const upTo    = isCurrent ? new Date().getDate() : this.daysInMonth(selKey);

    const cumulative = (key, limit) => {
      const byDay = new Array(days + 1).fill(0);
      real.filter(e => e.date.startsWith(key)).forEach(e => { byDay[Number(e.date.slice(8, 10))] += e.amount; });
      const out = [];
      let acc = 0;
      for (let d = 1; d <= days; d++) {
        acc += byDay[d];
        out.push(d <= limit ? acc : null);
      }
      return out;
    };

    const cur  = cumulative(selKey, upTo);
    const prev = cumulative(prevKey, this.daysInMonth(prevKey));
    return {
      days, upTo, cur, prev,
      curTotal:  cur[upTo - 1] || 0,
      prevSame:  prev[Math.min(upTo, this.daysInMonth(prevKey)) - 1] || 0,
      prevTotal: prev[this.daysInMonth(prevKey) - 1] || 0,
      prevKey
    };
  },

  /* ---------- Categorías: mes seleccionado vs promedio de los 3 meses previos ---------- */

  categoryVsAverage(expenses, categories, selKey) {
    const real   = this.real(expenses);
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const prevKeys = [1, 2, 3].map(i => this.addMonths(selKey, -i))
      .filter(k => real.some(e => e.date.startsWith(k)));

    const cur = {}, prev = {};
    real.forEach(e => {
      const k = e.date.slice(0, 7);
      if (k === selKey) cur[e.categoryId] = (cur[e.categoryId] || 0) + e.amount;
      else if (prevKeys.includes(k)) prev[e.categoryId] = (prev[e.categoryId] || 0) + e.amount;
    });

    const ids  = new Set([...Object.keys(cur), ...Object.keys(prev)]);
    const rows = [...ids].map(id => {
      const c   = cur[id] || 0;
      const avg = prevKeys.length ? (prev[id] || 0) / prevKeys.length : 0;
      return {
        id, cat: catMap[id] || { name: 'Sin categoría', color: '#94a3b8' },
        cur: c, avg,
        delta: avg > 0 ? (c - avg) / avg : null
      };
    }).sort((a, b) => Math.max(b.cur, b.avg) - Math.max(a.cur, a.avg));

    return { rows, monthsUsed: prevKeys.length };
  },

  /* ---------- Calendario de gasto (mapa de calor del mes) ---------- */

  heatmap(expenses, selKey) {
    const real  = this.real(expenses).filter(e => e.date.startsWith(selKey));
    const nDays = this.daysInMonth(selKey);
    const days  = Array.from({ length: nDays }, (_, i) => {
      const iso = `${selKey}-${String(i + 1).padStart(2, '0')}`;
      const list = real.filter(e => e.date === iso);
      return { day: i + 1, iso, total: this.sum(list), count: list.length, level: 0 };
    });
    // 5 niveles por cuantiles de los días con gasto (robusto a un día gigante)
    const values = days.filter(d => d.total > 0).map(d => d.total).sort((a, b) => a - b);
    if (values.length) {
      const q = p => values[Math.min(values.length - 1, Math.floor(p * values.length))];
      const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
      days.forEach(d => {
        if (d.total <= 0) return;
        d.level = 1 + cuts.filter(c => d.total > c).length;
      });
    }
    return { days, firstWeekday: this.weekdayOf(`${selKey}-01`), max: values[values.length - 1] || 0 };
  },

  /* ---------- Día de la semana (últimos N días) ---------- */

  weekday(expenses, days = 90) {
    const end   = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
    const startIso = localISODate(start), endIso = localISODate(end);
    const totals = new Array(7).fill(0);
    const occurrences = new Array(7).fill(0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      occurrences[(d.getDay() + 6) % 7]++;
    }
    this.real(expenses).forEach(e => {
      if (e.date >= startIso && e.date <= endIso) totals[this.weekdayOf(e.date)] += e.amount;
    });
    const avg = totals.map((t, i) => occurrences[i] ? t / occurrences[i] : 0);
    const overall = totals.reduce((a, b) => a + b, 0) / days;
    const peak = avg.indexOf(Math.max(...avg));
    return { avg, overall, peak, hasData: totals.some(t => t > 0) };
  },

  /* ---------- Gastos recurrentes (suscripciones, arriendo, etc.) ---------- */

  // Recurrente = misma descripción en ≥3 de los últimos 4 meses completos, con montos parecidos
  recurring(expenses, categories, refKey) {
    const real   = this.real(expenses);
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const months = [1, 2, 3, 4].map(i => this.addMonths(refKey, -i));
    const groups = {};
    real.forEach(e => {
      const k = e.date.slice(0, 7);
      if (!months.includes(k)) return;
      const norm = this.normalize(e.description);
      if (norm.length < 3) return;
      const g = groups[norm] || (groups[norm] = { byMonth: {}, last: e, cats: {} });
      g.byMonth[k] = (g.byMonth[k] || 0) + e.amount;
      g.cats[e.categoryId] = (g.cats[e.categoryId] || 0) + 1;
      if (e.date > g.last.date) g.last = e;
    });

    return Object.values(groups).map(g => {
      const vals = Object.values(g.byMonth);
      if (vals.length < 3) return null;
      if (Math.max(...vals) / Math.max(1, Math.min(...vals)) > 1.6) return null;
      const catId = Object.entries(g.cats).sort((a, b) => b[1] - a[1])[0][0];
      const paidThisMonth = real.some(e => e.date.startsWith(refKey) && this.normalize(e.description) === this.normalize(g.last.description));
      return {
        name: g.last.description.trim(),
        monthly: Math.round(this.median(vals)),
        months: vals.length,
        cat: catMap[catId] || { name: 'Otros', color: '#94a3b8' },
        paidThisMonth
      };
    }).filter(Boolean).sort((a, b) => b.monthly - a.monthly);
  },

  /* ---------- ¿En qué se va la plata? (top descripciones) ---------- */

  topSpending(expenses, categories, days = 90, limit = 5) {
    const end   = localISODate();
    const s     = new Date(); s.setDate(s.getDate() - days + 1);
    const start = localISODate(s);
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const groups = {};
    this.real(expenses).forEach(e => {
      if (e.date < start || e.date > end) return;
      const norm = this.normalize(e.description) || `cat:${e.categoryId}`;
      const g = groups[norm] || (groups[norm] = { total: 0, count: 0, name: '', catId: e.categoryId });
      g.total += e.amount;
      g.count++;
      if (!g.name) g.name = e.description ? e.description.trim() : (catMap[e.categoryId]?.name || 'Sin descripción');
    });
    const list = Object.values(groups).sort((a, b) => b.total - a.total);
    const grand = list.reduce((acc, g) => acc + g.total, 0);
    return {
      grand,
      items: list.slice(0, limit).map(g => ({
        ...g, avg: g.total / g.count, share: grand ? g.total / grand : 0,
        cat: catMap[g.catId] || { name: 'Otros', color: '#94a3b8' }
      }))
    };
  },

  /* ---------- Patrimonio real por mes ---------- */

  // Snapshot guardado si existe; si no, reconstruido: patrimonio actual − ingresos posteriores + gastos posteriores
  patrimonySeries(keys, patrimony, expenses, incomes, snapshots) {
    const current = this.key(new Date());
    const snapMap = Object.fromEntries((snapshots || []).map(s => [s.key, s.value]));
    const real    = this.real(expenses);
    const today   = localISODate();
    return keys.map(key => {
      if (key > current) return null;
      if (key === current) return Math.round(patrimony);
      if (snapMap[key] != null) return snapMap[key];
      const nextStart = `${this.addMonths(key, 1)}-01`;
      const incAfter = this.sum(incomes.filter(x => x.date >= nextStart && x.date <= today));
      const expAfter = this.sum(real.filter(x => x.date >= nextStart && x.date <= today));
      return Math.round(patrimony - incAfter + expAfter);
    });
  },

  /* ---------- Hallazgos en lenguaje natural ---------- */

  insights({ k, pace, cats, week, recurring, expenses, budget, isCurrent }) {
    const out = [];
    const fmt = v => Data.formatAmount(v);
    const pct = v => `${Math.round(Math.abs(v) * 100)}%`;
    const prevName = this.monthName(k.prevKey);

    // 1. Presupuesto
    if (isCurrent && budget && budget.budget > 0) {
      if (k.spent > budget.budget) {
        out.push({ tone: 'bad', icon: 'alert', title: 'Superaste tu presupuesto',
          text: `Llevas ${fmt(k.spent)}, ${fmt(k.spent - budget.budget)} sobre los ${fmt(budget.budget)} del mes.` });
      } else if (k.spent / budget.budget >= 0.85) {
        out.push({ tone: 'warn', icon: 'alert', title: `Usaste el ${pct(k.spent / budget.budget)} del presupuesto`,
          text: `Te quedan ${fmt(budget.budget - k.spent)} para lo que resta del mes.` });
      }
    }

    // 2. Ritmo vs mes pasado
    if (k.prevSame > 0 && k.spent > 0) {
      const d = (k.spent - k.prevSame) / k.prevSame;
      if (Math.abs(d) >= 0.05) {
        out.push({
          tone: d < 0 ? 'good' : 'bad', icon: d < 0 ? 'trend-down' : 'trend-up',
          title: `${pct(d)} ${d < 0 ? 'menos' : 'más'} que ${isCurrent ? 'a esta altura de ' : ''}${prevName}`,
          text: isCurrent
            ? `Al día ${k.dayCut} de ${prevName} llevabas ${fmt(k.prevSame)}; este mes llevas ${fmt(k.spent)}.`
            : `Gastaste ${fmt(k.spent)} vs ${fmt(k.prevSame)} en ${prevName}.`
        });
      }
    }

    // 3. Categoría que más se desvía de su promedio
    if (cats.monthsUsed) {
      const up = cats.rows
        .filter(r => r.avg > 0 && r.cur - r.avg >= 15000 && r.delta >= 0.25)
        .sort((a, b) => (b.cur - b.avg) - (a.cur - a.avg))[0];
      if (up) {
        out.push({ tone: 'bad', icon: 'tag',
          title: isCurrent ? `${up.cat.name}: ya superas tu promedio` : `${up.cat.name} subió ${pct(up.delta)}`,
          text: `${fmt(up.cur)} este mes vs ${fmt(up.avg)} de promedio mensual (+${fmt(up.cur - up.avg)}).` });
      }
      if (!isCurrent) {
        const down = cats.rows
          .filter(r => r.avg >= 20000 && r.delta !== null && r.delta <= -0.25)
          .sort((a, b) => (a.cur - a.avg) - (b.cur - b.avg))[0];
        if (down) {
          out.push({ tone: 'good', icon: 'tag', title: `${down.cat.name} bajó ${pct(down.delta)}`,
            text: `${fmt(down.cur)} vs ${fmt(down.avg)} de promedio: ahorraste ${fmt(down.avg - down.cur)}.` });
        }
      }
    }

    // 4. Tasa de ahorro
    if (k.rate !== null) {
      const better = k.avgRate === null || k.rate >= k.avgRate;
      out.push({
        tone: k.rate < 0 ? 'bad' : better ? 'good' : 'info', icon: 'wallet',
        title: k.rate < 0 ? `Gastaste ${pct(k.rate)} más de lo que ingresó` : `Ahorras el ${Math.round(k.rate * 100)}% de tus ingresos`,
        text: k.avgRate !== null
          ? `Tu promedio de los meses anteriores es ${Math.round(k.avgRate * 100)}%.${isCurrent ? ' El mes aún no termina.' : ''}`
          : `Ingresos ${fmt(k.income)} · gastos ${fmt(k.spent)}.`
      });
    }

    // 5. Gastos recurrentes
    if (recurring.length) {
      const sum = recurring.reduce((s, r) => s + r.monthly, 0);
      out.push({ tone: 'info', icon: 'refresh', title: `${recurring.length} gasto${recurring.length > 1 ? 's' : ''} recurrente${recurring.length > 1 ? 's' : ''}`,
        text: `Suman cerca de ${fmt(sum)} al mes: ${recurring.slice(0, 3).map(r => r.name).join(', ')}${recurring.length > 3 ? '…' : '.'}` });
    }

    // 6. Día de la semana
    if (week.hasData && week.overall > 0) {
      const ratio = week.avg[week.peak] / week.overall;
      if (ratio >= 1.4) {
        out.push({ tone: 'info', icon: 'calendar', title: `Los ${this.WEEKDAYS_PLURAL[week.peak]} gastas más`,
          text: `En promedio ${fmt(week.avg[week.peak])} ese día, ${ratio.toFixed(1).replace('.', ',')}× un día normal (últimos 90 días).` });
      }
    }

    // 7. Gasto destacado del mes
    const monthList = this.real(expenses).filter(e => e.date.startsWith(k.selKey));
    if (monthList.length >= 3) {
      const biggest = monthList.reduce((a, b) => (b.amount > a.amount ? b : a));
      const typical = this.median(this.real(expenses).slice(0, 200).map(e => e.amount));
      if (typical > 0 && biggest.amount >= 4 * typical && biggest.amount >= 50000) {
        out.push({ tone: 'info', icon: 'sparkle', title: `Gasto destacado: ${biggest.description || 'sin descripción'}`,
          text: `${fmt(biggest.amount)} el ${UI.dayLabel(biggest.date).toLowerCase()}, ${Math.round(biggest.amount / typical)}× tu gasto típico.` });
      }
    }

    return out.slice(0, 5);
  }
};
