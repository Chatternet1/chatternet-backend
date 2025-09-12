// server.js — Chatternet backend (users + sessions + profiles + settings)
// ----------------------------------------------------------------------
// This file is a full Express server ready for Render. It exposes:
//  - GET  /                  friendly index page
//  - GET  /healthz           liveness
//  - GET  /api/health        JSON health
//  - GET  /api/db/health     DB ping (requires DATABASE_URL)
//  - POST /api/auth/register {email,password,displayName}
//  - POST /api/auth/login    {email,password}
//  - POST /api/auth/logout
//  - GET  /api/auth/me       returns session user
//  - GET  /api/settings
//  - PATCH /api/settings/profile        {displayName,bio,avatarUrl,coverUrl,actor}
//  - PATCH /api/settings/privacy        { ...free JSON... }
//  - PATCH /api/settings/notifications  { ...free JSON... }
// Serves /assets/* from local ./assets directory (your messenger/common files)

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { v4: uuid } = require('uuid');

// ---------- ENV ----------
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

// IMPORTANT: set this to your front-end origin (Weebly/Render/Custom domain)
const CT_FRONTEND_ORIGIN =
  (process.env.CT_FRONTEND_ORIGIN || 'https://www.chatterfriends-movies.com').replace(/\/+$/, '');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

// DATABASE_URL must be set in Render if you want DB-backed auth/settings
const DATABASE_URL = process.env.DATABASE_URL || '';

const app = express();
app.set('trust proxy', 1); // secure cookies behind Render proxy

// ---------- DB ----------
let pool = null;
if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Render Postgres usually does SSL
    ssl: (process.env.PGSSLMODE || '').toLowerCase() === 'disable'
      ? false
      : { rejectUnauthorized: false }
  });
}

// Create core tables if needed
async function ensureSchema() {
  if (!pool) return;

  // users (single table for account + profile basics)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      bio           TEXT DEFAULT '',
      avatar_url    TEXT DEFAULT '',
      cover_url     TEXT DEFAULT '',
      actor         TEXT DEFAULT 'Me',
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // settings (jsonb blobs)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      privacy       JSONB NOT NULL DEFAULT '{}'::jsonb,
      notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
      security      JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // connect-pg-simple session table (auto-create)
  // The store below sets createTableIfMissing: true, so nothing to do here
}

// ---------- MIDDLEWARE ----------
app.use(express.json({ limit: '1mb' }));

// CORS for browser clients
app.use(
  cors({
    origin: [CT_FRONTEND_ORIGIN],
    credentials: true,
  })
);

// Session (cookie) + Postgres store
let store;
if (pool) {
  store = new PgStore({
    pool,
    tableName: 'session',
    createTableIfMissing: true
  });
}

app.use(
  session({
    name: 'ct.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: store || undefined, // if no DB, sessions will be in-memory (dev only)
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true on Render HTTPS
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    }
  })
);

// Serve assets like /assets/messenger.js
const assetsDir = path.join(__dirname, 'assets');
if (fs.existsSync(assetsDir)) {
  app.use('/assets', express.static(assetsDir, { fallthrough: true }));
}

// ---------- SMALL HELPERS ----------
function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

function authRequired(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
  }
  next();
}

async function getUserById(id) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function getUserByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] || null;
}

async function ensureSettingsRow(userId) {
  await pool.query(
    `INSERT INTO user_settings (user_id, privacy, notifications, security)
     VALUES ($1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function getSettings(userId) {
  const { rows } = await pool.query(`SELECT * FROM user_settings WHERE user_id = $1`, [userId]);
  return rows[0] || { user_id: userId, privacy: {}, notifications: {}, security: {} };
}

// ---------- ROUTES ----------

// Friendly index page
app.get('/', (req, res) => {
  const hasDb = !!DATABASE_URL;
  res.type('html').send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Chatternet backend ✓</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font:16px/1.4 system-ui,Segoe UI,Arial,sans-serif;padding:24px}
  a{color:#0059c9;text-decoration:none}
  a:hover{text-decoration:underline}
  code{background:#f3f4f6;border:1px solid #e5e7eb;padding:1px 6px;border-radius:6px}
</style>
</head>
<body>
  <h1>Chatternet backend ✓</h1>
  <p>Running on <code>PORT ${PORT}</code>.</p>
  <ul>
    <li><a href="/healthz">/healthz</a></li>
    <li><a href="/api/health">/api/health</a></li>
    <li><a href="/api/db/health">/api/db/health</a> ${hasDb ? '' : '(needs DATABASE_URL)'}</li>
    <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
  </ul>
</body>
</html>`);
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'chatternet-backend', time: new Date().toISOString() }));

app.get('/api/db/health', async (_req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  try {
    const { rows } = await pool.query('SELECT NOW() as now');
    return res.json({ ok: true, now: rows[0].now });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// ---- Auth ----
app.post('/api/auth/register', async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  const { email, password, displayName } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'EMAIL_AND_PASSWORD_REQUIRED' });

  try {
    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ ok: false, error: 'EMAIL_IN_USE' });

    const id = uuid();
    const hash = await bcrypt.hash(String(password), 10);

    const name = (displayName || email.split('@')[0] || 'Me').slice(0, 64);

    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)`,
      [id, email.toLowerCase(), hash, name]
    );
    await ensureSettingsRow(id);

    // sign in
    req.session.userId = id;

    const user = await getUserById(id);
    res.json({ ok: true, user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'EMAIL_AND_PASSWORD_REQUIRED' });

  try {
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

    req.session.userId = user.id;
    res.json({ ok: true, user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  if (!req.session || !req.session.userId) return res.json({ ok: true, user: null });
  const user = await getUserById(req.session.userId);
  res.json({ ok: true, user: safeUser(user) });
});

// ---- Settings API ----
app.get('/api/settings', authRequired, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  try {
    const user = await getUserById(req.session.userId);
    const settings = await getSettings(req.session.userId);
    res.json({
      ok: true,
      profile: {
        displayName: user.display_name,
        bio: user.bio,
        avatarUrl: user.avatar_url,
        coverUrl: user.cover_url,
        actor: user.actor
      },
      privacy: settings.privacy || {},
      notifications: settings.notifications || {},
      security: settings.security || {}
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.patch('/api/settings/profile', authRequired, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  const { displayName, bio, avatarUrl, coverUrl, actor } = req.body || {};
  try {
    await pool.query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           bio          = COALESCE($3, bio),
           avatar_url   = COALESCE($4, avatar_url),
           cover_url    = COALESCE($5, cover_url),
           actor        = COALESCE($6, actor)
       WHERE id = $1`,
      [req.session.userId, displayName, bio, avatarUrl, coverUrl, actor]
    );
    const user = await getUserById(req.session.userId);
    res.json({ ok: true, profile: {
      displayName: user.display_name,
      bio: user.bio,
      avatarUrl: user.avatar_url,
      coverUrl: user.cover_url,
      actor: user.actor
    }});
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.patch('/api/settings/privacy', authRequired, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  const incoming = req.body || {};
  try {
    await ensureSettingsRow(req.session.userId);
    await pool.query(
      `UPDATE user_settings
       SET privacy = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [req.session.userId, JSON.stringify(incoming)]
    );
    res.json({ ok: true, privacy: incoming });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.patch('/api/settings/notifications', authRequired, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  const incoming = req.body || {};
  try {
    await ensureSettingsRow(req.session.userId);
    await pool.query(
      `UPDATE user_settings
       SET notifications = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [req.session.userId, JSON.stringify(incoming)]
    );
    res.json({ ok: true, notifications: incoming });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Example secure endpoint that front-end can call to resolve current profile quickly
app.get('/api/profiles/me', authRequired, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  const user = await getUserById(req.session.userId);
  res.json({ ok: true, user: safeUser(user) });
});

// ---------- BOOT ----------
(async function boot(){
  try {
    if (pool) await ensureSchema();
  } catch (e) {
    console.error('ensureSchema error:', e);
  }
  app.listen(PORT, () => {
    console.log(`Chatternet backend listening on ${PORT} (origin ${CT_FRONTEND_ORIGIN})`);
  });
})();
