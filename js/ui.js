/* UI — sheets/modales, toasts, helpers de formato y formulario de gasto */

const UI = {

  _openStack: [],   // ids de modales abiertos (el último es el de arriba)

  /* ---------- Init (se llama una vez desde app.js) ---------- */

  init() {
    // Botones genéricos de cierre: <button data-close="modal-id">
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-close]');
      if (btn) this.closeModal(btn.dataset.close);
    });

    // Teclado de iOS: ajusta el overlay al viewport visible para que la hoja quede sobre el teclado
    if (window.visualViewport) {
      const sync = () => this._syncViewport();
      window.visualViewport.addEventListener('resize', sync);
      window.visualViewport.addEventListener('scroll', sync);
    }

    // Al enfocar un campo dentro de una hoja, llevarlo al centro (el teclado tapa la mitad inferior)
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (!el.matches('input, select, textarea') || !el.closest('.modal-body')) return;
      if (el.classList.contains('amount-input')) return;
      setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
    });

    this._setupQuickDates();
    this._setupPasswordReveal();

    // Monto gigante: ancho dinámico según los dígitos
    document.querySelectorAll('.amount-input').forEach(el => {
      el.addEventListener('input', () => this.autosizeAmount(el));
    });
  },

  isTouch() {
    return window.matchMedia('(pointer: coarse)').matches;
  },

  isSheetLayout() {
    return window.matchMedia('(max-width: 599px)').matches;
  },

  icon(name, cls = '') {
    return `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  },

  /* ---------- Money formatting ---------- */

  // Parse a CLP-formatted string like "250.000" or "-1.500.000" → number
  parseMoney(str) {
    if (str === '' || str === null || str === undefined) return 0;
    const s = str.toString().trim();
    const negative = s.startsWith('-');
    const num = parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
    return negative ? -num : num;
  },

  // Format a number as CLP: 250000 → "250.000"
  formatMoney(num) {
    if (num === '' || num === null || num === undefined) return '';
    const n = Math.round(Number(num));
    if (isNaN(n)) return '';
    const abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return n < 0 ? '-' + abs : abs;
  },

  // Attach live CLP formatter to an input (by id)
  attachMoneyFormat(id, allowNegative = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const raw      = el.value;
      const negative = allowNegative && raw.startsWith('-');
      const digits   = raw.replace(/[^0-9]/g, '');
      if (!digits) { el.value = negative ? '-' : ''; return; }
      const prevLen  = el.value.length;
      const cursor   = el.selectionStart;
      const formatted = (negative ? '-' : '') +
        parseInt(digits, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      el.value = formatted;
      try { el.setSelectionRange(cursor + (formatted.length - prevLen), cursor + (formatted.length - prevLen)); } catch (_) {}
    });
  },

  autosizeAmount(el) {
    const len = Math.max(1, el.value.length);
    el.style.width = `${len + 0.6}ch`;
  },

  /* ---------- Fechas ---------- */

  dateWithOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return localISODate(d);
  },

  // "Hoy", "Ayer", "lunes 20 oct" (+ año si no es el actual)
  dayLabel(iso) {
    if (iso === localISODate()) return 'Hoy';
    if (iso === this.dateWithOffset(-1)) return 'Ayer';
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const opts = { weekday: 'long', day: 'numeric', month: 'short' };
    if (y !== new Date().getFullYear()) opts.year = 'numeric';
    const label = date.toLocaleDateString('es-CL', opts).replace('.', '');
    return label.charAt(0).toUpperCase() + label.slice(1);
  },

  monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const raw = new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  },

  _setupQuickDates() {
    document.querySelectorAll('.quick-dates').forEach(group => {
      const input = document.getElementById(group.dataset.for);
      group.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          input.value = this.dateWithOffset(Number(btn.dataset.offset));
          input.dispatchEvent(new Event('change'));
        });
      });
      input.addEventListener('change', () => this.syncQuickDates(group.dataset.for));
      input.addEventListener('input',  () => this.syncQuickDates(group.dataset.for));
    });
  },

  syncQuickDates(inputId) {
    const input = document.getElementById(inputId);
    const group = document.querySelector(`.quick-dates[data-for="${inputId}"]`);
    if (!input || !group) return;
    group.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', input.value === this.dateWithOffset(Number(btn.dataset.offset)));
    });
  },

  _setupPasswordReveal() {
    document.querySelectorAll('.password-reveal').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const show  = input.type === 'password';
        input.type  = show ? 'text' : 'password';
        btn.innerHTML = this.icon(show ? 'eye-off' : 'eye');
        btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      });
    });
  },

  /* ---------- Toast ---------- */

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: 'check', error: 'x', info: 'info' };

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-icon">${this.icon(icons[type] || 'info')}</span><span class="toast-message"></span>`;
    el.querySelector('.toast-message').textContent = message;

    // Máximo 2 toasts visibles
    while (container.children.length >= 2) container.firstElementChild.remove();
    container.appendChild(el);

    const remove = () => {
      if (el.classList.contains('hiding')) return;
      el.classList.add('hiding');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    el.addEventListener('click', remove);
    setTimeout(remove, type === 'error' ? 4500 : 2800);
  },

  /* ---------- Sheets / Modales ---------- */

  openModal(id, { onClose = null } = {}) {
    const overlay = document.getElementById(id);
    if (!overlay || this._openStack.includes(id)) return;

    overlay._onClose = onClose;
    if (!overlay._bound) {
      overlay._bound = true;
      overlay.addEventListener('click', e => { if (e.target === overlay) this.closeModal(id); });
      this._attachSheetGestures(overlay, id);
    }

    this._openStack.push(id);
    this._syncViewport();
    overlay.style.display = 'flex';
    void overlay.offsetHeight; // reflow para que la transición arranque
    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    this._setupFocusTrap(overlay);
  },

  closeModal(id) {
    const overlay = document.getElementById(id);
    if (!overlay || !this._openStack.includes(id)) return;

    this._openStack = this._openStack.filter(x => x !== id);
    const modal = overlay.querySelector('.modal');
    if (modal) { modal.classList.remove('dragging'); modal.style.transform = ''; }
    overlay.classList.remove('open');
    if (overlay.contains(document.activeElement)) document.activeElement.blur();
    setTimeout(() => { if (!overlay.classList.contains('open')) overlay.style.display = 'none'; }, 320);

    if (!this._openStack.length) {
      document.body.classList.remove('modal-open');
      this._syncViewport();
    }
    const cb = overlay._onClose;
    overlay._onClose = null;
    if (cb) cb();
  },

  closeTopModal() {
    const id = this._openStack[this._openStack.length - 1];
    if (id) this.closeModal(id);
  },

  isModalOpen(id) {
    return this._openStack.includes(id);
  },

  _syncViewport() {
    const vv   = window.visualViewport;
    const root = document.documentElement.style;
    if (vv && this._openStack.length) {
      root.setProperty('--vvh', `${vv.height}px`);
      root.setProperty('--vv-top', `${vv.offsetTop}px`);
    } else {
      root.removeProperty('--vvh');
      root.removeProperty('--vv-top');
    }
  },

  // Deslizar hacia abajo desde el encabezado para cerrar (solo layout de hoja inferior)
  _attachSheetGestures(overlay, id) {
    const modal = overlay.querySelector('.modal');
    if (!modal || modal.classList.contains('modal-confirm')) return;
    const handles = overlay.querySelectorAll('.sheet-grabber, .modal-header');
    let startY = 0, startT = 0, dy = 0, active = false;

    const onStart = e => {
      if (!this.isSheetLayout() || e.target.closest('button')) return;
      active = true;
      startY = e.touches[0].clientY;
      startT = Date.now();
      dy = 0;
      modal.classList.add('dragging');
    };
    const onMove = e => {
      if (!active) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      modal.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      modal.classList.remove('dragging');
      const velocity = dy / Math.max(1, Date.now() - startT);
      if (dy > 110 || (dy > 30 && velocity > 0.6)) {
        this.closeModal(id);
      } else {
        modal.style.transform = '';
      }
    };
    handles.forEach(h => {
      h.addEventListener('touchstart', onStart, { passive: true });
      h.addEventListener('touchmove', onMove, { passive: false });
      h.addEventListener('touchend', onEnd);
      h.addEventListener('touchcancel', onEnd);
    });
  },

  // iOS solo abre el teclado si focus() ocurre dentro del gesto del usuario.
  // Enfocamos un input "puente" de inmediato y luego pasamos el foco al real.
  focusWithKeyboard(el, delay = 340) {
    if (!el) return;
    if (!this.isTouch()) { setTimeout(() => el.focus(), 60); return; }
    const proxy = document.createElement('input');
    proxy.setAttribute('inputmode', el.getAttribute('inputmode') || 'text');
    proxy.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0';
    document.body.appendChild(proxy);
    proxy.focus();
    setTimeout(() => { el.focus(); proxy.remove(); }, delay);
  },

  /* ---------- Expense sheet ---------- */

  async openExpenseModal(expense = null, { amount: presetAmount = '' } = {}) {
    const title    = document.getElementById('modal-expense-title');
    const idField  = document.getElementById('expense-id');
    const amount   = document.getElementById('expense-amount');
    const category = document.getElementById('expense-category');
    const desc     = document.getElementById('expense-description');
    const date     = document.getElementById('expense-date');

    // Parte síncrona primero: así el foco (y el teclado de iOS) ocurre dentro del toque
    title.textContent = expense ? 'Editar gasto' : 'Nuevo gasto';
    idField.value     = expense ? expense.id : '';
    amount.value      = expense ? this.formatMoney(expense.amount) : presetAmount;
    category.value    = expense ? expense.categoryId : '';
    desc.value        = expense ? expense.description : '';
    date.value        = expense ? expense.date : localISODate();
    this.autosizeAmount(amount);
    this.syncQuickDates('expense-date');

    document.getElementById('expense-kind-switch').style.display = expense ? 'none' : '';
    document.getElementById('btn-expense-delete').style.display  = expense ? '' : 'none';
    document.getElementById('btn-modal-save').textContent = expense ? 'Guardar cambios' : 'Guardar gasto';

    // Gasto previsto
    const plannedCb  = document.getElementById('expense-is-planned');
    const monthGroup = document.getElementById('expense-planned-month-group');
    const monthInput = document.getElementById('expense-planned-month');
    const dateGroup  = document.getElementById('expense-date-group');
    plannedCb.checked = expense ? !!expense.isPlanned : false;
    monthInput.value  = (expense && expense.isPlanned) ? expense.date.slice(0, 7) : '';
    const syncPlanned = () => {
      monthGroup.style.display = plannedCb.checked ? 'block' : 'none';
      dateGroup.style.display  = plannedCb.checked ? 'none'  : 'block';
      if (plannedCb.checked && !monthInput.value) {
        const next = new Date();
        next.setMonth(next.getMonth() + 1, 1);
        monthInput.value = localISODate(next).slice(0, 7);
      }
    };
    plannedCb.onchange = syncPlanned;
    syncPlanned();

    this._clearAllErrors();
    this.openModal('modal-expense');
    if (!expense) this.focusWithKeyboard(amount);

    // Parte asíncrona: categorías y cuentas (vienen del caché casi siempre)
    const [categories, accounts] = await Promise.all([Data.getCategories(), Data.getAccounts()]);
    this._renderCategoryChips(categories, category.value);

    const accountSel = document.getElementById('expense-account');
    accountSel.innerHTML =
      '<option value="">Sin cuenta específica</option>' +
      accounts.map(a => {
        const sel = expense && expense.accountId === a.id ? ' selected' : '';
        return `<option value="${a.id}"${sel}>${this._esc(a.name)}</option>`;
      }).join('');
    if (!expense) {
      const last = this._lastAccountId();
      if (last && accounts.some(a => a.id === last)) accountSel.value = last;
    }
  },

  closeExpenseModal() {
    this.closeModal('modal-expense');
  },

  _renderCategoryChips(categories, selectedId) {
    const wrap   = document.getElementById('expense-category-chips');
    const hidden = document.getElementById('expense-category');
    wrap.innerHTML = categories.map(c => `
      <button type="button" class="chip${c.id === selectedId ? ' selected' : ''}" data-id="${c.id}" style="--c:${c.color}">
        <span class="chip-dot"></span>${this._esc(c.name)}
      </button>`).join('');
    wrap.classList.remove('error');
    wrap.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        wrap.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
        hidden.value = chip.dataset.id;
        this._clearError('category');
        wrap.classList.remove('error');
      });
    });
  },

  rememberAccount(id) {
    try { localStorage.setItem('lastAccountId', id || ''); } catch (_) {}
  },

  _lastAccountId() {
    try { return localStorage.getItem('lastAccountId') || ''; } catch (_) { return ''; }
  },

  /* ---------- Confirm (action sheet) ---------- */

  confirm(message, onConfirm, { okLabel = 'Eliminar', danger = true } = {}) {
    document.getElementById('confirm-message').textContent = message;

    const okBtn     = document.getElementById('btn-confirm-ok');
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    // Clonar para limpiar listeners anteriores
    const newOk     = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.replaceWith(newOk);
    cancelBtn.replaceWith(newCancel);

    newOk.textContent = okLabel;
    newOk.className   = `btn btn-lg ${danger ? 'btn-danger' : 'btn-primary'}`;

    newOk.addEventListener('click', async () => {
      this.closeModal('modal-confirm');
      await onConfirm();
    }, { once: true });
    newCancel.addEventListener('click', () => this.closeModal('modal-confirm'), { once: true });

    this.openModal('modal-confirm');
  },

  /* ---------- Form Validation ---------- */

  validateExpenseForm() {
    const amount    = document.getElementById('expense-amount').value;
    const category  = document.getElementById('expense-category').value;
    const date      = document.getElementById('expense-date').value;
    const isPlanned = document.getElementById('expense-is-planned').checked;
    const plannedMonth = document.getElementById('expense-planned-month').value;
    let valid = true;

    if (!this.parseMoney(amount) || this.parseMoney(amount) <= 0) {
      this._showError('amount', 'Ingresa un monto mayor a cero');
      valid = false;
    } else {
      this._clearError('amount');
    }

    if (!category) {
      this._showError('category', 'Elige una categoría');
      document.getElementById('expense-category-chips').classList.add('error');
      valid = false;
    } else {
      this._clearError('category');
    }

    if (!isPlanned && !date) {
      this._showError('date', 'Selecciona una fecha');
      valid = false;
    } else {
      this._clearError('date');
    }

    if (isPlanned && !plannedMonth) {
      this._showError('planned-month', 'Selecciona el mes del gasto previsto');
      valid = false;
    } else {
      this._clearError('planned-month');
    }

    return valid;
  },

  /* ---------- Fila de lista (ícono con color) ---------- */

  txIcon(color, content) {
    return `<span class="tx-icon" style="background:${color}22;color:${color}">${content}</span>`;
  },

  initial(name) {
    return this._esc((name || '?').trim().charAt(0).toUpperCase() || '?');
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

  _setupFocusTrap(overlay) {
    if (overlay._trapHandler) overlay.removeEventListener('keydown', overlay._trapHandler);
    overlay._trapHandler = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )].filter(el => el.offsetParent !== null && !el.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    overlay.addEventListener('keydown', overlay._trapHandler);
  },

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
