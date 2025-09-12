// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;
const FRONTEND = process.env.CT_FRONTEND_ORIGIN || '*';

// ------------ middleware
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        FRONTEND === '*' ||
        origin === FRONTEND ||
        /\.onrender\.com$/.test(new URL(origin).hostname)
      ) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  })
);

// ------------ health
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// ------------ database (optional but auto-detects)
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      /render\.com|amazonaws\.com/.test(process.env.DATABASE_URL) ?
        { rejectUnauthorized: false } : false,
  });

  app.get('/api/db/health', async (req, res) => {
    try {
      const r = await pool.query('select 1 as up');
      res.json({ ok: true, up: r.rows[0].up === 1 });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

// ------------ static files (your frontend pulls messenger/common from here)
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '1h', etag: true }));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '5m', etag: true }));

// ------------ root info page
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Chatternet backend</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:24px;line-height:1.55}</style>
</head><body>
<h1>Chatternet backend ✓</h1>
<p>Running on <code>PORT ${PORT}</code>.</p>
<ul>
  <li><a href="/healthz">/healthz</a></li>
  <li><a href="/api/health">/api/health</a></li>
  <li><a href="/api/db/health">/api/db/health</a> (needs DATABASE_URL)</li>
  <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
</ul>
</body></html>`);
});

// ------------ 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ------------ start
app.listen(PORT, () => {
  console.log(`Chatternet backend listening on :${PORT}`);
});
