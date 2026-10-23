/* Storage — async Firestore CRUD wrapper */

let _db  = null; // firestore instance
let _uid = null; // user id

/* Caché en memoria por colección: evita re-descargar todo Firestore en cada render.
   Guarda la promesa para que lecturas en paralelo compartan una sola consulta.
   Toda escritura pasa por Storage, así que basta con invalidar ahí. */
const _cache = {};
function _cached(key, loader) {
  if (!_cache[key]) {
    _cache[key] = loader().catch(err => { delete _cache[key]; throw err; });
  }
  return _cache[key].then(list => list.slice());
}
function _invalidate(...keys) { keys.forEach(k => delete _cache[k]); }

function _userDoc() { return _db.collection('users').doc(_uid); }
function _col(name) { return _userDoc().collection(name); }

async function _deleteInBatches(refs) {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = _db.batch();
    refs.slice(i, i + 500).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

const Storage = {

  init(db, userId) {
    _db  = db;
    _uid = userId;
    _invalidate('expenses', 'incomes', 'accounts', 'categories');
  },

  // Descarta el caché (p. ej. al volver a la app tras un rato, por cambios hechos desde otro dispositivo)
  invalidateAll() {
    _invalidate('expenses', 'incomes', 'accounts', 'categories');
  },

  /* ---------- Expenses ---------- */

  async getExpenses() {
    return _cached('expenses', () => this._fetchExpenses());
  },

  async _fetchExpenses() {
    const snap = await _col('expenses').orderBy('date', 'desc').get();
    return snap.docs.map(d => {
      const r = d.data();
      return {
        id:          d.id,
        amount:      r.amount,
        categoryId:  r.categoryId,
        accountId:   r.accountId || null,
        description: r.description || '',
        date:        r.date,
        isPlanned:   r.isPlanned || false,
        externalId:  r.externalId || null,
        createdAt:   r.createdAt || 0
      };
    });
  },

  async addExpense(r) {
    const payload = {
      amount: r.amount, categoryId: r.categoryId, accountId: r.accountId || null,
      description: r.description || '', date: r.date,
      isPlanned: r.isPlanned || false, externalId: r.externalId || null,
      createdAt: Date.now()
    };
    await _col('expenses').doc(r.id).set(payload);
    return { id: r.id, ...payload };
  },

  async updateExpense(id, r) {
    const payload = {
      amount: r.amount, categoryId: r.categoryId, accountId: r.accountId || null,
      description: r.description || '', date: r.date,
      isPlanned: r.isPlanned || false
    };
    await _col('expenses').doc(id).update(payload);
    return { id, ...payload };
  },

  async deleteExpense(id) {
    await _col('expenses').doc(id).delete();
  },

  async deleteExpenses(ids) {
    await _deleteInBatches(ids.map(id => _col('expenses').doc(id)));
  },

  /* ---------- Categories ---------- */

  async getCategories() {
    return _cached('categories', () => this._fetchCategories());
  },

  async _fetchCategories() {
    const snap = await _col('categories').orderBy('createdAt', 'asc').get();
    return snap.docs.map(d => {
      const r = d.data();
      return { id: d.id, name: r.name, color: r.color, isPredefined: r.isPredefined || false };
    });
  },

  async addCategory(r) {
    const payload = { name: r.name, color: r.color, isPredefined: r.isPredefined || false, createdAt: Date.now() };
    await _col('categories').doc(r.id).set(payload);
    return { id: r.id, name: payload.name, color: payload.color, isPredefined: payload.isPredefined };
  },

  async updateCategory(id, r) {
    const payload = { name: r.name, color: r.color };
    await _col('categories').doc(id).update(payload);
    return { id, name: payload.name, color: payload.color };
  },

  async deleteCategory(id) {
    await _col('categories').doc(id).delete();
  },

  /* ---------- Accounts ---------- */

  async getAccounts() {
    return _cached('accounts', () => this._fetchAccounts());
  },

  async _fetchAccounts() {
    const snap = await _col('accounts').orderBy('createdAt', 'asc').get();
    return snap.docs.map(d => {
      const r = d.data();
      return { id: d.id, name: r.name, type: r.type, balance: r.balance, notes: r.notes || '', color: r.color };
    });
  },

  async addAccount(r) {
    const payload = {
      name: r.name, type: r.type, balance: r.balance,
      notes: r.notes || '', color: r.color, createdAt: Date.now()
    };
    await _col('accounts').doc(r.id).set(payload);
    return { id: r.id, name: payload.name, type: payload.type, balance: payload.balance,
             notes: payload.notes, color: payload.color };
  },

  async updateAccount(id, r) {
    const payload = { name: r.name, type: r.type, balance: r.balance, notes: r.notes || '', color: r.color };
    await _col('accounts').doc(id).update(payload);
    return { id, ...payload };
  },

  async deleteAccount(id) {
    await _col('accounts').doc(id).delete();
  },

  async adjustAccountBalance(id, delta) {
    const ref = _col('accounts').doc(id);
    await _db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const newBal = parseFloat(((snap.data().balance || 0) + delta).toFixed(2));
      tx.update(ref, { balance: newBal });
    });
  },

  /* ---------- Incomes ---------- */

  async getIncomes() {
    return _cached('incomes', () => this._fetchIncomes());
  },

  async _fetchIncomes() {
    const snap = await _col('incomes').orderBy('date', 'desc').get();
    return snap.docs.map(d => {
      const r = d.data();
      return {
        id: d.id, accountId: r.accountId, amount: r.amount,
        description: r.description || '', date: r.date,
        externalId: r.externalId || null,
        createdAt: r.createdAt || 0
      };
    });
  },

  async addIncome(r) {
    const payload = {
      accountId: r.accountId, amount: r.amount,
      description: r.description || '', date: r.date,
      externalId: r.externalId || null, createdAt: Date.now()
    };
    await _col('incomes').doc(r.id).set(payload);
    return { id: r.id, ...payload };
  },

  async updateIncome(id, r) {
    const payload = { accountId: r.accountId, amount: r.amount, description: r.description || '', date: r.date };
    await _col('incomes').doc(id).update(payload);
    return { id, ...payload };
  },

  async deleteIncome(id) {
    await _col('incomes').doc(id).delete();
  },

  /* ---------- Settings ---------- */

  async getSettings() {
    const snap = await _userDoc().get();
    const data = snap.exists ? snap.data() : {};
    return {
      currency:              data.currency || '$',
      dashboardPeriod:       data.dashboardPeriod || 'month',
      version:               data.version || 1,
      projIncome:            data.projIncome            != null ? data.projIncome            : null,
      projExpenses:          data.projExpenses          != null ? data.projExpenses          : null,
      projSnapshotPatrimony: data.projSnapshotPatrimony != null ? data.projSnapshotPatrimony : null,
      projSnapshotDate:      data.projSnapshotDate || null,
      budgetAmount:          data.budgetAmount != null ? data.budgetAmount : null,
      budgetMode:            data.budgetMode || 'auto'
    };
  },

  async saveSettings(s) {
    const payload = {
      currency:         s.currency,
      dashboardPeriod:  s.dashboardPeriod,
      version:          s.version || 1,
      budgetMode:       s.budgetMode || 'auto',
      budgetAmount:     s.budgetAmount != null ? s.budgetAmount : null
    };
    if (s.projIncome            != null) payload.projIncome            = s.projIncome;
    if (s.projExpenses          != null) payload.projExpenses          = s.projExpenses;
    if (s.projSnapshotPatrimony != null) payload.projSnapshotPatrimony = s.projSnapshotPatrimony;
    if (s.projSnapshotDate      != null) payload.projSnapshotDate      = s.projSnapshotDate;
    await _userDoc().set(payload, { merge: true });
  }
};

/* Cada escritura invalida su colección antes y después: así una lectura que ocurra
   mientras se escribe no deja datos viejos en caché. */
[
  ['addExpense', 'expenses'], ['updateExpense', 'expenses'], ['deleteExpense', 'expenses'], ['deleteExpenses', 'expenses'],
  ['addCategory', 'categories'], ['updateCategory', 'categories'], ['deleteCategory', 'categories'],
  ['addAccount', 'accounts'], ['updateAccount', 'accounts'], ['deleteAccount', 'accounts'], ['adjustAccountBalance', 'accounts'],
  ['addIncome', 'incomes'], ['updateIncome', 'incomes'], ['deleteIncome', 'incomes']
].forEach(([fn, key]) => {
  const write = Storage[fn];
  Storage[fn] = async function (...args) {
    _invalidate(key);
    try { return await write.apply(this, args); }
    finally { _invalidate(key); }
  };
});
