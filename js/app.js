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
  _views: ['dashboard', 'accounts', 'expenses', 'projection', 'budget'],
  _current: null,
  _viewNames: {
    dashboard: 'Finance', accounts: 'Cuentas', expenses: 'Gastos',
    projection: 'Proyección', budget: 'Presupuesto'
  },

  async navigate(viewName) {
    this._views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.style.display = v === viewName ? 'block' : 'none';
    });
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });
    // Update mobile subheader title
    const mobileTitle = document.getElementById('mobile-view-name');
    if (mobileTitle) mobileTitle.textContent = this._viewNames[viewName] || viewName;
    this._current = viewName;

    if (viewName === 'dashboard')  await Dashboard.render();
    if (viewName === 'accounts')   await Accounts.render();
    if (viewName === 'expenses')   await Expenses.render();
    if (viewName === 'projection') await Projection.render();
    if (viewName === 'budget')     await BudgetView.render();
  }
};

/* ===== Bootstrap ===== */
document.addEventListener('DOMContentLoaded', async () => {

  // Apply saved theme
  const savedTheme = localStorage.getItem('financeTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeIcon = savedTheme === 'light' ? '☀️' : '🌙';
  document.getElementById('btn-theme').textContent = themeIcon;
  document.getElementById('btn-theme-mobile').textContent = themeIcon;

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
    document.getElementById('auth-forgot-link').style.display = isLogin ? '' : 'none';
    document.getElementById('password-strength').style.display = 'none';
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
      if (pass.length < 8) {
        authError.style.cssText   = 'display:block';
        authError.textContent     = 'La contraseña debe tener al menos 8 caracteres';
        authSubmitBtn.disabled    = false;
        authSubmitBtn.textContent = 'Crear cuenta';
        return;
      }
      const passConfirm = document.getElementById('auth-password-confirm').value;
      if (pass !== passConfirm) {
        authError.style.cssText   = 'display:block';
        authError.textContent     = 'Las contraseñas no coinciden';
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

  /* ----- Forgot password flow ----- */
  document.getElementById('auth-forgot-link').addEventListener('click', () => {
    document.getElementById('auth-form').style.display          = 'none';
    document.getElementById('auth-mode-toggle').style.display   = 'none';
    document.getElementById('auth-forgot-link').style.display   = 'none';
    document.getElementById('auth-title').textContent           = 'Restablecer contraseña';
    document.getElementById('auth-forgot-section').style.display = 'block';
    document.getElementById('auth-forgot-email').focus();
  });

  document.getElementById('btn-forgot-back').addEventListener('click', () => {
    document.getElementById('auth-forgot-section').style.display = 'none';
    document.getElementById('auth-form').style.display           = 'block';
    document.getElementById('auth-mode-toggle').style.display    = '';
    document.getElementById('auth-forgot-link').style.display    = '';
    document.getElementById('auth-title').textContent            = 'Iniciar sesión';
    document.getElementById('auth-forgot-msg').style.display     = 'none';
  });

  document.getElementById('btn-forgot-send').addEventListener('click', async () => {
    const email  = document.getElementById('auth-forgot-email').value.trim();
    if (!email) return;
    const btn    = document.getElementById('btn-forgot-send');
    const msgEl  = document.getElementById('auth-forgot-msg');
    btn.disabled    = true;
    btn.textContent = '⚡ Enviando...';
    const error = await Auth.sendPasswordReset(email);
    if (error) {
      msgEl.style.cssText  = 'display:block';
      msgEl.textContent    = 'No se pudo enviar el email. Verificá la dirección.';
    } else {
      msgEl.style.cssText  = 'display:block;color:var(--color-success)';
      msgEl.textContent    = '✅ Revisá tu email para continuar.';
    }
    btn.disabled    = false;
    btn.textContent = 'Enviar link';
  });

  document.getElementById('btn-recovery-save').addEventListener('click', async () => {
    const np    = document.getElementById('auth-new-password').value;
    const npc   = document.getElementById('auth-new-password-confirm').value;
    const errEl = document.getElementById('auth-recovery-error');
    errEl.style.display = 'none';
    if (np.length < 8) {
      errEl.style.cssText = 'display:block';
      errEl.textContent   = 'La contraseña debe tener al menos 8 caracteres';
      return;
    }
    if (np !== npc) {
      errEl.style.cssText = 'display:block';
      errEl.textContent   = 'Las contraseñas no coinciden';
      return;
    }
    const btn = document.getElementById('btn-recovery-save');
    btn.disabled    = true;
    btn.textContent = '⚡ Guardando...';
    const error = await Auth.updatePassword(np);
    if (error) {
      errEl.style.cssText = 'display:block';
      errEl.textContent   = 'Error al guardar: ' + error.message;
      btn.disabled    = false;
      btn.textContent = 'Guardar nueva contraseña';
    }
    // On success, onAuthStateChange fires SIGNED_IN and _setupApp runs automatically
  });

  /* ----- Password strength indicator ----- */
  document.getElementById('auth-password').addEventListener('input', e => {
    if (isLogin) return;
    const val = e.target.value;
    const bar = document.getElementById('password-strength');
    let level = 0;
    if (val.length >= 8) level = 1;
    if (val.length >= 8 && /[0-9]/.test(val)) level = 2;
    if (val.length >= 8 && /[0-9]/.test(val) && /[^a-zA-Z0-9]/.test(val)) level = 3;
    const labels = ['', 'Débil', 'Buena', 'Fuerte'];
    const colors = ['', 'var(--color-danger)', '#f59e0b', 'var(--color-success)'];
    bar.style.display = val ? 'flex' : 'none';
    bar.querySelector('.strength-bar-fill').style.width      = `${level * 33.3}%`;
    bar.querySelector('.strength-bar-fill').style.background = colors[level] || colors[1];
    bar.querySelector('.strength-label').textContent         = labels[level] || '';
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
  async function applyThemeToggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    const icon = next === 'light' ? '☀️' : '🌙';
    document.getElementById('btn-theme').textContent = icon;
    document.getElementById('btn-theme-mobile').textContent = icon;
    localStorage.setItem('financeTheme', next);
    if (Router._current === 'dashboard') await Dashboard.render();
  }
  document.getElementById('btn-theme').addEventListener('click', applyThemeToggle);
  document.getElementById('btn-theme-mobile').addEventListener('click', applyThemeToggle);

  /* ----- Close dropdown when clicking outside ----- */
  document.addEventListener('click', () => {
    document.getElementById('navbar-dropdown').classList.remove('open');
  });

  /* ----- Dropdown nav links ----- */
  document.querySelectorAll('.nav-link-drop[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('navbar-dropdown').classList.remove('open');
      Router.navigate(link.dataset.view);
    });
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
