// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json());

// --- Load & persist ---
let data = {
  users: [],
  posts: [],
  messages: [] // <-- NEW
};
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE));
    data = { ...data, ...raw, messages: raw.messages || [] };
  } catch { /* keep defaults */ }
}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Helpers ---
const nowISO = () => new Date().toISOString();
const byId = (id) => data.users.find(u => u.id === id);

// --- Health ---
app.get('/api/health', (_req, res) => res.json({ ok: true, time: nowISO() }));

// --- Users ---
app.post('/api/signup', (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  if (data.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  const user = { id: Date.now().toString(), email, password, name, bio: '', avatar: '', friends: [], friendRequests: [] };
  data.users.push(user); save();
  res.json({ user });
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = data.users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(400).json({ error: 'Invalid login' });
  res.json({ user });
});
app.get('/api/users', (_req, res) => res.json(data.users));
app.get('/api/users/:id', (req, res) => res.json(byId(req.params.id) || {}));
app.put('/api/users/:id', (req, res) => {
  const u = byId(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  Object.assign(u, req.body || {}); save(); res.json(u);
});

// --- Posts (minimal) ---
app.get('/api/posts', (_req, res) => res.json(data.posts || []));
app.post('/api/posts', (req, res) => {
  const post = { id: Date.now().toString(), createdAt: nowISO(), comments: [], likes: [], ...req.body };
  data.posts.push(post); save(); res.json(post);
});
app.put('/api/posts/:id', (req, res) => {
  const i = (data.posts || []).findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  data.posts[i] = { ...data.posts[i], ...req.body }; save(); res.json(data.posts[i]);
});

// === MESSAGES (NEW) ===
//  Shape: { id, fromId, toId, text, time }
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
  if (!byId(fromId) || !byId(toId)) return res.status(400).json({ error: 'Invalid user id(s)' });
  const msg = { id: Date.now().toString(), fromId, toId, text, time: nowISO() };
  data.messages.push(msg); save(); res.json(msg);
});
// Optional convenience: recent threads for a user
app.get('/api/threads/:userId', (req, res) => {
  const { userId } = req.params;
  const mine = (data.messages || []).filter(m => m.fromId === userId || m.toId === userId);
  const peers = new Map();
  mine.forEach(m => {
    const peerId = m.fromId === userId ? m.toId : m.fromId;
    const last = peers.get(peerId);
    if (!last || new Date(m.time) > new Date(last.time)) peers.set(peerId, m);
  });
  const out = Array.from(peers.entries()).map(([peerId, last]) => ({
    peer: byId(peerId) || { id: peerId, name: 'Unknown', email: '' },
    last
  })).sort((a, b) => new Date(b.last.time) - new Date(a.last.time));
  res.json(out);
});

app.listen(PORT, () => console.log(`API listening on ${PORT}`));
