const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
// Use host-provided port (Render/Heroku) or 3000 locally
const PORT = process.env.PORT || 3000;

// Allow your website to call the API
app.use(cors());
app.use(bodyParser.json());

// Where we store data (JSON file)
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

// Load data (or create empty structure)
let data = { users: [], posts: [], polls: [], blogs: [], media: [], music: [], groups: [], events: [] };
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
}
function saveData(){ try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); } catch(e){ console.error('saveData error', e); } }

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ===== USERS ===== */
app.post('/api/signup', (req, res) => {
  const { email, password, name='' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (data.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  const user = { id: Date.now().toString(), email, password, name, bio:'', avatar:'', friends:[], friendRequests:[] };
  data.users.push(user); saveData();
  res.json({ user });
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = data.users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(400).json({ error: 'Invalid login' });
  res.json({ user });
});
app.get('/api/users', (_req,res)=>res.json(data.users));
app.get('/api/users/:id', (req,res)=>res.json(data.users.find(u=>u.id===req.params.id) || {}));
app.put('/api/users/:id', (req,res)=>{
  const user = data.users.find(u=>u.id===req.params.id);
  if(!user) return res.status(404).json({error:'User not found'});
  Object.assign(user, req.body); saveData(); res.json(user);
});

/* ===== POSTS ===== */
app.get('/api/posts', (_req,res)=>res.json(data.posts));
app.post('/api/posts', (req,res)=>{
  const post = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...req.body };
  data.posts.push(post); saveData(); res.json(post);
});

/* ===== (Optional) other collections you already had ===== */
app.get('/api/polls', (_req,res)=>res.json(data.polls));
app.post('/api/polls', (req,res)=>{ const poll = { id: Date.now().toString(), votes1:0, votes2:0, ...req.body }; data.polls.push(poll); saveData(); res.json(poll); });

app.get('/api/blogs', (_req,res)=>res.json(data.blogs));
app.post('/api/blogs', (req,res)=>{ const blog = { id: Date.now().toString(), ...req.body }; data.blogs.push(blog); saveData(); res.json(blog); });

app.get('/api/media', (_req,res)=>res.json(data.media));
app.post('/api/media', (req,res)=>{ const m = { id: Date.now().toString(), ...req.body }; data.media.push(m); saveData(); res.json(m); });

app.get('/api/music', (_req,res)=>res.json(data.music));
app.post('/api/music', (req,res)=>{ const m = { id: Date.now().toString(), ...req.body }; data.music.push(m); saveData(); res.json(m); });

app.get('/api/groups', (_req,res)=>res.json(data.groups));
app.post('/api/groups', (req,res)=>{ const g = { id: Date.now().toString(), ...req.body }; data.groups.push(g); saveData(); res.json(g); });

app.get('/api/events', (_req,res)=>res.json(data.events));
app.post('/api/events', (req,res)=>{ const e = { id: Date.now().toString(), ...req.body }; data.events.push(e); saveData(); res.json(e); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
