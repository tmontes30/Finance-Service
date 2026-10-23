/* App — bootstrap, router, tema y acciones globales */

/* ===== PatrimonioToggle ===== */
const PatrimonioToggle = {
  _hidden: false,
  _MASK: '••••••',
  _IDS: ['stat-patrimonio', 'accounts-total'],

  init() {
    try { this._hidden = localStorage.getItem('patrimonioHidden') === '1'; } catch (_) {}
    document.querySelectorAll('.btn-toggle-patrimonio').forEach(btn => {
      btn.addEventListener('click', () => this.set(!this._hidden));
    });
    const cb = document.getElementById('settings-hide-patrimonio');
    if (cb) cb.addEventListener('change', () => this.set(cb.checked));
    this._updateButtons();
  },

  applyTo(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.dataset.realValue = el.textContent;
    if (this._hidden) el.textContent = this._MASK;
    this._updateButtons();
  },

  set(hidden) {
    this._hidden = hidden;
    try { localStorage.setItem('patrimonioHidden', hidden ? '1' : '0'); } catch (_) {}
    this._IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (hidden) {
        if (el.textContent !== this._MASK) el.dataset.realValue = el.textContent;
        el.textContent = this._MASK;
      } else {
        el.textContent = el.dataset.realValue || el.textContent;
      }
    });
    this._updateButtons();
  },

  _updateButtons() {
    document.querySelectorAll('.btn-toggle-patrimonio').forEach(btn => {
      btn.innerHTML = UI.icon(this._hidden ? 'eye-off' : 'eye');
      btn.setAttribute('aria-label', this._hidden ? 'Mostrar patrimonio' : 'Ocultar patrimonio');
    });
    const cb = document.getElementById('settings-hide-patrimonio');
    if (cb) cb.checked = this._hidden;
  }
};

/* ===== Theme: 'dark' | 'light' | 'system' (guardado en localStorage financeTheme) ===== */
const Theme = {
  _pref: 'dark',

  init() {
    try { this._pref = localStorage.getItem('financeTheme') || 'dark'; } catch (_) {}
    this._apply(false);
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onSystemChange = () => { if (this._pref === 'system') this._apply(true); };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);

    document.querySelectorAll('[data-theme-pref]').forEach(btn => {
      btn.addEventListener('click', () => this.set(btn.dataset.themePref));
    });
  },

  set(pref) {
    this._pref = pref;
    try { localStorage.setItem('financeTheme', pref); } catch (_) {}
    this._apply(true);
  },

  resolved() {
    if (this._pref !== 'system') return this._pref;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  },

  _apply(rerender) {
    const theme = this.resolved();
    const changed = document.documentElement.getAttribute('data-theme') !== theme;
    document.documentElement.setAttribute('data-theme', theme);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    const meta = document.getElementById('meta-theme-color');
    if (meta && bg) meta.setAttribute('content', bg);
    document.querySelectorAll('[data-theme-pref]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themePref === this._pref);
    });
    // Los gráficos leen los colores al crearse: hay que reconstruirlos
    if (rerender && changed && Auth._ready) {
      Dashboard.resetCharts();
      Plan.resetChart();
      Router.refresh();
    }
  }
};

/* ===== Router ===== */
const Router = {
  _views: ['dashboard', 'accounts', 'expenses', 'plan'],
  _current: null,
  _viewNames: { dashboard: 'Resumen', accounts: 'Cuentas', expenses: 'Gastos', plan: 'Plan' },

  async navigate(viewName) {
    const same = this._current === viewName;
    if (Expenses._selecting && viewName !== 'expenses') Expenses._setSelecting(false);
    this._views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.style.display = v === viewName ? '' : 'none';
    });
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });
    document.querySelectorAll('.tab').forEach(tab => {
      const active = tab.dataset.view === viewName;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    });

    const mobileTitle = document.getElementById('mobile-view-name');
    if (mobileTitle) mobileTitle.textContent = this._viewNames[viewName] || viewName;
    this._current = viewName;
    if (!same) window.scrollTo(0, 0);
    Header.update();

    await this.refresh();
  },

  async refresh() {
    const v = this._current;
    try {
      if (v === 'dashboard')  await Dashboard.render();
      if (v === 'accounts')   await Accounts.render();
      if (v === 'expenses')   await Expenses.render();
      if (v === 'plan')       await Plan.render();
    } catch (err) {
      console.error(err);
      UI.toast('No se pudieron cargar los datos. Revisa tu conexión.', 'error');
    }
  }
};

/* ===== Header compacto: se vuelve sólido al hacer scroll (iOS large title) ===== */
const Header = {
  _ticking: false,
  init() {
    window.addEventListener('scroll', () => {
      if (this._ticking) return;
      this._ticking = true;
      requestAnimationFrame(() => { this.update(); this._ticking = false; });
    }, { passive: true });
  },
  update() {
    const header = document.getElementById('app-header');
    if (header) header.classList.toggle('scrolled', window.scrollY > 36);
  }
};

/* ===== Perfil del usuario (llamado desde auth.js) ===== */
function setUserProfile(name, email) {
  const display  = name || email || '';
  const initials = (name || email || '?')
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2)
    .map(w => w.charAt(0).toUpperCase()).join('') || '?';
  document.querySelectorAll('[data-avatar]').forEach(el => { el.textContent = initials; });
  const nameEl  = document.getElementById('nav-user-email');
  const emailEl = document.getElementById('settings-user-email');
  if (nameEl)  nameEl.textContent  = display;
  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = name ? name.split(' ')[0] : (email || ''); });
  if (emailEl) emailEl.textContent = name ? email : '';

  const firstName = name ? name.split(' ')[0] : '';
  const h = new Date().getHours();
  const greet = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) greetEl.textContent = firstName ? `${greet}, ${firstName}` : greet;
}

/* ===== Bootstrap ===== */
document.addEventListener('DOMContentLoaded', async () => {

  UI.init();
  Theme.init();
  Header.init();

  // Formato CLP en vivo para todos los campos de dinero
  ['expense-amount', 'income-amount', 'budget-manual-amount', 'account-adjust-amount',
   'filter-amount-min', 'filter-amount-max'].forEach(id => UI.attachMoneyFormat(id));
  UI.attachMoneyFormat('account-balance', true); // permite negativos

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

  const setAuthMode = login => {
    isLogin = login;
    authTitle.textContent     = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
    authSubmitBtn.textContent = isLogin ? 'Entrar' : 'Crear cuenta';
    authToggle.innerHTML      = isLogin
      ? '¿No tienes cuenta? <strong>Regístrate</strong>'
      : '¿Ya tienes cuenta? <strong>Inicia sesión</strong>';
    document.querySelectorAll('.register-only').forEach(el => {
      el.style.display = isLogin ? 'none' : '';
    });
    document.getElementById('auth-card').classList.toggle('register', !isLogin);
    document.getElementById('auth-forgot-link').style.display = isLogin ? '' : 'none';
    document.getElementById('password-strength').style.display = 'none';
    authPass.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
  };

  const showAuthError = (msg, success = false) => {
    authError.style.cssText = success ? 'display:block;color:var(--color-success);background:var(--color-success-light)' : 'display:block';
    authError.textContent   = msg;
  };

  authToggle.addEventListener('click', () => {
    authError.style.display = 'none';
    setAuthMode(!isLogin);
  });

  // RUT auto-format
  document.getElementById('auth-rut').addEventListener('input', e => {
    e.target.value = _formatRut(e.target.value);
  });

  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    authError.style.display   = 'none';
    authSubmitBtn.disabled    = true;
    authSubmitBtn.textContent = isLogin ? 'Entrando…' : 'Creando cuenta…';

    const email = authEmail.value.trim();
    const pass  = authPass.value;
    const resetBtn = () => {
      authSubmitBtn.disabled    = false;
      authSubmitBtn.textContent = isLogin ? 'Entrar' : 'Crear cuenta';
    };
    let error;

    if (isLogin) {
      error = await Auth.loginWithEmail(email, pass);
    } else {
      const nombre   = document.getElementById('auth-nombre').value.trim();
      const apellido = document.getElementById('auth-apellido').value.trim();
      const rut      = document.getElementById('auth-rut').value.trim();
      const telefono = document.getElementById('auth-telefono').value.trim();
      const passConfirm = document.getElementById('auth-password-confirm').value;

      const invalid =
        (!nombre || !apellido)        ? 'Nombre y apellido son requeridos' :
        pass.length < 8               ? 'La contraseña debe tener al menos 8 caracteres' :
        pass !== passConfirm          ? 'Las contraseñas no coinciden' :
        (rut && !_validarRut(rut))    ? 'El RUT no tiene un formato válido (ej: 12.345.678-9)' :
        null;
      if (invalid) { showAuthError(invalid); resetBtn(); return; }

      error = await Auth.signupWithEmail(email, pass, { nombre, apellido, rut, telefono });
      if (!error) {
        // Volver al modo login con el email pre-llenado
        setAuthMode(true);
        authPass.value = '';
        showAuthError('Cuenta creada. Ahora inicia sesión.', true);
        resetBtn();
        return;
      }
    }

    if (error) {
      showAuthError(_mapAuthError(error));
      resetBtn();
    }
  });

  /* ----- Forgot password flow ----- */
  document.getElementById('auth-forgot-link').addEventListener('click', () => {
    document.getElementById('auth-form').style.display           = 'none';
    document.getElementById('auth-mode-toggle').style.display    = 'none';
    document.getElementById('auth-title').textContent            = 'Restablecer contraseña';
    document.getElementById('auth-forgot-section').style.display = 'block';
    document.getElementById('auth-forgot-email').value           = authEmail.value.trim();
  });

  document.getElementById('btn-forgot-back').addEventListener('click', () => {
    document.getElementById('auth-forgot-section').style.display = 'none';
    document.getElementById('auth-form').style.display           = 'block';
    document.getElementById('auth-mode-toggle').style.display    = '';
    document.getElementById('auth-title').textContent            = 'Iniciar sesión';
    document.getElementById('auth-forgot-msg').style.display     = 'none';
  });

  document.getElementById('btn-forgot-send').addEventListener('click', async () => {
    const email  = document.getElementById('auth-forgot-email').value.trim();
    if (!email) return;
    const btn    = document.getElementById('btn-forgot-send');
    const msgEl  = document.getElementById('auth-forgot-msg');
    btn.disabled    = true;
    btn.textContent = 'Enviando…';
    const error = await Auth.sendPasswordReset(email);
    if (error) {
      msgEl.style.cssText  = 'display:block';
      msgEl.textContent    = 'No se pudo enviar el email. Verifica la dirección.';
    } else {
      msgEl.style.cssText  = 'display:block;color:var(--color-success);background:var(--color-success-light)';
      msgEl.textContent    = 'Listo. Revisa tu email para continuar.';
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
    btn.textContent = 'Guardando…';
    const error = await Auth.updatePassword(np);
    if (error) {
      errEl.style.cssText = 'display:block';
      errEl.textContent   = 'Error al guardar: ' + error.message;
      btn.disabled    = false;
      btn.textContent = 'Guardar nueva contraseña';
    }
    // Si funciona, onAuthStateChanged dispara _setupApp automáticamente
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
    const colors = ['', 'var(--color-danger)', 'var(--color-warning)', 'var(--color-success)'];
    bar.style.display = val ? 'flex' : 'none';
    bar.querySelector('.strength-bar-fill').style.width      = `${Math.max(level, 1) * 33.3}%`;
    bar.querySelector('.strength-bar-fill').style.background = colors[level] || colors[1];
    bar.querySelector('.strength-label').textContent         = labels[level] || 'Débil';
  });

  /* ----- Navegación: navbar (escritorio), tab bar (iPhone) y selector de Plan ----- */
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      Router.navigate(link.dataset.view);
    });
  });
  document.querySelectorAll('.tab[data-view]').forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      const target = tab.dataset.view;
      // Tocar la pestaña activa vuelve arriba (como en iOS)
      if (tab.classList.contains('active')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      Router.navigate(target);
    });
  });
  document.getElementById('navbar-brand').addEventListener('click', () => Router.navigate('dashboard'));
  document.getElementById('navbar-brand').addEventListener('keydown', e => { if (e.key === 'Enter') Router.navigate('dashboard'); });
  document.getElementById('btn-see-all-expenses').addEventListener('click', () => Router.navigate('expenses'));

  /* ----- Agregar movimiento ----- */
  document.getElementById('btn-add-expense').addEventListener('click', () => UI.openExpenseModal());
  document.getElementById('btn-fab').addEventListener('click', () => UI.openExpenseModal());

  // Cambiar entre Gasto ↔ Ingreso dentro de la hoja (conserva el monto escrito)
  document.querySelector('#expense-kind-switch [data-switch-to="income"]').addEventListener('click', () => {
    const amount = document.getElementById('expense-amount').value;
    UI.closeModal('modal-expense');
    Accounts.openIncomeModal(null, null, { amount });
  });
  document.querySelector('#income-kind-switch [data-switch-to="expense"]').addEventListener('click', () => {
    const amount = document.getElementById('income-amount').value;
    UI.closeModal('modal-income');
    UI.openExpenseModal(null, { amount });
  });

  /* ----- Expense sheet: cerrar ----- */
  document.getElementById('modal-close').addEventListener('click', () => UI.closeExpenseModal());

  /* ----- Expense sheet: guardar ----- */
  document.getElementById('btn-modal-save').addEventListener('click', async () => {
    if (!UI.validateExpenseForm()) return;
    const saveBtn = document.getElementById('btn-modal-save');
    saveBtn.disabled = true;
    try {
      const id           = document.getElementById('expense-id').value;
      const isPlanned    = document.getElementById('expense-is-planned').checked;
      const plannedMonth = document.getElementById('expense-planned-month').value;
      const payload = {
        amount:      UI.parseMoney(document.getElementById('expense-amount').value),
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
          UI.rememberAccount(payload.accountId);
          UI.toast(isPlanned ? 'Gasto previsto agregado' : 'Gasto agregado', 'success');
        }
        UI.closeExpenseModal();
        await Router.refresh();
      } catch (err) {
        UI.toast('Error al guardar: ' + (err.message || err), 'error');
      }
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* ----- Expense sheet: eliminar ----- */
  document.getElementById('btn-expense-delete').addEventListener('click', () => {
    const id = document.getElementById('expense-id').value;
    if (!id) return;
    UI.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.', async () => {
      try {
        await Data.deleteExpense(id);
        UI.closeExpenseModal();
        UI.toast('Gasto eliminado', 'success');
        await Router.refresh();
      } catch (err) {
        UI.toast('Error al eliminar: ' + (err.message || err), 'error');
      }
    });
  });

  /* Enter en el formulario guarda (excepto en textarea) */
  document.getElementById('expense-form').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('btn-modal-save').click();
    }
  });

  /* ESC cierra la hoja de arriba */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') UI.closeTopModal();
  });

  /* ----- Ajustes ----- */
  const openSettings = () => {
    Categories.updateCount();
    UI.openModal('modal-settings');
  };
  document.getElementById('btn-open-settings').addEventListener('click', openSettings);
  document.getElementById('btn-open-settings-mobile').addEventListener('click', openSettings);

  document.getElementById('btn-export-csv-settings').addEventListener('click', () => Expenses.exportCSV());

  document.getElementById('btn-logout').addEventListener('click', () => {
    UI.confirm('¿Quieres cerrar sesión?', async () => {
      await Auth.logout();
    }, { okLabel: 'Cerrar sesión' });
  });

  /* ----- Volver a la app: refrescar datos si estuvo un rato en segundo plano ----- */
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (Auth._ready && hiddenAt && Date.now() - hiddenAt > 60 * 1000) {
      Storage.invalidateAll();
      Router.refresh();
    }
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

function _mapAuthError(err) {
  const code = err.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
    return 'Email o contraseña incorrectos';
  if (code === 'auth/email-already-in-use')
    return 'Ya existe una cuenta con ese email';
  if (code === 'auth/weak-password')
    return 'La contraseña debe tener al menos 6 caracteres';
  if (code === 'auth/invalid-email')
    return 'El email no tiene un formato válido';
  if (code === 'auth/too-many-requests')
    return 'Demasiados intentos. Intenta de nuevo más tarde';
  if (code === 'auth/network-request-failed')
    return 'Sin conexión. Revisa tu internet e intenta de nuevo';
  return err.message || 'Ocurrió un error inesperado';
}
