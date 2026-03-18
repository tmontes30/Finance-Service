/* UI — modal system, toasts, validation helpers */

const UI = {

  /* ---------- Toast ---------- */

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '⚡', error: '🔥', info: '🤖' };

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML =
      `<span class="toast-icon">${icons[type] || '💬'}</span>` +
      `<span class="toast-message">${message}</span>`;

    container.appendChild(el);

    const remove = () => {
      el.classList.add('hiding');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    el.addEventListener('click', remove);
    setTimeout(remove, 3500);
  },

  /* ---------- Expense Modal ---------- */

  async openExpenseModal(expense = null) {
    const modal    = document.getElementById('modal-expense');
    const title    = document.getElementById('modal-expense-title');
    const idField  = document.getElementById('expense-id');
    const amount   = document.getElementById('expense-amount');
    const category = document.getElementById('expense-category');
    const desc     = document.getElementById('expense-description');
    const date     = document.getElementById('expense-date');

    title.textContent = expense ? 'Editar Gasto' : 'Agregar Gasto';
    idField.value     = expense ? expense.id : '';
    amount.value      = expense ? expense.amount : '';
    desc.value        = expense ? expense.description : '';
    date.value        = expense
      ? expense.date
      : new Date().toISOString().split('T')[0];

    // Populate category options
    const categories = await Data.getCategories();
    category.innerHTML =
      '<option value="">Seleccionar categoría</option>' +
      categories.map(c =>
        `<option value="${c.id}"${expense && expense.categoryId === c.id ? ' selected' : ''}>${c.name}</option>`
      ).join('');

    // Populate account options
    const accountSel = document.getElementById('expense-account');
    const accounts   = await Data.getAccounts();
    accountSel.innerHTML =
      '<option value="">Sin cuenta específica</option>' +
      accounts.map(a => {
        const info = ACCOUNT_TYPES[a.type] || { icon: '📁' };
        const sel  = expense && expense.accountId === a.id ? ' selected' : '';
        return `<option value="${a.id}"${sel}>${info.icon} ${this._esc(a.name)}</option>`;
      }).join('');

    // Planned expense fields
    const plannedCb  = document.getElementById('expense-is-planned');
    const monthGroup = document.getElementById('expense-planned-month-group');
    const monthInput = document.getElementById('expense-planned-month');

    plannedCb.checked = expense ? (expense.isPlanned || false) : false;
    monthInput.value  = (expense && expense.isPlanned) ? expense.date.slice(0, 7) : '';
    monthGroup.style.display = plannedCb.checked ? 'block' : 'none';

    plannedCb.onchange = () => {
      monthGroup.style.display = plannedCb.checked ? 'block' : 'none';
    };

    // Clear errors
    this._clearAllErrors();

    modal.style.display = 'flex';
    setTimeout(() => amount.focus(), 60);
    this._setupFocusTrap(modal);
  },

  closeExpenseModal() {
    document.getElementById('modal-expense').style.display = 'none';
  },

  /* ---------- Confirm Dialog ---------- */

  confirm(message, onConfirm) {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-message').textContent = message;
    modal.style.display = 'flex';

    const close = () => { modal.style.display = 'none'; };

    const okBtn     = document.getElementById('btn-confirm-ok');
    const cancelBtn = document.getElementById('btn-confirm-cancel');

    // Clone to remove any stale listeners
    const newOk     = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.replaceWith(newOk);
    cancelBtn.replaceWith(newCancel);

    document.getElementById('btn-confirm-ok').addEventListener('click', async () => {
      close();
      await onConfirm();
    }, { once: true });

    document.getElementById('btn-confirm-cancel').addEventListener('click', close, { once: true });
  },

  /* ---------- Form Validation ---------- */

  validateExpenseForm() {
    const amount   = document.getElementById('expense-amount').value;
    const category = document.getElementById('expense-category').value;
    const date     = document.getElementById('expense-date').value;
    let valid = true;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      this._showError('amount', 'Ingresa un monto válido mayor a cero');
      valid = false;
    } else {
      this._clearError('amount');
    }

    if (!category) {
      this._showError('category', 'Selecciona una categoría');
      valid = false;
    } else {
      this._clearError('category');
    }

    if (!date) {
      this._showError('date', 'Selecciona una fecha');
      valid = false;
    } else {
      this._clearError('date');
    }

    const isPlanned   = document.getElementById('expense-is-planned').checked;
    const plannedMonth = document.getElementById('expense-planned-month').value;
    if (isPlanned && !plannedMonth) {
      this._showError('planned-month', 'Selecciona el mes del gasto previsto');
      valid = false;
    } else {
      this._clearError('planned-month');
    }

    return valid;
  },

  /* ---------- Category Badge ---------- */

  categoryBadge(category) {
    if (!category) return '<span style="color:var(--color-text-muted)">—</span>';
    const bg = category.color + '22';
    return (
      `<span class="category-badge" style="background:${bg};color:${category.color}">` +
      `<span class="category-dot" style="background:${category.color}"></span>` +
      `${this._esc(category.name)}</span>`
    );
  },

  /* ---------- Private helpers ---------- */

  _showError(field, msg) {
    const errEl  = document.getElementById(`error-${field}`);
    const inpEl  = document.getElementById(`expense-${field}`);
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    if (inpEl) inpEl.classList.add('error');
  },

  _clearError(field) {
    const errEl = document.getElementById(`error-${field}`);
    const inpEl = document.getElementById(`expense-${field}`);
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (inpEl) inpEl.classList.remove('error');
  },

  _clearAllErrors() {
    ['amount', 'category', 'date', 'planned-month'].forEach(f => this._clearError(f));
  },

  _setupFocusTrap(modal) {
    // Remove previous trap if any
    if (modal._trapHandler) {
      modal.removeEventListener('keydown', modal._trapHandler);
    }
    const focusable = modal.querySelectorAll(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    modal._trapHandler = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    modal.addEventListener('keydown', modal._trapHandler);
  },

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
