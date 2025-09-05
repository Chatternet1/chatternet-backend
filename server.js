// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// --- middleware
app.use(cors());
app.use(bodyParser.json({ limit: '6mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '6mb' }));

// --- static site
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/index.html'));

// --- DATA FILE ---
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
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return defaultData();
}
let data = load();

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}
const nowISO = () => new Date().toISOString();
const byId = (id) => (data.users || []).find(u => String(u.id) === String(id));

// --- HEALTH ---
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, time: nowISO(), node: process.version, dataFile: DATA_FILE })
);

// --- USERS ---
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
      visibility: 'private', pic: true, fr: true, dm: true, dmAudience: 'everyone',
      online: false, tags: true, search: true, activity: false, location: false
    },
    settings: {
      darkMode: false, compact: false, highContrast: false, reduceMotion: false,
      fontSize: 'medium', theme: 'blue', language: 'en',
      notifications: { event: true, friend: true, post: true, sound: false, volume: 0.5 }
    },
    createdAt: nowISO()
  };
  (data.users ||= []).push(user); save();
  res.json({ user });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = (data.users || []).find(u => u.email === email && u.password === password);
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
  const i = (data.users || []).findIndex(u => u.id === id);
  if (i < 0) return res.status(404).json({ error: 'User not found' });
  const incoming = req.body || {};
  data.users[i] = {
    ...data.users[i],
    ...incoming,
    friends: Array.isArray(incoming.friends) ? incoming.friends : (data.users[i].friends || []),
    friendRequests: Array.isArray(incoming.friendRequests) ? incoming.friendRequests : (data.users[i].friendRequests || []),
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

// --- ECHO BOT (auto-reply) ---
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
      avatar: '',
      cover: '',
      friends: [],
      friendRequests: [],
      privacy: { visibility: 'public', dm: true, dmAudience: 'everyone' },
      settings: { notifications: {} },
      createdAt: nowISO()
    };
    (data.users ||= []).push(bot);
    save();
  } else if (!bot.bot) {
    bot.bot = true; save();
  }
  return bot;
}
ensureEchoBot();

function botReplyText(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return "Say something and I'll echo it back.";
  if (/hello|hi|hey/.test(t)) return "Hello! I'm an echo bot. Say anything.";
  if (t.startsWith('/time')) return 'Server time: ' + nowISO();
  return `Echo: ${text}`;
}

// --- MESSAGES ---
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

  // auto-reply if recipient is a bot
  const toUser = byId(toId);
  if (toUser?.bot) {
    const reply = {
      id: (Date.now() + 1).toString(),
      fromId: toUser.id,
      toId: fromId,
      text: botReplyText(text),
      time: nowISO()
    };
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

// --- FRIENDS ---
app.get('/api/friends', (req, res) => {
  const { userId } = req.query || {};
  const u = byId(userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const friends = (u.friends || []).map(id => byId(id)).filter(Boolean);
  res.json({
    friends,
    requests: (u.friendRequests || []).map(id => byId(id)).filter(Boolean)
  });
});

// send request (fromId -> toId)
app.post('/api/friends/request', (req, res) => {
  const { fromId, toId } = req.body || {};
  const from = byId(fromId), to = byId(toId);
  if (!from || !to) return res.status(404).json({ error: 'User not found' });

  // already friends?
  if ((from.friends || []).includes(to.id)) return res.json({ ok: true, already: true });

  // bots auto-accept
  if (to.bot) {
    from.friends ||= []; to.friends ||= [];
    if (!from.friends.includes(to.id)) from.friends.push(to.id);
    if (!to.friends.includes(from.id)) to.friends.push(from.id);
    save(); return res.json({ ok: true, autoAccepted: true });
  }

  to.friendRequests ||= [];
  if (!to.friendRequests.includes(from.id)) to.friendRequests.push(from.id);
  save();
  res.json({ ok: true });
});

// accept / decline (toId acts on request from fromId)
app.post('/api/friends/respond', (req, res) => {
  const { fromId, toId, action } = req.body || {};
  const from = byId(fromId), to = byId(toId);
  if (!from || !to) return res.status(404).json({ error: 'User not found' });

  to.friendRequests = (to.friendRequests || []).filter(id => id !== from.id);

  if (action === 'accept') {
    from.friends ||= []; to.friends ||= [];
    if (!from.friends.includes(to.id)) from.friends.push(to.id);
    if (!to.friends.includes(from.id)) to.friends.push(from.id);
  }
  save();
  res.json({ ok: true });
});

// --- POSTS (Feed) ---
function normalizePost(p = {}) {
  return {
    id: p.id || Date.now().toString(),
    title: p.title || '',
    content: p.content || '',
    media: p.media || '',
    authorId: p.authorId || '',
    authorName: p.authorName || '',
    createdAt: p.createdAt || nowISO()
  };
}

app.get('/api/posts', (_req, res) => {
  const list = (data.posts || []).slice().sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list.map(normalizePost));
});

app.post('/api/posts', (req, res) => {
  const { title = '', content = '', media = '', authorId = '', authorName = '' } = req.body || {};
  if (!content.trim()) return res.status(400).json({ error: 'content required' });
  const post = normalizePost({ title, content, media, authorId, authorName, id: Date.now().toString(), createdAt: nowISO() });
  (data.posts ||= []).unshift(post);
  save();
  res.json(post);
});

app.delete('/api/posts/:id', (req, res) => {
  const before = (data.posts || []).length;
  data.posts = (data.posts || []).filter(p => String(p.id) !== String(req.params.id));
  if (data.posts.length === before) return res.status(404).json({ error: 'Post not found' });
  save();
  res.json({ ok: true });
});

// --- EVENTS ---
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

app.get('/api/events', (_req, res) => {
  res.json((data.events || []).map(ensureEvent));
});

app.get('/api/events/:id', (req, res) => {
  const ev = (data.events || []).find(e => String(e.id) === String(req.params.id));
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json(ensureEvent(ev));
});

app.post('/api/events', (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const ev = ensureEvent({ ...req.body, id: Date.now().toString(), createdAt: nowISO() });
  (data.events ||= []).unshift(ev);
  save();
  res.json(ev);
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
  save();
  res.json(list[i]);
});

app.delete('/api/events/:id', (req, res) => {
  const before = (data.events || []).length;
  data.events = (data.events || []).filter(e => String(e.id) !== String(req.params.id));
  if (data.events.length === before) return res.status(404).json({ error: 'Event not found' });
  save();
  res.json({ ok: true });
});

// --- start
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
