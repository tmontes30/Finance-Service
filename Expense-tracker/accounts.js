/* Accounts view — bank accounts, savings, investments, and income */

const Accounts = {

  /* ---------- Init ---------- */

  init() {
    document.getElementById('btn-add-account').addEventListener('click',
      () => this._openAccountModal());
    document.getElementById('btn-add-account-empty').addEventListener('click',
      () => this._openAccountModal());

    document.getElementById('modal-account-close').addEventListener('click',
      () => this._closeAccountModal());
    document.getElementById('btn-account-cancel').addEventListener('click',
      () => this._closeAccountModal());
    document.getElementById('modal-account').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeAccountModal();
    });

    document.getElementById('btn-account-save').addEventListener('click',
      async () => this._saveAccount());
    document.getElementById('account-form').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this._saveAccount().catch(err => UI.toast('Error: ' + (err.message || err), 'error'));
      }
    });

    document.getElementById('btn-add-income').addEventListener('click',
      async () => this._openIncomeModal());

    document.getElementById('modal-income-close').addEventListener('click',
      () => this._closeIncomeModal());
    document.getElementById('btn-income-cancel').addEventListener('click',
      () => this._closeIncomeModal());
    document.getElementById('modal-income').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeIncomeModal();
    });

    document.getElementById('btn-income-save').addEventListener('click',
      async () => this._saveIncome());
    document.getElementById('income-form').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this._saveIncome().catch(err => UI.toast('Error: ' + (err.message || err), 'error')); }
    });
  },

  /* =========================================================
     RENDER
     ========================================================= */

  async render() {
    await Promise.all([this._renderAccounts(), this._renderIncomes()]);
  },

  /* ---------- Accounts list ---------- */

  async _renderAccounts() {
    const [accounts, incomes] = await Promise.all([Data.getAccounts(), Data.getIncomes()]);
    const listEl    = document.getElementById('accounts-list');
    const emptyEl   = document.getElementById('accounts-empty');
    const summaryEl = document.getElementById('accounts-summary');
    const incomeBtn = document.getElementById('btn-add-income');

    if (accounts.length === 0) {
      listEl.innerHTML        = '';
      emptyEl.style.display   = 'block';
      summaryEl.style.display = 'none';
      incomeBtn.style.display = 'none';
      return;
    }

    emptyEl.style.display   = 'none';
    summaryEl.style.display = 'block';
    incomeBtn.style.display = 'inline-flex';

    const total = accounts.reduce((s, a) => s + a.balance, 0);
    document.getElementById('accounts-total').textContent = Data.formatAmount(total);
    PatrimonioToggle.applyTo('accounts-total');

    const byType = {};
    accounts.forEach(a => { byType[a.type] = (byType[a.type] || 0) + a.balance; });
    document.getElementById('accounts-breakdown').innerHTML = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, sum]) => {
        const info = ACCOUNT_TYPES[type] || { label: type, icon: '📁' };
        return `<div class="breakdown-item">
          <span>${info.icon} ${info.label}</span>
          <span class="breakdown-amount ${sum < 0 ? 'negative' : ''}">${Data.formatAmount(sum)}</span>
        </div>`;
      }).join('');

    listEl.innerHTML = accounts.map(a => this._accountCardHTML(a)).join('');

    // Edit — use closure
    listEl.querySelectorAll('.btn-acc-edit').forEach(btn => {
      const acc = accounts.find(a => a.id === btn.dataset.id);
      btn.addEventListener('click', () => { if (acc) this._openAccountModal(acc); });
    });

    // Delete — use closure
    listEl.querySelectorAll('.btn-acc-delete').forEach(btn => {
      const acc = accounts.find(a => a.id === btn.dataset.id);
      if (!acc) return;
      const incomeCount = incomes.filter(i => i.accountId === acc.id).length;
      const extra = incomeCount > 0
        ? ` También se eliminarán los ${incomeCount} ingreso(s) asociado(s).`
        : '';
      btn.addEventListener('click', () => {
        UI.confirm(`¿Eliminar la cuenta "${acc.name}"?${extra}`, async () => {
          await Data.deleteAccountAndIncomes(acc.id);
          await this.render();
          await Dashboard.render();
          UI.toast('Cuenta eliminada', 'success');
        });
      });
    });

    listEl.querySelectorAll('.btn-acc-add-income').forEach(btn => {
      btn.addEventListener('click', async () => this._openIncomeModal(null, btn.dataset.id));
    });
  },

  _accountCardHTML(acc) {
    const info       = ACCOUNT_TYPES[acc.type] || { label: acc.type, icon: '📁' };
    const isNegative = acc.balance < 0;
    return `
      <div class="account-card" style="border-left: 4px solid ${acc.color}">
        <div class="acc-icon" style="background:${acc.color}22;color:${acc.color}">${info.icon}</div>
        <div class="acc-body">
          <div class="acc-name">${UI._esc(acc.name)}</div>
          <div class="acc-type">${info.label}</div>
          ${acc.notes ? `<div class="acc-notes">${UI._esc(acc.notes)}</div>` : ''}
        </div>
        <div class="acc-right">
          <div class="acc-balance ${isNegative ? 'negative' : ''}">${Data.formatAmount(acc.balance)}</div>
          <div class="acc-actions">
            <button class="btn-icon btn-acc-add-income" data-id="${acc.id}" title="Agregar ingreso">⚡</button>
            <button class="btn-icon btn-acc-edit" data-id="${acc.id}" title="Editar">⚙️</button>
            <button class="btn-icon danger btn-acc-delete" data-id="${acc.id}" title="Eliminar">🗑️</button>
          </div>
        </div>
      </div>`;
  },

  /* ---------- Income list ---------- */

  async _renderIncomes() {
    const [incomes, accounts] = await Promise.all([Data.getIncomes(), Data.getAccounts()]);
    const section  = document.getElementById('income-history-section');
    const listEl   = document.getElementById('income-list');
    const countEl  = document.getElementById('income-list-count');
    const accMap   = Object.fromEntries(accounts.map(a => [a.id, a]));

    if (incomes.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    countEl.textContent   = `${incomes.length} ingreso${incomes.length !== 1 ? 's' : ''}`;

    const sorted = [...incomes].sort((a, b) => {
      if (b.date !== a.date) return b.date > a.date ? 1 : -1;
      return b.createdAt - a.createdAt;
    });

    listEl.innerHTML = `
      <table class="expense-table income-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Cuenta</th>
            <th style="text-align:right">Monto</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(i => {
            const acc = accMap[i.accountId];
            const accBadge = acc
              ? `<span class="category-badge" style="background:${acc.color}22;color:${acc.color}">
                  <span class="category-dot" style="background:${acc.color}"></span>
                  ${UI._esc(acc.name)}
                 </span>`
              : '<span style="color:var(--color-text-muted)">—</span>';
            const desc = i.description
              ? UI._esc(i.description)
              : `<span style="color:var(--color-text-muted);font-style:italic">Sin descripción</span>`;
            return `<tr>
              <td class="col-date" data-label="Fecha">${Data.formatDate(i.date)}</td>
              <td data-label="Descripción">${desc}</td>
              <td data-label="Cuenta">${accBadge}</td>
              <td class="col-amount income-amount" data-label="Monto">${Data.formatAmount(i.amount)}</td>
              <td class="col-actions">
                <button class="btn-icon btn-income-edit" data-id="${i.id}" title="Editar">⚙️</button>
                <button class="btn-icon danger btn-income-delete" data-id="${i.id}" title="Eliminar">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    // Edit — use closure
    listEl.querySelectorAll('.btn-income-edit').forEach(btn => {
      const income = sorted.find(i => i.id === btn.dataset.id);
      btn.addEventListener('click', async () => {
        if (income) await this._openIncomeModal(income);
      });
    });

    listEl.querySelectorAll('.btn-income-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.confirm('¿Eliminar este ingreso? El saldo de la cuenta se revertirá.', async () => {
          await Data.deleteIncome(btn.dataset.id);
          await this.render();
          await Dashboard.render();
          UI.toast('Ingreso eliminado', 'success');
        });
      });
    });
  },

  /* =========================================================
     ACCOUNT MODAL
     ========================================================= */

  _openAccountModal(acc = null) {
    const modal = document.getElementById('modal-account');
    document.getElementById('modal-account-title').textContent = acc ? 'Editar Cuenta' : 'Nueva Cuenta';
    document.getElementById('account-id').value      = acc ? acc.id : '';
    document.getElementById('account-name').value    = acc ? acc.name : '';
    document.getElementById('account-type').value    = acc ? acc.type : 'bank';
    document.getElementById('account-balance').value = acc ? acc.balance : '';
    document.getElementById('account-notes').value   = acc ? acc.notes : '';
    document.getElementById('account-color').value   = acc ? acc.color : '#6366f1';
    this._clearAccountErrors();
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('account-name').focus(), 60);
  },

  _closeAccountModal() {
    document.getElementById('modal-account').style.display = 'none';
  },

  async _saveAccount() {
    const name    = document.getElementById('account-name').value.trim();
    const balance = document.getElementById('account-balance').value;
    let valid = true;

    if (!name) {
      this._showError('account-name', 'El nombre es requerido'); valid = false;
    } else { this._clearError('account-name'); }

    if (balance === '' || isNaN(parseFloat(balance))) {
      this._showError('account-balance', 'Ingresa un saldo válido (puede ser 0 o negativo)');
      valid = false;
    } else { this._clearError('account-balance'); }

    if (!valid) return;

    const saveBtn = document.getElementById('btn-account-save');
    saveBtn.disabled = true;
    try {
      const id      = document.getElementById('account-id').value;
      const payload = {
        name:    name,
        type:    document.getElementById('account-type').value,
        balance: document.getElementById('account-balance').value,
        notes:   document.getElementById('account-notes').value,
        color:   document.getElementById('account-color').value
      };
      try {
        const record = id
          ? await Data.updateAccount(id, payload)
          : await Data.addAccount(payload);
        if (record && record.color.toLowerCase() !== (payload.color || '').toLowerCase()) {
          UI.toast('El color ya estaba en uso — se asignó uno alternativo', 'info');
        }
        UI.toast(id ? 'Cuenta actualizada' : 'Cuenta agregada', 'success');
        this._closeAccountModal();
        await this.render();
        await Dashboard.render();
      } catch (err) {
        UI.toast('Error al guardar cuenta: ' + (err.message || err), 'error');
      }
    } finally {
      saveBtn.disabled = false;
    }
  },

  /* =========================================================
     INCOME MODAL
     ========================================================= */

  async _openIncomeModal(income = null, preselectedAccountId = null) {
    const modal  = document.getElementById('modal-income');
    const title  = document.getElementById('modal-income-title');
    const select = document.getElementById('income-account');

    title.textContent = income ? 'Editar Ingreso' : 'Registrar Ingreso';

    const accounts = await Data.getAccounts();
    select.innerHTML = '<option value="">Seleccionar cuenta</option>' +
      accounts.map(a => {
        const info     = ACCOUNT_TYPES[a.type] || { icon: '📁' };
        const selected = (income && income.accountId === a.id) ||
                         (!income && preselectedAccountId === a.id);
        return `<option value="${a.id}" ${selected ? 'selected' : ''}>${info.icon} ${UI._esc(a.name)}</option>`;
      }).join('');

    document.getElementById('income-id').value          = income ? income.id : '';
    document.getElementById('income-amount').value      = income ? income.amount : '';
    document.getElementById('income-description').value = income ? income.description : '';
    document.getElementById('income-date').value        = income
      ? income.date
      : new Date().toISOString().split('T')[0];

    this._clearIncomeErrors();
    modal.style.display = 'flex';
    setTimeout(() => (income
      ? document.getElementById('income-amount')
      : document.getElementById('income-account')
    ).focus(), 60);
  },

  _closeIncomeModal() {
    document.getElementById('modal-income').style.display = 'none';
  },

  async _saveIncome() {
    const accountId = document.getElementById('income-account').value;
    const amount    = document.getElementById('income-amount').value;
    const date      = document.getElementById('income-date').value;
    let valid = true;

    if (!accountId) {
      this._showError('income-account', 'Selecciona una cuenta'); valid = false;
    } else { this._clearError('income-account'); }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      this._showError('income-amount', 'Ingresa un monto válido mayor a cero'); valid = false;
    } else { this._clearError('income-amount'); }

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
        amount:      document.getElementById('income-amount').value,
        description: document.getElementById('income-description').value,
        date
      };
      try {
        if (id) {
          await Data.updateIncome(id, payload);
          UI.toast('Ingreso actualizado', 'success');
        } else {
          await Data.addIncome(payload);
          UI.toast('Ingreso registrado', 'success');
        }
        this._closeIncomeModal();
        await this.render();
        await Dashboard.render();
      } catch (err) {
        UI.toast('Error al guardar ingreso: ' + (err.message || err), 'error');
      }
    } finally {
      saveBtn.disabled = false;
    }
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
