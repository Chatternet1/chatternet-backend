// server.js (robust, logs all startup errors)

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// ----- crash guard so we SEE errors instead of silent exit -----
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err && err.stack ? err.stack : err);
});

// ----- middleware -----
app.use(cors());
app.use(bodyParser.json({ limit: '6mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '6mb' }));

// ----- serve static site from /public -----
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ----- data store -----
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

function defaultData() {
  return {
    users: [],
    posts: [],
    messages: [],
    polls: [],
    blogs: [],
    media: [],
    groups: [],
    events: []
  };
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8') || '{}';
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('load error:', e);
  }
  return defaultData();
}

let data = load();

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('save error:', e);
  }
}

const nowISO = () => new Date().toISOString();
const byId = (id) => (data.users || []).find((u) => String(u.id) === String(id));

// ----- health -----
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: nowISO(), node: process.version, dataFile: DATA_FILE })
);

// ----- users -----
app.post('/api/signup', (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  if ((data.users || []).find((u) => u.email === email))
    return res.status(400).json({ error: 'Email exists' });

  const user = {
    id: Date.now().toString(),
    email,
    password,
    name,
    bio: '',
    avatar: '',
    cover: '',
    friends: [],
    friendRequests: [],
    privacy: {
      visibility: 'private',
      pic: true,
      fr: true,
      dm: true,
      dmAudience: 'everyone',
      online: false,
      tags: true,
      search: true,
      activity: false,
      location: false
    },
    settings: {
      darkMode: false,
      compact: false,
      highContrast: false,
      reduceMotion: false,
      fontSize: 'medium',
      theme: 'blue',
      language: 'en',
      notifications: { event: true, friend: true, post: true, sound: false, volume: 0.5 }
    },
    createdAt: nowISO()
  };
  data.users.push(user);
  save();
  res.json({ user });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = (data.users || []).find((u) => u.email === email && u.password === password);
  if (!user) return res.status(400).json({ error: 'Invalid login' });
  res.json({ user });
});

app.get('/api/users', (_req, res) => res.json(data.users || []));
app.get('/api/users/:id', (req, res) => {
  const u = byId(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(u);
});
app.put('/api/users/:id', (req, res) => {
  const id = req.params.id;
  const i = (data.users || []).findIndex((u) => String(u.id) === String(id));
  if (i < 0) return res.status(404).json({ error: 'User not found' });

  const incoming = req.body || {};
  data.users[i] = {
    ...data.users[i],
    ...incoming,
    friends: Array.isArray(incoming.friends) ? incoming.friends : (data.users[i].friends || []),
    friendRequests: Array.isArray(incoming.friendRequests)
      ? incoming.friendRequests
      : (data.users[i].friendRequests || []),
    privacy: { ...(data.users[i].privacy || {}), ...(incoming.privacy || {}) },
    settings: {
      ...(data.users[i].settings || {}),
      ...(incoming.settings || {}),
      notifications: {
        ...((data.users[i].settings || {}).notifications || {}),
        ...(((incoming.settings || {}).notifications) || {})
      }
    }
  };
  save();
  res.json(data.users[i]);
});

// ----- posts (minimal) -----
app.get('/api/posts', (_req, res) => res.json(data.posts || []));
app.post('/api/posts', (req, res) => {
  const b = req.body || {};
  const post = {
    id: Date.now().toString(),
    title: b.title || '',
    content: b.content || '',
    authorName: b.authorName || 'Me',
    createdAt: b.createdAt || nowISO(),
    media: b.media || null,
    comments: Array.isArray(b.comments) ? b.comments : [],
    likes: Array.isArray(b.likes) ? b.likes : []
  };
  data.posts.push(post);
  save();
  res.json(post);
});

// ----- messages -----
app.get('/api/messages', (req, res) => {
  const { userId, peerId } = req.query;
  if (!userId || !peerId) return res.status(400).json({ error: 'userId & peerId required' });
  const list = (data.messages || [])
    .filter(
      (m) =>
        (String(m.fromId) === String(userId) && String(m.toId) === String(peerId)) ||
        (String(m.fromId) === String(peerId) && String(m.toId) === String(userId))
    )
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(list);
});

app.post('/api/messages', (req, res) => {
  const { fromId, toId, text } = req.body || {};
  if (!fromId || !toId || !text)
    return res.status(400).json({ error: 'fromId, toId, text required' });
  const msg = { id: Date.now().toString(), fromId, toId, text, time: nowISO() };
  data.messages.push(msg);
  save();
  res.json(msg);
});

app.get('/api/threads/:userId', (req, res) => {
  const userId = String(req.params.userId);
  const peers = new Map();
  (data.messages || []).forEach((m) => {
    if (String(m.fromId) === userId || String(m.toId) === userId) {
      const peer = String(m.fromId) === userId ? String(m.toId) : String(m.fromId);
      const prev = peers.get(peer);
      if (!prev || new Date(m.time) > new Date(prev.time)) peers.set(peer, m);
    }
  });
  const out = Array.from(peers.entries()).map(([peerId, last]) => ({ peerId, last }));
  res.json(out);
});

// ----- express error handler (last) -----
app.use((err, _req, res, _next) => {
  console.error('Express error:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Server error', detail: String(err && err.message ? err.message : err) });
});

// ----- start server -----
console.log('Booting Chatternet API… Node =', process.version, 'PORT =', PORT);
const server = app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});
server.on('error', (e) => {
  console.error('listen error:', e && e.stack ? e.stack : e);
});
