<script>
// ---- Minimal front-end "session" + backend user sync ----
const LS = {
  SESSION: 'ct_session_v1',
  BACKEND_USER: 'ct_backend_user_v1'
};

// Local session: always treat the current user as "Me"
function sessionGet(){ try{ return JSON.parse(localStorage.getItem(LS.SESSION)) || { user: 'Me' }; }catch{ return {user:'Me'}; } }
function sessionSet(s){ localStorage.setItem(LS.SESSION, JSON.stringify(s)); }

// Ensure "Me" exists on the backend and remember its id
async function ensureBackendUser(){
  try{
    const cached = JSON.parse(localStorage.getItem(LS.BACKEND_USER)||'null');
    if (cached && cached.id) return cached;

    // We create (or log in) a deterministic demo account so pages stay in sync
    const email = 'me@demo.local';     // your demo email
    const password = 'demo';           // simple demo password
    let user = null;

    // Try login
    try {
      const out = await Api.post('/login', { email, password });
      user = out.user;
    } catch {
      // Not found -> signup
      const out = await Api.post('/signup', { email, password, name:'Me' });
      user = out.user;
    }
    const info = { id:user.id, email:user.email, name:user.name || 'Me' };
    localStorage.setItem(LS.BACKEND_USER, JSON.stringify(info));
    sessionSet({user:'Me'});
    return info;
  }catch(e){
    alert('Cannot initialize user on backend: ' + e.message);
    throw e;
  }
}

// Fetch fresh copy of our backend user
async function getMyUser(){
  const u = JSON.parse(localStorage.getItem(LS.BACKEND_USER)||'null');
  if (!u || !u.id) return ensureBackendUser();
  try { return await Api.get('/users/'+encodeURIComponent(u.id)); }
  catch { return ensureBackendUser(); }
}

// Small helper to find the echo bot
async function getEchoBot(){
  const list = await Api.get('/users');
  return list.find(u=>u.bot) || null;
}

window.Auth = { ensureBackendUser, getMyUser, getEchoBot };
</script>
