/**
 * PartyFindr backend
 * Plain Node.js + Express + SQLite + JWT.
 *
 * Run:
 *   npm install
 *   npm start
 * Then open http://localhost:3000
 */

const express = require("express");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

// ---------- Database ----------
const db = new Database(path.join(__dirname, "partyfindr.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    dob TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    host_id TEXT NOT NULL,
    host_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    starts_at TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    min_age INTEGER NOT NULL,
    max_age INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    party_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (party_id, user_id)
  );
`);

// Seed demo parties on first run
const partyCount = db.prepare("SELECT COUNT(*) AS c FROM parties").get().c;
if (partyCount === 0) {
  const seed = db.prepare(`INSERT INTO parties
    (id, title, description, host_id, host_name, lat, lng, starts_at, capacity, min_age, max_age)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const day = 86400000;
  seed.run("seed-1", "Rooftop Sunset Hangout", "Bring a drink, meet new people, watch the sun go down.",
    "seed-host-1", "Maria", 48.2, 16.3, new Date(Date.now() + day).toISOString(), 20, 18, 30);
  seed.run("seed-2", "Board Games & Pizza", "Cozy living-room night. Catan, Codenames, lots of pizza.",
    "seed-host-2", "Theo", 48.215, 16.35, new Date(Date.now() + 2 * day).toISOString(), 8, 16, 25);
  seed.run("seed-3", "Backyard BBQ & Chill", "Grill, music, hammocks. Vegetarian options welcome.",
    "seed-host-3", "Lina", 48.185, 16.325, new Date(Date.now() + 3 * day).toISOString(), 15, 21, 40);
}

// ---------- Helpers ----------
function ageFromDob(dob) {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function uuid() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ (Math.random() * 16) >> (c / 4)).toString(16)
  );
}

function publicUser(row) {
  return { id: row.id, email: row.email, dob: row.dob, age: ageFromDob(row.dob) };
}

function partyWithAttendees(p) {
  const ids = db.prepare("SELECT user_id FROM attendance WHERE party_id = ?")
    .all(p.id).map(r => r.user_id);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    hostId: p.host_id,
    hostName: p.host_name,
    lat: p.lat,
    lng: p.lng,
    startsAt: p.starts_at,
    capacity: p.capacity,
    minAge: p.min_age,
    maxAge: p.max_age,
    attendeeIds: ids,
  };
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- App ----------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Auth
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, dob, attested } = req.body || {};
    if (!email || !password || !dob) return res.status(400).json({ error: "Missing fields." });
    if (!attested) return res.status(400).json({ error: "You must confirm your age is accurate." });
    const age = ageFromDob(dob);
    if (age < 16) return res.status(400).json({ error: "You must be at least 16 to use PartyFindr." });
    const existing = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
    if (existing) return res.status(400).json({ error: "An account with this email already exists." });
    const password_hash = await bcrypt.hash(password, 10);
    const id = uuid();
    db.prepare("INSERT INTO users (id, email, password_hash, dob) VALUES (?, ?, ?, ?)")
      .run(id, email, password_hash, dob);
    const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id, email, dob, age } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const row = db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
    if (!row) return res.status(400).json({ error: "Invalid email or password." });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(400).json({ error: "Invalid email or password." });
    const token = jwt.sign({ sub: row.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: publicUser(row) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/auth/me", authMiddleware, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  if (!row) return res.status(404).json({ error: "User not found." });
  res.json({ user: publicUser(row) });
});

// Parties
app.get("/parties", (req, res) => {
  const rows = db.prepare("SELECT * FROM parties").all();
  res.json(rows.map(partyWithAttendees));
});

app.post("/parties", authMiddleware, (req, res) => {
  const host = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  if (!host) return res.status(401).json({ error: "Invalid session." });
  const { title, description, lat, lng, startsAt, capacity, minAge, maxAge } = req.body || {};
  if (!title || !description || lat == null || lng == null || !startsAt || !capacity) {
    return res.status(400).json({ error: "Missing fields." });
  }
  const id = uuid();
  const hostName = host.email.split("@")[0];
  db.prepare(`INSERT INTO parties
    (id, title, description, host_id, host_name, lat, lng, starts_at, capacity, min_age, max_age)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title, description, host.id, hostName, lat, lng, startsAt, capacity, minAge ?? 16, maxAge ?? 99);
  const row = db.prepare("SELECT * FROM parties WHERE id = ?").get(id);
  res.json(partyWithAttendees(row));
});

app.post("/parties/:id/attend", authMiddleware, (req, res) => {
  const row = db.prepare("SELECT * FROM parties WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Party not found." });
  const party = partyWithAttendees(row);
  if (party.attendeeIds.includes(req.userId)) return res.json(party);
  if (party.attendeeIds.length >= party.capacity)
    return res.status(400).json({ error: "This party is already full." });
  db.prepare("INSERT OR IGNORE INTO attendance (party_id, user_id) VALUES (?, ?)")
    .run(req.params.id, req.userId);
  res.json(partyWithAttendees(row));
});

app.get("/me/attended", authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT p.* FROM parties p
    JOIN attendance a ON a.party_id = p.id WHERE a.user_id = ?`).all(req.userId);
  res.json(rows.map(partyWithAttendees));
});

app.listen(PORT, () => {
  console.log(`PartyFindr running on http://localhost:${PORT}`);
});
