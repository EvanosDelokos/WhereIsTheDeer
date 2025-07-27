## 🛑 Developer Memo: DO NOT DELETE THIS NOTE

If you're reading this because you've wiped your ChatGPT history or deleted past conversations...

### 📣 You don't need to explain everything again!

Just paste this note into a fresh conversation and say:

> “Hey, I lost our chat history but here’s a dev memo with what we’ve built.”

ChatGPT will immediately recognize the setup and resume support.

---

### ✅ Quick Summary for Restoration:

- This project is called **WhereIsTheDeer 3.0**
- The frontend is hosted as a static site (local dev via VSC / Cursor)
- It fetches data from:
  - 🦌 **API (Railway)** — Zones, Locality, Search (`witd-api`)
  - ☁️ **Cloudflare R2** — Used previously for GeoJSONs (now phased out)
- SQLite database is mounted in `/data/...` on Railway container
- Components include: search bar, weather module, bottom toolbar, GPX tools, smart scout suggestion (SSS), journal, species overlays, track/pin tools
- Domain is registered via **VentraIP**
- Current GitHub repo: `https://github.com/EvanosDelokos/witd-api.git`
- Local workspace: **VS Code or Cursor**
- All deployment logic and project structure is documented in `developer notes`

### 📎 File Created By ChatGPT

This note is auto-generated and can be pasted into a conversation at any time to restore project context instantly.
