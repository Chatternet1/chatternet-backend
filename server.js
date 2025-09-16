// Chatternet backend — multi-user base (Render-ready)
// Express + Postgres sessions + users/friends/posts/messages APIs.
//
// Env expected (Render -> Environment tab):
// - CT_FRONTEND_ORIGIN: https://www.chatterfriends-movies.com (and/or ALLOWED_ORIGINS)
// - ALLOWED_ORIGINS: comma-separated list of allowed origins (optional)
// - DATABASE_URL: postgres://user:pass@host:5432/chatternet
// - PGSSLMODE: require
// - SESSION_SECRET: 32+ random chars
// - COOKIE_DOMAIN: .your-domain.com (optional)
// - EMAIL_FROM: Chatternet <no-reply@your-domain.com> (optional, not used yet)

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const sanitizeHtml = require('sanitize-html');

// ---------- ENV ----------
const {
  PORT = 10000,
  NODE_ENV = 'development',
  DATABASE_URL,
  SESSION_SECRET = 'please-change-me-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  CT_FRONTEND_ORIGIN = '',
  ALLOWED_ORIGINS = '',
  COOKIE_DOMAIN = '',
  PGSSLMODE = ''
} = process.env;

const PROD = NODE_ENV === 'production';

// ---------- DB ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 12,
  ssl: (PROD || PGSSLMODE) ? { rejectUnauthorized: false } : undefined
});
const q = (text, params) => pool.query(text, params);

// ---------- BOOTSTRAP TABLES ----------
async function ensureTables() {
  await q(`
  create table if not exists users (
    id uuid primary key,
    email text unique not null,
    pass_hash text not null,
    name text not null,
    handle text unique not null,
    avatar text,
    bio text default '',
    created_at timestamptz default now()
  );
  create index if not exists idx_users_handle on users(handle);

  create table if not exists posts (
    id uuid primary key,
    user_id uuid references users(id) on delete cascade,
    body text not null,
    media jsonb default '[]'::jsonb,
    visibility text default 'public',
    created_at timestamptz default now()
  );
  create index if not exists idx_posts_user on posts(user_id);
  create index if not exists idx_posts_created_at on posts(created_at desc);

  create table if not exists post_likes (
    post_id uuid references posts(id) on delete cascade,
    user_id uuid references users(id) on delete cascade,
    primary key (post_id, user_id)
  );

  create table if not exists post_comments (
    id uuid primary key,
    post_id uuid references posts(id) on delete cascade,
    user_id uuid references users(id) on delete cascade,
    body text not null,
    created_at timestamptz default now()
  );

  create table if not exists friend_links (
    a uuid references users(id) on delete cascade,
    b uuid references users(id) on delete cascade,
    created_at timestamptz default now(),
    primary key (a,b)
  );

  create table if not exists friend_requests (
    id uuid primary key,
    from_id uuid references users(id) on delete cascade,
    to_id uuid references users(id) on delete cascade,
    status text default 'pending', -- pending|accepted|declined|canceled
    created_at timestamptz default now()
  );
  create index if not exists idx_fr_to on friend_requests(to_id);
  create index if not exists idx_fr_from on friend_requests(from_id);

  create table if not exists threads (
    id uuid primary key,
    created_at timestamptz default now()
  );

  create table if not exists thread_participants (
    thread_id uuid references threads(id) on delete cascade,
    user_id uuid references users(id) on delete cascade,
    last_read_at timestamptz default now(),
    primary key (thread_id, user_id)
  );

  create table if not exists messages (
    id uuid primary key,
    thread_id uuid references threads(id) on delete cascade,
    from_id uuid references users(id) on delete cascade,
    body text not null,
    created_at timestamptz default now()
  );
  create index if not exists idx_msgs_thread on messages(thread_id, created_at);
  `);
}

// ---------- UTILS ----------
function clean(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim();
}
function requireAuth(req, res, next) {
  if (req.session?.uid) return next();
  return res.status(401).json({ error: 'auth_required' });
}
async function userRow(uid) {
  const { rows } = await q('select id, email, name, handle, avatar, bio, created_at from users where id=$1', [uid]);
  return rows[0] || null;
}
const normalizeUser = (u) => ({ id: u.id, name: u.name, handle: u.handle, avatar: u.avatar || '', bio: u.bio || '' });

// CORS origin allowlist (ALLOWED_ORIGINS + CT_FRONTEND_ORIGIN)
function pickOrigins(listOrSingle) {
  const list = (listOrSingle || '').split(',').map(s => s.trim()).filter(Boolean);
  return (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    if (list.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS: ' + origin));
  };
}

// ---------- APP ----------
const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
const corsOrigin = pickOrigins([ALLOWED_ORIGINS, CT_FRONTEND_ORIGIN].filter(Boolean).join(','));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.options('*', cors({ origin: corsOrigin, credentials: true })); // preflight

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(PROD ? 'combined' : 'dev'));

app.use(session({
  store: new PgStore({ pool }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: PROD,
    httpOnly: true,
    sameSite: PROD ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
  }
}));

// ---------- HEALTH ----------
app.get('/healthz', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- AUTH ----------
app.post('/api/signup', async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const pass = String(req.body.password || '');
    const name = clean(req.body.name || 'New User');
    const handle = clean((req.body.handle || '').toLowerCase());

    if (!email || !pass || !/^[a-z][a-z0-9._-]{2,19}$/.test(handle)) {
      return res.status(400).json({ error: 'bad_input' });
    }
    const hash = await bcrypt.hash(pass, 10);
    const id = uuid();
    await q('insert into users(id, email, pass_hash, name, handle) values ($1,$2,$3,$4,$5)', [id, email, hash, name, handle]);
    req.session.uid = id;
    const me = await userRow(id);
    res.json({ ok: true, me });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('users_email_key')) return res.status(409).json({ error: 'email_taken' });
    if (msg.includes('users_handle_key')) return res.status(409).json({ error: 'handle_taken' });
    res.status(500).json({ error: 'signup_failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const pass = String(req.body.password || '');
  const { rows } = await q('select * from users where email=$1', [email]);
  const u = rows[0];
  if (!u) return res.status(401).json({ error: 'invalid' });
  const ok = await bcrypt.compare(pass, u.pass_hash);
  if (!ok) return res.status(401).json({ error: 'invalid' });
  req.session.uid = u.id;
  res.json({ ok: true, me: normalizeUser(u) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', async (req, res) => {
  if (!req.session?.uid) return res.json({ me: null });
  const me = await userRow(req.session.uid);
  res.json({ me });
});

// ---------- HANDLE ----------
app.get('/api/handle/check', async (req, res) => {
  const h = clean(String(req.query.handle || '').toLowerCase());
  if (!/^[a-z][a-z0-9._-]{2,19}$/.test(h)) return res.json({ ok: false, reason: 'invalid' });
  const { rows } = await q('select 1 from users where handle=$1', [h]);
  res.json({ ok: rows.length === 0 });
});

app.post('/api/handle/update', requireAuth, async (req, res) => {
  const h = clean(String(req.body.handle || '').toLowerCase());
  if (!/^[a-z][a-z0-9._-]{2,19}$/.test(h)) return res.status(400).json({ error: 'invalid' });
  try {
    await q('update users set handle=$1 where id=$2', [h, req.session.uid]);
    res.json({ ok: true, handle: h });
  } catch {
    res.status(409).json({ error: 'handle_taken' });
  }
});

// ---------- USERS ----------
app.get('/api/users', async (req, res) => {
  const { rows } = await q('select id, name, handle, avatar, bio, created_at from users order by created_at desc limit 500');
  res.json({ users: rows.map(normalizeUser) });
});

app.get('/api/users/:handle', async (req, res) => {
  const h = clean(req.params.handle.toLowerCase());
  const { rows } = await q('select id, name, handle, avatar, bio, created_at from users where handle=$1', [h]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json({ user: normalizeUser(rows[0]) });
});

// ---------- POSTS ----------
app.get('/api/posts', async (req, res) => {
  const uid = req.session?.uid || null;
  let rows;
  if (!uid) {
    rows = (await q(`
      select p.*, u.name, u.handle, u.avatar,
             (select count(*) from post_likes pl where pl.post_id=p.id) as likes,
             (select count(*) from post_comments pc where pc.post_id=p.id) as comments
      from posts p
      join users u on u.id=p.user_id
      where p.visibility='public'
      order by p.created_at desc
      limit 200
    `)).rows;
  } else {
    rows = (await q(`
      with my_friends as (
        select case when a=$1 then b else a end friend_id
        from friend_links where a=$1 or b=$1
      )
      select p.*, u.name, u.handle, u.avatar,
             (select count(*) from post_likes pl where pl.post_id=p.id) as likes,
             (select count(*) from post_comments pc where pc.post_id=p.id) as comments
      from posts p
      join users u on u.id=p.user_id
      where p.visibility='public'
         or p.user_id in (select friend_id from my_friends)
         or p.user_id=$1
      order by p.created_at desc
      limit 200
    `, [uid])).rows;
  }
  res.json({ posts: rows });
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const id = uuid();
  const body = clean(req.body.body || '');
  const media = Array.isArray(req.body.media) ? req.body.media.slice(0, 5) : [];
  const visibility = ['public', 'friends', 'private'].includes(req.body.visibility) ? req.body.visibility : 'public';
  if (!body && media.length === 0) return res.status(400).json({ error: 'empty' });
  await q('insert into posts(id, user_id, body, media, visibility) values ($1,$2,$3,$4,$5)', [id, req.session.uid, body, JSON.stringify(media), visibility]);
  res.json({ ok: true, id });
});

app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  await q('insert into post_likes(post_id, user_id) values ($1,$2) on conflict do nothing', [req.params.id, req.session.uid]);
  res.json({ ok: true });
});

app.post('/api/posts/:id/unlike', requireAuth, async (req, res) => {
  await q('delete from post_likes where post_id=$1 and user_id=$2', [req.params.id, req.session.uid]);
  res.json({ ok: true });
});

app.post('/api/posts/:id/comment', requireAuth, async (req, res) => {
  const id = uuid();
  const body = clean(req.body.body || '');
  if (!body) return res.status(400).json({ error: 'empty' });
  await q('insert into post_comments(id, post_id, user_id, body) values ($1,$2,$3,$4)', [id, req.params.id, req.session.uid, body]);
  res.json({ ok: true, id });
});

// ---------- FRIENDS ----------
app.get('/api/friends', requireAuth, async (req, res) => {
  const { rows } = await q(`
    select u.id, u.name, u.handle, u.avatar
    from friend_links f
    join users u on u.id = (case when f.a=$1 then f.b else f.a end)
    where f.a=$1 or f.b=$1
  `, [req.session.uid]);
  res.json({ friends: rows.map(normalizeUser) });
});

app.get('/api/friends/requests', requireAuth, async (req, res) => {
  const incoming = (await q(`
    select fr.id, fr.from_id, u.name, u.handle, u.avatar, fr.created_at
    from friend_requests fr
    join users u on u.id=fr.from_id
    where fr.to_id=$1 and fr.status='pending'
    order by fr.created_at desc
  `, [req.session.uid])).rows;

  const outgoing = (await q(`
    select fr.id, fr.to_id, u.name, u.handle, u.avatar, fr.created_at
    from friend_requests fr
    join users u on u.id=fr.to_id
    where fr.from_id=$1 and fr.status='pending'
    order by fr.created_at desc
  `, [req.session.uid])).rows;

  res.json({ incoming, outgoing });
});

app.post('/api/friends/request', requireAuth, async (req, res) => {
  const toHandle = clean(req.body.handle || '');
  const to = (await q('select id from users where handle=$1', [toHandle])).rows[0];
  if (!to) return res.status(404).json({ error: 'user_not_found' });
  if (to.id === req.session.uid) return res.status(400).json({ error: 'self' });
  const id = uuid();
  await q('insert into friend_requests(id, from_id, to_id) values ($1,$2,$3)', [id, req.session.uid, to.id]);
  res.json({ ok: true, id });
});

app.post('/api/friends/:id/accept', requireAuth, async (req, res) => {
  const fr = (await q('select * from friend_requests where id=$1 and to_id=$2 and status=$3', [req.params.id, req.session.uid, 'pending'])).rows[0];
  if (!fr) return res.status(404).json({ error: 'not_found' });
  const a = fr.from_id < fr.to_id ? fr.from_id : fr.to_id;
  const b = fr.from_id < fr.to_id ? fr.to_id : fr.from_id;
  await q('update friend_requests set status=$1 where id=$2', ['accepted', req.params.id]);
  await q('insert into friend_links(a,b) values ($1,$2) on conflict do nothing', [a,b]);
  res.json({ ok: true });
});

app.post('/api/friends/:id/decline', requireAuth, async (req, res) => {
  await q('update friend_requests set status=$1 where id=$2 and (to_id=$3 or from_id=$3)', ['declined', req.params.id, req.session.uid]);
  res.json({ ok: true });
});

app.post('/api/friends/:id/cancel', requireAuth, async (req, res) => {
  await q('update friend_requests set status=$1 where id=$2 and from_id=$3', ['canceled', req.params.id, req.session.uid]);
  res.json({ ok: true });
});

// ---------- MESSAGES / THREADS ----------
app.get('/api/threads', requireAuth, async (req, res) => {
  const rows = (await q(`
    select t.id,
           json_agg(json_build_object('id', u.id, 'name', u.name, 'handle', u.handle, 'avatar', u.avatar)
             order by u.name) filter (where u.id is not null) as participants,
           (select m.body from messages m where m.thread_id=t.id order by m.created_at desc limit 1) as last_message,
           (select m.created_at from messages m where m.thread_id=t.id order by m.created_at desc limit 1) as last_at
    from threads t
    join thread_participants tp on tp.thread_id=t.id
    left join thread_participants tp2 on tp2.thread_id=t.id and tp2.user_id<>$1
    left join users u on u.id=tp2.user_id
    where tp.user_id=$1
    group by t.id
    order by last_at desc nulls last, t.id
  `, [req.session.uid])).rows;
  res.json({ threads: rows });
});

app.post('/api/threads', requireAuth, async (req, res) => {
  const toHandle = clean(req.body.handle || '');
  const to = (await q('select id from users where handle=$1', [toHandle])).rows[0];
  if (!to) return res.status(404).json({ error: 'user_not_found' });
  const reuse = (await q(`
    select t.id from threads t
    join thread_participants a on a.thread_id=t.id and a.user_id=$1
    join thread_participants  b on b.thread_id=t.id and b.user_id=$2
    group by t.id
  `, [req.session.uid, to.id])).rows[0];
  const tid = reuse?.id || uuid();
  if (!reuse) {
    await q('insert into threads(id) values ($1)', [tid]);
    await q('insert into thread_participants(thread_id, user_id) values ($1,$2),($1,$3)', [tid, req.session.uid, to.id]);
  }
  res.json({ ok: true, thread_id: tid });
});

app.get('/api/threads/:id/messages', requireAuth, async (req, res) => {
  const tid = req.params.id;
  const mine = (await q('select 1 from thread_participants where thread_id=$1 and user_id=$2', [tid, req.session.uid])).rows[0];
  if (!mine) return res.status(403).json({ error: 'forbidden' });
  const rows = (await q(`
    select m.id, m.from_id, u.name, u.handle, u.avatar, m.body, m.created_at
    from messages m
    join users u on u.id=m.from_id
    where m.thread_id=$1
    order by m.created_at asc
    limit 500
  `, [tid])).rows;
  await q('update thread_participants set last_read_at=now() where thread_id=$1 and user_id=$2', [tid, req.session.uid]);
  res.json({ messages: rows });
});

app.post('/api/threads/:id/messages', requireAuth, async (req, res) => {
  const tid = req.params.id;
  const mine = (await q('select 1 from thread_participants where thread_id=$1 and user_id=$2', [tid, req.session.uid])).rows[0];
  if (!mine) return res.status(403).json({ error: 'forbidden' });
  const id = uuid();
  const body = clean(req.body.body || '');
  if (!body) return res.status(400).json({ error: 'empty' });
  await q('insert into messages(id, thread_id, from_id, body) values ($1,$2,$3,$4)', [id, tid, req.session.uid, body]);
  res.json({ ok: true, id });
});

// ---------- STATIC (optional) ----------
app.use('/public', express.static('public', { maxAge: '1h', etag: true }));

// ---------- RUN ----------
const run = async () => {
  await ensureTables();
  app.listen(PORT, () => console.log('Chatternet backend on :' + PORT));
};

if (process.argv[2] === 'initdb') {
  ensureTables().then(() => { console.log('DB ready'); process.exit(0); });
} else {
  run();
}
