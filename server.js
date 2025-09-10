// Chatternet backend – simple Express server
// Serves /public pages, /assets (messenger/common), and small utility APIs.

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();

// ---------- Basics ----------
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

// Helpful cache headers for static files
const staticOptsAssets = { etag: true, lastModified: true, maxAge: '1h', fallthrough: true };
const staticOptsPublic = { etag: true, lastModified: true, maxAge: '1m', fallthrough: true };

// Serve assets (e.g., /assets/messenger.js)
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptsAssets));

// Serve public pages (e.g., /public/settings.html mapped at /settings.html)
app.use('/', express.static(path.join(__dirname, 'public'), staticOptsPublic));

// ---------- Tiny APIs ----------
// Health check
app.get(['/ping','/healthz'], (req, res) => {
  res.json({
    ok: true,
    service: 'chatternet-backend',
    time: new Date().toISOString(),
    node: process.version
  });
});

// Diagnostics (lightweight, safe to expose)
app.get('/api/diagnostics', (req, res) => {
  // Minimal info; no secrets
  const files = [];
  try {
    const pub = path.join(__dirname, 'public');
    fs.readdirSync(pub).forEach(f => files.push(f));
  } catch {}
  res.json({
    ok: true,
    env: {
      PORT: process.env.PORT || null,
    },
    pages: files,
    assets: ['common.js','messenger.js']
  });
});

// Simple echo endpoint (handy for testing from the front-end)
app.post('/api/echo', (req, res) => {
  const { text = '' } = req.body || {};
  res.json({ ok: true, echo: String(text), time: new Date().toISOString() });
});

// ---------- HTML convenience routes (optional) ----------
const htmlFiles = [
  'feed.html','friends.html','groups.html','profile.html','settings.html','media.html','messages.html'
];
htmlFiles.forEach(name => {
  app.get('/' + name, (req, res, next) => {
    const fp = path.join(__dirname, 'public', name);
    if (fs.existsSync(fp)) return res.sendFile(fp);
    next();
  });
});

// ---------- Fallback ----------
app.use((req, res, next) => {
  // If request looks like an html page but not found, show a helpful 404.
  if (req.accepts('html')) {
    return res
      .status(404)
      .send(
        `<!doctype html><meta charset="utf-8"/>
         <title>Not Found</title>
         <style>body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#0f172a;background:#f5f7fb}
         .card{background:#fff;border:1px solid #e6eaf2;border-radius:12px;padding:16px;max-width:700px}
         a{color:#2563eb;text-decoration:none}</style>
         <div class="card">
           <h2>404 — Page not found</h2>
           <p>We couldn't find <code>${req.path}</code>.</p>
           <p>Try one of these pages:</p>
           <ul>${htmlFiles.map(f=>`<li><a href="/${f}">${f}</a></li>`).join('')}</ul>
           <p>Health: <a href="/ping">/ping</a> • Diagnostics: <a href="/api/diagnostics">/api/diagnostics</a></p>
         </div>`
      );
  }
  next();
});

// ---------- Start ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/ping`);
});
