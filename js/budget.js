/* Budget — estimated monthly budget from historical expenses */

const Budget = {

  /**
   * Computes estimated budget and current-month tracking stats.
   * Uses last 1-3 complete months; removes outliers when 3+ months available.
   * Returns null if no historical data exists yet.
   */
  compute(allExpenses) {
    const now        = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Group real expenses by past complete months (keep individual amounts for outlier detection)
    const byMonth = {};
    for (const e of allExpenses) {
      if (e.isPlanned) continue;
      const key = e.date.slice(0, 7);
      if (key >= currentKey) continue;                   // skip current & future
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(e.amount);
    }

    const sortedMonths = Object.keys(byMonth).sort().reverse().slice(0, 3);
    if (sortedMonths.length === 0) return null;

    // Per-transaction outlier threshold (IQR method) across all recent past transactions
    const allPast = sortedMonths.flatMap(k => byMonth[k]);
    let txThreshold = Infinity;
    if (allPast.length >= 4) {
      const sorted = [...allPast].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      txThreshold = q3 + 1.5 * (q3 - q1);
    }

    // Sum each month excluding per-transaction outliers
    const totals = sortedMonths.map(k => {
      const clean = byMonth[k].filter(v => v <= txThreshold);
      return (clean.length > 0 ? clean : byMonth[k]).reduce((a, b) => a + b, 0);
    });

    // Inter-month outlier removal: only when 3 months available
    let used = totals;
    if (totals.length >= 3) {
      const mean  = totals.reduce((a, b) => a + b, 0) / totals.length;
      const std   = Math.sqrt(totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length);
      const clean = totals.filter(v => Math.abs(v - mean) <= 1.5 * std);
      if (clean.length >= 1) used = clean;
    }

    const budget = used.reduce((a, b) => a + b, 0) / used.length;

    // Current-month spending (real only)
    const currentSpend = allExpenses
      .filter(e => !e.isPlanned && e.date.startsWith(currentKey))
      .reduce((s, e) => s + e.amount, 0);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed  = now.getDate();
    const daysLeft    = daysInMonth - daysPassed;
    const dailyRate   = daysPassed > 0 ? currentSpend / daysPassed : 0;
    const projected   = dailyRate * daysInMonth;
    const delta       = projected - budget;          // positive = over budget
    const pct         = budget > 0 ? (currentSpend / budget) * 100 : 0;

    return {
      budget,
      monthsUsed: sortedMonths.length,
      currentSpend,
      pct,
      daysLeft,
      projected,
      delta
    };
  },

  /**
   * Returns budget stats using the user's chosen mode (manual or auto).
   * Always returns current-month spending stats even if no history exists.
   */
  getEffectiveBudget(allExpenses) {
    const settings     = Data.getSettings();
    const computed     = this.compute(allExpenses);
    const isManual     = settings.budgetMode === 'manual' && settings.budgetAmount != null;
    const manualAmount = settings.budgetAmount;

    if (!isManual) {
      return computed ? { ...computed, isManual: false, computedBudget: computed.budget } : null;
    }

    // Manual mode: recompute pct/delta against manual amount
    const now = new Date();
    const currentKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed  = now.getDate();
    const daysLeft    = daysInMonth - daysPassed;

    const currentSpend = allExpenses
      .filter(e => !e.isPlanned && e.date.startsWith(currentKey))
      .reduce((s, e) => s + e.amount, 0);

    const dailyRate = daysPassed > 0 ? currentSpend / daysPassed : 0;
    const projected = dailyRate * daysInMonth;
    const pct       = manualAmount > 0 ? (currentSpend / manualAmount) * 100 : 0;
    const delta     = projected - manualAmount;

    return {
      budget:        manualAmount,
      monthsUsed:    computed ? computed.monthsUsed : 0,
      currentSpend,
      pct,
      daysLeft,
      projected,
      delta,
      isManual:      true,
      computedBudget: computed ? computed.budget : null
    };
  }

};
