/* App — async bootstrap y router */

/* ===== PatrimonioToggle ===== */
const PatrimonioToggle = {
  _hidden: false,
  _MASK: '••••••',

  init() {
    this._hidden = localStorage.getItem('patrimonioHidden') === '1';
    document.querySelectorAll('.btn-toggle-patrimonio').forEach(btn => {
      btn.addEventListener('click', () => this._toggle());
    });
    this._updateButtons();
  },

  applyTo(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.dataset.realValue = el.textContent;
    if (this._hidden) el.textContent = this._MASK;
    this._updateButtons();
  },

  _toggle() {
    this._hidden = !this._hidden;
    localStorage.setItem('patrimonioHidden', this._hidden ? '1' : '0');
    ['stat-patrimonio', 'accounts-total'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (this._hidden) {
        if (el.textContent !== this._MASK) el.dataset.realValue = el.textContent;
        el.textContent = this._MASK;
      } else {
        el.textContent = el.dataset.realValue || el.textContent;
      }
    });
    this._updateButtons();
  },

  _updateButtons() {
    const eyeOpen = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOff  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    document.querySelectorAll('.btn-toggle-patrimonio').forEach(btn => {
      btn.innerHTML = this._hidden ? eyeOff : eyeOpen;
      btn.title = this._hidden ? 'Mostrar patrimonio' : 'Ocultar patrimonio';
    });
  }
};

const Router = {
  _views: ['dashboard', 'accounts', 'expenses', 'categories', 'projection'],
  _current: null,

  async navigate(viewName) {
    this._views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.style.display = v === viewName ? 'block' : 'none';
    });
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });
    this._current = viewName;

    if (viewName === 'dashboard')  await Dashboard.render();
    if (viewName === 'accounts')   await Accounts.render();
    if (viewName === 'expenses')   await Expenses.render();
    if (viewName === 'categories') await Categories.render();
    if (viewName === 'projection') await Projection.render();
  }
};

/* ===== Bootstrap ===== */
document.addEventListener('DOMContentLoaded', async () => {

  // Apply saved theme
  const savedTheme = localStorage.getItem('financeTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('btn-theme').textContent = savedTheme === 'light' ? '☀️' : '🌙';

  /* Auth maneja: Storage.init, Data.init, módulos de vistas, y el primer navigate */
  await Auth.init();
  PatrimonioToggle.init();

  /* ----- Auth screen ----- */
  const authForm      = document.getElementById('auth-form');
  const authEmail     = document.getElementById('auth-email');
  const authPass      = document.getElementById('auth-password');
  const authError     = document.getElementById('auth-error');
  const authSubmitBtn = document.getElementById('auth-submit');
  const authTitle     = document.getElementById('auth-title');
  const authToggle    = document.getElementById('auth-mode-toggle');
  let isLogin = true;

  authToggle.addEventListener('click', () => {
    isLogin = !isLogin;
    authTitle.textContent     = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
    authSubmitBtn.textContent = isLogin ? 'Entrar' : 'Crear cuenta';
    authToggle.textContent    = isLogin
      ? '¿No tienes cuenta? Regístrate'
      : '¿Ya tienes cuenta? Inicia sesión';
    authError.style.display = 'none';
    document.querySelectorAll('.register-only').forEach(el => {
      el.style.display = isLogin ? 'none' : '';
    });
    document.getElementById('auth-card').classList.toggle('register', !isLogin);
  });

  // RUT auto-format
  document.getElementById('auth-rut').addEventListener('input', e => {
    e.target.value = _formatRut(e.target.value);
  });

  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    authError.style.display   = 'none';
    authSubmitBtn.disabled    = true;
    authSubmitBtn.textContent = '⚡ Cargando...';

    const email = authEmail.value.trim();
    const pass  = authPass.value;
    let error;

    if (isLogin) {
      error = await Auth.loginWithEmail(email, pass);
    } else {
      const nombre   = document.getElementById('auth-nombre').value.trim();
      const apellido = document.getElementById('auth-apellido').value.trim();
      const rut      = document.getElementById('auth-rut').value.trim();
      const telefono = document.getElementById('auth-telefono').value.trim();

      if (!nombre || !apellido) {
        authError.style.cssText   = 'display:block';
        authError.textContent     = 'Nombre y apellido son requeridos';
        authSubmitBtn.disabled    = false;
        authSubmitBtn.textContent = 'Crear cuenta';
        return;
      }
      if (rut && !_validarRut(rut)) {
        authError.style.cssText   = 'display:block';
        authError.textContent     = 'El RUT no tiene un formato válido (ej: 12.345.678-9)';
        authSubmitBtn.disabled    = false;
        authSubmitBtn.textContent = 'Crear cuenta';
        return;
      }

      error = await Auth.signupWithEmail(email, pass, { nombre, apellido, rut, telefono });
      if (!error) {
        // Volver al modo login con el email pre-llenado
        isLogin = true;
        authTitle.textContent = 'Iniciar sesión';
        authSubmitBtn.textContent = 'Entrar';
        authToggle.textContent = '¿No tienes cuenta? Regístrate';
        document.querySelectorAll('.register-only').forEach(el => { el.style.display = 'none'; });
        document.getElementById('auth-card').classList.remove('register');
        authPass.value = '';
        authError.style.cssText = 'display:block;color:var(--color-success)';
        authError.textContent   = '✅ Cuenta creada. Ahora iniciá sesión.';
        authSubmitBtn.disabled    = false;
        authSubmitBtn.textContent = 'Entrar';
        return;
      }
    }

    if (error) {
      authError.style.cssText   = 'display:block';
      authError.textContent     = _mapAuthError(error.message);
      authSubmitBtn.disabled    = false;
      authSubmitBtn.textContent = isLogin ? 'Entrar' : 'Crear cuenta';
    }
  });

  /* ----- Nav links ----- */
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      Router.navigate(link.dataset.view);
    });
  });

  /* ----- Hamburger ----- */
  document.getElementById('navbar-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('navbar-dropdown').classList.toggle('open');
  });

  /* ----- Logo click → dashboard ----- */
  document.getElementById('navbar-brand').addEventListener('click', () => {
    Router.navigate('dashboard');
  });

  /* ----- Theme toggle ----- */
  document.getElementById('btn-theme').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.getElementById('btn-theme').textContent = next === 'light' ? '☀️' : '🌙';
    localStorage.setItem('financeTheme', next);
  });

  /* ----- Close dropdown when clicking outside ----- */
  document.addEventListener('click', () => {
    document.getElementById('navbar-dropdown').classList.remove('open');
  });

  /* ----- Mobile nav links (hamburger dropdown) ----- */
  document.getElementById('nav-mobile-add').addEventListener('click', () => {
    document.getElementById('navbar-dropdown').classList.remove('open');
    UI.openExpenseModal();
  });
  document.getElementById('nav-mobile-logout').addEventListener('click', () => {
    document.getElementById('navbar-dropdown').classList.remove('open');
    document.getElementById('btn-logout').click();
  });

  /* ----- Add expense buttons ----- */
  document.getElementById('btn-add-expense').addEventListener('click',
    async () => UI.openExpenseModal());
  document.getElementById('btn-add-expense-mobile').addEventListener('click',
    async () => UI.openExpenseModal());
  document.getElementById('btn-fab').addEventListener('click',
    () => UI.openExpenseModal());

  /* ----- Expense modal: close ----- */
  document.getElementById('modal-close').addEventListener('click', () => UI.closeExpenseModal());
  document.getElementById('btn-modal-cancel').addEventListener('click', () => UI.closeExpenseModal());
  document.getElementById('modal-expense').addEventListener('click', e => {
    if (e.target === e.currentTarget) UI.closeExpenseModal();
  });

  /* ----- Expense modal: save ----- */
  document.getElementById('btn-modal-save').addEventListener('click', async () => {
    if (!UI.validateExpenseForm()) return;
    const saveBtn = document.getElementById('btn-modal-save');
    saveBtn.disabled = true;
    try {
      const id         = document.getElementById('expense-id').value;
      const isPlanned  = document.getElementById('expense-is-planned').checked;
      const plannedMonth = document.getElementById('expense-planned-month').value;
      const payload = {
        amount:      document.getElementById('expense-amount').value,
        categoryId:  document.getElementById('expense-category').value,
        accountId:   document.getElementById('expense-account').value || null,
        description: document.getElementById('expense-description').value,
        date:        isPlanned ? plannedMonth + '-01' : document.getElementById('expense-date').value,
        isPlanned
      };
      try {
        if (id) {
          await Data.updateExpense(id, payload);
          UI.toast('Gasto actualizado', 'success');
        } else {
          await Data.addExpense(payload);
          UI.toast('Gasto agregado', 'success');
        }
        UI.closeExpenseModal();
        await Expenses.render();
        await Dashboard.render();
        if (Router._current === 'accounts') await Accounts.render();
      } catch (err) {
        UI.toast('Error al guardar: ' + (err.message || err), 'error');
      }
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* Save on Enter inside modal form */
  document.getElementById('expense-form').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('btn-modal-save').click();
    }
  });

  /* ESC closes modals */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      UI.closeExpenseModal();
      document.getElementById('modal-income').style.display  = 'none';
      document.getElementById('modal-account').style.display = 'none';
      document.getElementById('modal-confirm').style.display = 'none';
    }
  });

  /* ----- Logout ----- */
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await Auth.logout();
  });
});

function _formatRut(value) {
  let clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  const verifier = clean.slice(-1);
  let body = clean.slice(0, -1);
  let formatted = '';
  while (body.length > 3) {
    formatted = '.' + body.slice(-3) + formatted;
    body = body.slice(0, -3);
  }
  return body + formatted + '-' + verifier;
}

function _validarRut(rut) {
  return /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/.test(rut) || /^\d{7,8}-[\dkK]$/.test(rut);
}

function _mapAuthError(msg) {
  if (msg.includes('Invalid login') || msg.includes('invalid_credentials'))
    return 'Email o contraseña incorrectos';
  if (msg.includes('Email not confirmed'))
    return 'Debes confirmar tu email primero';
  if (msg.includes('User already registered'))
    return 'Ya existe una cuenta con ese email';
  if (msg.includes('Password should'))
    return 'La contraseña debe tener al menos 6 caracteres';
  return msg;
}
