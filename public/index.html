<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Chatternet — Home</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root{--brand:#3498db;--brand2:#2980b9;--bg:#f0f2f5;--card:#fff;--ink:#0f172a;--muted:#667085}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,Arial,sans-serif}
  .top{background:var(--brand);color:#fff;padding:14px 16px;font-weight:800}
  .page{max-width:900px;margin:18px auto;padding:0 12px 28px}
  .card{background:var(--card);border:1px solid rgba(0,0,0,.08);border-radius:14px;box-shadow:0 6px 16px rgba(0,0,0,.08);padding:16px;margin:12px 0}
  a.btn{display:inline-block;padding:12px 14px;border-radius:10px;border:1px solid #d7d7d7;background:#fff;text-decoration:none;margin:6px 8px 0 0}
  a.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
  .muted{color:var(--muted)}
  input,button{padding:10px;border:1px solid #d7d7d7;border-radius:10px;font-size:14px}
  button{background:var(--brand);color:#fff;cursor:pointer}
</style>
</head>
<body>
  <div class="top">Chatternet — Home</div>
  <div class="page">
    <div class="card">
      <div style="font-weight:800">Quick links</div>
      <div style="margin-top:8px">
        <a class="btn" href="messages.html">Open Messages</a>
        <a class="btn" href="/api/health" target="_blank">API Health (JSON)</a>
      </div>
    </div>

    <div class="card">
      <div style="font-weight:800;margin-bottom:6px">Who am I?</div>
      <div class="muted">Enter any email + name. If the email doesn’t exist yet, this page will create it on the backend.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <input id="email" placeholder="your@email.com" style="flex:2;min-width:240px">
        <input id="name"  placeholder="Display name (optional)" style="flex:1;min-width:180px">
        <button id="saveWho">Save</button>
      </div>
      <div id="who" class="muted" style="margin-top:8px"></div>
    </div>

    <div class="card">
      <div style="font-weight:800">Status</div>
      <pre id="status" style="white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace"></pre>
    </div>
  </div>

<script>
const LS={SESSION:'ct_session_v1',PROFILE:'ct_profile_data_v1'};
const load=(k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

function currentEmail(){ const s=load(LS.SESSION,null); return s&&s.user ? s.user : null; }
function currentName(){ const p=load(LS.PROFILE,{})['Me']; return p&&p.displayName ? p.displayName : 'Me'; }

async function ensureBackendUser(email, name){
  const res=await fetch('/api/users'); const users=await res.json();
  let u=(users||[]).find(x=>x.email===email);
  if(u) return u;
  const up=await fetch('/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'local',name})});
  const j=await up.json(); if(j&&j.user) return j.user;
  throw new Error('Signup failed: '+(j.error||'unknown'));
}

async function ping(){
  try{
    const r=await fetch('/api/health'); const j=await r.json();
    document.getElementById('status').textContent='OK '+JSON.stringify(j,null,2);
  }catch(e){
    document.getElementById('status').textContent='API not reachable.\n'+e;
  }
}

document.getElementById('saveWho').onclick=()=>{
  const email=document.getElementById('email').value.trim();
  const name=document.getElementById('name').value.trim()||'Me';
  if(!email) return alert('Enter an email.');
  save(LS.SESSION,{user:email});
  const prof=load(LS.PROFILE,{}); prof['Me']=Object.assign({},prof['Me']||{}, {displayName:name}); save(LS.PROFILE,prof);
  document.getElementById('who').textContent=`Saved: ${name} <${email}>`;
  ensureBackendUser(email,name).catch(()=>{});
};

(function boot(){
  const email=currentEmail()||'me@local.test';
  document.getElementById('email').value=email;
  document.getElementById('name').value=currentName();
  document.getElementById('who').textContent=`Using ${currentName()} <${email}>`;
  ping();
})();
</script>
</body>
</html>
