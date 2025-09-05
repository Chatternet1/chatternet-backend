// server.js (Chatternet backend – CORS + cookie sessions + settings + images)
'use strict';

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// ─────────────────────────── helpers ───────────────────────────
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function nowISO() { return new Date().toISOString(); }
function defaultData() {
  return {
    users: [],
    posts: [],
    messages: [],
    polls: [],
    blogs: [],
    media: [],
    groups: [],
    events: [],
    // sessions: sessionId -> userId
    sessions: {},
    // global look/feel settings (used by Settings page)
    settingsGlobal: {
      privacy: { visibility: 'private', allowDM: true, dmAudience: 'everyone', emailVisible: false },
      profile: { displayName: '', bio: '', avatarAlt: '', avatarUrl: '', coverUrl: '' },
      notifications: { email: false, push: false },
      appearance: { theme: 'system', accent: '#3b82f6', bigText: false, highContrast: false }
    }
  };
}
function load() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) {}
  return defaultData();
}
let data = load();
function save() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); } catch (_) {} }
const byId = (id) => (data.users || []).find(u => String(u.id) === String(id));

// Strip secrets + normalize structure for the frontend
function sanitizeUser(u) {
  if (!u) return null;
  const profile = u.profile || {
    displayName: u.name || '',
    bio: u.bio || '',
    avatarUrl: u.avatar || '',
    coverUrl: u.cover || '',
    avatarAlt: u.profile?.avatarAlt || ''
  };
  const notifications = u.notifications || (u.settings && u.settings.notifications) || {};
  const appearance = u.appearance || {
    darkMode: !!u.settings?.darkMode,
    highContrast: !!u.settings?.highContrast,
    theme: u.settings?.theme || 'system'
  };
  const privacy = u.privacy || {};
  const security = u.security || {};

  return {
    id: u.id,
    email: u.email || '',
    name: u.name || profile.displayName || '',
    privacy,
    profile,
    notifications,
    appearance,
    security,
    createdAt: u.createdAt
  };
}

// ─────────────────────────── CORS & cookies ───────────────────────────
app.set('trust proxy', 1);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Configure CORS to reflect origin and allow credentials
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin / curl
    if (ALLOWED.length === 0) return cb(null, true); // allow all if not configured
    try {
      const ok = ALLOWED.includes(origin) ||
                 /\.weebly(site)?\.com$/i.test(new URL(origin).hostname);
      return ok ? cb(null, true) : cb(new Error('CORS not allowed'));
    } catch { return cb(new Error('CORS not allowed')); }
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ─────────────────────────── static site ───────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/index.html'));

// ─────────────────────────── sessions ───────────────────────────
function newSession(userId) {
  const sid = crypto.randomUUID();
  data.sessions[sid] = { userId: String(userId), createdAt: nowISO() };
  save();
  return sid;
}
function getUserFromReq(req) {
  const sid = req.cookies.ct_session_v2;
  if (!sid) return null;
  const link = data.sessions[sid];
  if (!link) return null;
  return byId(link.userId) || null;
}
function destroySession(req, res) {
  const sid = req.cookies.ct_session_v2;
  if (sid && data.sessions[sid]) {
    delete data.sessions[sid];
    save();
  }
  res.clearCookie('ct_session_v2', { path: '/', sameSite: 'none', secure: true });
}
function setSessionCookie(res, sessionId) {
  res.cookie('ct_session_v2', sessionId, {
    httpOnly: true,
    secure: true,       // HTTPS only
    sameSite: 'none',   // allow cross-site (Weebly)
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  });
}

// ─────────────────────────── health ───────────────────────────
app.get('/api/health', (_req, res) => res.json({
  ok: true, time: nowISO(), node: process.version, dataFile: DATA_FILE
}));

// ─────────────────────────── users & auth ───────────────────────────
app.post('/api/signup', (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  if ((data.users || []).find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });

  const user = {
    id: Date.now().toString(),
    email, password, name,
    bio: '', avatar: '', cover: '',
    friends: [], friendRequests: [],
    privacy: {
      visibility: 'private', pic: true, fr: true, dm: true,
      dmAudience: 'everyone', online: false, tags: true, search: true,
      activity: false, location: false
    },
    settings: {
      darkMode: false, compact: false, highContrast: false, reduceMotion: false,
      fontSize: 'medium', theme: 'system', language: 'en',
      notifications: { event: true, friend: true, post: true, sound: false, volume: 0.5 }
    },
    // new fields used by Settings UI
    profile: { displayName: name || '', bio: '', avatarUrl: '', coverUrl: '' },
    notifications: { email: false, push: false },
    appearance: { theme: 'system', accent: '#3b82f6', bigText: false, highContrast: false },
    security: {},
    createdAt: nowISO()
  };
  (data.users ||= []).push(user); save();

  const sid = newSession(user.id);
  setSessionCookie(res, sid);
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = (data.users || []).find(u => u.email === email && u.password === password);
  if (!user) return res.status(400).json({ error: 'Invalid login' });

  const sid = newSession(user.id);
  setSessionCookie(res, sid);
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

app.get('/api/users/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'No session' });
  res.json(sanitizeUser(user));
});

// alias some frontends try
app.get('/api/session/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'No session' });
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/users', (_req, res) => res.json((data.users || []).map(sanitizeUser)));

app.get('/api/users/:id', (req, res) => {
  const u = byId(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(sanitizeUser(u));
});

app.put('/api/users/:id', (req, res) => {
  const id = String(req.params.id);
  const i = (data.users || []).findIndex(u => String(u.id) === id);
  if (i < 0) return res.status(404).json({ error: 'User not found' });

  const incoming = req.body || {};
  const prev = data.users[i];

  // Map new structure (profile/notifications/appearance/security) + legacy settings/fields
  const merged = {
    ...prev,
    email: incoming.email ?? prev.email,
    name: incoming.name ?? prev.name,
    privacy: { ...(prev.privacy || {}), ...(incoming.privacy || {}) },
    profile: { ...(prev.profile || {}), ...(incoming.profile || {}) },
    notifications: { ...(prev.notifications || {}), ...(incoming.notifications || {}) },
    appearance: { ...(prev.appearance || {}), ...(incoming.appearance || {}) },
    security: { ...(prev.security || {}), ...(incoming.security || {}) }
  };

  // Keep legacy mirrors in sync (non-breaking for older pages)
  merged.avatar = merged.profile.avatarUrl || merged.avatar || '';
  merged.cover  = merged.profile.coverUrl  || merged.cover  || '';
  merged.bio    = merged.profile.bio       || merged.bio    || '';
  if (incoming.settings) {
    merged.settings = {
      ...(prev.settings || {}),
      ...(incoming.settings || {}),
      notifications: { ...((prev.settings || {}).notifications || {}), ...((incoming.settings || {}).notifications || {}) }
    };
  }

  data.users[i] = merged;
  save();
  res.json(sanitizeUser(merged));
});

// ─────────────────────────── Echo bot helper ───────────────────────────
function ensureEchoBot() {
  let bot = (data.users || []).find(u => u.email === 'bot@demo.test');
  if (!bot) {
    bot = {
      id: (Date.now() + 999).toString(),
      email: 'bot@demo.test',
      password: '',
      name: 'Echo Bot',
      bot: true,
      bio: 'I repeat what you say. Try /time',
      avatar: '', cover: '',
      friends: [], friendRequests: [],
      privacy: { visibility: 'public', dm: true, dmAudience: 'everyone' },
      settings: { notifications: {} },
      profile: { displayName: 'Echo Bot', bio: 'I repeat what you say.', avatarUrl: '', coverUrl: '' },
      notifications: {},
      appearance: { theme: 'system', accent: '#3b82f6', bigText: false, highContrast: false },
      createdAt: nowISO()
    };
    (data.users ||= []).push(bot); save();
  } else if (!bot.bot) { bot.bot = true; save(); }
  return bot;
}
ensureEchoBot();

const botReplyText = (text) => {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return "Say something and I'll echo it back.";
  if (/hello|hi|hey/.test(t)) return "Hello! I'm an echo bot. Say anything.";
  if (t.startsWith('/time')) return 'Server time: ' + nowISO();
  return `Echo: ${text}`;
};

// ─────────────────────────── friends ───────────────────────────
app.get('/api/friends', (req, res) => {
  const { userId } = req.query || {};
  const me = byId(userId);
  if (!me) return res.status(404).json({ error: 'User not found' });

  const all = (data.users || []).filter(u => u.id !== me.id).map(sanitizeUser);
  const requests = (me.friendRequests || []).map(id => sanitizeUser(byId(id))).filter(Boolean);
  const friends = (me.friends || []).map(id => sanitizeUser(byId(id))).filter(Boolean);
  res.json({ requests, friends, all });
});
app.post('/api/friends/request', (req, res) => {
  const { fromId, toId } = req.body || {};
  const from = byId(fromId), to = byId(toId);
  if (!from || !to) return res.status(400).json({ error: 'Invalid users' });
  if ((to.friendRequests || []).includes(from.id) || (to.friends || []).includes(from.id))
    return res.json({ ok: true });
  (to.friendRequests ||= []).push(from.id); save();
  res.json({ ok: true });
});
app.post('/api/friends/respond', (req, res) => {
  const { fromId, toId, action } = req.body || {};
  const from = byId(fromId), to = byId(toId);
  if (!from || !to) return res.status(400).json({ error: 'Invalid users' });

  to.friendRequests = (to.friendRequests || []).filter(id => id !== from.id);
  if (action === 'accept') {
    if (!(to.friends || []).includes(from.id)) (to.friends ||= []).push(from.id);
    if (!(from.friends || []).includes(to.id)) (from.friends ||= []).push(to.id);
  }
  save();
  res.json({ ok: true });
});

// ─────────────────────────── messages ───────────────────────────
app.get('/api/messages', (req, res) => {
  const { userId, peerId } = req.query;
  if (!userId || !peerId) return res.status(400).json({ error: 'userId & peerId required' });
  const list = (data.messages || [])
    .filter(m => (m.fromId === userId && m.toId === peerId) || (m.fromId === peerId && m.toId === userId))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(list);
});
app.post('/api/messages', (req, res) => {
  const { fromId, toId, text } = req.body || {};
  if (!fromId || !toId || !text) return res.status(400).json({ error: 'fromId, toId, text required' });
  const msg = { id: Date.now().toString(), fromId, toId, text, time: nowISO() };
  (data.messages ||= []).push(msg); save();

  const toUser = byId(toId);
  if (toUser?.bot) {
    const reply = { id: (Date.now() + 1).toString(), fromId: toUser.id, toId: fromId, text: botReplyText(text), time: nowISO() };
    (data.messages ||= []).push(reply); save();
  }
  res.json(msg);
});
app.get('/api/threads/:userId', (req, res) => {
  const userId = req.params.userId; const peers = new Map();
  (data.messages || []).forEach(m => {
    if (m.fromId === userId || m.toId === userId) {
      const peer = m.fromId === userId ? m.toId : m.fromId;
      const prev = peers.get(peer);
      if (!prev || new Date(m.time) > new Date(prev.time)) peers.set(peer, m);
    }
  });
  const out = Array.from(peers.entries()).map(([peerId, last]) => ({ peerId, last })); res.json(out);
});

// ─────────────────────────── posts ───────────────────────────
app.get('/api/posts', (_req, res) => {
  const list = (data.posts || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});
app.post('/api/posts', (req, res) => {
  const { title = '', content = '', media = '', authorName = 'Anonymous', authorId = '' } = req.body || {};
  if (!content.trim() && !media.trim()) return res.status(400).json({ error: 'content or media required' });
  const post = { id: Date.now().toString(), title, content, media, authorName, authorId, createdAt: nowISO() };
  (data.posts ||= []).unshift(post); save();
  res.json(post);
});
app.delete('/api/posts/:id', (req, res) => {
  const id = String(req.params.id);
  const before = (data.posts || []).length;
  data.posts = (data.posts || []).filter(p => String(p.id) !== id);
  if ((data.posts || []).length === before) return res.status(404).json({ error: 'Post not found' });
  save(); res.json({ ok: true });
});

// ─────────────────────────── events ───────────────────────────
function ensureEvent(ev = {}) {
  return {
    id: ev.id || Date.now().toString(),
    title: ev.title || 'Event',
    date: ev.date || '',
    time: ev.time || '',
    location: ev.location || '',
    privacy: ev.privacy || 'Public',
    desc: ev.desc || '',
    imgSrc: ev.imgSrc || '',
    creator: ev.creator || 'Me',
    createdAt: ev.createdAt || nowISO(),
    invites: Array.isArray(ev.invites) ? ev.invites : [],
    rsvp: ev.rsvp || { Going: [], Maybe: [], NotGoing: [] },
    discussion: Array.isArray(ev.discussion) ? ev.discussion : []
  };
}
app.get('/api/events', (_req, res) => res.json((data.events || []).map(ensureEvent)));
app.get('/api/events/:id', (req, res) => {
  const ev = (data.events || []).find(e => String(e.id) === String(req.params.id));
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json(ensureEvent(ev));
});
app.post('/api/events', (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const ev = ensureEvent({ ...req.body, id: Date.now().toString(), createdAt: nowISO() });
  (data.events ||= []).unshift(ev); save(); res.json(ev);
});
app.put('/api/events/:id', (req, res) => {
  const id = String(req.params.id);
  const list = (data.events ||= []);
  const i = list.findIndex(e => String(e.id) === id);
  if (i < 0) return res.status(404).json({ error: 'Event not found' });
  const incoming = req.body || {};
  list[i] = ensureEvent({
    ...list[i],
    ...incoming,
    rsvp: { ...(list[i].rsvp || { Going: [], Maybe: [], NotGoing: [] }), ...(incoming.rsvp || {}) },
    invites: Array.isArray(incoming.invites) ? incoming.invites : (list[i].invites || []),
    discussion: Array.isArray(incoming.discussion) ? incoming.discussion : (list[i].discussion || [])
  });
  save(); res.json(list[i]);
});
app.delete('/api/events/:id', (req, res) => {
  const before = (data.events || []).length;
  data.events = (data.events || []).filter(e => String(e.id) !== String(req.params.id));
  if ((data.events || []).length === before) return res.status(404).json({ error: 'Event not found' });
  save(); res.json({ ok: true });
});

// ─────────────────────────── global settings (for Settings page) ───────────────────────────
app.get('/api/settings', (req, res) => {
  const { scope } = req.query || {};
  if (scope === 'global') return res.json(data.settingsGlobal || defaultData().settingsGlobal);
  res.status(400).json({ error: 'unknown scope' });
});
app.get('/api/settings/global', (_req, res) => {
  res.json(data.settingsGlobal || defaultData().settingsGlobal);
});
app.put('/api/settings', (req, res) => {
  const { scope, patch } = req.body || {};
  if (scope !== 'global') return res.status(400).json({ error: 'unknown scope' });
  data.settingsGlobal = { ...(data.settingsGlobal || {}), ...(patch || {}) };
  save();
  res.json({ ok: true, settings: data.settingsGlobal });
});
app.put('/api/settings/global', (req, res) => {
  const { patch } = req.body || {};
  data.settingsGlobal = { ...(data.settingsGlobal || {}), ...(patch || {}) };
  save();
  res.json({ ok: true, settings: data.settingsGlobal });
});
// Some frontends try this:
app.put('/api/config', (req, res) => {
  data.settingsGlobal = { ...(data.settingsGlobal || {}), ...(req.body || {}) };
  save();
  res.json({ ok: true, settings: data.settingsGlobal });
});
app.get('/api/config', (_req, res) => res.json(data.settingsGlobal || defaultData().settingsGlobal));

// ─────────────────────────── media (data URL saver) ───────────────────────────
app.post('/api/images', (req, res) => {
  const { kind = 'image', data: dataUrl } = req.body || {};
  if (!dataUrl || !/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl))
    return res.status(400).json({ error: 'Invalid image data' });
  const ext = dataUrl.includes('image/png') ? 'png' : (dataUrl.includes('image/webp') ? 'webp' : 'jpg');
  const base64 = dataUrl.split(',')[1];
  const buf = Buffer.from(base64, 'base64');
  const filename = `${Date.now()}-${kind}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, buf);
  const url = `/uploads/${filename}`;
  res.json({ url });
});

// ─────────────────────────── start ───────────────────────────
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
