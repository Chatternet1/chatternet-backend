// server.js  — Chatternet API (Auth + Profiles + Minimal Feed)
// Run:  node server.js
// Env:  PORT=8080  JWT_SECRET=change_me  ORIGIN=https://your-frontend.example,https://another-frontend.example
// Persists to ./chatternet.db (SQLite)

const express = require("express");
const path = require("path");
const cookie = require("cookie-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const Database = require("better-sqlite3");

// --- config
const PORT = process.env.PORT || 8080;
const ORIGIN = (process.env.ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "chatternet.db");

// --- app
const app = express();
app.use(express.json({ limit: "1.5mb" }));
app.use(cookie());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ORIGIN.length === 0 || ORIGIN.includes(origin)),
  credentials: true,
}));
app.use((req,res,next)=>{ res.setHeader("X-Chatternet","api"); next(); });

// --- db
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Me',
  bio TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  cover_url  TEXT DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_code TEXT DEFAULT NULL,
  reset_code  TEXT DEFAULT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  followee_id INTEGER NOT NULL,
  UNIQUE(follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const selUserById = db.prepare("SELECT id, handle, email, display_name, bio, avatar_url, cover_url, email_verified, created_at FROM users WHERE id=?");
const selUserByHandle = db.prepare("SELECT id, handle, email, display_name, bio, avatar_url, cover_url, email_verified, created_at FROM users WHERE handle=?");
const selAuthByHandleOrEmail = db.prepare("SELECT * FROM users WHERE handle=? OR email=?");

// --- helpers
function nowISO(){ return new Date().toISOString(); }
function safeUser(u){ if(!u) return null; const {pass_hash, verify_code, reset_code, ...rest} = u; return rest; }
function sign(res, payload){
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("ct_token", token, { httpOnly:true, sameSite:"lax", secure:false, maxAge: 1000*60*60*24*7, path:"/" });
}
function clear(res){ res.clearCookie("ct_token", { path:"/" }); }
function authed(req,res,next){
  const t = req.cookies.ct_token;
  if(!t) return res.status(401).json({ error:"auth_required" });
  try{ req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch(e){ return res.status(401).json({ error:"bad_token" }); }
}

// --- static (serve assets + any static frontend you add here)
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/public", express.static(path.join(__dirname, "public")));

// --- health
app.get("/api/health", (req,res)=>res.json({ ok:true, time:nowISO() }));

// --- auth: register
app.post("/api/auth/register", (req,res)=>{
  const { handle, email, password } = req.body||{};
  if(!handle || !email || !password) return res.status(400).json({ error:"missing_fields" });
  if(!/^[a-z0-9_]{3,20}$/i.test(handle)) return res.status(400).json({ error:"bad_handle" });
  if(password.length < 8) return res.status(400).json({ error:"weak_password" });

  try{
    const pass_hash = bcrypt.hashSync(password, 10);
    const verify_code = nanoid(6).toUpperCase();
    db.prepare("INSERT INTO users(handle,email,pass_hash,display_name,created_at,verify_code) VALUES(?,?,?,?,?,?)")
      .run(handle, (email||"").toLowerCase(), pass_hash, handle, nowISO(), verify_code);
    const u = selUserByHandle.get(handle);
    sign(res, { id:u.id, handle:u.handle });
    return res.json({ ok:true, user:safeUser(u), verify_code });
  }catch(e){
    if(String(e.message).includes("UNIQUE")) return res.status(409).json({ error:"exists" });
    console.error(e); return res.status(500).json({ error:"server" });
  }
});

// --- auth: verify email
app.post("/api/auth/verify-email", authed, (req,res)=>{
  const { code } = req.body||{};
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if(!user) return res.status(404).json({ error:"no_user" });
  if(!code || code !== user.verify_code) return res.status(400).json({ error:"bad_code" });
  db.prepare("UPDATE users SET email_verified=1, verify_code=NULL WHERE id=?").run(user.id);
  const u = selUserById.get(user.id);
  return res.json({ ok:true, user:safeUser(u) });
});

// --- auth: login
app.post("/api/auth/login", (req,res)=>{
  const { handleOrEmail, password } = req.body||{};
  const u = selAuthByHandleOrEmail.get(handleOrEmail, (handleOrEmail||"").toLowerCase());
  if(!u) return res.status(404).json({ error:"no_user" });
  if(!bcrypt.compareSync(password||"", u.pass_hash)) return res.status(401).json({ error:"bad_password" });
  sign(res, { id:u.id, handle:u.handle });
  return res.json({ ok:true, user:safeUser(u) });
});

// --- auth: logout
app.post("/api/auth/logout", (req,res)=>{ clear(res); res.json({ ok:true }); });

// --- auth: me
app.get("/api/auth/me", authed, (req,res)=>{
  const u = selUserById.get(req.user.id);
  return res.json({ ok:true, user:safeUser(u) });
});

// --- password reset (demo)
app.post("/api/auth/send-reset", (req,res)=>{
  const { email } = req.body||{};
  const u = db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase());
  if(!u) return res.json({ ok:true });
  const code = nanoid(6).toUpperCase();
  db.prepare("UPDATE users SET reset_code=? WHERE id=?").run(code, u.id);
  return res.json({ ok:true, reset_code: code }); // email in prod
});
app.post("/api/auth/apply-reset", (req,res)=>{
  const { email, code, newPassword } = req.body||{};
  const u = db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase());
  if(!u || !code || code !== u.reset_code) return res.status(400).json({ error:"bad_code" });
  if((newPassword||"").length < 8) return res.status(400).json({ error:"weak_password" });
  db.prepare("UPDATE users SET pass_hash=?, reset_code=NULL WHERE id=?").run(bcrypt.hashSync(newPassword,10), u.id);
  return res.json({ ok:true });
});

// --- profile
app.put("/api/profile", authed, (req,res)=>{
  const { displayName, bio, avatarUrl, coverUrl } = req.body||{};
  db.prepare("UPDATE users SET display_name=?, bio=?, avatar_url=?, cover_url=? WHERE id=?")
    .run(displayName||"Me", bio||"", avatarUrl||"", coverUrl||"", req.user.id);
  const u = selUserById.get(req.user.id);
  return res.json({ ok:true, user:safeUser(u) });
});
app.get("/api/users/:handle", (req,res)=>{
  const u = selUserByHandle.get(req.params.handle);
  if(!u) return res.status(404).json({ error:"no_user" });
  res.json({ ok:true, user:safeUser(u) });
});

// --- follow
app.post("/api/follow/:handle", authed, (req,res)=>{
  const target = selUserByHandle.get(req.params.handle);
  if(!target) return res.status(404).json({ error:"no_user" });
  if(target.id === req.user.id) return res.status(400).json({ error:"self" });
  try{
    db.prepare("INSERT INTO follows(follower_id,followee_id) VALUES(?,?)").run(req.user.id, target.id);
    return res.json({ ok:true, following:true });
  }catch(e){
    db.prepare("DELETE FROM follows WHERE follower_id=? AND followee_id=?").run(req.user.id, target.id);
    return res.json({ ok:true, following:false });
  }
});

// --- posts
app.get("/api/posts", (req,res)=>{
  const rows = db.prepare(`
    SELECT p.id, p.body, p.created_at,
           u.handle, u.display_name, u.avatar_url
    FROM posts p JOIN users u ON u.id=p.user_id
    ORDER BY p.id DESC LIMIT 200
  `).all();
  res.json({ ok:true, items: rows });
});
app.post("/api/posts", authed, (req,res)=>{
  const { body } = req.body||{};
  if(!body || !body.trim()) return res.status(400).json({ error:"empty" });
  db.prepare("INSERT INTO posts(user_id,body,created_at) VALUES(?,?,?)").run(req.user.id, body.trim(), nowISO());
  res.json({ ok:true });
});

// --- start
app.listen(PORT, ()=>console.log(`Chatternet API on :${PORT}`));
