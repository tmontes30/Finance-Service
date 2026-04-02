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

    // Group real expenses by past complete months
    const byMonth = {};
    for (const e of allExpenses) {
      if (e.isPlanned) continue;
      const key = e.date.slice(0, 7);
      if (key >= currentKey) continue;                   // skip current & future
      byMonth[key] = (byMonth[key] || 0) + e.amount;
    }

    const sortedMonths = Object.keys(byMonth).sort().reverse().slice(0, 3);
    if (sortedMonths.length === 0) return null;

    const totals = sortedMonths.map(k => byMonth[k]);

    // Outlier removal: only when 3 months available
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
  }

};
