// server.js — Chatternet backend (Postgres sessions enforced in production)

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { v4: uuid } = require('uuid');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const NODE_ENV = process.env.NODE_ENV || 'production';
const PORT = Number(process.env.PORT || 10000);

// Your website origin (Weebly/custom). Used for CORS.
const CT_FRONTEND_ORIGIN = (process.env.CT_FRONTEND_ORIGIN || 'https://www.chatterfriends-movies.com').replace(/\/+$/, '');
// Long random string
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
// Render Postgres Internal URL
const DATABASE_URL = process.env.DATABASE_URL || '';

const IS_PROD = NODE_ENV === 'production';
const IS_CROSS_SITE = true; // frontend is on different origin (Weebly/Render site)

// --------- DB POOL (required in production) ----------
if (IS_PROD && !DATABASE_URL) {
  // Hard fail to avoid MemoryStore in prod
  throw new Error('DATABASE_URL is required in production for Postgres session storage.');
}

let pool = null;
if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: (process.env.PGSSLMODE || '').toLowerCase() === 'disable'
      ? false
      : { rejectUnauthorized: false }
  });
}

// Ensure core tables
async function ensureSchema() {
  if (!pool) return;

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      privacy       JSONB NOT NULL DEFAULT '{}'::jsonb,
      notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
      security      JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

// --------- MIDDLEWARE ----------
app.use(express.json({ limit: '1mb' }));

// CORS (credentials on)
const ALLOW = new Set([CT_FRONTEND_ORIGIN, 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5500'].filter(Boolean));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      cb(null, ALLOW.has(origin));
    },
    credentials: true
  })
);

// Sessions: ALWAYS Postgres in production; Memory only allowed in dev
let store;
if (pool) {
  store = new PgStore({
    pool,
    tableName: 'session',
    createTableIfMissing: true
  });
  console.log('Session store: Postgres');
} else {
  console.warn('Session store: Memory (development only)');
}

app.use(
  session({
    name: 'ct.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: store, // undefined only if no DB (dev)
    cookie: {
      httpOnly: true,
      secure: IS_PROD,                      // Render is HTTPS
      sameSite: IS_CROSS_SITE ? 'none' : 'lax', // cross-site cookie for different front-end origin
      maxAge: 1000 * 60 * 60 * 24 * 30      // 30 days
    }
  })
);

// Serve /assets/*
const assetsDir = path.join(__dirname, 'assets');
if (fs.existsSync(assetsDir)) {
  app.use('/assets', express.static(assetsDir, { maxAge: '5m' }));
}

// --------- HELPERS ----------
function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}
function authRequired(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
  next();
}
async function getUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
  return rows[0] || null;
}
async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [String(email).toLowerCase()]);
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
  const { rows } = await pool.query('SELECT * FROM user_settings WHERE user_id=$1', [userId]);
  return rows[0] || { user_id: userId, privacy: {}, notifications: {}, security: {} };
}

// --------- ROUTES ----------
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Chatternet backend ✓</title>
<style>body{font:16px/1.5 system-ui,Segoe UI,Arial,sans-serif;padding:32px}a{color:#2563eb;text-decoration:none}</style>
</head><body>
<h1>Chatternet backend ✓</h1>
<ul>
  <li><a href="/healthz">/healthz</a></li>
  <li><a href="/api/health">/api/health</a></li>
  <li><a href="/api/db/health">/api/db/health</a></li>
  <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
</ul>
</body></html>`);
});

app.get('/healthz', (_req, res) => res.type('text').send('ok'));
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/db/health', async (_req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, now: rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// --- Auth ---
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
       VALUES ($1,$2,$3,$4)`,
      [id, String(email).toLowerCase(), hash, name]
    );
    await ensureSettingsRow(id);
    req.session.userId = id;

    res.json({ ok: true, user: safeUser(await getUserById(id)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'NO_DATABASE_URL' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'EMAIL_AND_PASSWORD_REQUIRED' });

  try {
    const u = await getUserByEmail(email);
    if (!u) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

    const ok = await bcrypt.compare(String(password), u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

    req.session.userId = u.id;
    res.json({ ok: true, user: safeUser(u) });
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
  res.json({ ok: true, user: safeUser(await getUserById(req.session.userId)) });
});

// --- Settings ---
app.get('/api/settings', authRequired, async (req, res) => {
  const u = await getUserById(req.session.userId);
  const s = await getSettings(req.session.userId);
  res.json({
    ok: true,
    profile: {
      displayName: u.display_name,
      bio: u.bio,
      avatarUrl: u.avatar_url,
      coverUrl: u.cover_url,
      actor: u.actor
    },
    privacy: s.privacy || {},
    notifications: s.notifications || {},
    security: s.security || {}
  });
});

app.patch('/api/settings/profile', authRequired, async (req, res) => {
  const { displayName, bio, avatarUrl, coverUrl, actor } = req.body || {};
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
  const u = await getUserById(req.session.userId);
  res.json({ ok: true, profile: {
    displayName: u.display_name,
    bio: u.bio,
    avatarUrl: u.avatar_url,
    coverUrl: u.cover_url,
    actor: u.actor
  }});
});

app.patch('/api/settings/privacy', authRequired, async (req, res) => {
  await ensureSettingsRow(req.session.userId);
  await pool.query(
    `UPDATE user_settings SET privacy=$2, updated_at=NOW() WHERE user_id=$1`,
    [req.session.userId, JSON.stringify(req.body || {})]
  );
  res.json({ ok: true, privacy: req.body || {} });
});

app.patch('/api/settings/notifications', authRequired, async (req, res) => {
  await ensureSettingsRow(req.session.userId);
  await pool.query(
    `UPDATE user_settings SET notifications=$2, updated_at=NOW() WHERE user_id=$1`,
    [req.session.userId, JSON.stringify(req.body || {})]
  );
  res.json({ ok: true, notifications: req.body || {} });
});

// --------- BOOT ----------
(async () => {
  try {
    if (pool) {
      await pool.query('SELECT 1'); // sanity
      console.log('[db] connected');
      await ensureSchema();
    }
  } catch (e) {
    console.error('[db] startup error:', e);
    if (IS_PROD) process.exit(1); // enforce DB in prod
  }

  app.listen(PORT, () => console.log(`Chatternet backend listening on ${PORT}`));
})();
