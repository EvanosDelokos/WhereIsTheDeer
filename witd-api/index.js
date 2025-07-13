const cors = require("cors");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());

// ✅ Point to mounted volume path
const db = new sqlite3.Database("/data/addresses.sqlite");

// 🔁 Health check
app.get("/health", (req, res) => res.status(200).send("OK"));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API running on http://0.0.0.0:${PORT}`);
});
