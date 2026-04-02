/* Data — async CRUD operations and business logic */

const ACCOUNT_TYPES = {
  bank:       { label: 'Cuenta bancaria', icon: '🏦' },
  savings:    { label: 'Ahorro',          icon: '💎' },
  investment: { label: 'Inversión',       icon: '🚀' },
  cash:       { label: 'Efectivo',        icon: '💸' },
  credit:     { label: 'Crédito',         icon: '🔐' },
  other:      { label: 'Otro',            icon: '🔮' }
};

const PREDEFINED_CATEGORIES = [
  { id: 'cat_food',          name: 'Comida',          color: '#22c55e' },
  { id: 'cat_transport',     name: 'Transporte',      color: '#3b82f6' },
  { id: 'cat_housing',       name: 'Vivienda',        color: '#f59e0b' },
  { id: 'cat_health',        name: 'Salud',           color: '#ef4444' },
  { id: 'cat_entertainment', name: 'Entretenimiento', color: '#8b5cf6' },
  { id: 'cat_shopping',      name: 'Compras',         color: '#ec4899' },
  { id: 'cat_education',     name: 'Educación',       color: '#06b6d4' },
  { id: 'cat_other',         name: 'Otros',           color: '#94a3b8' }
];

function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

const Data = {
  // Valores en caché para acceso síncrono (usado en callbacks de Chart.js)
  _currency:        '$',
  _dashboardPeriod: 'month',

  /* ---------- Init / seed ---------- */

  async init() {
    const settings = await Storage.getSettings();
    this._currency              = settings.currency;
    this._dashboardPeriod       = settings.dashboardPeriod;
    this._projIncome            = settings.projIncome;
    this._projExpenses          = settings.projExpenses;
    this._projSnapshotPatrimony = settings.projSnapshotPatrimony;
    this._projSnapshotDate      = settings.projSnapshotDate;
    this._budgetAmount          = settings.budgetAmount != null ? settings.budgetAmount : null;
    this._budgetMode            = settings.budgetMode || 'auto';

    // Sembrar categorías predefinidas si el usuario no tiene ninguna
    const cats = await Storage.getCategories();
    if (cats.length === 0) {
      for (const c of PREDEFINED_CATEGORIES) {
        await Storage.addCategory({ id: genId(), name: c.name, color: c.color, isPredefined: true });
      }
    }
  },

  /* ---------- Settings ---------- */

  getSettings() {
    return {
      currency:              this._currency,
      dashboardPeriod:       this._dashboardPeriod,
      version:               1,
      projIncome:            this._projIncome,
      projExpenses:          this._projExpenses,
      projSnapshotPatrimony: this._projSnapshotPatrimony,
      projSnapshotDate:      this._projSnapshotDate,
      budgetAmount:          this._budgetAmount,
      budgetMode:            this._budgetMode || 'auto'
    };
  },

  async updateSettings(partial) {
    const updated = {
      currency:              this._currency,
      dashboardPeriod:       this._dashboardPeriod,
      version:               1,
      projIncome:            this._projIncome,
      projExpenses:          this._projExpenses,
      projSnapshotPatrimony: this._projSnapshotPatrimony,
      projSnapshotDate:      this._projSnapshotDate,
      budgetAmount:          this._budgetAmount,
      budgetMode:            this._budgetMode || 'auto',
      ...partial
    };
    this._currency              = updated.currency;
    this._dashboardPeriod       = updated.dashboardPeriod;
    this._projIncome            = updated.projIncome;
    this._projExpenses          = updated.projExpenses;
    this._projSnapshotPatrimony = updated.projSnapshotPatrimony;
    this._projSnapshotDate      = updated.projSnapshotDate;
    this._budgetAmount          = updated.budgetAmount != null ? updated.budgetAmount : null;
    this._budgetMode            = updated.budgetMode || 'auto';
    await Storage.saveSettings(updated);
  },

  async resetProjectionSnapshot() {
    const patrimony = await this.getTotalPatrimonio();
    const date      = new Date().toISOString().split('T')[0];
    await this.updateSettings({ projSnapshotPatrimony: patrimony, projSnapshotDate: date });
    return { patrimony, date };
  },

  /* ---------- Expenses ---------- */

  async getExpenses() {
    return Storage.getExpenses();
  },

  async addExpense({ amount, categoryId, description, date, accountId, isPlanned }) {
    const amt    = parseFloat(parseFloat(amount).toFixed(2));
    const record = {
      id: genId(), amount: amt, categoryId,
      accountId: accountId || null,
      description: (description || '').trim().slice(0, 200),
      date, isPlanned: isPlanned || false
    };
    const saved = await Storage.addExpense(record);
    if (accountId && !isPlanned) await Storage.adjustAccountBalance(accountId, -amt);
    return saved;
  },

  async updateExpense(id, { amount, categoryId, description, date, accountId, isPlanned }) {
    const all = await this.getExpenses();
    const old = all.find(e => e.id === id);
    if (!old) return null;
    const newAmt = parseFloat(parseFloat(amount).toFixed(2));
    if (old.accountId && !old.isPlanned) await Storage.adjustAccountBalance(old.accountId, old.amount);
    if (accountId     && !isPlanned)     await Storage.adjustAccountBalance(accountId, -newAmt);
    return Storage.updateExpense(id, {
      amount: newAmt, categoryId, accountId: accountId || null,
      description: (description || '').trim().slice(0, 200),
      date, isPlanned: isPlanned || false
    });
  },

  async deleteExpense(id) {
    const all = await this.getExpenses();
    const rec = all.find(e => e.id === id);
    if (rec && rec.accountId && !rec.isPlanned) await Storage.adjustAccountBalance(rec.accountId, rec.amount);
    await Storage.deleteExpense(id);
  },

  async deleteExpenses(ids) {
    const set = new Set(ids);
    const all = await this.getExpenses();
    for (const e of all.filter(e => set.has(e.id) && e.accountId && !e.isPlanned)) {
      await Storage.adjustAccountBalance(e.accountId, e.amount);
    }
    await Storage.deleteExpenses(ids);
  },

  /* ---------- Categories ---------- */

  async getCategories() {
    return Storage.getCategories();
  },

  async getCategoryById(id) {
    const cats = await this.getCategories();
    return cats.find(c => c.id === id) || null;
  },

  async addCategory(name, color) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const cats = await this.getCategories();
    const resolvedColor = this._pickUniqueColor(color || '#6366f1', cats.map(c => c.color));
    return Storage.addCategory({ id: genId(), name: trimmed, color: resolvedColor, isPredefined: false });
  },

  async updateCategory(id, name, color) {
    const cats = await this.getCategories();
    const resolvedColor = this._pickUniqueColor(
      color, cats.filter(c => c.id !== id).map(c => c.color)
    );
    return Storage.updateCategory(id, { name: name.trim(), color: resolvedColor });
  },

  async deleteCategory(id) {
    await Storage.deleteCategory(id);
  },

  async countExpensesForCategory(id) {
    const expenses = await this.getExpenses();
    return expenses.filter(e => e.categoryId === id).length;
  },

  /* ---------- Accounts ---------- */

  async getAccounts() {
    return Storage.getAccounts();
  },

  async getAccountById(id) {
    const accs = await this.getAccounts();
    return accs.find(a => a.id === id) || null;
  },

  async addAccount({ name, type, balance, notes, color }) {
    const accs = await this.getAccounts();
    const resolvedColor = this._pickUniqueColor(color || '#6366f1', accs.map(a => a.color));
    return Storage.addAccount({
      id: genId(), name: name.trim().slice(0, 100), type: type || 'bank',
      balance: parseFloat(parseFloat(balance || 0).toFixed(2)),
      notes: (notes || '').trim().slice(0, 300), color: resolvedColor
    });
  },

  async updateAccount(id, { name, type, balance, notes, color }) {
    const accs = await this.getAccounts();
    const resolvedColor = this._pickUniqueColor(
      color || '#6366f1', accs.filter(a => a.id !== id).map(a => a.color)
    );
    return Storage.updateAccount(id, {
      name: name.trim().slice(0, 100), type: type || 'bank',
      balance: parseFloat(parseFloat(balance || 0).toFixed(2)),
      notes: (notes || '').trim().slice(0, 300), color: resolvedColor
    });
  },

  async deleteAccount(id) {
    await Storage.deleteAccount(id);
  },

  async deleteAccountAndIncomes(accountId) {
    const incomes = await this.getIncomes();
    for (const i of incomes.filter(i => i.accountId === accountId)) {
      await Storage.deleteIncome(i.id);
    }
    await Storage.deleteAccount(accountId);
  },

  async getTotalPatrimonio() {
    const accounts = await this.getAccounts();
    return accounts.reduce((sum, a) => sum + a.balance, 0);
  },

  /* ---------- Incomes ---------- */

  async getIncomes() {
    return Storage.getIncomes();
  },

  async getIncomeById(id) {
    const incomes = await this.getIncomes();
    return incomes.find(i => i.id === id) || null;
  },

  async addIncome({ accountId, amount, description, date }) {
    const amt  = parseFloat(parseFloat(amount).toFixed(2));
    const saved = await Storage.addIncome({
      id: genId(), accountId, amount: amt,
      description: (description || '').trim().slice(0, 200), date
    });
    await Storage.adjustAccountBalance(accountId, amt);
    return saved;
  },

  async updateIncome(id, { accountId, amount, description, date }) {
    const old = await this.getIncomeById(id);
    if (!old) return null;
    const newAmt = parseFloat(parseFloat(amount).toFixed(2));
    await Storage.adjustAccountBalance(old.accountId, -old.amount);
    await Storage.adjustAccountBalance(accountId, newAmt);
    return Storage.updateIncome(id, {
      accountId, amount: newAmt,
      description: (description || '').trim().slice(0, 200), date
    });
  },

  async deleteIncome(id) {
    const record = await this.getIncomeById(id);
    if (!record) return;
    await Storage.adjustAccountBalance(record.accountId, -record.amount);
    await Storage.deleteIncome(id);
  },

  async getTotalIncomes() {
    const incomes = await this.getIncomes();
    return incomes.reduce((sum, i) => sum + i.amount, 0);
  },

  /* ---------- Helpers (síncronos — usan caché) ---------- */

  formatAmount(amount) {
    const n = Number(amount);
    return `${this._currency}${Math.round(n).toLocaleString('es-CL')}`;
  },

  formatDate(isoDate) {
    if (!isoDate) return '—';
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  },

  /* ---------- Private: color único ---------- */

  _pickUniqueColor(proposed, usedColors) {
    const norm = c => c.toLowerCase();
    const used = new Set(usedColors.map(norm));
    if (!used.has(norm(proposed))) return proposed;

    const palette = [
      '#6366f1','#8b5cf6','#a855f7','#ec4899','#f43f5e',
      '#f97316','#f59e0b','#eab308','#84cc16','#22c55e',
      '#10b981','#14b8a6','#06b6d4','#38bdf8','#3b82f6',
      '#60a5fa','#818cf8','#c084fc','#f472b6','#fb7185',
      '#e879f9','#34d399','#2dd4bf','#7c3aed','#db2777'
    ];
    for (const c of palette) {
      if (!used.has(norm(c))) return c;
    }
    let rand;
    do {
      rand = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    } while (used.has(rand));
    return rand;
  }
};
