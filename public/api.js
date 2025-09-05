<script>
// One backend for everything (served by the same Node app)
window.API_BASE = '/api';

// Basic JSON helpers
async function j(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try { const e = await res.json(); msg = e.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
window.Api = {
  get: (p)=>j('GET', p),
  post:(p,b)=>j('POST',p,b),
  put: (p,b)=>j('PUT', p,b),
  del: (p)=>j('DELETE', p),
};
</script>
