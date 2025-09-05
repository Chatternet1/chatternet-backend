<script>
/* public/auth.js */
window.Auth = (() => {
  const LSKEY = 'chatternet.me';

  async function ensureAccount() {
    let me = null;
    try { me = JSON.parse(localStorage.getItem(LSKEY) || 'null'); } catch {}
    if (me?.id) return me;

    // create a throwaway account
    const id = Math.floor(Math.random() * 1e9).toString(36);
    const email = `user${id}@demo.local`;
    const password = 'demo';
    const name = 'Me';

    try {
      const r = await Api.users.signup(email, password, name);
      me = r.user;
    } catch {
      const r = await Api.users.login(email, password);
      me = r.user;
    }
    localStorage.setItem(LSKEY, JSON.stringify(me));
    return me;
  }

  function getMeId() {
    try { const m = JSON.parse(localStorage.getItem(LSKEY) || 'null'); return m?.id || ''; } catch { return ''; }
  }

  async function getMe() {
    const id = getMeId();
    return id ? await Api.users.get(id) : await ensureAccount();
  }

  return { ensureAccount, getMe, getMeId };
})();
</script>
