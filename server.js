// server.js — Chatternet Core API (Express + Postgres + Secure Cookie JWT)
// Works on Render. Fully CORS’d to your frontends. Provides real accounts,
// profiles, friends, posts, comments, likes, notifications.
//
// Node 18+ required (Render uses 24.x on your service).

'use strict';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

// ---------- Config ----------
const {
  PORT = 10000,
  DATABASE_URL,
  JWT_SECRET = 'please-change-me',
  CT_FRONTEND_ORIGIN = '',
  RENDER = 'true',
} = process.env;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL missing. Add it in Render → Environment.');
  process.exit(1);
}

// Allowed origins: comma-separated list
const ORIGINS = CT_FRONTEND_ORIGIN.split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// CORS (credentials for cookies)
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin (no Origin header) and explicit frontends
      if (!origin || ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS: ' + origin));
    },
    credentials: true,
  })
);

// ---------- DB ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render PG
});
const q = (text, params) => pool.query(text, params);

// ---------- Helpers ----------
const COOKIE_NAME = 'ct_jwt';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,                 // Render uses HTTPS
  sameSite: 'none',             // allow cross-site cookies (Weebly/custom)
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function authRequired(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Unauthenticated' });
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

function pick(o, keys) {
  const out = {};
  keys.forEach(k => (out[k] = o[k]));
  return out;
}

// ---------- Routes: Health ----------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---------- Routes: Auth ----------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email & password required' });

    const emailLc = String(email).trim().toLowerCase();
    const existing = await q('SELECT id FROM users WHERE email=$1', [emailLc]);
    if (existing.rowCount) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 12);
    const dn = (displayName || 'Me').slice(0, 80);

    const ins = await q(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1,$2,$3) RETURNING id, display_name, avatar_url, cover_url, bio, created_at`,
      [emailLc, hash, dn]
    );
    const user = ins.rows[0];

    const token = signToken({ id: user.id, email: emailLc });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ me: { id: user.id, email: emailLc, displayName: user.display_name } });
  } catch (e) {
    console.error('register', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email & password required' });

    const emailLc = String(email).trim().toLowerCase();
    const r = await q('SELECT id, password_hash, display_name FROM users WHERE email=$1', [emailLc]);
    if (!r.rowCount) return res.status(401).json({ error: 'Invalid credentials' });

    const u = r.rows[0];
    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: u.id, email: emailLc });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ me: { id: u.id, email: emailLc, displayName: u.display_name } });
  } catch (e) {
    console.error('login', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 });
  res.json({ ok: true });
});

app.get('/api/me', authRequired, async (req, res) => {
  const r = await q(
    'SELECT id, email, display_name, avatar_url, cover_url, bio, created_at FROM users WHERE id=$1',
    [req.user.id]
  );
  res.json({ me: r.rows[0] || null });
});

// ---------- Routes: Profile ----------
app.put('/api/profile', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = pick(body, ['displayName', 'avatarUrl', 'coverUrl', 'bio']);
    const dn = (allowed.displayName || '').slice(0, 80);
    const av = (allowed.avatarUrl || '').slice(0, 500);
    const cv = (allowed.coverUrl || '').slice(0, 500);
    const bio = (allowed.bio || '').slice(0, 1000);

    const r = await q(
      `UPDATE users SET display_name=$1, avatar_url=$2, cover_url=$3, bio=$4, updated_at=NOW()
       WHERE id=$5 RETURNING id, email, display_name, avatar_url, cover_url, bio`,
      [dn || null, av || null, cv || null, bio || null, req.user.id]
    );
    res.json({ me: r.rows[0] });
  } catch (e) {
    console.error('profile', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Routes: Friends ----------
app.post('/api/friends/request', authRequired, async (req, res) => {
  const { toUserId } = req.body || {};
  if (!toUserId || toUserId === req.user.id) return res.status(400).json({ error: 'Bad target' });

  // Prevent duplicates
  const exists = await q(
    `SELECT id FROM friend_requests
     WHERE (from_id=$1 AND to_id=$2 AND status='pending')
        OR (from_id=$2 AND to_id=$1 AND status='pending')`,
    [req.user.id, toUserId]
  );
  if (exists.rowCount) return res.json({ ok: true });

  await q(
    `INSERT INTO friend_requests (from_id, to_id) VALUES ($1,$2)`,
    [req.user.id, toUserId]
  );
  await q(
    `INSERT INTO notifications (user_id, type, payload)
     VALUES ($1,'friend_request', jsonb_build_object('from', $2))`,
    [toUserId, req.user.id]
  );
  res.json({ ok: true });
});

app.post('/api/friends/respond', authRequired, async (req, res) => {
  const { fromUserId, action } = req.body || {};
  if (!fromUserId || !['accept', 'decline'].includes(action))
    return res.status(400).json({ error: 'Bad input' });

  const r = await q(
    `UPDATE friend_requests SET status=$1, responded_at=NOW()
     WHERE from_id=$2 AND to_id=$3 AND status='pending' RETURNING id`,
    [action === 'accept' ? 'accepted' : 'declined', fromUserId, req.user.id]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'No pending request' });

  if (action === 'accept') {
    await q(`INSERT INTO friends (user_id, friend_id) VALUES ($1,$2),($2,$1) ON CONFLICT DO NOTHING`, [
      req.user.id,
      fromUserId,
    ]);
    await q(
      `INSERT INTO notifications (user_id, type, payload)
       VALUES ($1,'friend_accept', jsonb_build_object('by', $2))`,
      [fromUserId, req.user.id]
    );
  }
  res.json({ ok: true });
});

app.get('/api/friends', authRequired, async (req, res) => {
  const r = await q(
    `SELECT u.id, u.display_name, u.avatar_url
     FROM friends f JOIN users u ON u.id=f.friend_id
     WHERE f.user_id=$1 ORDER BY u.display_name ASC`,
    [req.user.id]
  );
  res.json({ friends: r.rows });
});

// ---------- Routes: Posts / Comments / Likes ----------
app.post('/api/posts', authRequired, async (req, res) => {
  const { content, imageUrl } = req.body || {};
  if (!content && !imageUrl) return res.status(400).json({ error: 'Nothing to post' });

  const r = await q(
    `INSERT INTO posts (user_id, content, image_url)
     VALUES ($1,$2,$3) RETURNING id, user_id, content, image_url, created_at`,
    [req.user.id, (content || '').slice(0, 2000), (imageUrl || '').slice(0, 600)]
  );
  res.json({ post: r.rows[0] });
});

app.get('/api/posts', authRequired, async (req, res) => {
  const r = await q(
    `SELECT p.id, p.user_id, u.display_name, u.avatar_url, p.content, p.image_url, p.created_at,
            (SELECT COUNT(*)::int FROM likes l WHERE l.post_id=p.id) AS likes,
            (SELECT COUNT(*)::int FROM comments c WHERE c.post_id=p.id) AS comments
     FROM posts p JOIN users u ON u.id=p.user_id
     WHERE p.user_id=$1 OR p.user_id IN (SELECT friend_id FROM friends WHERE user_id=$1)
     ORDER BY p.created_at DESC
     LIMIT 100`,
    [req.user.id]
  );
  res.json({ posts: r.rows });
});

app.post('/api/posts/:id/like', authRequired, async (req, res) => {
  const postId = req.params.id;
  const liked = await q(
    `INSERT INTO likes (post_id, user_id)
     VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`,
    [postId, req.user.id]
  );
  if (liked.rowCount) {
    const owner = await q('SELECT user_id FROM posts WHERE id=$1', [postId]);
    if (owner.rowCount && owner.rows[0].user_id !== req.user.id) {
      await q(
        `INSERT INTO notifications (user_id, type, payload)
         VALUES ($1,'post_like', jsonb_build_object('postId',$2,'by',$3))`,
        [owner.rows[0].user_id, postId, req.user.id]
      );
    }
  }
  res.json({ ok: true });
});

app.post('/api/posts/:id/comment', authRequired, async (req, res) => {
  const postId = req.params.id;
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Empty comment' });

  const r = await q(
    `INSERT INTO comments (post_id, user_id, text)
     VALUES ($1,$2,$3) RETURNING id, post_id, user_id, text, created_at`,
    [postId, req.user.id, text.slice(0, 1000)]
  );

  const owner = await q('SELECT user_id FROM posts WHERE id=$1', [postId]);
  if (owner.rowCount && owner.rows[0].user_id !== req.user.id) {
    await q(
      `INSERT INTO notifications (user_id, type, payload)
       VALUES ($1,'post_comment', jsonb_build_object('postId',$2,'by',$3))`,
      [owner.rows[0].user_id, postId, req.user.id]
    );
  }
  res.json({ comment: r.rows[0] });
});

// ---------- Routes: Notifications ----------
app.get('/api/notifications', authRequired, async (req, res) => {
  const r = await q(
    `SELECT id, type, payload, created_at, read
     FROM notifications WHERE user_id=$1
     ORDER BY created_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json({ notifications: r.rows });
});

app.post('/api/notifications/read', authRequired, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.json({ ok: true });
  const sql = `UPDATE notifications SET read=true WHERE user_id=$1 AND id = ANY($2::uuid[])`;
  await q(sql, [req.user.id, ids]);
  res.json({ ok: true });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ Chatternet API listening on :${PORT}`);
  console.log(`   Allowed origins: ${ORIGINS.join(', ') || '(none set)'}`);
});
