const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
import { fileURLToPath } from "url";

const app = express();

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite init
const db = new sqlite3.Database(path.join(__dirname, "addresses.sqlite"));

// Search endpoint
app.get("/search", (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const terms = q.trim().split(/\s+/);
  if (terms.length === 0) return res.json([]);

  let addressTerms = terms.slice(0, -1);
  let suburbTerm = terms[terms.length - 1];

  const addrConds = addressTerms.map(() => `REPLACE(address, '.0 ', ' ') LIKE ?`).join(" AND ");
  const params = addressTerms.map(t => `%${t}%`);

  let sql = `SELECT * FROM addresses WHERE (${addrConds})`;
  if (suburbTerm) {
    sql += ` AND suburb LIKE ?`;
    params.push(`%${suburbTerm}%`);
  }

  sql += ` LIMIT 10`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Default root
app.get("/", (req, res) => {
  res.send("WhereIsTheDeer API is running.");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
