# 🦌 WhereIsTheDeer — Full Developer Infrastructure Notes (2025)

This document summarizes **all services, configurations, and hosting details** that power the WhereIsTheDeer project. It is designed to help developers maintain, debug, and scale the platform in the future.

---

## 🌐 Domain & DNS

| Provider     | Purpose                        | Notes                                                  |
|--------------|--------------------------------|--------------------------------------------------------|
| 🌍 **VentraIP** | Domain name registrar & DNS     | `whereisthedeer.com.au` domain purchased and managed here. Custom DNS records point to Cloudflare. |

---

## ☁️ CDN, Edge Caching & Assets

| Provider        | Purpose                            | Notes                                                                 |
|------------------|------------------------------------|-----------------------------------------------------------------------|
| 🌩 **Cloudflare** | CDN, DNS, and asset proxying       | Public assets like GPX, images, and R2 storage were initially served via [r2.dev](https://r2.dev) links, later replaced with API. |
| 📦 **Cloudflare R2** | Object storage for large files     | Stores `zones.json`, `LocalityPolygon.geojson`, and potentially large GPX or imagery files. Not directly public-facing anymore. |

---

## 🧠 Backend API

| Provider     | Purpose                            | Notes                                                                 |
|--------------|------------------------------------|-----------------------------------------------------------------------|
| 🚆 **Railway** | Backend API + SQLite DB hosting   | Express.js server handles search (`/search`), overlays (`/zones`, `/locality`) via volume-mounted SQLite and GeoJSON. |

### 📁 Railway Volume Setup

- Mounted at `/data/data/storage/data/data/`
- Contains:
  - `addresses.sqlite`
  - `zones.json`
  - `LocalityPolygon.geojson`

### ✅ Live API Endpoints

```
https://witd-api-production.up.railway.app/search?q=Broadmeadows
https://witd-api-production.up.railway.app/zones
https://witd-api-production.up.railway.app/locality
```

---

## 🖥 Git + Deployment

| Tool        | Purpose                      | Notes                                                          |
|-------------|------------------------------|----------------------------------------------------------------|
| 🐙 **GitHub** | Source control + CI/CD        | Main repo: `https://github.com/EvanosDelokos/witd-api`         |
| 🧠 **VS Code** | Local development IDE        | Main frontend lives in folder `WhereIsTheDeer2.0 - Copy/`       |
| 💻 **Cursor** | AI-powered code editor       | Used for iterating on map UI, modal styling, and JS modules.   |

---

## 🗺 Frontend Structure

Folder: `WhereIsTheDeer2.0 - Copy/`

### 📂 Key Files

| File                      | Purpose                                         |
|---------------------------|-------------------------------------------------|
| `index.html`              | Main landing page                               |
| `map.html`                | Interactive Leaflet map with toolbars + layers  |
| `style.css`               | All custom styling, including mobile UI         |
| `JS/mapEngine.js`         | Leaflet map init + tile layers                  |
| `JS/speciesLayer.js`      | Loads + renders `zones.json` overlays           |
| `JS/searchModule.js`      | Search bar with address lookup (via API)        |
| `JS/pinManager.js`        | Pins with rename/delete/journal                 |
| `JS/gpxManager.js`        | Upload + render GPX routes                      |
| `JS/drawModule.js`        | Track drawing (with minimum pin count)          |
| `JS/weatherModule.js`     | Forecasts, live search                          |
| `JS/disclaimerModule.js`  | Opens modal on load with legal notice           |
| `JS/journalModal.js`      | View/edit journal entries                       |
| `JS/settings.js`          | App config and constants                        |
| `JS/uiManager.js`         | Manages bottom toolbar + modal positioning      |
| `JS/main.js`              | Main entrypoint for wiring all modules          |

---

## ✅ Features Recap

- 📍 Pin placement with labels + journal
- 📏 Track drawing with min 2-point requirement
- 🧹 Clear pins with confirmation
- 🛰 Satellite + contour overlays (via Leaflet)
- 🔍 Address search (Railway SQLite-powered)
- 🌦 Weather forecast via external API
- 📁 GPX upload & viewer
- 🦌 Species filter: Deer, Duck, Hog Deer, etc.
- 🧠 Smart Scout Suggestions (UI placeholder for now)
- 📓 Journal log with view/edit modal

---

## 💬 Final Notes

- All API fetch URLs are now routed through Railway (`witd-api-production.up.railway.app`)
- No more usage of R2.dev in frontend after 27 July 2025
- `/locality` and `/zones` are **lazy loaded** and don't impact startup time
- Journal, weather, and species layers use the new unified popup/modal system

---

🛠 You can continue development from the `developer notes` file in the root. Add to this Markdown as features evolve.