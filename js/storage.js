/* Storage — async Supabase CRUD wrapper */

let _sb  = null; // supabase client
let _uid = null; // user id

const Storage = {

  init(client, userId) {
    _sb  = client;
    _uid = userId;
  },

  /* ---------- Expenses ---------- */

  async getExpenses() {
    const { data, error } = await _sb.from('expenses').select('*')
      .eq('user_id', _uid).order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      id:          r.id,
      amount:      parseFloat(r.amount),
      categoryId:  r.category_id,
      accountId:   r.account_id || null,
      description: r.description || '',
      date:        r.date,
      isPlanned:   r.is_planned  || false,
      createdAt:   new Date(r.created_at).getTime()
    }));
  },

  async addExpense(r) {
    const { data, error } = await _sb.from('expenses').insert({
      id: r.id, user_id: _uid, amount: r.amount,
      category_id: r.categoryId, account_id: r.accountId || null,
      description: r.description || '', date: r.date,
      is_planned: r.isPlanned || false
    }).select().single();
    if (error) throw error;
    return { id: data.id, amount: parseFloat(data.amount), categoryId: data.category_id,
             accountId: data.account_id || null, description: data.description || '',
             date: data.date, isPlanned: data.is_planned || false,
             createdAt: new Date(data.created_at).getTime() };
  },

  async updateExpense(id, r) {
    const { data, error } = await _sb.from('expenses').update({
      amount: r.amount, category_id: r.categoryId, account_id: r.accountId || null,
      description: r.description || '', date: r.date,
      is_planned: r.isPlanned || false
    }).eq('id', id).eq('user_id', _uid).select().single();
    if (error) throw error;
    return { id: data.id, amount: parseFloat(data.amount), categoryId: data.category_id,
             accountId: data.account_id || null, description: data.description || '',
             date: data.date, isPlanned: data.is_planned || false,
             createdAt: new Date(data.created_at).getTime() };
  },

  async deleteExpense(id) {
    const { error } = await _sb.from('expenses').delete().eq('id', id).eq('user_id', _uid);
    if (error) throw error;
  },

  async deleteExpenses(ids) {
    const { error } = await _sb.from('expenses').delete().in('id', ids).eq('user_id', _uid);
    if (error) throw error;
  },

  /* ---------- Categories ---------- */

  async getCategories() {
    const { data, error } = await _sb.from('categories').select('*')
      .eq('user_id', _uid).order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, name: r.name, color: r.color, isPredefined: r.is_predefined
    }));
  },

  async addCategory(r) {
    const { data, error } = await _sb.from('categories').insert({
      id: r.id, user_id: _uid, name: r.name, color: r.color,
      is_predefined: r.isPredefined || false
    }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, color: data.color, isPredefined: data.is_predefined };
  },

  async updateCategory(id, r) {
    const { data, error } = await _sb.from('categories').update({
      name: r.name, color: r.color
    }).eq('id', id).eq('user_id', _uid).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, color: data.color, isPredefined: data.is_predefined };
  },

  async deleteCategory(id) {
    const { error } = await _sb.from('categories').delete().eq('id', id).eq('user_id', _uid);
    if (error) throw error;
  },

  /* ---------- Accounts ---------- */

  async getAccounts() {
    const { data, error } = await _sb.from('accounts').select('*')
      .eq('user_id', _uid).order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, name: r.name, type: r.type,
      balance: parseFloat(r.balance), notes: r.notes || '', color: r.color
    }));
  },

  async addAccount(r) {
    const { data, error } = await _sb.from('accounts').insert({
      id: r.id, user_id: _uid, name: r.name, type: r.type,
      balance: r.balance, notes: r.notes || '', color: r.color
    }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, type: data.type,
             balance: parseFloat(data.balance), notes: data.notes || '', color: data.color };
  },

  async updateAccount(id, r) {
    const { data, error } = await _sb.from('accounts').update({
      name: r.name, type: r.type, balance: r.balance, notes: r.notes || '', color: r.color
    }).eq('id', id).eq('user_id', _uid).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, type: data.type,
             balance: parseFloat(data.balance), notes: data.notes || '', color: data.color };
  },

  async deleteAccount(id) {
    const { error } = await _sb.from('accounts').delete().eq('id', id).eq('user_id', _uid);
    if (error) throw error;
  },

  async adjustAccountBalance(id, delta) {
    const { data: acc, error: fetchErr } = await _sb.from('accounts')
      .select('balance').eq('id', id).eq('user_id', _uid).single();
    if (fetchErr || !acc) return;
    const newBal = parseFloat((parseFloat(acc.balance) + delta).toFixed(2));
    const { error } = await _sb.from('accounts').update({ balance: newBal })
      .eq('id', id).eq('user_id', _uid);
    if (error) throw error;
  },

  /* ---------- Incomes ---------- */

  async getIncomes() {
    const { data, error } = await _sb.from('incomes').select('*')
      .eq('user_id', _uid).order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, accountId: r.account_id, amount: parseFloat(r.amount),
      description: r.description || '', date: r.date,
      createdAt: new Date(r.created_at).getTime()
    }));
  },

  async addIncome(r) {
    const { data, error } = await _sb.from('incomes').insert({
      id: r.id, user_id: _uid, account_id: r.accountId, amount: r.amount,
      description: r.description || '', date: r.date
    }).select().single();
    if (error) throw error;
    return { id: data.id, accountId: data.account_id, amount: parseFloat(data.amount),
             description: data.description || '', date: data.date,
             createdAt: new Date(data.created_at).getTime() };
  },

  async updateIncome(id, r) {
    const { data, error } = await _sb.from('incomes').update({
      account_id: r.accountId, amount: r.amount,
      description: r.description || '', date: r.date
    }).eq('id', id).eq('user_id', _uid).select().single();
    if (error) throw error;
    return { id: data.id, accountId: data.account_id, amount: parseFloat(data.amount),
             description: data.description || '', date: data.date,
             createdAt: new Date(data.created_at).getTime() };
  },

  async deleteIncome(id) {
    const { error } = await _sb.from('incomes').delete().eq('id', id).eq('user_id', _uid);
    if (error) throw error;
  },

  /* ---------- Settings ---------- */

  async getSettings() {
    const { data } = await _sb.from('settings').select('*').eq('user_id', _uid).maybeSingle();
    if (!data) return { currency: '$', dashboardPeriod: 'month', version: 1, projIncome: null, projExpenses: null, projSnapshotPatrimony: null, projSnapshotDate: null };
    return {
      currency:             data.currency,
      dashboardPeriod:      data.dashboard_period,
      version:              data.version,
      projIncome:           data.proj_income    != null ? parseFloat(data.proj_income)    : null,
      projExpenses:         data.proj_expenses  != null ? parseFloat(data.proj_expenses)  : null,
      projSnapshotPatrimony: data.proj_snapshot_patrimony != null ? parseFloat(data.proj_snapshot_patrimony) : null,
      projSnapshotDate:     data.proj_snapshot_date || null
    };
  },

  async saveSettings(s) {
    const payload = {
      user_id:          _uid,
      currency:         s.currency,
      dashboard_period: s.dashboardPeriod,
      version:          s.version || 1
    };
    if (s.projIncome          != null) payload.proj_income             = s.projIncome;
    if (s.projExpenses        != null) payload.proj_expenses           = s.projExpenses;
    if (s.projSnapshotPatrimony != null) payload.proj_snapshot_patrimony = s.projSnapshotPatrimony;
    if (s.projSnapshotDate    != null) payload.proj_snapshot_date      = s.projSnapshotDate;
    const { error } = await _sb.from('settings').upsert(payload);
    if (error) throw error;
  }
};
