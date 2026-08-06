/* Auth — email/password vía Firebase Auth */

const Auth = {
  _auth:       null,
  _db:         null,
  _user:       null,
  _ready:      false,
  _resetCode:  null,
  _resetEmail: null,

  async init() {
    firebase.initializeApp(FIREBASE_CONFIG);
    this._auth = firebase.auth();
    this._db   = firebase.firestore();

    // Link de recuperación de contraseña: ?mode=resetPassword&oobCode=...
    const params = new URLSearchParams(window.location.search);
    const isRecoveryLink = params.get('mode') === 'resetPassword' && !!params.get('oobCode');
    if (isRecoveryLink) {
      this._resetCode = params.get('oobCode');
      history.replaceState(null, '', window.location.pathname);
    }

    let first = true;
    this._auth.onAuthStateChanged(async user => {
      if (first) {
        first = false;
        if (isRecoveryLink) {
          try {
            this._resetEmail = await this._auth.verifyPasswordResetCode(this._resetCode);
            this._showRecovery();
          } catch (err) {
            this._showAuth();
          }
          this._hideSplash();
          return;
        }
        if (user) {
          this._user = user;
          await this._setupApp();
        } else {
          this._showAuth();
        }
        this._hideSplash();
        return;
      }

      // Cambios posteriores (login, logout, recuperación de contraseña completada)
      if (this._suppressAuthEvents) return;
      if (user && !this._ready) {
        this._user = user;
        await this._setupApp();
      } else if (!user && this._ready) {
        window.location.reload();
      }
    });
  },

  async _setupApp() {
    if (this._ready) return;
    this._ready = true;
    try {
      Storage.init(this._db, this._user.uid);
      await Data.init();

      Dashboard.init();
      Accounts.init();
      Expenses.init();
      Categories.init();
      Projection.init();
      BudgetView.init();

      const emailEl = document.getElementById('nav-user-email');
      if (emailEl) {
        let label = this._user.email;
        try {
          const profileSnap = await this._db.collection('users').doc(this._user.uid).get();
          const p = profileSnap.data();
          if (p && p.nombre && p.apellido) label = `${p.nombre} ${p.apellido}`;
        } catch (_) { /* usa el email como fallback */ }
        emailEl.textContent = label;
      }

      this._hideAuth();
      await Router.navigate('dashboard');
    } catch (err) {
      this._ready = false;
      console.error('Error al iniciar sesión:', err);
      // Si la sesión está inválida cerramos sesión
      try { await this._auth.signOut(); } catch (_) {}
      window.location.reload();
    }
  },

  client() { return this._auth; },
  user()   { return this._user; },

  async loginWithEmail(email, password) {
    try {
      await this._auth.signInWithEmailAndPassword(email, password);
      return null;
    } catch (err) {
      return err;
    }
  },

  async signupWithEmail(email, password, profile = {}) {
    // Suprime el evento de auth mientras se crea la cuenta: Firebase inicia sesión
    // automáticamente al registrar, pero acá queremos que el usuario inicie sesión
    // explícitamente después (igual que el comportamiento anterior con Supabase).
    this._suppressAuthEvents = true;
    try {
      const cred = await this._auth.createUserWithEmailAndPassword(email, password);
      const displayName = (profile.nombre && profile.apellido) ? `${profile.nombre} ${profile.apellido}` : null;
      if (displayName) await cred.user.updateProfile({ displayName });
      await this._db.collection('users').doc(cred.user.uid).set({
        nombre: profile.nombre || '', apellido: profile.apellido || '',
        rut: profile.rut || '', telefono: profile.telefono || '', email
      }, { merge: true });
      await this._auth.signOut();
      return null;
    } catch (err) {
      return err;
    } finally {
      this._suppressAuthEvents = false;
    }
  },

  async sendPasswordReset(email) {
    try {
      await this._auth.sendPasswordResetEmail(email, {
        url: 'https://tmontes30.github.io/Finance-Service/',
        handleCodeInApp: true
      });
      return null;
    } catch (err) {
      return err;
    }
  },

  async updatePassword(newPassword) {
    try {
      await this._auth.confirmPasswordReset(this._resetCode, newPassword);
      await this._auth.signInWithEmailAndPassword(this._resetEmail, newPassword);
      return null;
    } catch (err) {
      return err;
    }
  },

  async logout() {
    this._ready = false;
    await this._auth.signOut();
    window.location.reload();
  },

  _showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-wrapper').style.display = 'none';
    document.getElementById('btn-fab').classList.remove('fab-active');
  },

  _hideAuth() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-wrapper').style.display  = 'block';
    document.getElementById('btn-fab').classList.add('fab-active');
  },

  _hideSplash() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    splash.classList.add('splash-hidden');
    setTimeout(() => { splash.style.display = 'none'; }, 420);
  },

  _showRecovery() {
    document.getElementById('auth-form').style.display          = 'none';
    document.getElementById('auth-forgot-link').style.display   = 'none';
    document.getElementById('auth-mode-toggle').style.display   = 'none';
    document.getElementById('auth-forgot-section').style.display    = 'none';
    document.getElementById('auth-title').textContent           = 'Nueva contraseña';
    document.getElementById('auth-recovery-section').style.display = 'block';
    document.getElementById('auth-screen').style.display        = 'flex';
    document.getElementById('app-wrapper').style.display        = 'none';
  }
};
