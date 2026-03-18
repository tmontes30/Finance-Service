/* Auth — Google OAuth + email/password via Supabase */

const Auth = {
  _client: null,
  _user:   null,
  _ready:  false,

  async init() {
    this._client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Recuperar sesión existente (también maneja el redirect de Google OAuth)
    const { data: { session } } = await this._client.auth.getSession();
    if (session) {
      this._user = session.user;
      await this._setupApp();
    } else {
      this._showAuth();
    }

    // Escuchar cambios de autenticación
    this._client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && !this._ready) {
        this._user = session.user;
        await this._setupApp();
      } else if (event === 'SIGNED_OUT') {
        window.location.reload();
      }
    });
  },

  async _setupApp() {
    if (this._ready) return;
    this._ready = true;
    try {
      Storage.init(this._client, this._user.id);
      await Data.init();

      Dashboard.init();
      Accounts.init();
      Expenses.init();
      Categories.init();
      Projection.init();

      const emailEl = document.getElementById('nav-user-email');
      if (emailEl) {
        const meta = this._user.user_metadata;
        emailEl.textContent = (meta?.nombre && meta?.apellido)
          ? `${meta.nombre} ${meta.apellido}`
          : this._user.email;
      }

      this._hideAuth();
      await Router.navigate('dashboard');
    } catch (err) {
      this._ready = false;
      console.error('Error al iniciar sesión:', err);
      // Si la sesión está inválida (usuario eliminado, FK violation, etc.) cerramos sesión
      try { await this._client.auth.signOut(); } catch (_) {}
      window.location.reload();
    }
  },

  client() { return this._client; },
  user()   { return this._user; },

  async loginWithEmail(email, password) {
    const { error } = await this._client.auth.signInWithPassword({ email, password });
    return error;
  },

  async signupWithEmail(email, password, profile = {}) {
    const { error } = await this._client.auth.signUp({
      email,
      password,
      options: { data: profile }
    });
    return error;
  },

  async logout() {
    this._ready = false;
    await this._client.auth.signOut();
    window.location.reload();
  },

  _showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-wrapper').style.display = 'none';
  },

  _hideAuth() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-wrapper').style.display  = 'block';
  }
};
