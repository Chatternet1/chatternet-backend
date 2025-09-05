/* public/auth.js — unified auth used by ALL pages
   - Compatible with your backend routes:
       POST /api/signup {email,password,name}
       POST /api/login  {email,password}
        GET /api/users
        GET /api/users/:id
   - Persists to the keys your UI already reads:
       ct_accounts_v2 : { [email]: { id,email,name } }
       ct_session_v1  : { user: email, id }
       ct_users_v3    : seed "Me" avatar for headers
       ct_profile_data_v1 : store displayName/email for "Me"
   - Exposes:
       Auth.isLoggedIn(), Auth.current(), Auth.require(opts)
       Auth.login({email,password}), Auth.signup({email,password,name}), Auth.logout()
       Auth.ensureAccount(), Auth.getMe(), Auth.getMeId()
*/

(function () {
  const LS = {
    ACC: 'ct_accounts_v2',
    SESSION: 'ct_session_v1',
    USERS: 'ct_users_v3',
    PROFILE: 'ct_profile_data_v1',
    LEGACY_ME: 'chatternet.me' // migrate from your old snippet if present
  };

  const apiBase = (typeof window.API_BASE !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

  const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  async function req(method, path, body, headers) {
    const opts = { method, headers: headers || {} };
    if (!(body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      if (body) opts.body = JSON.stringify(body);
    } else {
      opts.body = body;
    }
    const r = await fetch(apiBase + path, opts);
    const t = await r.text();
    if (!r.ok) {
      try { const j = t ? JSON.parse(t) : {}; throw new Error(j.error || j.message || t || 'Request failed'); }
      catch { throw new Error(t || 'Request failed'); }
    }
    try { return t ? JSON.parse(t) : {}; } catch { return {}; }
  }

  // --- backend helpers (tolerant to shapes) ---
  async function signup(email, password, name) {
    const res = await req('POST', '/api/signup', { email, password, name: name || '' });
    return (res && res.user) || res;
  }
  async function login(email, password) {
    const res = await req('POST', '/api/login', { email, password });
    return (res && res.user) || res;
  }
  async function getUsers() {
    try { const list = await req('GET', '/api/users'); return Array.isArray(list) ? list : []; } catch { return []; }
  }
  async function getUser(id) {
    try { return await req('GET', `/api/users/${encodeURIComponent(id)}`); } catch { return null; }
  }

  // --- session wiring used by the rest of your app ---
  function setSession(user) {
    if (!user || !user.email) return;

    // accounts
    const accs = load(LS.ACC, {});
    accs[user.email] = { id: user.id, email: user.email, name: user.name || '' };
    save(LS.ACC, accs);

    // active session
    save(LS.SESSION, { user: user.email, id: user.id });

    // mirror to profile/users so avatars/headers pick up instantly
    const prof = load(LS.PROFILE, {});
    prof['Me'] = { ...(prof['Me'] || {}), displayName: user.name || prof['Me']?.displayName || 'Me', email: user.email };
    save(LS.PROFILE, prof);

    const users = load(LS.USERS, []);
    const i = users.findIndex(u => u.name === 'Me');
    const me = { name: 'Me', avatar: (users[i]?.avatar || `https://i.pravatar.cc/100?u=me`) };
    if (i >= 0) users[i] = me; else users.unshift(me);
    save(LS.USERS, users);
  }

  function clearSession() {
    try { localStorage.removeItem(LS.SESSION); } catch {}
  }

  function migrateLegacy() {
    // If old snippet stored "chatternet.me" but no proper session, upgrade it
    const sess = load(LS.SESSION, null);
    if (sess && sess.user) return;
    const legacy = load(LS.LEGACY_ME, null);
    if (legacy && legacy.email) {
      const accs = load(LS.ACC, {});
      accs[legacy.email] = { id: legacy.id, email: legacy.email, name: legacy.name || '' };
      save(LS.ACC, accs);
      save(LS.SESSION, { user: legacy.email, id: legacy.id });
    }
  }
  migrateLegacy();

  // --- public API ---
  const Auth = {
    isLoggedIn() {
      const s = load(LS.SESSION, null);
      const accs = load(LS.ACC, {});
      return !!(s && accs && accs[s.user]);
    },

    current() {
      const s = load(LS.SESSION, null);
      if (!s) return null;
      const accs = load(LS.ACC, {});
      const entry = accs[s.user];
      if (!entry) return null;
      return { id: s.id || entry.id || null, email: entry.email, name: entry.name || 'Me' };
    },

    require(opts) {
      const redirect = (opts && opts.redirect) || 'login.html';
      if (this.isLoggedIn()) return true;
      const rt = location.pathname + location.search + location.hash;
      location.href = `${redirect}?return=${encodeURIComponent(rt)}`;
      return false;
    },

    async signup({ email, password, name }) {
      email = String(email || '').trim().toLowerCase();
      if (!email || !password) throw new Error('Email & password required');
      const user = await signup(email, password, name || '');
      if (!user || !user.email) throw new Error('Signup failed');
      setSession(user);
      return user;
    },

    async login({ email, password }) {
      email = String(email || '').trim().toLowerCase();
      if (!email || !password) throw new Error('Email & password required');
      let user = await login(email, password);
      if (!user || !user.email) {
        // fallback: find by email if API shape was unexpected
        const list = await getUsers();
        user = list.find(u => u.email === email) || null;
        if (!user) throw new Error('Invalid login');
      }
      setSession(user);
      return user;
    },

    logout() {
      clearSession();
      const rt = location.pathname + location.search + location.hash;
      location.href = `login.html?return=${encodeURIComponent(rt)}`;
    },

    // === the trio you asked for ===
    async ensureAccount() {
      // If logged in, just return current user
      const cur = this.current();
      if (cur && cur.id) {
        const u = await getUser(cur.id);
        if (u) return u;
      }

      // create (or reuse) a demo account
      const id = Math.floor(Math.random() * 1e9).toString(36);
      const email = `user${id}@demo.local`;
      const password = 'demo';
      const name = 'Me';

      try {
        const u = await signup(email, password, name);
        setSession(u);
        return u;
      } catch {
        const u = await login(email, password);
        setSession(u);
        return u;
      }
    },

    async getMe() {
      const cur = this.current();
      if (cur && cur.id) {
        const u = await getUser(cur.id);
        if (u) return u;
      }
      return await this.ensureAccount();
    },

    getMeId() {
      const c = this.current();
      return c && c.id ? c.id : '';
    }
  };

  // expose globally
  window.Auth = Auth;
})();
