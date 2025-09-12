// server.js — Chatternet backend (with optional Postgres + CORS)
// --------------------------------------------------------------

const path = require('path');
const express = require('express');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------- Minimal CORS (allow your site origin via env) ----------
const ALLOW = new Set(
  [
    process.env.CT_FRONTEND_ORIGIN,   // e.g. https://www.chatterfriends-movies.com
    process.env.CT_FRONTEND_ORIGIN_2, // optional 2nd origin
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5500'
  ].filter(Boolean)
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOW.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- Health ----------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) =>
  res.json({ ok: true, time: new Date().toISOString(), uptime: process.uptime() })
);

// ---------- Static ----------
const ASSETS_DIR = path.join(__dirname, 'assets');
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use('/assets', express.static(ASSETS_DIR, { maxAge: '5m' }));
app.use(express.static(PUBLIC_DIR, { maxAge: '5m' }));

// ---------- Optional Postgres (only if DATABASE_URL is set) ----------
let pool = null;
const DB_URL = process.env.DATABASE_URL || '';
if (DB_URL) {
  try {
    const { Pool } = require('pg');
    // Render DB usually requires SSL; both forms below are fine.
    const ssl =
      /sslmode=require/i.test(DB_URL)
        ? undefined
        : { rejectUnauthorized: false };

    pool = new Pool({ connectionString: DB_URL, ssl });
    // quick connection test on boot (non-fatal)
    pool.query('SELECT 1').then(
      () => console.log('[db] connected'),
      (e) => console.warn('[db] connect failed (will retry on requests):', e.message)
    );
  } catch (e) {
    console.warn('[db] pg module not installed — skipping DB:', e.message);
  }
}

app.get('/api/db/health', async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'DATABASE_URL not set or pg not installed' });
  try {
    const r = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Root ----------
app.get('/', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      const port = process.env.PORT || 10000;
      res
        .type('html')
        .status(200)
        .send(`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Chatternet backend ✓</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:40px} a{color:#2563eb;text-decoration:none}</style>
</head><body>
<h1>Chatternet backend ✓</h1>
<p>Running on <code>PORT ${port}</code>.</p>
<ul>
  <li><a href="/healthz">/healthz</a></li>
  <li><a href="/api/health">/api/health</a></li>
  <li><a href="/api/db/health">/api/db/health</a> (needs <code>DATABASE_URL</code>)</li>
  <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
</ul>
</body></html>`);
    }
  });
});

// ---------- 404 / errors ----------
app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found', path: req.originalUrl }));
app.use((err, req, res, next) => {
  console.error('[server] error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// ---------- Start ----------
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`[server] listening on http://${HOST}:${PORT}`));
