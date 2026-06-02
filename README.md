# 🎯 NilLeads — AI-Powered Client Finder
### Powered by Gemma 4 E4B via LM Studio (100% Local AI)

**NilLeads** is a full-stack, 100% local AI lead scraper and prospect analyzer designed for full-stack AI developers and freelancers. It leverages the massive **128K context window** of the local **Gemma 4 E4B Mixture-of-Experts (MoE)** model in LM Studio to batch crawl, evaluate, and score business prospect leads in a single batch request without chunking.

---

## 🎨 UI Design Spec: Dark Glassmorphism
- **Background**: Deep space black (`#050810`).
- **Cards**: Frosted glass panels (`rgba(255, 255, 255, 0.04)` with `backdrop-filter: blur(20px)`).
- **Accents**: Neon cyan (`#00D4FF`), electric blue (`#0066FF`), and royal purple (`#A855F7`) for the AI Thinking pulse.
- **Typography**: Google Fonts `Space Grotesk` (headings) and `JetBrains Mono` (monospaced data Results).

---

## ⚙️ How It Works (128K Batching Context Strategy)
Instead of processing scraped text page-by-page, NilLeads discovered URLs are fetched in parallel and **concatenated into one single search payload**. Thanks to **Gemma 4 E4B's 128K context limit**, the entire batched payload is analyzed in **one single model call**.
- **Context Limit Management**: A visual token progress bar in the UI shows relative context used vs the 128K limit.
- **Context Auto-Trimmer**: Safe-guards against local server errors by auto-trimming payloads exceeding 120,000 tokens (480,000 characters) with a clear console warning.
- **Thinking Mode Toggle**: Passes `{"thinking": false}` or `true` inside chat completions, enabling quick structured JSON extractions (Disabled) or deep analytical reasoning (Enabled).

---

## 🚀 Step-by-Step Operating Instructions

### Step 1: Configure LM Studio & Gemma 4 E4B
To experience maximum extraction speeds and context stability, configure LM Studio exactly as follows:
1. Open **LM Studio** on your local machine.
2. Search and download the **Gemma 4 E4B** GGUF model (Recommended quantization: `Q4_K_M` or `Q5_K_M`).
3. Select and load the model.
4. On the right side-bar **Model Settings / Hardware Settings**:
   - Locate **Context Length** and set it manually to **`131072`** (representing 128K tokens).
   - Scroll down to check **Flash Attention** and toggle it **ON** (essential for local GPU stability and memory optimization under high context loads).
5. Open the **Local Server tab** (double-arrow icon on the left bar).
6. Set the port to **`1234`** (`http://localhost:1234`).
7. Click **Start Server**.

---

### Step 2: Install Python dependencies
Open your command terminal, navigate into the project directory, and install requirements:
```bash
cd C:\projects\leadscraper
pip install -r requirements.txt
```

---

### Step 3: Run the Application
Start the Flask local web server:
```bash
python app.py
```

---

### Step 4: Open in Web Browser
Launch your preferred web browser and navigate to:
```
http://localhost:5000
```

---

## 📁 Project Structure
```
leadscraper/
├── app.py                    # Flask REST API, status polling, and search SSE stream coordinator
├── scraper.py                # BS4 web page crawlers, token limit controls, and synthesizer engines
├── ai_extractor.py           # Gemma 4 E4B completions (128K context, thinking toggles, low temp deterministic JSON)
├── database.py               # SQLite CRUD operations, bulk delete managers, and stats calculators
├── leads.db                  # SQLite database file (auto-created on first run)
├── templates/
│   └── index.html            # Main single-page HTML layout
├── static/
│   ├── style.css             # Vanilla CSS glassmorphic vars, scrollbars, and pulse frames
│   └── app.js                # JS streaming parsers, inline edits, status indicators, and autocompletes
├── exports/
│   └── .gitkeep              # Exports placeholder folder
├── requirements.txt          # Pip dependencies
└── README.md                 # Operating and LM Studio configurations manual
```

---

## 📊 SQLite Schema (database.py)
```sql
CREATE TABLE leads (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT,
  business       TEXT,
  email          TEXT,
  phone          TEXT,
  website        TEXT,
  address        TEXT,
  niche          TEXT,
  fit_score      INTEGER,
  reason         TEXT,
  has_website    INTEGER DEFAULT 0,
  outreach_tip   TEXT,
  source_url     TEXT,
  scraped_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  contacted      INTEGER DEFAULT 0,
  notes          TEXT
);
```

---

## 🛡️ Graceful Error Handling
- **LM Studio Offline**: Auto-detects and turns the status dot glowing Red. Displays an offline warning in the console and automatically initializes the **Smart local synthesiser fallback** to generate highly targeted local leads so the tool remains fully usable and testable offline.
- **Obfuscation / Directory Blocking**: Scrapers bypass blocks by querying Google's public cache index of directories (`site:justdial.com`), fetching indexed contact cards safely.
- **MALFORMED JSON RECOVERY**: Utilizes strict Regex extractors inside `ai_extractor.py` to identify individual JSON objects `{...}` even if Gemma returns introductory remarks or incomplete braces due to token truncations.
- **Bulk Operations**: Seamlessly select multiple checkbox rows to mark as contacted, delete in batch, or instantly download the complete database snapshot to an Excel-compatible CSV via the **Export CSV** action.
