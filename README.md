# Signal — AI Recruiter

> An intelligent candidate ranking system that goes beyond keyword matching to deliver semantically-aware, explainable hiring decisions.

---

## The Problem

Traditional ATS systems match candidates by keyword frequency. They miss implicit requirements, can't read culture signals, and treat every skill as equally important regardless of the role. The result: a ranked list that feels mechanical and wrong.

Signal fixes this by making a language model do what a language model is actually good at — **reading and understanding** a job description before scoring anyone.

---

## How It Works

Signal runs a **two-stage pipeline** powered by the Claude API:

### Stage 1 — Deep JD Parsing
Claude reads the full job description and extracts structured intelligence:
- **Core skills** vs. **nice-to-have skills** vs. **implicit skills** (things not written but clearly needed)
- **Culture signals** inferred from language and tone ("fast-paced", "research-adjacent", "safety-conscious")
- **Priority weight vector** — how much this specific role cares about technical depth vs. research orientation vs. leadership vs. output velocity
- **Green flags** (standout traits) and **red flags** (disqualifying traits)
- Seniority level, role type, remote policy, years of experience required

This structured intel — not the raw JD text — drives all scoring.

### Stage 2 — Semantic Candidate Scoring
Each candidate is scored across **6 dimensions** (100pt scale):

| Dimension | Points | What it measures |
|---|---|---|
| Skill Match | 28 | Explicit + implicit + domain keyword resonance, fuzzy-matched |
| Experience | 18 | Years vs. required, with seniority level calibration |
| Culture Fit | 16 | Candidate personality traits vs. extracted culture signals |
| Priority Alignment | 18 | Claude's extracted priority weights applied to candidate strengths |
| Flags | 10 | Green flag bonuses and red flag penalties from JD parse |
| Behavioral | 10 | Stability, open source activity, response rate, availability |

### Stage 3 — Explainable Reasoning
Claude generates a 2-3 sentence plain-English explanation for every ranked candidate — citing their actual skills, experience gaps, and culture fit — so every score is transparent and defensible.

---

## Features

- **CSV candidate upload** — bring your own candidate pool (or use the built-in example)
- **Live re-ranking** — edit the JD and rankings update automatically
- **JD Intelligence panel** — see exactly what Claude extracted from your job description
- **Expandable candidate cards** — score breakdown bars, semantic match tags, behavioral signals, full profile
- **"Why this score"** — per-candidate AI-generated reasoning in plain English
- **Side-by-side comparison** — compare top 3 candidates across all key attributes
- **Filters** — All / Open to Work / Top Tier (75+)

---

## Demo Flow

1. Click **"Load Example"** on the CSV panel — 6 realistic candidates load instantly
2. Click **"Load Example JD"** — the full pipeline kicks off automatically
3. Watch the 3-stage progress indicator (Parse → Score → Explain)
4. The **JD Intelligence panel** appears showing Claude's structured parse
5. Ranked candidates appear with animated score rings
6. Click any candidate to expand — see score breakdown, matched skills, and "Why this score"
7. Hit **"Compare Top 3"** for a side-by-side decision view

---

## CSV Format

Upload your own candidates with these columns (semicolons for multi-value fields):

```
name, title, company, location, years, skills, domains, summary, opentowork, salary, notice, personality
```

**Example row:**
```
Priya Nair,AI Research Engineer,Cohere,Toronto,5,LLMs;Fine-tuning;Python;JAX;RAG,Generative AI;NLP;Research,Built RAG system cutting resolution time by 60%.,true,$155K-$185K,2 weeks,research-driven;collaborative
```

Optional columns: `education`, `velocity`, `promotions`, `jobhopping`, `opensource`, `mentors`, `conferences`, `responserate`, `commits`

---

## Architecture

```
User uploads CSV
      ↓
Candidate Pool (parsed, normalized)
      ↓
User pastes Job Description
      ↓
Claude API — JD Parse → Structured Intel Object
      ↓
Scoring Engine — 6-dimension semantic scoring per candidate
      ↓
Sort by total score
      ↓
Claude API — Parallel explanation generation (top 10)
      ↓
Ranked shortlist with scores + reasoning
```

---

## Tech Stack

- **React** (single-file component, no build step needed)
- **Claude API** (`claude-sonnet-4-6`) — JD parsing, explanation generation
- **Scoring engine** — deterministic, client-side, built on Claude's parsed output
- **No backend** — runs entirely in the browser

---

## What Makes This Different

Most "AI recruiters" wrap keyword search in a GPT prompt and call it intelligence. Signal's architecture separates **understanding** (Claude reads the JD) from **scoring** (deterministic engine uses that understanding). This means:

- Rankings are **reproducible** — same JD + same candidates = same scores
- Scores are **explainable** — every point traces back to a dimension with a clear rationale
- The system **generalizes** — works for any role, not just the ones it was tuned on
- **Culture fit is a first-class signal** — not an afterthought

---

*Built as a proof of concept for intelligent, semantic-first candidate ranking.*
