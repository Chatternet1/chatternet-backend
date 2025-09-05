<script>
/* public/api.js */
window.API_BASE = 'https://chatternet-backend-1.onrender.com';  // ← your Render URL

window.Api = (() => {
  const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

  async function req(method, path, body) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok) {
      let msg = 'Request failed';
      try { const t = await r.json(); msg = t.error || JSON.stringify(t); } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  const get  = (p)      => req('GET',    p);
  const post = (p, b)   => req('POST',   p, b);
  const put  = (p, b)   => req('PUT',    p, b);
  const del  = (p)      => req('DELETE', p);

  return {
    // generic (used by your pages)
    get, post, put, del,

    // helpers
    health:   ()             => get('/api/health'),
    users:    {
      list: ()               => get('/api/users'),
      get:  (id)             => get('/api/users/' + encodeURIComponent(id)),
      put:  (id, patch)      => put('/api/users/' + encodeURIComponent(id), patch),
      signup: (email, password, name) => post('/api/signup', { email, password, name }),
      login:  (email, password)       => post('/api/login',  { email, password })
    },
    friends:  {
      list:    (userId)                 => get('/api/friends?userId=' + encodeURIComponent(userId)),
      request: (fromId, toId)           => post('/api/friends/request', { fromId, toId }),
      respond: (fromId, toId, action)   => post('/api/friends/respond', { fromId, toId, action })
    },
    messages: {
      list:   (userId, peerId)          => get('/api/messages?userId=' + encodeURIComponent(userId) + '&peerId=' + encodeURIComponent(peerId)),
      send:   (fromId, toId, text)      => post('/api/messages', { fromId, toId, text }),
      threads:(userId)                  => get('/api/threads/' + encodeURIComponent(userId))
    },
    posts:    {
      list:   ()                        => get('/api/posts'),
      create: (p)                       => post('/api/posts', p),
      remove: (id)                      => del('/api/posts/' + encodeURIComponent(id))
    },
    events:   {
      list:   ()                        => get('/api/events'),
      get:    (id)                      => get('/api/events/' + encodeURIComponent(id)),
      create: (ev)                      => post('/api/events', ev),
      update: (id, patch)               => put('/api/events/' + encodeURIComponent(id), patch),
      remove: (id)                      => del('/api/events/' + encodeURIComponent(id))
    }
  };
})();
</script>
