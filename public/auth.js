<script>
/* public/auth.js */
(function () {
  const LS = {
    ACC: 'ct_accounts_v2',
    SESSION: 'ct_session_v1'
  };

  function load(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  async function ensureBackendUser() {
    // Keep a simple local account with an email/password and store the server user
    let acc = load(LS.ACC, null);
    if (!acc) {
      acc = { email: 'me@demo.local', password: 'demo123', name: 'Me', user: null };
      save(LS.ACC, acc);
    }

    // Try login then signup if needed
    let user = null;
    try {
      const out = await Api.login(acc.email, acc.password);
      user = out.user;
    } catch {
      const out = await Api.signup(acc.email, acc.password, acc.name);
      user = out.user;
    }
    acc.user = user; save(LS.ACC, acc);
    save(LS.SESSION, { userId: user.id, at: Date.now() });
    return user;
  }

  async function getEchoBot() {
    const list = await Api.users.list();
    return list.find(u => u.email === 'bot@demo.test') || null;
  }

  window.Auth = {
    async getUser() {
      const acc = load(LS.ACC, null);
      return acc?.user || ensureBackendUser();
    },
    async ensureAccount() {
      return ensureBackendUser();
    },
    async getEchoBot() {
      return getEchoBot();
    }
  };
})();
</script>
