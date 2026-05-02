# 🏙️ Calgary 3D Urban Dashboard

An interactive 3D city dashboard for downtown Calgary featuring real building data, AI-powered natural language querying, and project persistence.

---

## 🌐 Live Demo

> **Hosted URL:** https://frontend-eosin-six-49.vercel.app/

---

## 📸 Features

- **3D Building Visualization** — 573 real Calgary buildings rendered using Three.js with accurate footprints and heights from OpenStreetMap
- **Click-to-Inspect** — Click any building to see its address, height, floors, zoning type, zone code, and assessed value
- **AI Natural Language Queries** — Type queries like:
  - `"highlight buildings over 100 feet"`
  - `"show commercial buildings"`
  - `"show buildings in RC-G zoning"`
  - `"buildings less than $500,000 in value"`
- **Project Persistence** — Save, load, and delete filter queries per user using SQLite
- **CSV Export** — Export any highlighted building set as a CSV file
- **Cinematic Intro** — Auto-rotating camera animation on load
- **Zoom Slider** — Smooth camera zoom control

---

## 🗂️ Project Structure

```
calgary-dashboard/
├── backend/
│   ├── app.py          # Flask API server — all routes
│   ├── data.py         # Fetches OSM building data + enriches with values
│   ├── llm.py          # HuggingFace LLM integration + rule-based fallback
│   ├── db.py           # SQLite database — users and projects
│   └── .env            # Your API keys (not committed to git)
├── frontend/
│   └── src/
│       ├── App.jsx      # Root component — state management
│       ├── Map3D.jsx    # Three.js 3D city renderer
│       ├── Sidebar.jsx  # UI panel — queries, legend, save/load
│       └── api.js       # All fetch calls to Flask backend
├── UML_diagram.png      # System architecture diagram
└── README.md
```

---

## ⚙️ Prerequisites

Make sure you have the following installed before starting:

| Tool | Version | Download |
|------|---------|----------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ (LTS) | https://nodejs.org |
| Git | Any | https://git-scm.com |

---

## 🔑 Getting a Hugging Face API Key (Free)

The app uses the **Mistral-7B** model via Hugging Face's free Inference API.

1. Go to **https://huggingface.co** and click **Sign Up** (free)
2. After logging in, click your profile picture → **Settings**
3. In the left sidebar, click **Access Tokens**
4. Click **New token** → give it a name (e.g. `calgary-dashboard`) → Role: **Read**
5. Click **Generate token** and **copy it** — it looks like `hf_xxxxxxxxxxxxxxxx`
6. Paste it into your `.env` file (see Setup step 3 below)

> **Note:** The app includes a rule-based fallback parser, so it will still work even if the HuggingFace API is unavailable or rate-limited.

---

## 🚀 Setup Instructions

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd calgary-dashboard
```

### 2. Set up the Backend

```bash
cd backend
pip install flask flask-cors requests python-dotenv
```

### 3. Create your `.env` file

Inside the `backend/` folder, create a file named `.env`:

```
HF_API_KEY=hf_xxxxxxxxxxxxxxxx
```

Replace `hf_xxxxxxxxxxxxxxxx` with your actual Hugging Face token from the steps above.

### 4. Run the Flask backend

```bash
python app.py
```

You should see:
```
Fetching buildings from OpenStreetMap...
Loaded 573 buildings
* Running on http://127.0.0.1:5000
```

### 5. Set up the Frontend (new terminal)

```bash
cd frontend
npm install
npm install three @react-three/fiber @react-three/drei axios
npm start
```

The app will open automatically at **http://localhost:3000**

---

## 🖥️ Usage Guide

### Viewing the Map
- **Drag** to rotate the camera
- **Scroll** to zoom in/out
- Use the **zoom slider** in the sidebar for precise zoom control
- **Click any building** to see its details in the popup

### AI Querying
1. Type a natural language query in the **AI Query** box
2. Press **Enter** or click **Run Query**
3. Matching buildings highlight in **yellow**
4. Click **Clear** to reset, or **Export CSV** to download results

**Example queries:**
```
buildings over 100 feet
show commercial buildings
buildings less than $500,000 in value
show buildings in RC-G zoning
more than 5 floors
```

### Saving Projects
1. Enter your username in the **Save / Load** section and click **Go**
2. Run an AI query to generate a filter
3. Type a project name and click 💾
4. Your saved projects appear below — click to reload any filter
5. Click **✕** on a project to delete it
6. Click **Switch User** to log in as a different user

---

## 🏗️ Data Sources

| Data | Source | Notes |
|------|--------|-------|
| Building footprints | OpenStreetMap (Overpass API) | Real coordinates and shapes |
| Building heights | OpenStreetMap tags | From `height` or `building:levels` |
| Zoning types | OpenStreetMap tags | `building`, `landuse` tags |
| Assessed values | Simulated | Height × $15,000 + variance (Calgary Open Data API returned 403; requires app token registration) |
| Zoning codes | Simulated | Real Calgary codes: CC-X, RC-G, M-C1, M-C2, etc. |

---

## 🤖 LLM Integration

**Primary:** Hugging Face Inference API using `mistralai/Mistral-7B-Instruct-v0.3`

The Flask backend sends a structured prompt to the LLM:
```
Query: "highlight buildings over 100 feet"
→ LLM returns: {"attribute": "height_feet", "operator": ">", "value": 100}
→ Backend filters 573 buildings
→ Frontend highlights matching buildings in yellow
```

**Fallback:** If the LLM API is unavailable or rate-limited, a rule-based parser handles:
- Height queries (`over 100 feet`, `>100ft`, `taller than 30m`)
- Value queries (`less than $500,000`, `over $1M`)
- Zoning queries (`commercial buildings`, `RC-G zoning`)
- Floor queries (`more than 5 floors`)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Three.js |
| Backend | Python, Flask |
| Database | SQLite |
| Data | OpenStreetMap (Overpass API) |
| AI | Hugging Face Inference API (Mistral-7B) |
| Hosting | Render (backend) + Vercel (frontend) |

---

## 📊 UML Diagram

See `UML_diagram.png` in the root of the project for:
- Class diagram showing data models (User, Project, Building)
- Sequence diagram showing the LLM query flow

---

##  Alternative Approaches Taken

As noted in the brief: *"If an alternative approach is taken, provide explanation and include it in UML."*

### 1. Assessed Property Values — Simulated
**Original plan:** Fetch real assessed values from Calgary Open Data API (`data.calgary.ca/resource/6zp6-pxei.json`)

**Problem:** The API returned `403 Forbidden` — it requires app token registration which was not feasible within the 24-hour window.

**Alternative:** Values are simulated using a height-based formula:
assessed_value = building_height × $15,000 + random_variance(seed=99)

This reflects real Calgary property patterns — taller downtown buildings have higher assessed values. The formula produces a realistic range of ~$80,000 (small structures) to ~$5,000,000 (skyscrapers).

### 2. LLM Query Parsing — Dual-Layer System
**Original plan:** Use HuggingFace Inference API to parse all queries

**Problem:** HuggingFace free tier has rate limits and ~5–10 second latency, making it unreliable for real-time use.

**Alternative:** Implemented a dual-layer parsing system:
- **Layer 1 (Primary):** HuggingFace Mistral-7B-Instruct via Inference API
- **Layer 2 (Fallback):** Custom rule-based regex parser that handles:
  - Height queries (`over 100 feet`, `>100ft`, `taller than 30m`)
  - Value queries (`less than $500,000`, `over $1M`)
  - Zoning queries (`RC-G zoning`, `commercial buildings`)
  - Floor queries (`more than 5 floors`)

This ensures queries always return results instantly even when the LLM API is unavailable.

### 3. OSM Overpass API — Mirror Fallback
**Original plan:** Single Overpass API endpoint

**Problem:** Primary endpoint (`overpass-api.de`) returned `406 Not Acceptable`

**Alternative:** Implemented automatic failover across 3 Overpass mirrors:
1. `https://overpass-api.de/api/interpreter`
2. `https://maps.mail.ru/osm/tools/overpass/api/interpreter`
3. `https://overpass.kumi.systems/api/interpreter`

Plus a final fallback of 60 procedurally-generated Calgary sample buildings if all mirrors fail.

## ⚠️ Known Limitations

- **Assessed values are simulated** — Calgary's Open Data API (`data.calgary.ca`) requires an application token registration that was not completed. Values are generated using `height × $15,000 + random variance`, which reflects realistic downtown Calgary property patterns.
- **HuggingFace free tier** may be slow (~5-10 seconds) or rate-limited. The rule-based fallback handles most queries instantly.
- **OSM data quality** varies — some buildings show as `yes` type (unclassified in OpenStreetMap).

---


