/* Accounts view — cuentas (bancos, ahorro, inversiones) e ingresos */

// Colores sugeridos para cuentas (datos guardados en la cuenta, no colores del tema)
const ACCOUNT_SWATCHES = [
  '#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b'
];

const Accounts = {
  _INCOME_PAGE: 15,
  _incomeLimit: 15,
  _editingBalance: null, // saldo actual de la cuenta en edición
  _accounts: [],
  _incomes:  [],

  /* ---------- Init ---------- */

  init() {
    document.getElementById('btn-add-account').addEventListener('click', () => this._openAccountModal());
    document.getElementById('btn-add-account-empty').addEventListener('click', () => this._openAccountModal());
    document.getElementById('btn-add-income').addEventListener('click', () => this.openIncomeModal());

    // Account sheet
    document.getElementById('modal-account-close').addEventListener('click', () => UI.closeModal('modal-account'));
    document.getElementById('btn-account-cancel').addEventListener('click', () => UI.closeModal('modal-account'));
    document.getElementById('btn-account-save').addEventListener('click', () => this._saveAccount());
    document.getElementById('btn-account-delete').addEventListener('click', () => this._deleteAccount());
    document.getElementById('account-form').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this._saveAccount();
      }
    });
    this._buildTypeGrid();
    this._buildSwatches();

    // Ajuste de saldo
    document.getElementById('adjust-sign-plus').addEventListener('click', () => this._setAdjustSign(true));
    document.getElementById('adjust-sign-minus').addEventListener('click', () => this._setAdjustSign(false));
    document.getElementById('account-adjust-amount').addEventListener('input', () => this._updateAdjustPreview());

    // Income sheet
    document.getElementById('modal-income-close').addEventListener('click', () => UI.closeModal('modal-income'));
    document.getElementById('btn-income-save').addEventListener('click', () => this._saveIncome());
    document.getElementById('btn-income-delete').addEventListener('click', () => this._deleteIncome());
    document.getElementById('income-form').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this._saveIncome(); }
    });

    // Listas (delegación de eventos)
    document.getElementById('accounts-list').addEventListener('click', e => {
      const addBtn = e.target.closest('.tx-action');
      if (addBtn) { e.stopPropagation(); this.openIncomeModal(null, addBtn.dataset.id); return; }
      const row = e.target.closest('.tx-row[data-id]');
      if (!row) return;
      const acc = this._accounts.find(a => a.id === row.dataset.id);
      if (acc) this._openAccountModal(acc);
    });
    document.getElementById('income-list').addEventListener('click', e => {
      const row = e.target.closest('.tx-row[data-id]');
      if (!row) return;
      const inc = this._incomes.find(i => i.id === row.dataset.id);
      if (inc) this.openIncomeModal(inc);
    });
    document.getElementById('btn-income-more').addEventListener('click', () => {
      this._incomeLimit += this._INCOME_PAGE;
      this._renderIncomes();
    });
  },

  /* =========================================================
     RENDER
     ========================================================= */

  async render() {
    const [accounts, incomes] = await Promise.all([Data.getAccounts(), Data.getIncomes()]);
    this._accounts = accounts;
    this._incomes  = incomes;
    this._renderAccounts();
    this._renderIncomes();
  },

  _renderAccounts() {
    const accounts  = this._accounts;
    const listEl    = document.getElementById('accounts-list');
    const emptyEl   = document.getElementById('accounts-empty');
    const summaryEl = document.getElementById('accounts-summary');
    const headerEl  = document.getElementById('accounts-list-header');
    const incomeBtn = document.getElementById('btn-add-income');

    if (accounts.length === 0) {
      listEl.innerHTML        = '';
      emptyEl.style.display   = 'block';
      summaryEl.style.display = 'none';
      headerEl.style.display  = 'none';
      incomeBtn.style.display = 'none';
      return;
    }
    emptyEl.style.display   = 'none';
    summaryEl.style.display = '';
    headerEl.style.display  = '';
    incomeBtn.style.display = '';

    const total = accounts.reduce((s, a) => s + a.balance, 0);
    document.getElementById('accounts-total').textContent = Data.formatAmount(total);
    PatrimonioToggle.applyTo('accounts-total');

    // Barra de distribución (solo saldos positivos)
    const positive = accounts.filter(a => a.balance > 0).sort((a, b) => b.balance - a.balance);
    const posTotal = positive.reduce((s, a) => s + a.balance, 0);
    document.getElementById('accounts-alloc-bar').innerHTML = posTotal > 0
      ? positive.map(a => `<span style="width:${(a.balance / posTotal * 100).toFixed(2)}%;background:${a.color}" title="${UI._esc(a.name)}"></span>`).join('')
      : '';

    // Desglose por tipo
    const byType = {};
    accounts.forEach(a => { byType[a.type] = (byType[a.type] || 0) + a.balance; });
    document.getElementById('accounts-breakdown').innerHTML = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, sum]) => {
        const info = ACCOUNT_TYPES[type] || { short: type };
        return `<div class="breakdown-item">
          <span class="breakdown-label">${info.short}</span>
          <span class="breakdown-amount">${Data.formatAmount(sum)}</span>
        </div>`;
      }).join('');

    listEl.innerHTML = accounts.map(a => this._accountRowHTML(a)).join('');
  },

  _accountRowHTML(acc) {
    const info = ACCOUNT_TYPES[acc.type] || { label: acc.type, svg: 'dots' };
    const sub  = [info.label, acc.notes].filter(Boolean).map(s => `<span>${UI._esc(s)}</span>`).join('<span aria-hidden="true">·</span>');
    return `
      <div class="tx-row" data-id="${acc.id}" role="button" tabindex="0">
        <span class="acc-icon" style="background:${acc.color}22;color:${acc.color}">${UI.icon(info.svg)}</span>
        <div class="tx-main">
          <div class="tx-title">${UI._esc(acc.name)}</div>
          <div class="tx-sub">${sub}</div>
        </div>
        <div class="acc-balance ${acc.balance < 0 ? 'negative' : ''}">${Data.formatAmount(acc.balance)}</div>
        <button class="tx-action" data-id="${acc.id}" aria-label="Registrar ingreso en ${UI._esc(acc.name)}">${UI.icon('plus')}</button>
      </div>`;
  },

  _renderIncomes() {
    const incomes = this._incomes;
    const section = document.getElementById('income-history-section');
    const listEl  = document.getElementById('income-list');
    const moreBtn = document.getElementById('btn-income-more');
    const accMap  = Object.fromEntries(this._accounts.map(a => [a.id, a]));

    if (incomes.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    document.getElementById('income-list-count').textContent =
      `${incomes.length} ingreso${incomes.length !== 1 ? 's' : ''}`;

    const sorted = [...incomes].sort((a, b) => {
      if (b.date !== a.date) return b.date > a.date ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
    const visible = sorted.slice(0, this._incomeLimit);

    const totals = {};
    sorted.forEach(i => { const k = i.date.slice(0, 7); totals[k] = (totals[k] || 0) + i.amount; });
    const groups = [];
    visible.forEach(i => {
      const k = i.date.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.key === k) last.items.push(i); else groups.push({ key: k, items: [i] });
    });

    listEl.innerHTML = groups.map(g => `
      <div class="tx-group-label"><span>${UI.monthLabel(g.key)}</span><span class="tx-group-total">+${Data.formatAmount(totals[g.key])}</span></div>
      <div class="list-group">${g.items.map(i => {
        const acc = accMap[i.accountId];
        const sub = [acc ? acc.name : null, UI.dayLabel(i.date)].filter(Boolean)
          .map(s => `<span>${UI._esc(s)}</span>`).join('<span aria-hidden="true">·</span>');
        return `
          <div class="tx-row" data-id="${i.id}" role="button" tabindex="0">
            <span class="tx-icon" style="background:var(--color-success-light);color:var(--color-success)">${UI.icon('arrow-in')}</span>
            <div class="tx-main">
              <div class="tx-title">${UI._esc(i.description || 'Ingreso')}</div>
              <div class="tx-sub">${sub}</div>
            </div>
            <div class="tx-amount amount-pos">+${Data.formatAmount(i.amount)}</div>
          </div>`;
      }).join('')}</div>`).join('');

    const remaining = sorted.length - visible.length;
    moreBtn.style.display = remaining > 0 ? '' : 'none';
    moreBtn.textContent   = `Mostrar más (${remaining} restante${remaining !== 1 ? 's' : ''})`;
  },

  /* =========================================================
     ACCOUNT SHEET
     ========================================================= */

  _buildTypeGrid() {
    const grid = document.getElementById('account-type-grid');
    grid.innerHTML = Object.entries(ACCOUNT_TYPES).map(([key, t]) => `
      <button type="button" class="type-option" data-type="${key}">${UI.icon(t.svg)}<span>${t.short}</span></button>`).join('');
    grid.querySelectorAll('.type-option').forEach(btn => {
      btn.addEventListener('click', () => this._setType(btn.dataset.type));
    });
  },

  _setType(type) {
    document.getElementById('account-type').value = type;
    document.querySelectorAll('#account-type-grid .type-option').forEach(b => {
      b.classList.toggle('selected', b.dataset.type === type);
    });
  },

  _buildSwatches() {
    const row   = document.getElementById('account-swatches');
    const input = document.getElementById('account-color');
    row.innerHTML = ACCOUNT_SWATCHES.map(c =>
      `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`
    ).join('') + `<button type="button" class="swatch swatch-custom" aria-label="Otro color">${UI.icon('plus')}</button>`;

    row.querySelectorAll('.swatch[data-color]').forEach(btn => {
      btn.addEventListener('click', () => this._setColor(btn.dataset.color));
    });
    row.querySelector('.swatch-custom').addEventListener('click', () => input.click());
    input.addEventListener('input', () => this._setColor(input.value));
  },

  _setColor(color) {
    const c = color.toLowerCase();
    document.getElementById('account-color').value = c;
    let matched = false;
    document.querySelectorAll('#account-swatches .swatch[data-color]').forEach(b => {
      const sel = b.dataset.color === c;
      b.classList.toggle('selected', sel);
      if (sel) matched = true;
    });
    const custom = document.querySelector('#account-swatches .swatch-custom');
    custom.classList.toggle('selected', !matched);
    custom.style.background = matched ? '' : c;
    custom.style.color      = matched ? '' : 'transparent';
  },

  _openAccountModal(acc = null) {
    document.getElementById('modal-account-title').textContent = acc ? 'Editar cuenta' : 'Nueva cuenta';
    document.getElementById('account-id').value      = acc ? acc.id : '';
    document.getElementById('account-name').value    = acc ? acc.name : '';
    document.getElementById('account-balance').value = acc ? UI.formatMoney(acc.balance) : '';
    document.getElementById('account-notes').value   = acc ? acc.notes : '';
    this._setType(acc ? acc.type : 'bank');
    this._setColor(acc ? acc.color : this._suggestColor());
    document.getElementById('btn-account-delete').style.display = acc ? '' : 'none';

    const adjustSect = document.getElementById('account-adjust-section');
    if (acc) {
      this._editingBalance = acc.balance;
      adjustSect.style.display = 'block';
      document.getElementById('account-adjust-amount').value = '';
      document.getElementById('account-adjust-preview').textContent = '';
      this._setAdjustSign(true);
    } else {
      this._editingBalance = null;
      adjustSect.style.display = 'none';
    }

    this._clearAccountErrors();
    UI.openModal('modal-account');
    if (!acc) UI.focusWithKeyboard(document.getElementById('account-name'));
  },

  _suggestColor() {
    const used = new Set(this._accounts.map(a => (a.color || '').toLowerCase()));
    return ACCOUNT_SWATCHES.find(c => !used.has(c)) || ACCOUNT_SWATCHES[0];
  },

  _setAdjustSign(plus) {
    document.getElementById('adjust-sign-plus').classList.toggle('active', plus);
    document.getElementById('adjust-sign-minus').classList.toggle('active', !plus);
    this._updateAdjustPreview();
  },

  _updateAdjustPreview() {
    const preview = document.getElementById('account-adjust-preview');
    const raw     = UI.parseMoney(document.getElementById('account-adjust-amount').value);
    if (isNaN(raw) || raw === 0 || this._editingBalance === null) {
      preview.textContent = '';
      return;
    }
    const isPlus = document.getElementById('adjust-sign-plus').classList.contains('active');
    const newBal = this._editingBalance + (isPlus ? raw : -raw);
    preview.innerHTML = `${Data.formatAmount(this._editingBalance)} ${isPlus ? '+' : '−'} ${Data.formatAmount(raw)} = <strong>${Data.formatAmount(newBal)}</strong>`;
    preview.style.color = newBal < 0 ? 'var(--color-danger)' : 'var(--color-success)';
  },

  async _saveAccount() {
    const name    = document.getElementById('account-name').value.trim();
    const balance = document.getElementById('account-balance').value;
    let valid = true;

    if (!name) {
      this._showError('account-name', 'El nombre es requerido'); valid = false;
    } else { this._clearError('account-name'); }

    if (balance === '' || balance === '-') {
      this._showError('account-balance', 'Ingresa un saldo (puede ser 0 o negativo)');
      valid = false;
    } else { this._clearError('account-balance'); }

    if (!valid) return;

    // Saldo final: aplica el ajuste si se ingresó
    let finalBalance = UI.parseMoney(balance);
    const id = document.getElementById('account-id').value;
    if (id && this._editingBalance !== null) {
      const adjustRaw = UI.parseMoney(document.getElementById('account-adjust-amount').value);
      if (!isNaN(adjustRaw) && adjustRaw !== 0) {
        const isPlus = document.getElementById('adjust-sign-plus').classList.contains('active');
        finalBalance = this._editingBalance + (isPlus ? adjustRaw : -adjustRaw);
      }
    }

    const saveBtn = document.getElementById('btn-account-save');
    saveBtn.disabled = true;
    try {
      const payload = {
        name,
        type:    document.getElementById('account-type').value,
        balance: finalBalance,
        notes:   document.getElementById('account-notes').value,
        color:   document.getElementById('account-color').value
      };
      const record = id
        ? await Data.updateAccount(id, payload)
        : await Data.addAccount(payload);

      if (record && record.color.toLowerCase() !== (payload.color || '').toLowerCase()) {
        UI.toast('Ese color ya estaba en uso: se asignó otro', 'info');
      }
      UI.toast(id ? 'Cuenta actualizada' : 'Cuenta creada', 'success');
      UI.closeModal('modal-account');
      await Router.refresh();
    } catch (err) {
      UI.toast('Error al guardar la cuenta: ' + (err.message || err), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  },

  _deleteAccount() {
    const id  = document.getElementById('account-id').value;
    const acc = this._accounts.find(a => a.id === id);
    if (!acc) return;
    const incomeCount = this._incomes.filter(i => i.accountId === id).length;
    const extra = incomeCount > 0
      ? ` También se eliminarán ${incomeCount} ingreso${incomeCount !== 1 ? 's' : ''} asociado${incomeCount !== 1 ? 's' : ''}.`
      : '';
    UI.confirm(`¿Eliminar la cuenta "${acc.name}"?${extra}`, async () => {
      try {
        await Data.deleteAccountAndIncomes(id);
        UI.closeModal('modal-account');
        UI.toast('Cuenta eliminada', 'success');
        await Router.refresh();
      } catch (err) {
        UI.toast('Error al eliminar: ' + (err.message || err), 'error');
      }
    });
  },

  /* =========================================================
     INCOME SHEET
     ========================================================= */

  async openIncomeModal(income = null, preselectedAccountId = null, { amount: presetAmount = '' } = {}) {
    const amountEl = document.getElementById('income-amount');

    // Parte síncrona primero (para que iOS abra el teclado dentro del toque)
    document.getElementById('modal-income-title').textContent = income ? 'Editar ingreso' : 'Nuevo ingreso';
    document.getElementById('income-id').value          = income ? income.id : '';
    amountEl.value                                      = income ? UI.formatMoney(income.amount) : presetAmount;
    document.getElementById('income-description').value = income ? income.description : '';
    document.getElementById('income-date').value        = income ? income.date : localISODate();
    document.getElementById('income-kind-switch').style.display = income ? 'none' : '';
    document.getElementById('btn-income-delete').style.display  = income ? '' : 'none';
    document.getElementById('btn-income-save').textContent = income ? 'Guardar cambios' : 'Guardar ingreso';
    UI.autosizeAmount(amountEl);
    UI.syncQuickDates('income-date');
    this._clearIncomeErrors();

    UI.openModal('modal-income');
    if (!income) UI.focusWithKeyboard(amountEl);

    const accounts = await Data.getAccounts();
    if (!accounts.length) {
      UI.closeModal('modal-income');
      UI.toast('Primero crea una cuenta para recibir el ingreso', 'info');
      this._openAccountModal();
      return;
    }
    const select = document.getElementById('income-account');
    const selId  = income ? income.accountId : (preselectedAccountId || (accounts.length === 1 ? accounts[0].id : ''));
    select.innerHTML = '<option value="">Seleccionar cuenta</option>' +
      accounts.map(a => `<option value="${a.id}"${a.id === selId ? ' selected' : ''}>${UI._esc(a.name)}</option>`).join('');
  },

  async _saveIncome() {
    const accountId = document.getElementById('income-account').value;
    const amount    = document.getElementById('income-amount').value;
    const date      = document.getElementById('income-date').value;
    let valid = true;

    if (!UI.parseMoney(amount) || UI.parseMoney(amount) <= 0) {
      this._showError('income-amount', 'Ingresa un monto mayor a cero'); valid = false;
    } else { this._clearError('income-amount'); }

    if (!accountId) {
      this._showError('income-account', 'Selecciona una cuenta'); valid = false;
    } else { this._clearError('income-account'); }

    if (!date) {
      this._showError('income-date', 'Selecciona una fecha'); valid = false;
    } else { this._clearError('income-date'); }

    if (!valid) return;

    const saveBtn = document.getElementById('btn-income-save');
    saveBtn.disabled = true;
    try {
      const id      = document.getElementById('income-id').value;
      const payload = {
        accountId,
        amount:      UI.parseMoney(amount),
        description: document.getElementById('income-description').value,
        date
      };
      if (id) {
        await Data.updateIncome(id, payload);
        UI.toast('Ingreso actualizado', 'success');
      } else {
        await Data.addIncome(payload);
        UI.toast('Ingreso registrado', 'success');
      }
      UI.closeModal('modal-income');
      await Router.refresh();
    } catch (err) {
      UI.toast('Error al guardar el ingreso: ' + (err.message || err), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  },

  _deleteIncome() {
    const id = document.getElementById('income-id').value;
    if (!id) return;
    UI.confirm('¿Eliminar este ingreso? El saldo de la cuenta se revertirá.', async () => {
      try {
        await Data.deleteIncome(id);
        UI.closeModal('modal-income');
        UI.toast('Ingreso eliminado', 'success');
        await Router.refresh();
      } catch (err) {
        UI.toast('Error al eliminar: ' + (err.message || err), 'error');
      }
    });
  },

  /* =========================================================
     ERROR HELPERS
     ========================================================= */

  _showError(fieldId, msg) {
    const errEl = document.getElementById('error-' + fieldId);
    const inpEl = document.getElementById(fieldId);
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    if (inpEl) inpEl.classList.add('error');
  },

  _clearError(fieldId) {
    const errEl = document.getElementById('error-' + fieldId);
    const inpEl = document.getElementById(fieldId);
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (inpEl) inpEl.classList.remove('error');
  },

  _clearAccountErrors() {
    ['account-name', 'account-balance'].forEach(f => this._clearError(f));
  },

  _clearIncomeErrors() {
    ['income-account', 'income-amount', 'income-date'].forEach(f => this._clearError(f));
  }
};
