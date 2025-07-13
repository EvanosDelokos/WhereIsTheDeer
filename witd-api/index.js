const cors = require("cors");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(cors());

// __dirname is available in CommonJS already
const db = new sqlite3.Database(path.join(__dirname, "addresses.sqlite"));

// Health check route
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/search", (req, res) => {
  const q = req.query.q;
  console.log(">> Incoming /search:", q); // 🔍 Add this

  if (!q) {
    console.log(">> Missing query param");
    return res.status(400).json({ error: "Missing query" });
  }

  const terms = q.trim().split(/\s+/);
  if (terms.length === 0) {
    console.log(">> Empty terms after trim");
    return res.json([]);
  }

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

  console.log(">> Final SQL:", sql);
  console.log(">> Params:", params);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.log(">> SQL error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    console.log(">> Returning", rows.length, "results");
    res.json(rows);
  });
});

app.get("/", (req, res) => {
  res.send("WhereIsTheDeer API is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
});
