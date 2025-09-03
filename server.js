// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow your Weebly site to call the API
app.use(cors());

// IMPORTANT: raise body size limits so avatars / covers (base64) can be saved
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

// ---- DATA ----
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

function defaultData() {
  return {
    users: [],          // {id,email,password,name,bio,avatar,cover,friends[],friendRequests[]}
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
  } catch (e) {}
  return defaultData();
}

let data = load();

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const nowISO = () => new Date().toISOString();
const byId = (id) => (data.users || []).find(u => u.id === id);

// ---- HEALTH ----
app.get('/api/health', (req, res) => res.json({ ok: true, time: nowISO() }));

// ---- USERS ----
app.post('/api/signup', (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  if ((data.users || []).find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  const user = { id: Date.now().toString(), email, password, name, bio: '', avatar: '', cover: '', friends: [], friendRequests: [] };
  data.users.push(user); save();
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
  const u = byId(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(u);
});

app.put('/api/users/:id', (req, res) => {
  const u = byId(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  // Merge simple fields; arrays/objects replace as provided
  const incoming = req.body || {};
  Object.assign(u, incoming);
  save();
  res.json(u);
});

// ---- POSTS ----
app.get('/api/posts', (req, res) => res.json(data.posts || []));

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
  data.posts.push(post); save();
  res.json(post);
});

// persist likes/comments/bot replies
app.put('/api/posts/:id', (req, res) => {
  const id = req.params.id;
  const i = (data.posts || []).findIndex(p => p.id === id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const incoming = req.body || {};
  data.posts[i] = {
    ...data.posts[i],
    ...incoming,
    comments: Array.isArray(incoming.comments) ? incoming.comments : (data.posts[i].comments || []),
    likes: Array.isArray(incoming.likes) ? incoming.likes : (data.posts[i].likes || [])
  };
  save();
  res.json(data.posts[i]);
});

// ---- MESSAGES ----
// GET /api/messages?userId=...&peerId=...
app.get('/api/messages', (req, res) => {
  const { userId, peerId } = req.query;
  if (!userId || !peerId) return res.status(400).json({ error: 'userId & peerId required' });
  const list = (data.messages || [])
    .filter(m =>
      (m.fromId === userId && m.toId === peerId) ||
      (m.fromId === peerId && m.toId === userId)
    )
    .sort((a,b) => new Date(a.time) - new Date(b.time));
  res.json(list);
});

// POST /api/messages  {fromId,toId,text}
app.post('/api/messages', (req, res) => {
  const { fromId, toId, text } = req.body || {};
  if (!fromId || !toId || !text) return res.status(400).json({ error: 'fromId, toId, text required' });
  const msg = { id: Date.now().toString(), fromId, toId, text, time: nowISO() };
  data.messages.push(msg); save();
  res.json(msg);
});

// Optional: thread list for a user
app.get('/api/threads/:userId', (req, res) => {
  const userId = req.params.userId;
  const peers = new Map(); // peerId -> last message
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

app.listen(PORT, () => console.log(`API listening on ${PORT}`));
