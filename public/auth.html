<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Chatternet — Sign in</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root{ --brand:#3498db; --ink:#0f172a; --bg:#f5f7fb; --card:#fff; }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:'Segoe UI',Arial,sans-serif}
  .wrap{max-width:960px;margin:30px auto;padding:0 14px}
  .card{background:var(--card);border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:16px}
  .tabs{display:flex;gap:8px;margin-bottom:10px}
  .tab{padding:8px 12px;border:1px solid #dfe3f0;border-radius:999px;background:#fff;font-weight:700;cursor:pointer}
  .tab.active{background:#e9f2ff;border-color:#cfe1ff}
  input,button{font:inherit} input{width:100%;padding:10px;border:1px solid #d7d7d7;border-radius:10px}
  .btn{padding:10px 14px;border:1px solid #d7d7d7;border-radius:10px;background:#fff;cursor:pointer}
  .btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  .row>*{flex:1 1 auto}
  .hint{font-size:12px;color:#475569}
  #toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border-radius:10px;padding:10px 14px;opacity:0;transition:opacity .2s}
  #toast.show{opacity:1}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="tabs">
      <div class="tab active" data-pane="login">Log in</div>
      <div class="tab" data-pane="signup">Sign up</div>
      <div class="tab" data-pane="verify">Verify email</div>
      <div class="tab" data-pane="forgot">Forgot password</div>
    </div>

    <!-- login -->
    <section id="pane-login">
      <div class="row">
        <input id="liUser" placeholder="Handle or email">
        <input id="liPass" type="password" placeholder="Password">
      </div>
      <div class="row" style="margin-top:8px;justify-content:flex-end">
        <button class="btn primary" id="btnLogin">Log in</button>
      </div>
    </section>

    <!-- signup -->
    <section id="pane-signup" style="display:none">
      <div class="row">
        <input id="suHandle" placeholder="Handle (letters/numbers/underscore)">
        <input id="suEmail" type="email" placeholder="Email">
      </div>
      <div class="row" style="margin-top:8px">
        <input id="suPass" type="password" placeholder="Password (8+ chars)">
      </div>
      <div class="row" style="margin-top:8px;justify-content:flex-end">
        <button class="btn primary" id="btnSignup">Create account</button>
      </div>
      <div class="hint" id="verifyHint" style="margin-top:6px"></div>
    </section>

    <!-- verify -->
    <section id="pane-verify" style="display:none">
      <div class="row">
        <input id="veCode" placeholder="Verification code (6 chars)">
      </div>
      <div class="row" style="margin-top:8px;justify-content:flex-end">
        <button class="btn primary" id="btnVerify">Verify</button>
      </div>
      <div class="hint">If you just signed up, the demo API returns the code to you (in real life this would be emailed).</div>
    </section>

    <!-- forgot -->
    <section id="pane-forgot" style="display:none">
      <div class="row">
        <input id="fgEmail" type="email" placeholder="Your account email">
      </div>
      <div class="row" style="margin-top:8px;justify-content:flex-end">
        <button class="btn" id="btnSendReset">Send reset code</button>
      </div>
      <hr>
      <div class="row">
        <input id="fgCode" placeholder="Reset code">
        <input id="fgNew" type="password" placeholder="New password (8+)">
      </div>
      <div class="row" style="margin-top:8px;justify-content:flex-end">
        <button class="btn primary" id="btnApplyReset">Apply reset</button>
      </div>
    </section>
  </div>
</div>

<div id="toast"></div>

<script>
/* simple toast */
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.className='';void t.offsetWidth;t.className='show';setTimeout(()=>t.className='',1200);}

/* backend base (same logic as common.js) */
(function(){ let base=localStorage.getItem('ct_api_base')||window.CT_API_BASE||''; if(!base){ const guess=location.origin.replace(/\/+$/,''); base=guess.includes('localhost')? 'http://localhost:8080' : guess; localStorage.setItem('ct_api_base',base);} window.CT_API_BASE=base;})();

async function api(path,opts={}){
  const res = await fetch((window.CT_API_BASE||'').replace(/\/+$/,'') + path, {
    credentials: 'include',
    headers: { 'Content-Type':'application/json', ...(opts.headers||{}) },
    ...opts
  });
  const text = await res.text();
  let json = {}; try{ json = text? JSON.parse(text):{}; }catch{ json = { raw:text }; }
  if(!res.ok) throw new Error(json.error||res.statusText);
  return json;
}

/* tabs */
document.querySelector('.tabs').addEventListener('click',e=>{
  const tab=e.target.closest('.tab'); if(!tab) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t===tab));
  const id=tab.dataset.pane;
  ['login','signup','verify','forgot'].forEach(p=>{ document.getElementById('pane-'+p).style.display = (p===id)?'block':'none'; });
});

/* actions */
document.getElementById('btnSignup').onclick = async ()=>{
  try{
    const r = await api('/api/auth/register', { method:'POST', body: JSON.stringify({
      handle: document.getElementById('suHandle').value.trim(),
      email:  document.getElementById('suEmail').value.trim(),
      password: document.getElementById('suPass').value
    })});
    document.getElementById('verifyHint').textContent = 'Your verification code (demo): ' + (r.verify_code||'(check email)');
    toast('Account created — verify your email');
  }catch(e){ alert(e.message); }
};
document.getElementById('btnVerify').onclick = async ()=>{
  try{
    await api('/api/auth/verify-email', { method:'POST', body: JSON.stringify({ code: document.getElementById('veCode').value.trim() })});
    toast('Email verified');
  }catch(e){ alert(e.message); }
};
document.getElementById('btnLogin').onclick = async ()=>{
  try{
    await api('/api/auth/login', { method:'POST', body: JSON.stringify({
      handleOrEmail: document.getElementById('liUser').value.trim(),
      password: document.getElementById('liPass').value
    })});
    toast('Welcome back'); setTimeout(()=>location.href='feed.html',500);
  }catch(e){ alert(e.message); }
};
document.getElementById('btnSendReset').onclick = async ()=>{
  try{
    const r = await api('/api/auth/send-reset', { method:'POST', body: JSON.stringify({ email: document.getElementById('fgEmail').value.trim() })});
    toast('Reset sent (demo code returned in response console)'); console.log('Reset code', r.reset_code);
  }catch(e){ alert(e.message); }
};
document.getElementById('btnApplyReset').onclick = async ()=>{
  try{
    await api('/api/auth/apply-reset', { method:'POST', body: JSON.stringify({
      email: document.getElementById('fgEmail').value.trim(),
      code:  document.getElementById('fgCode').value.trim(),
      newPassword: document.getElementById('fgNew').value
    })});
    toast('Password updated — log in now');
  }catch(e){ alert(e.message); }
};
</script>
</body>
</html>
