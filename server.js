// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Allow bigger JSON (for data-URL avatars/covers)
app.use(cors());
app.use(bodyParser.json({ limit: '6mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '6mb' }));

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/index.html'));

// ---- DATA ----
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
function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
const nowISO = () => new Date().toISOString();
const byId = id => (data.users || []).find(u => u.id === id);

// ---- HEALTH ----
app.get('/api/health', (_req, res) => res.json({ ok: true, time: nowISO() }));

// ---- USERS ----
app.post('/api/signup', (req, res) => {
  const { email, password, name = '' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  if ((data.users || []).find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  const user = {
    id: Date.now().toString(),
    email, password, name,
    bio: '', avatar: '', cover: '',
    friends: [], friendRequests: [],
    privacy: { visibility: 'private', pic: true, fr: true, dm: true, dmAudience: 'everyone', online: false, tags: true, search: true, activity: false, locati
