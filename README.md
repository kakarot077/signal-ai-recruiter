# Signal — Intelligent Candidate Ranking System

> Redrob Intelligent Candidate Discovery & Ranking Challenge submission.

---

## Quick Start

```bash
python rank.py --candidates ./candidates.jsonl --out ./submission.csv
```

That's it. Produces a valid top-100 ranked CSV in ~13 seconds on CPU.

Also supports gzipped input:
```bash
python rank.py --candidates ./candidates.jsonl.gz --out ./submission.csv
```

Debug mode (prints score breakdown for top 10):
```bash
python rank.py --candidates ./candidates.jsonl --out ./submission.csv --debug
```

---

## Architecture

Signal uses a **5-layer deterministic scoring pipeline** — no API calls, no GPU, no external models. Pure Python, stdlib only.

```
100,000 candidates
       ↓
Layer 1: Hard Disqualifiers        (fast exit — wrong title, too junior, honeypots)
       ↓ ~42,000 remain
Layer 2: Skill Relevance Score     (weighted TF-IDF-style match vs JD requirements)
Layer 3: Career Signal Score       (title fit, product vs services, trajectory)
Layer 4: Behavioral Signal Score   (23 Redrob signals: availability, engagement)
Layer 5: Location Fit Score        (Pune/Noida/Tier-1 India preference)
       ↓
Weighted Sum → normalize → sort → top 100
       ↓
Per-candidate reasoning (generated from actual profile data, no templates)
```

### Scoring Weights

| Layer | Weight | Rationale |
|---|---|---|
| Skill Match | 35% | Core requirement — production embedding/retrieval experience |
| Career Trajectory | 25% | Product company vs services; title relevance; stability |
| Behavioral Signals | 20% | Availability multiplier — best candidate who won't respond is useless |
| Location Fit | 12% | JD explicitly prefers Pune/Noida/Tier-1 Indian cities |
| Experience Band | 8% | 5–9 years per JD; sweet spot 6–8 |

### Key Design Decisions

**Skill matching goes beyond keyword bags.** Skills are scored by proficiency level (`expert > advanced > intermediate > beginner`), duration of use, and endorsement count. Text mentions in career descriptions get half-credit — a candidate who built a retrieval system but didn't list "retrieval" as a skill still scores for it.

**Behavioral signals are a multiplier, not an afterthought.** Per the JD: *"A perfect-on-paper candidate who hasn't logged in for 6 months and has a 5% response rate is, for hiring purposes, not actually available."* Notice period, last active date, recruiter response rate, and open-to-work flag together form a 20% availability weight.

**Honeypot detection.** The ranker checks for impossible profiles: experience duration exceeding company founding date, expert proficiency with zero months used, claimed YOE far exceeding career history. These are hard-disqualified.

**Hard disqualifiers are intentionally aggressive.** Marketing managers, HR managers, content writers, and similar clearly non-ML profiles are eliminated immediately (after checking if their career history redeems them). This avoids the "HR Manager with 9 AI keywords" trap explicitly called out in the JD.

**Pure services career penalty.** Candidates whose entire career is at TCS/Infosys/Wipro/Accenture etc. get a significant penalty per JD's explicit requirement.

---

## Compute Profile

| Constraint | Limit | Actual |
|---|---|---|
| Runtime | ≤ 5 min | ~13 seconds |
| Memory | ≤ 16 GB | < 2 GB |
| GPU | Not allowed | Not used |
| Network | Not allowed | Not used |
| Dependencies | — | stdlib only |

Tested on: Python 3.11, standard laptop CPU.

---

## Repository Structure

```
rank.py                  # Main ranker — run this
requirements.txt         # No external deps required
submission.csv           # Pre-generated submission (top 100)
submission_metadata.yaml # Challenge metadata
README.md                # This file

signal-final.jsx         # React demo app (sandbox/demo link)
```

---

## Sandbox / Demo

The React demo (Signal) is hosted at [sandbox link] and shows the ranking system running on a small sample with the same JD. It uses Claude API for the demo UI but the Python ranker (`rank.py`) uses zero API calls.

---

## Reproducing the Submission

```bash
# Clone repo
git clone https://github.com/kakarot077/signal-ai-recruiter
cd signal-ai-recruiter

# No pip install needed — stdlib only
# Place candidates.jsonl in current directory

python rank.py --candidates ./candidates.jsonl --out ./submission.csv

# Validate
python validate_submission.py ./submission.csv
# → "Submission is valid."
```

---

## AI Tools Declaration

Claude was used for:
- Architectural design and code review
- JD analysis and signal weight calibration
- README writing

The scoring logic, feature engineering, and Python implementation are original engineering work. The ranker makes zero API calls during execution.
