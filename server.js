// Chatternet backend — Express + Postgres sessions + JSON API
// Render service: srv-d2s5h37diees739dj09g
// Render Postgres: dpg-d32a07jipnbc73d1fs40-a
// Frontend: https://www.chatterfiends-movies.com (and friends spelling)

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

/* ========= ENV ========= */
const {
  PORT = 10000,
  DATABASE_URL,
  PGSSLMODE,
  SESSION_SECRET = 'change-me',
  CT_FRONTEND_ORIGIN = '',          // optional explicit origin
  ALLOWED_ORIGINS = ''              // optional extra origins, comma-separated
} = process.env;

const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const useSSL = ((PGSSLMODE || '').toLowerCase() === 'require') || isProd;

/* ========= DB (optional for local dev) ========= */
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, ssl: useSSL ? { rejectUnauthorized: false } : false })
  : null;

async function ensureTables() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passhash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts(
      id UUID PRIMARY KEY,
      title TEXT,
      content TEXT,
      media TEXT,
      author_name TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events(
      id UUID PRIMARY KEY,
      title TEXT,
      date TEXT,
      time TEXT,
      location TEXT,
      privacy TEXT,
      desc TEXT,
      img_src TEXT,
      creator TEXT,
      invites JSONB DEFAULT '[]'::jsonb,
      rsvp JSONB DEFAULT '{"Going":[],"Maybe":[],"NotGoing":[]}'::jsonb,
      discussion JSONB DEFAULT '[]'::jsonb,
      likes JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

/* ========= APP ========= */
const app = express();
app.set('trust proxy', 1);

/* ========= CORS (credentials) =========
   Allow your production site(s) + service hostname automatically.
*/
const defaultAllowed = new Set([
  CT_FRONTEND_ORIGIN.trim(),
  'https://www.chatterfiends-movies.com',
  'https://chatterfiends-movies.com',
  'https://www.chatterfriends-movies.com',
  'https://chatterfriends-movies.com',
  `https://${(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim()}`, // this backend’s public URL
  ...ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
].filter(Boolean));

const allowedSuffixes = [
  '.chatterfiends-movies.com',
  '.chatterfriends-movies.com'
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin/curl
    try {
      const u = new URL(origin);
      const host = (u.hostname || '').toLowerCase();
      if (defaultAllowed.has(origin)) return cb(null, true);
      if (allowedSuffixes.some(suf => host === suf.slice(1) || host.endsWith(suf))) return cb(null, true);
      if (!isProd && /^https?:\/\/localhost(:\d+)?$/i.test(origin)) return cb(null, true);
      return cb(new Error('CORS not allowed: ' + origin));
    } catch {
      return cb(new Error('CORS: bad origin'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false, limit: '25mb' }));

/* ========= Sessions ========= */
const store = pool
  ? new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true })
  : new session.MemoryStore();

app.use(session({
  store,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,      // required when SameSite=None
    sameSite: 'none',    // cross-site cookie for your separate frontend domain
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

/* ========= Static ========= */
const UP = path.join(__dirname, 'uploads');
if (!fs.existsSync(UP)) fs.mkdirSync(UP);

app.use('/uploads', express.static(UP, { maxAge: '1y', immutable: true }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

/* ========= Helpers ========= */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
const fullUrl = (req, rel) => {
  try { new URL(rel); return rel; } catch {}
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  return `${proto}://${host}${rel.startsWith('/') ? rel : `/${rel}`}`;
};
const mem = { posts: [], events: [] }; // in-memory fallback for local dev

/* ========= Health ========= */
app.get('/ping', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/healthz', (_req, res) => res.type('text').send('ok'));
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/db/health', async (_req, res) => {
  if (!pool) return res.json({ ok: true, db: 'disabled' });
  try { await pool.query('select 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

/* ========= Auth (minimal) ========= */
app.post('/api/signup', async (req, res) => {
  try {
    if (!pool) return res.status(501).json({ ok: false, error: 'DB not configured' });
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ ok: false, error: 'name, email, password required' });
    const dupe = await pool.query('select 1 from users where email=$1', [email.toLowerCase()]);
    if (dupe.rowCount) return res.status(409).json({ ok: false, error: 'email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const ins = await pool.query(
      'insert into users(name,email,passhash) values($1,$2,$3) returning id,name,email,created_at',
      [name, email.toLowerCase(), hash]
    );
    req.session.userId = ins.rows[0].id;
    res.json({ ok: true, user: ins.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/login', async (req, res) => {
  try {
    if (!pool) return res.status(501).json({ ok: false, error: 'DB not configured' });
    const { email, password } = req.body || {};
    const q = await pool.query('select * from users where email=$1', [email.toLowerCase()]);
    if (!q.rowCount) return res.status(401).json({ ok: false, error: 'invalid credentials' });
    const u = q.rows[0];
    const ok = await bcrypt.compare(password, u.passhash);
    if (!ok) return res.status(401).json({ ok: false, error: 'invalid credentials' });
    req.session.userId = u.id;
    res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, created_at: u.created_at } });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

/* ========= Media ========= */
// POST /api/images {data:'data:image/...;base64,...'} -> {ok,url}
app.post('/api/images', (req, res) => {
  try {
    const { data } = req.body || {};
    if (!/^data:image\/[a-z0-9+.\-]+;base64,/i.test(data || '')) {
      return res.status(400).json({ ok: false, error: 'expected data:image/* base64' });
    }
    const [, meta, b64] = data.match(/^data:(image\/[a-z0-9+.\-]+);base64,(.*)$/i) || [];
    const ext = (meta.split('/')[1] || 'png').toLowerCase().replace(/[^a-z0-9.]/g, '');
    const filename = `${uid()}.${ext}`;
    fs.writeFileSync(path.join(UP, filename), Buffer.from(b64, 'base64'));
    res.json({ ok: true, url: fullUrl(req, `/uploads/${filename}`) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// POST /api/posts {title,content,media,authorName}
app.post('/api/posts', async (req, res) => {
  try {
    const row = {
      id: uid(),
      title: (req.body?.title || 'Media').slice(0, 200),
      content: req.body?.content || '',
      media: req.body?.media || '',
      author_name: req.body?.authorName || 'Me'
    };
    if (pool) {
      await pool.query(
        'insert into posts(id,title,content,media,author_name) values($1,$2,$3,$4,$5)',
        [row.id, row.title, row.content, row.media, row.author_name]
      );
    } else {
      row.created_at = new Date().toISOString();
      mem.posts.unshift(row);
    }
    res.json({ ok: true, post: row });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.get('/api/posts', async (_req, res) => {
  try {
    if (pool) {
      const q = await pool.query('select * from posts order by created_at desc');
      return res.json({ ok: true, posts: q.rows });
    }
    res.json({ ok: true, posts: mem.posts });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

/* ========= Events ========= */
const normalizeEvent = (ev = {}) => ({
  id: ev.id || uid(),
  title: ev.title || 'Event',
  date: ev.date || '',
  time: ev.time || '',
  location: ev.location || '',
  privacy: ev.privacy || 'Public',
  desc: ev.desc || ev.description || '',
  img_src: ev.img_src || ev.imgSrc || '',
  creator: ev.creator || 'Me',
  invites: Array.isArray(ev.invites) ? ev.invites : [],
  rsvp: ev.rsvp && typeof ev.rsvp === 'object' ? ev.rsvp : { Going: [], Maybe: [], NotGoing: [] },
  discussion: Array.isArray(ev.discussion) ? ev.discussion : [],
  likes: Array.isArray(ev.likes) ? ev.likes : [],
  created_at: ev.created_at || new Date().toISOString()
});

// GET /api/events
app.get('/api/events', async (_req, res) => {
  try {
    if (pool) {
      const q = await pool.query('select * from events order by created_at desc');
      return res.json({ ok: true, events: q.rows.map(normalizeEvent) });
    }
    res.json({ ok: true, events: mem.events.map(normalizeEvent) });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// POST /api/events
app.post('/api/events', async (req, res) => {
  try {
    const ev = normalizeEvent(req.body || {});
    if (pool) {
      await pool.query(
        `insert into events(id,title,date,time,location,privacy,desc,img_src,creator,invites,rsvp,discussion,likes)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb)`,
        [ev.id, ev.title, ev.date, ev.time, ev.location, ev.privacy, ev.desc, ev.img_src, ev.creator,
         JSON.stringify(ev.invites), JSON.stringify(ev.rsvp), JSON.stringify(ev.discussion), JSON.stringify(ev.likes)]
      );
    } else {
      mem.events.unshift(ev);
    }
    res.json({ ok: true, event: ev });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// PUT /api/events/:id
app.put('/api/events/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updated = normalizeEvent({ ...req.body, id });

    if (pool) {
      await pool.query(
        `update events set title=$2,date=$3,time=$4,location=$5,privacy=$6,desc=$7,img_src=$8,creator=$9,
         invites=$10::jsonb,rsvp=$11::jsonb,discussion=$12::jsonb,likes=$13::jsonb where id=$1`,
        [updated.id, updated.title, updated.date, updated.time, updated.location, updated.privacy,
         updated.desc, updated.img_src, updated.creator,
         JSON.stringify(updated.invites), JSON.stringify(updated.rsvp),
         JSON.stringify(updated.discussion), JSON.stringify(updated.likes)]
      );
    } else {
      const i = mem.events.findIndex(x => x.id === id);
      if (i >= 0) mem.events[i] = updated; else mem.events.unshift(updated);
    }
    res.json({ ok: true, event: updated });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

// DELETE /api/events/:id
app.delete('/api/events/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (pool) {
      await pool.query('delete from events where id=$1', [id]);
    } else {
      mem.events = mem.events.filter(e => e.id !== id);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

/* ========= Root helper page ========= */
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Chatternet backend ✓</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:26px} a{display:block;margin:6px 0}</style>
</head><body>
<h1>Chatternet backend ✓</h1>
<ul>
  <li><a href="/healthz">/healthz</a></li>
  <li><a href="/api/health">/api/health</a></li>
  <li><a href="/api/db/health">/api/db/health</a></li>
  <li><a href="/api/posts">/api/posts</a></li>
  <li><a href="/api/events">/api/events</a></li>
  <li><a href="/assets/messenger.js">/assets/messenger.js</a></li>
</ul>
</body></html>`);
});

/* ========= Boot ========= */
ensureTables()
  .then(() => app.listen(PORT, () => console.log('Chatternet backend listening on', PORT)))
  .catch((e) => { console.error('Failed to init tables:', e); process.exit(1); });
