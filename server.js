// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

// --- Config ---
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());

// --- Data store ---
function defaultData() {
  return {
    users: [],          // {id,email,password,name,bio,avatar,friends[],friendRequests[]}
    posts: [],          // {id,title,content,authorName,createdAt,media?,comments[],likes[]}
    messages: [],       // {id,fromId,toId,text,time}
    polls: [],
    blogs: [],
    media: [],
    music: [],
    groups: [],
    events: []
  };
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Load data error:', e);
  }
  return defaultData();
}

let data = load();

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Save data error:', e);
  }
}

const nowISO = () => new Date().toISOString();
const userById = (id) => (data.users || []).find(u => u.id === id);

// --- Root & health ---
app.get('/', (req, res) => res.redirect('/api/health'));
app.get('/api/health', (req, res) => res.json({ ok: true, time: nowISO() }));

// --- USERS ---
app.post('/api/signup', (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email & password required' });
  }
  if ((data.users || []).find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email exists' });
  }
  const user = {
    id: Date.now().toString(),
    email,
    password,
    name,
    bio: '',
    avatar: '',
    friends: [],
    friendRequests: []
  };
  data.users.push(user);
  save();
  res.json({ user });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = (data.users || []).find(u => u.email === email && u.password === password);
  if (!user) return res.status(400).json({ error: 'Invalid login' });
  res.json({ user });
});

app.get('/api/users', (req, res) => res.json(data.users || []));

app.get('/api/users/:id', (req, res) => {
  const u = userById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(u);
});

app.put('/api/users/:id', (req, res) => {
  const u = userById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  Object.assign(u, req.body || {});
  save();
  res.json(u);
});

// --- POSTS ---
app.get('/api/posts', (req, res) => res.json(data.posts || []));

app.post('/api/posts', (req, res) => {
  const body = req.body || {};
  const post = {
    id: Date.now().toString(),
    title: body.title || '',
    content: body.content || '',
    authorName: body.authorName || 'Me',
    createdAt: body.createdAt || nowISO(),
    media: body.media || null,
    comments: Array.isArray(body.comments) ? body.comments : [],
    likes: Array.isArray(body.likes) ? body.likes : []
  };
  data.posts.push(post);
  save();
  res.json(post);
});

// *** Persist likes & comments ***
app.put('/api/posts/:id', (req, res) => {
  const id = req.params.id;
  const posts = data.posts || [];
  const i = posts.findIndex(p => p.id === id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });

  const incoming = req.body || {};
  posts[i] = {
    ...posts[i],
    ...incoming,
    comments: Array.isArray(incoming.comments) ? incoming.comments : (posts[i].comments || []),
    likes: Array.isArray(incoming.likes) ? incoming.likes : (posts[i].likes || [])
  };
  save();
  res.json(posts[i]);
});

// --- MESSAGES ---
// GET conversation between two users
// /api/messages?userId=...&peerId=...
app.get('/api/messages', (req, res) => {
  const { userId, peerId } = req.query;
  if (!userId || !peerId) {
    return res.status(400).json({ error: 'userId & peerId required' });
  }
  const list = (data.messages || [])
    .filter(m =>
      (m.fromId === userId && m.toId === peerId) ||
      (m.fromId === peerId && m.toId === userId)
    )
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(list);
});

// POST message  {fromId,toId,text}
app.post('/api/messages', (req, res) => {
  const { fromId, toId, text } = req.body || {};
  if (!fromId || !toId || !text) {
    return res.status(400).json({ error: 'fromId, toId, text required' });
  }
  const msg = { id: Date.now().toString(), fromId, toId, text, time: nowISO() };
  data.messages.push(msg);
  save();
  res.json(msg);
});

// Lightweight thread list for a user
app.get('/api/threads/:userId', (req, res) => {
  const userId = req.params.userId;
  const peers = new Map(); // peerId -> lastMessage
  (data.messages || []).forEach(m => {
    if (m.fromId === userId || m.toId === userId) {
      const peerId = m.fromId === userId ? m.toId : m.fromId;
      const prev = peers.get(peerId);
      if (!prev || new Date(m.time) > new Date(prev.time)) peers.set(peerId, m);
    }
  });
  const out = Array.from(peers.entries()).map(([peerId, last]) => ({ peerId, last }));
  res.json(out);
});

// --- 404 for unknown API routes (JSON) ---
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// --- Start ---
app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});
