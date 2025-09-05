/* public/auth.js
   Tiny front-end auth/session helper for Chatternet (localStorage only)
   Works with the headers already in your pages.
*/
(function () {
  const LS = {
    ACCOUNTS: 'ct_accounts_v2',       // { [email]: {email,password,displayName,avatar} }
    SESSION:  'ct_session_v1',        // { user: email }
    PROFILE:  'ct_profile_data_v1',   // { 'Me': { displayName, avatar } }
    USERS:    'ct_users_v3'           // [ {name:'Me', avatar: '...'}, ...]
  };

  const load = (k, f) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; }
    catch { return f; }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function hasAccount() {
    const accs = load(LS.ACCOUNTS, {});
    return !!Object.keys(accs).length;
  }

  function isLoggedIn() {
    const s = load(LS.SESSION, null);
    const accs = load(LS.ACCOUNTS, {});
    return !!(s && accs[s.user]);
  }

  function getSession() {
    return load(LS.SESSION, null);
  }

  function getAccounts() {
    return load(LS.ACCOUNTS, {});
  }

  function setSession(email) {
    save(LS.SESSION, { user: email });
    // Reflect display name/avatar into PROFILE['Me'] and ensure USERS contains 'Me'
    const acc = getAccounts()[email] || {};
    const profile = load(LS.PROFILE, {});
    profile['Me'] = profile['Me'] || {};
    if (acc.displayName && !profile['Me'].displayName) profile['Me'].displayName = acc.displayName;
    if (acc.avatar && !profile['Me'].avatar) profile['Me'].avatar = acc.avatar;
    save(LS.PROFILE, profile);

    let users = load(LS.USERS, null);
    if (!Array.isArray(users)) users = [];
    if (!users.find(u => u.name === 'Me')) {
      users.unshift({ name: 'Me', avatar: (profile['Me'] && profile['Me'].avatar) || `https://i.pravatar.cc/100?u=me` });
      save(LS.USERS, users);
    }
  }

  function clearSession() {
    localStorage.removeItem(LS.SESSION);
  }

  async function signup({ email, password, displayName = '' , avatar = '' }) {
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (!email || !password) throw new Error('Email and password required');

    const accs = getAccounts();
    if (accs[email]) throw new Error('Email already exists');

    accs[email] = { email, password, displayName, avatar };
    save(LS.ACCOUNTS, accs);

    // Set session and profile
    setSession(email);
    const prof = load(LS.PROFILE, {});
    prof['Me'] = prof['Me'] || {};
    if (displayName) prof['Me'].displayName = displayName;
    if (avatar) prof['Me'].avatar = avatar;
    save(LS.PROFILE, prof);

    return { ok: true };
  }

  async function login({ email, password }) {
    const accs = getAccounts();
    const acc = accs[String(email || '').toLowerCase()];
    if (!acc || acc.password !== String(password || '')) throw new Error('Invalid login');
    setSession(acc.email);
    return { ok: true };
  }

  function logout() {
    clearSession();
  }

  // Gate-keeper used by your pages’ headers
  function require(opts) {
    const redirect = (opts && opts.redirect) || 'settings.html?mode=login';
    if (isLoggedIn()) return true;
    if (!hasAccount()) { location.href = redirect; return false; }
    location.href = redirect; return false;
  }

  function currentAccount() {
    const s = getSession();
    if (!s) return null;
    return getAccounts()[s.user] || null;
  }

  window.Auth = {
    // guards
    require, isLoggedIn, hasAccount,
    // session
    getSession, currentAccount, logout,
    // operations
    signup, login
  };
})();
