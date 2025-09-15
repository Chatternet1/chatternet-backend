// server.js
"use strict";

/**
 * Chatternet backend (Express + Postgres sessions + static site)
 * - Serves /public (HTML/JS/CSS) including assets/messenger.js
 * - Session store: connect-pg-simple (uses DATABASE_URL on Render)
 * - Minimal demo APIs:
 *    GET  /healthz
 *    GET  /api/me
 *    CRUD /events   (in-memory demo store; front-end also falls back to localStorage)
 */

const path = require("path");
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);
const { Pool } = require("pg");

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const PROD = NODE_ENV === "production";

const DATABASE_URL = process.env.DATABASE_URL || ""; // Render Postgres
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-change-me";

// Allow your site(s). You can add your real domain here.
const ALLOW_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5000",
  "https://chatternet-backend-1.onrender.com",
];

// ---------- App ----------
const app = express();

// Security headers (relaxed CSP so your inline scripts/pages work)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Compression
app.use(compression());

// CORS (credentials enabled)
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow no origin (curl, mobile webviews) or anything in ALLOW_ORIGINS.
      if (!origin) return cb(null, true);
      if (ALLOW_ORIGINS.some((o) => origin.startsWith(o))) return cb(null, true);
      // Permissive for now. Tighten if you want.
      return cb(null, true);
    },
    credentials: true,
  })
);

// Trust proxy (Render)
app.set("trust proxy", 1);

// Body parsers
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------- Sessions ----------
let store;
if (DATABASE_URL) {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: PROD ? { rejectUnauthorized: false } : false,
  });
  store = new PgStore({
    pool,
    tableName: "session",
    createTableIfMissing: true, // auto-create table on first run
  });
} else {
  console.warn("DATABASE_URL not set — using in-memory sessions (dev only).");
}

app.use(
  session({
    name: "ctsid",
    secret: SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
    store,
    cookie: {
      httpOnly: true,
      secure: PROD, // secure cookies in production
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  })
);

// ---------- Tiny demo APIs ----------
app.get("/healthz", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

app.get("/api/me", (req, res) => {
  // Simple demo session counter
  req.session.seen = (req.session.seen || 0) + 1;
  res.json({ name: "Me", seen: req.session.seen });
});

// ---------- Events API (demo; in-memory) ----------
/**
 * Shape is kept loose to match the front-end:
 * {
 *   id, title, date, time, endDate, endTime, location, tickets, price,
 *   privacy, category, tags[], desc, imgSrc,
 *   creator, cohosts[], rsvp:{Going[],Maybe[],NotGoing[]},
 *   discussion[], likes[], createdAt
 * }
 */
let EVENTS = [];

function ensureEvent(ev = {}) {
  return {
    id: String(ev.id || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    title: ev.title || "Event",
    date: ev.date || "",
    time: ev.time || "",
    endDate: ev.endDate || "",
    endTime: ev.endTime || "",
    location: ev.location || "",
    tickets: ev.tickets || "",
    price: ev.price || "",
    privacy: ev.privacy || "Public",
    category: ev.category || "",
    tags: Array.isArray(ev.tags) ? ev.tags : [],
    desc: ev.desc || "",
    imgSrc: ev.imgSrc || "",
    creator: ev.creator || "Me",
    cohosts: ev.cohosts || [],
    rsvp: ev.rsvp || { Going: [], Maybe: [], NotGoing: [] },
    discussion: ev.discussion || [],
    likes: ev.likes || [],
    createdAt: ev.createdAt || new Date().toISOString(),
  };
}

app.get("/events", (_req, res) => {
  res.json(EVENTS.map(ensureEvent));
});

app.post("/events", (req, res) => {
  const ev = ensureEvent(req.body || {});
  EVENTS.unshift(ev);
  res.json(ev);
});

app.put("/events/:id", (req, res) => {
  const id = String(req.params.id || "");
  const idx = EVENTS.findIndex((e) => String(e.id) === id);
  const updated = ensureEvent({ ...(EVENTS[idx] || {}), ...(req.body || {}), id });
  if (idx >= 0) EVENTS[idx] = updated;
  else EVENTS.unshift(updated);
  res.json(updated);
});

app.delete("/events/:id", (req, res) => {
  const id = String(req.params.id || "");
  const before = EVENTS.length;
  EVENTS = EVENTS.filter((e) => String(e.id) !== id);
  res.json({ ok: true, deleted: before - EVENTS.length });
});

// ---------- Static site ----------
const pubDir = path.join(__dirname, "public");
app.use(express.static(pubDir, { extensions: ["html"] }));

// Default API 404 (before HTML fallback)
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// HTML fallback to /public/index.html (so bare domain works)
app.get("*", (req, res, next) => {
  // Don’t hijack asset paths
  if (req.path.startsWith("/assets/")) return next();
  res.sendFile(path.join(pubDir, "index.html"));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Chatternet backend listening on http://0.0.0.0:${PORT} (${NODE_ENV})`);
  if (!DATABASE_URL) {
    console.log("Tip: set DATABASE_URL on Render for persistent session storage.");
  }
});
