<script>
// Force your backend base everywhere (absolute URL avoids proxy rewrites)
window.API_BASE = 'https://chatternet-backend-1.onrender.com/api';

// Safe join: base + endpoint (endpoint has NO leading slash)
window.apiJoin = function(base, endpoint){
  const b = String(base||'').replace(/\/+$/,'');
  let   e = String(endpoint||'').replace(/^\/+/, '');
  if (e.startsWith('api/')) e = e.slice(4);           // strip stray "api/"
  return b + '/' + e;
};

// Generic fetch with auto-fix for double /api
window.callAPI = async function(endpoint, opts={}){
  const url = apiJoin(window.API_BASE, endpoint);
  const r = await fetch(url, {
    headers: { 'Content-Type':'application/json', ...(opts.headers||{}) },
    ...opts
  });

  // If 404 and double /api, retry once with the fixed URL
  if (!r.ok && r.status === 404 && url.includes('/api/api/')) {
    const fixed = url.replace('/api/api/', '/api/');
    const r2 = await fetch(fixed, {
      headers: { 'Content-Type':'application/json', ...(opts.headers||{}) },
      ...opts
    });
    if (r2.ok) { try { return await r2.json(); } catch { return {}; } }
    const t2 = await r2.text().catch(()=> ''); throw new Error(t2 || ('HTTP '+r2.status));
  }

  if (!r.ok) { const t = await r.text().catch(()=> ''); throw new Error(t || ('HTTP '+r.status)); }
  try { return await r.json(); } catch { return {}; }
};
</script>
