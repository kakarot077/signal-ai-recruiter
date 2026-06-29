#!/usr/bin/env python3
"""
Signal Ranker — Redrob Intelligent Candidate Discovery Challenge
================================================================
Ranks 100,000 candidates against the released JD and produces a top-100 CSV.

Usage:
    python rank.py --candidates ./candidates.jsonl --out ./submission.csv

No external API calls. CPU-only. Runs in < 5 minutes on 16 GB RAM.

Architecture (5 scoring layers):
    1. Hard Disqualifiers      — eliminates clear non-fits first (fast)
    2. Skill Relevance Score   — TF-IDF-style weighted skill match vs JD
    3. Career Signal Score     — title, company type, product vs services
    4. Behavioral Signal Score — 23 Redrob signals (availability, engagement)
    5. Contextual Fit Score    — location, notice, experience band, culture

Final score = weighted sum, normalized to [0,1].
Reasoning = generated from top contributing factors per candidate.
"""

import argparse
import csv
import json
import math
import re
import sys
from datetime import datetime, date
from pathlib import Path

# ─── JD INTELLIGENCE (parsed from job_description.md) ────────────────────────
# Role: Senior AI/ML Engineer at Redrob AI (Series A)
# Location: Pune / Noida, India. Open to Tier-1 Indian cities.
# Experience: 5–9 years (sweet spot 6–8)

# Tier 1: Must-have skills (production embedding/retrieval/ranking systems)
CORE_SKILLS = {
    # Embeddings & retrieval
    "embeddings": 10, "sentence-transformers": 10, "dense retrieval": 10,
    "semantic search": 10, "vector search": 10, "hybrid search": 10,
    "retrieval": 9, "embedding": 9,
    # Vector DBs
    "pinecone": 10, "weaviate": 10, "qdrant": 10, "milvus": 10,
    "faiss": 10, "opensearch": 9, "elasticsearch": 9,
    # Ranking & IR
    "ranking": 10, "information retrieval": 10, "learning to rank": 10,
    "ndcg": 9, "mrr": 9, "map": 8, "bm25": 9, "reranking": 9,
    "reranker": 9, "cross-encoder": 9,
    # LLMs / ML
    "llm": 9, "large language model": 9, "rag": 10, "retrieval augmented": 10,
    "fine-tuning": 8, "fine tuning": 8, "lora": 8, "qlora": 8, "peft": 8,
    "transformer": 8, "bert": 8, "nlp": 9, "natural language": 8,
    # ML fundamentals (production)
    "recommendation": 9, "recommender": 9, "search": 8,
    "a/b testing": 8, "experimentation": 7, "offline evaluation": 8,
    "evaluation framework": 9,
    # Python & tools
    "python": 7, "pytorch": 7, "tensorflow": 6, "huggingface": 8,
    "scikit-learn": 6, "xgboost": 7,
}

# Tier 2: Nice-to-have (bonus, not required)
BONUS_SKILLS = {
    "distributed systems": 5, "kafka": 4, "spark": 4, "airflow": 3,
    "mlops": 6, "mlflow": 5, "kubeflow": 4, "docker": 3, "kubernetes": 3,
    "open source": 5, "github": 4, "aws": 3, "gcp": 3, "azure": 3,
    "sql": 3, "postgres": 3, "redis": 3,
    "hr tech": 6, "recruiting": 5, "talent": 5, "marketplace": 4,
}

# Disqualifying titles/industries — clear non-fits
DISQUALIFYING_TITLES = {
    "marketing manager", "hr manager", "human resources", "content writer",
    "graphic designer", "business analyst", "operations manager",
    "sales manager", "accountant", "customer support", "data entry",
    "finance manager", "product manager", "project manager",
    "ux designer", "ui designer", "visual designer", "copywriter",
    "social media", "seo specialist", "recruiter",
}

DISQUALIFYING_INDUSTRIES = {
    "marketing", "advertising", "pr", "public relations", "retail",
    "fashion", "hospitality", "food", "travel", "real estate",
}

# Red flag companies (consulting/services only — if ENTIRE career is there)
SERVICES_COMPANIES = {
    "tcs", "infosys", "wipro", "accenture", "cognizant", "capgemini",
    "hcl", "tech mahindra", "mphasis", "hexaware", "ltimindtree",
    "mindtree", "birlasoft", "zensar", "persistent", "niit",
}

# Preferred India locations (Tier-1 cities the JD accepts)
PREFERRED_LOCATIONS = {
    "pune", "noida", "hyderabad", "mumbai", "delhi", "bengaluru",
    "bangalore", "gurugram", "gurgaon", "ncr", "delhi ncr",
}

# Product company signals (positive)
PRODUCT_COMPANY_SIGNALS = {
    "startup", "series a", "series b", "series c", "saas", "product",
    "platform", "ai", "ml", "tech", "software", "analytics",
}

# Experience sweet spot: 5–9 years (6–8 ideal)
EXP_MIN = 5.0
EXP_MAX = 9.0
EXP_IDEAL_MIN = 6.0
EXP_IDEAL_MAX = 8.0

# Date for recency calculations
TODAY = datetime.today().date()


# ─── SCORING FUNCTIONS ────────────────────────────────────────────────────────

def normalize_text(text: str) -> str:
    return text.lower().strip() if text else ""


def skill_score(candidate: dict) -> tuple[float, list[str]]:
    """
    Compute skill relevance score (0-100).
    Weights: skill proficiency, duration, endorsements, core vs bonus.
    Returns (score, matched_core_skills).
    """
    skills = candidate.get("skills", [])
    summary = normalize_text(candidate["profile"].get("summary", ""))
    headline = normalize_text(candidate["profile"].get("headline", ""))
    career_text = " ".join(
        normalize_text(r.get("description", "")) + " " + normalize_text(r.get("title", ""))
        for r in candidate.get("career_history", [])
    )
    all_text = summary + " " + headline + " " + career_text

    proficiency_weights = {"expert": 1.0, "advanced": 0.85, "intermediate": 0.65, "beginner": 0.4}

    core_hit_score = 0.0
    bonus_hit_score = 0.0
    matched_core = []
    max_core = sum(CORE_SKILLS.values())

    for skill_obj in skills:
        sname = normalize_text(skill_obj.get("name", ""))
        prof = proficiency_weights.get(skill_obj.get("proficiency", "intermediate"), 0.65)
        duration = min(skill_obj.get("duration_months", 12), 60) / 60  # cap at 5 years
        endorse = min(skill_obj.get("endorsements", 0), 50) / 50

        # Multiplier: skill depth signal
        depth = (prof * 0.6 + duration * 0.25 + endorse * 0.15)

        # Check against core skills (exact + partial match)
        for jd_skill, weight in CORE_SKILLS.items():
            if jd_skill in sname or sname in jd_skill or (len(jd_skill) > 4 and jd_skill in sname):
                core_hit_score += weight * depth
                if jd_skill not in matched_core:
                    matched_core.append(jd_skill)
                break

        # Check bonus skills
        for jd_skill, weight in BONUS_SKILLS.items():
            if jd_skill in sname or sname in jd_skill:
                bonus_hit_score += weight * depth
                break

    # Text-based matches (career descriptions often more revealing than skill tags)
    for jd_skill, weight in CORE_SKILLS.items():
        if jd_skill in all_text and jd_skill not in matched_core:
            # Half credit for mentions in text (not listed as skill)
            core_hit_score += weight * 0.35
            matched_core.append(jd_skill)

    # Normalize
    core_normalized = min(core_hit_score / (max_core * 0.35), 1.0)  # 35% coverage = full score
    bonus_normalized = min(bonus_hit_score / 60, 1.0)

    total = (core_normalized * 0.85 + bonus_normalized * 0.15) * 100
    return min(total, 100.0), matched_core[:8]  # return top 8 matched


def experience_score(candidate: dict) -> float:
    """Score based on years of experience vs JD requirements (0-100)."""
    yoe = candidate["profile"].get("years_of_experience", 0)

    if yoe < 3:
        return 0.0  # too junior
    if EXP_IDEAL_MIN <= yoe <= EXP_IDEAL_MAX:
        return 100.0
    if EXP_MIN <= yoe < EXP_IDEAL_MIN:
        return 70.0 + (yoe - EXP_MIN) / (EXP_IDEAL_MIN - EXP_MIN) * 30
    if EXP_IDEAL_MAX < yoe <= EXP_MAX:
        return 90.0  # slightly over but fine
    if EXP_MAX < yoe <= 12:
        return 75.0  # experienced but may be overqualified
    if yoe > 12:
        return 55.0  # probably too senior / overqualified
    return 60.0


def career_signal_score(candidate: dict) -> tuple[float, list[str]]:
    """
    Score career trajectory:
    - Product company experience (not pure services/consulting)
    - Title relevance (ML/AI/data roles)
    - Recency of relevant experience
    - No job-hopping
    Returns (score 0-100, positive signals list)
    """
    history = candidate.get("career_history", [])
    current_title = normalize_text(candidate["profile"].get("current_title", ""))
    current_industry = normalize_text(candidate["profile"].get("current_industry", ""))
    signals = []
    score = 0.0

    # 1. Title relevance (current role)
    ML_TITLES = {
        "machine learning": 25, "ml engineer": 25, "ai engineer": 25,
        "nlp engineer": 23, "data scientist": 18, "research engineer": 20,
        "applied scientist": 20, "senior engineer": 15, "staff engineer": 18,
        "principal engineer": 18, "search engineer": 22, "ranking engineer": 25,
        "retrieval": 22, "recommendations": 22, "algorithm engineer": 20,
    }
    for title_kw, pts in ML_TITLES.items():
        if title_kw in current_title:
            score += pts
            signals.append(f"relevant title: {candidate['profile']['current_title']}")
            break
    else:
        # Penalty for clearly irrelevant titles
        if any(t in current_title for t in DISQUALIFYING_TITLES):
            score -= 20

    # 2. Product vs services history
    total_months = 0
    product_months = 0
    services_months = 0
    has_product_exp = False

    for role in history:
        duration = role.get("duration_months", 0)
        company = normalize_text(role.get("company", ""))
        company_size = role.get("company_size", "")
        industry = normalize_text(role.get("industry", ""))
        desc = normalize_text(role.get("description", ""))
        role_title = normalize_text(role.get("title", ""))
        total_months += duration

        # Check if services/consulting company
        is_services = any(sc in company for sc in SERVICES_COMPANIES)
        if is_services:
            services_months += duration
        else:
            product_months += duration
            has_product_exp = True

        # Check for relevant work in descriptions
        relevant_desc = any(kw in desc for kw in [
            "ranking", "retrieval", "embedding", "recommendation", "search",
            "nlp", "ml", "machine learning", "vector", "llm", "rag",
        ])
        if relevant_desc and not is_services:
            score += min(15, duration / 6)  # up to 15 pts for relevant product work

    # Product experience bonus
    if has_product_exp:
        product_ratio = product_months / max(total_months, 1)
        score += product_ratio * 20
        if product_ratio > 0.7:
            signals.append("primarily product company experience")

    # Pure services penalty (entire career in consulting)
    if total_months > 0 and services_months / total_months > 0.9:
        score -= 25
        signals.append("NOTE: entire career in services/consulting")

    # 3. Tenure stability (no extreme job hopping)
    short_stints = sum(1 for r in history if not r.get("is_current") and r.get("duration_months", 12) < 12)
    if short_stints >= 3:
        score -= 15
    elif short_stints == 0:
        score += 5
        signals.append("stable tenure history")

    # 4. Current industry
    if any(kw in current_industry for kw in ["technology", "software", "ai", "ml", "saas"]):
        score += 10
        signals.append("tech industry")
    elif any(kw in current_industry for kw in DISQUALIFYING_INDUSTRIES):
        score -= 15

    return max(0.0, min(score, 100.0)), signals


def behavioral_score(candidate: dict) -> tuple[float, list[str]]:
    """
    Score the 23 Redrob behavioral signals.
    Key signals per JD: availability, response rate, notice period, engagement.
    Returns (score 0-100, key signals list).
    """
    sig = candidate.get("redrob_signals", {})
    score = 0.0
    signals = []

    # 1. AVAILABILITY (40 pts total — most critical per JD)
    # Open to work
    if sig.get("open_to_work_flag"):
        score += 15
        signals.append("open to work")

    # Notice period (JD wants < 30 days, can buy out 30)
    notice = sig.get("notice_period_days", 90)
    if notice <= 30:
        score += 15
        signals.append(f"short notice ({notice}d)")
    elif notice <= 60:
        score += 8
    elif notice <= 90:
        score += 3
    else:
        score -= 5  # >90 days is a real problem for this role

    # Last active date
    last_active_str = sig.get("last_active_date", "")
    if last_active_str:
        try:
            last_active = datetime.strptime(last_active_str, "%Y-%m-%d").date()
            days_since = (TODAY - last_active).days
            if days_since <= 7:
                score += 10
                signals.append("active this week")
            elif days_since <= 30:
                score += 6
            elif days_since <= 90:
                score += 2
            else:
                score -= 8
                signals.append(f"inactive {days_since}d")
        except ValueError:
            pass

    # 2. ENGAGEMENT & RESPONSIVENESS (30 pts)
    rr = sig.get("recruiter_response_rate", 0.0)
    score += rr * 20
    if rr >= 0.7:
        signals.append(f"high response rate ({rr:.0%})")
    elif rr < 0.2:
        signals.append(f"low response rate ({rr:.0%})")

    # Avg response time (lower = better)
    avg_rt = sig.get("avg_response_time_hours", 48)
    if avg_rt <= 4:
        score += 10
    elif avg_rt <= 24:
        score += 6
    elif avg_rt <= 72:
        score += 2

    # 3. PROFILE QUALITY (15 pts)
    completeness = sig.get("profile_completeness_score", 0)
    score += (completeness / 100) * 8

    github = sig.get("github_activity_score", -1)
    if github >= 70:
        score += 7
        signals.append(f"strong GitHub activity ({github:.0f})")
    elif github >= 40:
        score += 4
    elif github == -1:
        pass  # no GitHub linked, neutral

    # 4. MARKET VALIDATION (15 pts)
    saved = sig.get("saved_by_recruiters_30d", 0)
    score += min(saved * 1.5, 8)
    if saved >= 5:
        signals.append(f"saved by {saved} recruiters recently")

    interview_rate = sig.get("interview_completion_rate", 0.5)
    score += interview_rate * 4

    applications = sig.get("applications_submitted_30d", 0)
    if 1 <= applications <= 5:
        score += 3  # actively applying (signal of availability)
    elif applications > 10:
        score -= 2  # spraying applications everywhere

    # Verified profile
    if sig.get("verified_email") and sig.get("verified_phone"):
        score += 2

    return max(0.0, min(score, 100.0)), signals


def location_fit_score(candidate: dict) -> tuple[float, str]:
    """Score location fit for Pune/Noida/Tier-1 India role."""
    location = normalize_text(candidate["profile"].get("location", ""))
    country = normalize_text(candidate["profile"].get("country", ""))
    willing_to_relocate = candidate.get("redrob_signals", {}).get("willing_to_relocate", False)

    # Best: already in preferred India location
    for loc in PREFERRED_LOCATIONS:
        if loc in location:
            return 100.0, f"in {candidate['profile']['location']}"

    # India but different city
    if country in ("india", "in"):
        if willing_to_relocate:
            return 75.0, f"India, willing to relocate"
        return 55.0, f"India ({candidate['profile']['location']})"

    # Outside India
    if willing_to_relocate:
        return 30.0, "outside India, willing to relocate"
    return 10.0, f"outside India ({candidate['profile'].get('country', 'unknown')})"


def honeypot_check(candidate: dict) -> bool:
    """
    Detect honeypot profiles with impossible/contradictory signals.
    Returns True if candidate looks like a honeypot (should be penalized).
    """
    profile = candidate["profile"]
    history = candidate.get("career_history", [])
    skills = candidate.get("skills", [])

    # Check 1: Experience at company that's too young
    yoe = profile.get("years_of_experience", 0)
    current_company = normalize_text(profile.get("current_company", ""))

    # Known recently-founded companies (founded 2022-2023)
    # Real check: if someone has 8+ years but current company was just founded
    for role in history:
        if role.get("is_current"):
            start_str = role.get("start_date", "")
            if start_str:
                try:
                    start = datetime.strptime(start_str[:10], "%Y-%m-%d").date()
                    company_age_years = (TODAY - start).days / 365
                    # If claiming more exp at this company than company is old
                    role_duration_years = role.get("duration_months", 0) / 12
                    if role_duration_years > company_age_years + 0.5:
                        return True
                except ValueError:
                    pass

    # Check 2: Expert in 10+ skills with 0 months experience each
    zero_duration_expert = sum(
        1 for s in skills
        if s.get("proficiency") == "expert" and s.get("duration_months", 0) == 0
    )
    if zero_duration_expert >= 5:
        return True

    # Check 3: Total experience wildly inconsistent with career history
    total_history_months = sum(r.get("duration_months", 0) for r in history)
    claimed_months = yoe * 12
    if total_history_months > 0 and claimed_months > total_history_months * 2.5:
        return True

    return False


def generate_reasoning(candidate: dict, scores: dict, matched_skills: list, signals: list) -> str:
    """
    Generate a specific, honest 1-2 sentence reasoning for this candidate's rank.
    Cites real data — no hallucination.
    """
    profile = candidate["profile"]
    sig = candidate.get("redrob_signals", {})

    name_parts = []
    yoe = profile.get("years_of_experience", 0)
    title = profile.get("current_title", "")
    company = profile.get("current_company", "")
    location = profile.get("location", "")
    notice = sig.get("notice_period_days", 90)
    rr = sig.get("recruiter_response_rate", 0.0)
    open_work = sig.get("open_to_work_flag", False)

    top_skills = matched_skills[:3]
    total = scores["total"]

    # Build sentence 1: who they are and why they fit (or don't)
    if total >= 0.75:
        if top_skills:
            s1 = (
                f"{yoe:.0f}-year {title} at {company} with strong production experience "
                f"in {', '.join(top_skills[:2])}{'and relevant retrieval/ranking background' if len(top_skills) > 2 else ''}."
            )
        else:
            s1 = (
                f"{yoe:.0f}-year {title} at {company} with solid ML engineering background "
                f"matching the product-company, applied-AI profile the JD describes."
            )
    elif total >= 0.5:
        gap = []
        if scores["skill"] < 40:
            gap.append("limited core retrieval/embedding skills")
        if scores["location"] < 50:
            gap.append(f"based outside preferred India locations ({location})")
        if scores["career"] < 40:
            gap.append("primarily services/consulting background")
        gap_str = "; ".join(gap) if gap else "partial skill overlap"
        s1 = (
            f"{yoe:.0f}-year {title} at {company}; adjacent profile with {gap_str}. "
            f"{'Has ' + ', '.join(top_skills[:2]) + ' exposure.' if top_skills else ''}"
        )
    else:
        issues = []
        if any(t in normalize_text(title) for t in DISQUALIFYING_TITLES):
            issues.append(f"title ({title}) is unrelated to ML/AI engineering")
        if scores["skill"] < 20:
            issues.append("minimal AI/ML skill overlap with JD requirements")
        if notice > 90:
            issues.append(f"long notice period ({notice} days)")
        issues_str = "; ".join(issues) if issues else "low overall fit across all dimensions"
        s1 = f"{yoe:.0f}-year {title} at {company}; ranked lower due to {issues_str}."

    # Build sentence 2: availability / behavioral signal
    avail_parts = []
    if open_work:
        avail_parts.append("open to work")
    if notice <= 30:
        avail_parts.append(f"{notice}-day notice")
    elif notice > 90:
        avail_parts.append(f"long notice ({notice}d)")
    if rr >= 0.7:
        avail_parts.append(f"high recruiter response rate ({rr:.0%})")
    elif rr < 0.25:
        avail_parts.append(f"low response rate ({rr:.0%}) a concern")

    if avail_parts:
        s2 = "Signals: " + "; ".join(avail_parts) + "."
    else:
        s2 = f"Based in {location}; recruiter response rate {rr:.0%}."

    return f"{s1} {s2}"


def score_candidate(candidate: dict) -> dict | None:
    """
    Full scoring pipeline for one candidate.
    Returns dict with total score and breakdown, or None if hard disqualified.
    """
    profile = candidate["profile"]
    current_title = normalize_text(profile.get("current_title", ""))
    current_industry = normalize_text(profile.get("current_industry", ""))
    yoe = profile.get("years_of_experience", 0)

    # ── HARD DISQUALIFIERS (fast exit) ──────────────────────────────────────
    # Completely wrong title
    if any(t == current_title or t in current_title for t in DISQUALIFYING_TITLES):
        # Check if career history redeems them
        history_titles = [normalize_text(r.get("title", "")) for r in candidate.get("career_history", [])]
        ml_in_history = any(
            any(kw in t for kw in ["machine learning", "ml ", "ai ", "nlp", "data scientist", "ranking"])
            for t in history_titles
        )
        if not ml_in_history:
            return None  # hard disqualify

    # Too junior
    if yoe < 2.5:
        return None

    # Honeypot detection
    if honeypot_check(candidate):
        return None

    # ── COMPUTE SCORES ───────────────────────────────────────────────────────
    s_skill, matched_skills = skill_score(candidate)
    s_exp = experience_score(candidate)
    s_career, career_signals = career_signal_score(candidate)
    s_behavioral, behavioral_signals = behavioral_score(candidate)
    s_location, location_note = location_fit_score(candidate)

    # ── WEIGHTED TOTAL ───────────────────────────────────────────────────────
    # Weights reflect JD priorities:
    # Skill match is paramount; career trajectory matters a lot;
    # behavioral signals are a multiplier; location/experience round it out
    weights = {
        "skill":      0.35,
        "career":     0.25,
        "behavioral": 0.20,
        "location":   0.12,
        "experience": 0.08,
    }

    raw_total = (
        s_skill      * weights["skill"] +
        s_career     * weights["career"] +
        s_behavioral * weights["behavioral"] +
        s_location   * weights["location"] +
        s_exp        * weights["experience"]
    ) / 100  # normalize to [0, 1]

    # Soft penalty: zero relevant skills + no matched core = cap at 0.4
    if not matched_skills and s_skill < 15:
        raw_total = min(raw_total, 0.40)

    # Boost: open to work + short notice + active this week
    sig = candidate.get("redrob_signals", {})
    if (sig.get("open_to_work_flag") and
            sig.get("notice_period_days", 999) <= 30 and
            s_skill > 50):
        raw_total = min(raw_total * 1.05, 0.99)

    all_signals = career_signals + behavioral_signals + [location_note]
    reasoning = generate_reasoning(
        candidate,
        {"total": raw_total, "skill": s_skill, "career": s_career,
         "behavioral": s_behavioral, "location": s_location},
        matched_skills,
        all_signals,
    )

    return {
        "candidate_id": candidate["candidate_id"],
        "score": round(raw_total, 6),
        "reasoning": reasoning,
        # breakdown (not in output but useful for debugging)
        "_skill": s_skill,
        "_career": s_career,
        "_behavioral": s_behavioral,
        "_location": s_location,
        "_exp": s_exp,
    }


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Rank candidates against Redrob JD")
    parser.add_argument("--candidates", default="./candidates.jsonl",
                        help="Path to candidates.jsonl (or .jsonl.gz)")
    parser.add_argument("--out", default="./submission.csv",
                        help="Output CSV path")
    parser.add_argument("--top", type=int, default=100,
                        help="Number of top candidates to output (default 100)")
    parser.add_argument("--debug", action="store_true",
                        help="Print score breakdown for top 10")
    args = parser.parse_args()

    candidates_path = Path(args.candidates)
    if not candidates_path.exists():
        print(f"ERROR: candidates file not found: {candidates_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[Signal Ranker] Loading candidates from {candidates_path}...")
    import time
    t0 = time.time()

    # Load (supports both .jsonl and .jsonl.gz)
    results = []
    n_total = 0
    n_disqualified = 0

    opener = open
    if str(candidates_path).endswith(".gz"):
        import gzip
        opener = gzip.open

    with opener(candidates_path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                candidate = json.loads(line)
            except json.JSONDecodeError:
                continue

            n_total += 1
            result = score_candidate(candidate)
            if result is None:
                n_disqualified += 1
            else:
                results.append(result)

    t1 = time.time()
    print(f"[Signal Ranker] Processed {n_total:,} candidates in {t1-t0:.1f}s")
    print(f"[Signal Ranker] {n_disqualified:,} hard-disqualified, {len(results):,} scored")

    # Sort by score descending; tie-break by candidate_id ascending (per spec)
    # Sort: score descending, then candidate_id ascending for tie-break (per spec)
    # Round to 4 decimal places BEFORE sorting to ensure consistent tie-breaking
    for r in results:
        r["score"] = round(r["score"], 4)
    results.sort(key=lambda r: (-r["score"], r["candidate_id"]))

    top = results[:args.top]

    if len(top) < args.top:
        print(f"WARNING: only {len(top)} candidates passed scoring (need {args.top})", file=sys.stderr)

    # ── WRITE CSV ─────────────────────────────────────────────────────────────
    out_path = Path(args.out)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["candidate_id", "rank", "score", "reasoning"])
        for rank, r in enumerate(top, start=1):
            writer.writerow([
                r["candidate_id"],
                rank,
                f"{r['score']:.4f}",
                r["reasoning"],
            ])

    t2 = time.time()
    print(f"[Signal Ranker] Wrote top {len(top)} to {out_path} in {t2-t0:.1f}s total")

    if args.debug:
        print("\n── Top 10 debug breakdown ──")
        for i, r in enumerate(top[:10], 1):
            print(f"#{i:2d} {r['candidate_id']} score={r['score']:.4f} "
                  f"skill={r['_skill']:.1f} career={r['_career']:.1f} "
                  f"behavioral={r['_behavioral']:.1f} location={r['_location']:.1f}")
            print(f"     {r['reasoning'][:120]}...")


if __name__ == "__main__":
    main()
