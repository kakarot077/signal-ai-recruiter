import { useState, useRef } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#080C14", surface: "#0D1422", surfaceHover: "#121A2E",
  border: "#1C2A42", borderAccent: "#1E4080",
  cyan: "#00D4FF", cyanDim: "#0A2A3A", cyanGlow: "rgba(0,212,255,0.12)",
  amber: "#FFB347", amberDim: "#2A1A00",
  green: "#00E676", greenDim: "#003D20",
  purple: "#A78BFA", purpleDim: "#1E1040",
  red: "#FF4444", redDim: "#2A0000",
  text: "#E8F0FF", textMuted: "#6B7FA3", textDim: "#2E3D5A",
  white: "#FFFFFF",
};

// ─── EXAMPLE DATA ─────────────────────────────────────────────────────────────
const EXAMPLE_JD = `Senior ML Engineer — AI Platform

We're hiring a Senior ML Engineer to join our AI Platform team. You'll build and optimize large language model training pipelines, implement RLHF techniques, and work with distributed training frameworks.

This is a research-adjacent role — we move fast, publish internally, and care deeply about safety. You'll collaborate closely with research scientists and help bridge research and engineering.

Requirements:
- 6+ years of ML engineering experience
- Deep expertise in PyTorch or JAX
- Hands-on experience with LLMs, fine-tuning, and RLHF
- Strong Python; MLOps/deployment experience
- Open source contributions are a strong plus
- Experience mentoring junior engineers preferred

Culture: Fast-moving, research-driven team. We value intellectual curiosity, shipping things that matter, and safety-conscious engineering.`;

const EXAMPLE_CSV = `name,title,company,location,years,skills,domains,summary,opentowork,salary,notice,personality
Ananya Krishnamurthy,Senior ML Engineer,DeepMind,London,7,PyTorch;Transformers;RLHF;Distributed Training;Python;CUDA;MLOps,LLM;NLP;Research Engineering,Built RLHF pipeline that reduced hallucination rate by 34% in production LLM. Led team of 6 across 3 time zones.,true,$180K-$220K,4 weeks,collaborative;research-driven;startup-ready
Marcus Okonkwo,Staff Engineer,Stripe,San Francisco,9,Distributed Systems;Go;Rust;Kubernetes;gRPC;PostgreSQL;Python,Infrastructure;Platform Engineering;Backend Systems,Architected payment reconciliation system handling $2.4B daily transactions with 99.999% uptime.,false,$230K-$270K,6 weeks,methodical;scale-focused;deep-technical
Priya Nair,AI Research Engineer,Cohere,Toronto,5,LLMs;Fine-tuning;Python;JAX;RAG;Vector Databases;FastAPI,Generative AI;NLP;Research;Applied ML,First author on 2 NeurIPS papers on efficient fine-tuning. Built RAG system cutting support ticket resolution time by 60%.,true,$155K-$185K,2 weeks,research-driven;high-velocity;collaborative
Tobias Reinholt,Principal Data Scientist,Spotify,Stockholm,11,ML Modeling;A/B Testing;Causal Inference;Python;Spark;Scala;SQL,Data Science;Experimentation;Recommendation Systems,Recommendation engine serving 600M users. Expert in causal inference and large-scale experimentation.,false,$195K-$230K,3 months,methodical;data-driven;stability-seeking
Sofia Esposito,ML Platform Engineer,Databricks,Milan,6,MLflow;Spark;Python;Docker;Terraform;AWS;Feature Engineering,ML Infrastructure;MLOps;Data Engineering;Platform,Core contributor to MLflow. Built ML platform adopted by 200+ internal teams cutting deploy time from days to 4 hours.,true,$145K-$175K,1 month,collaborative;open-source-first;startup-ready;builder-mindset
Devon Park,Senior Software Engineer,Netflix,Los Angeles,8,Java;Microservices;Kafka;Cassandra;Python;GraphQL;React,Backend Engineering;Streaming Infrastructure;Web Services,Streaming infrastructure at Netflix scale. Backend generalist with limited ML-specific experience.,true,$185K-$215K,2 weeks,independent;fast-mover;generalist`;

// ─── CSV PARSER ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

  return lines.slice(1).map((line, i) => {
    // Handle quoted fields with commas inside
    const values = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    values.push(cur.trim());

    const g = (col) => values[headers.indexOf(col)] || "";
    const id = `csv-${Date.now()}-${i}`;

    return {
      id,
      name: g("name") || `Candidate ${i + 1}`,
      avatar: (g("name") || "??").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      avatarColor: ["#7C3AED","#0EA5E9","#10B981","#F59E0B","#EC4899","#EF4444","#8B5CF6","#06B6D4"][i % 8],
      title: g("title") || "Not specified",
      company: g("company") || "Not specified",
      location: g("location") || "Not specified",
      yearsExp: parseInt(g("years") || g("yearsexp")) || 0,
      education: g("education") || "Not specified",
      skills: g("skills").split(";").map(s => s.trim()).filter(Boolean),
      domains: g("domains").split(";").map(s => s.trim()).filter(Boolean),
      summary: g("summary") || g("notes") || "No summary provided.",
      openToWork: g("opentowork").toLowerCase() !== "false",
      salaryExpectation: g("salary") || "Not specified",
      noticePeriod: g("notice") || "Not specified",
      personality: g("personality").split(";").map(s => s.trim()).filter(Boolean),
      // Behavioral defaults — enriched from CSV if columns present
      careerVelocity: parseInt(g("velocity")) || 75,
      promotions: parseInt(g("promotions")) || 1,
      behavioral: {
        jobHopping: g("jobhopping").toLowerCase() === "true",
        sideProjects: g("sideprojects").toLowerCase() !== "false",
        conferences: g("conferences").toLowerCase() === "true",
        mentors: g("mentors").toLowerCase() === "true",
        openSource: g("opensource").toLowerCase() === "true",
      },
      activity: {
        lastActiveDays: parseInt(g("lastactivedays")) || 1,
        responseRate: parseInt(g("responserate")) || 80,
        openSourceContribs: parseInt(g("oscontribs")) || 0,
        githubCommits: parseInt(g("commits")) || 0,
      },
    };
  }).filter(c => c.name);
}

// ─── CLAUDE: JD PARSER ────────────────────────────────────────────────────────
async function parseJDWithClaude(jd) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `You are an expert technical recruiter. Deeply analyze this job description and extract structured intelligence. Return ONLY valid JSON, no markdown, no preamble.

{
  "roleSummary": "one sentence capturing essence of role",
  "seniorityLevel": "junior|mid|senior|staff|principal|executive",
  "requiredYearsExp": 0,
  "domain": "primary domain (e.g. ML Engineering, Backend, Data Science)",
  "coreSkills": ["skill1"],
  "niceToHaveSkills": ["skill1"],
  "implicitSkills": ["skills implied but not explicitly stated"],
  "domainKeywords": ["domain concepts that matter even if not named as skills"],
  "cultureSignals": ["fast-paced","research-driven","startup","collaborative","enterprise"],
  "roleType": "IC|management|hybrid",
  "priorityWeights": {
    "technicalDepth": 0.0,
    "researchOrientation": 0.0,
    "leadershipPotential": 0.0,
    "velocityAndOutput": 0.0,
    "domainSpecialization": 0.0
  },
  "redFlags": ["disqualifying traits"],
  "greenFlags": ["standout traits beyond requirements"],
  "remotePolicy": "remote|hybrid|onsite|flexible"
}

Priority weights must sum to 1.0. Be precise and opinionated.

JOB DESCRIPTION:
${jd}`
      }]
    })
  });
  const data = await res.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── CLAUDE: PER-CANDIDATE EXPLANATION ───────────────────────────────────────
async function generateExplanation(candidate, scoreObj, intel) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are a technical recruiter. Write 2-3 sentences explaining why ${candidate.name} scored ${scoreObj.total}/100 for this role. Be specific: cite their actual skills, experience, culture fit, and gaps. No preamble, no bullet points — just direct prose.

Role: ${intel.domain} · ${intel.seniorityLevel} · Needs: ${intel.coreSkills?.join(", ")}
Culture: ${intel.cultureSignals?.join(", ")}
Green flags: ${intel.greenFlags?.join(", ")}

Candidate: ${candidate.title} at ${candidate.company}, ${candidate.yearsExp}y exp
Skills: ${candidate.skills.join(", ")}
Personality: ${candidate.personality?.join(", ")}
Summary: ${candidate.summary}

Score breakdown — Skill: ${scoreObj.breakdown.skillMatch}/28, Experience: ${scoreObj.breakdown.experience}/18, Culture: ${scoreObj.breakdown.cultureFit}/16, Priority: ${scoreObj.breakdown.priorityAlignment}/18, Flags: ${scoreObj.breakdown.flags}/10, Behavioral: ${scoreObj.breakdown.behavioral}/10`
      }]
    })
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("").trim() || "Unable to generate explanation.";
}

// ─── V3 SCORING ENGINE (semantic, intel-driven) ───────────────────────────────
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

function scoreWithIntel(candidate, intel) {
  // 1. SEMANTIC SKILL MATCH (28 pts)
  const allJDSkills = [
    ...(intel.coreSkills || []).map(s => ({ skill: s, weight: 1.0 })),
    ...(intel.niceToHaveSkills || []).map(s => ({ skill: s, weight: 0.5 })),
    ...(intel.implicitSkills || []).map(s => ({ skill: s, weight: 0.7 })),
  ];
  const totalWeight = allJDSkills.reduce((s, x) => s + x.weight, 0) || 1;

  let skillScore = 0, matchedSkills = [], matchedImplicit = [];
  allJDSkills.forEach(({ skill, weight }) => {
    const jdL = skill.toLowerCase();
    const matched =
      candidate.skills.some(cs => {
        const csL = cs.toLowerCase();
        return csL.includes(jdL) || jdL.includes(csL) || levenshtein(csL, jdL) <= 2;
      }) ||
      (candidate.domains || []).some(d => d.toLowerCase().includes(jdL) || jdL.includes(d.toLowerCase().split(" ")[0]));
    if (matched) {
      skillScore += weight * (28 / totalWeight);
      if (weight === 0.7) matchedImplicit.push(skill);
      else matchedSkills.push(skill);
    }
  });
  // Domain keyword resonance bonus
  const domainHits = (intel.domainKeywords || []).filter(kw =>
    (candidate.domains || []).some(d => d.toLowerCase().includes(kw.toLowerCase())) ||
    candidate.summary.toLowerCase().includes(kw.toLowerCase())
  ).length;
  skillScore = Math.min(28, skillScore + domainHits * 1.2);

  // 2. EXPERIENCE CALIBRATION (18 pts)
  const reqYears = intel.requiredYearsExp || 0;
  let expScore = reqYears === 0
    ? Math.min(18, (candidate.yearsExp / 8) * 18)
    : (() => {
        const ratio = candidate.yearsExp / reqYears;
        if (ratio >= 1.5) return 18;
        if (ratio >= 1.0) return 14 + (ratio - 1) * 8;
        return ratio * 14;
      })();
  const seniorityMap = { junior: 2, mid: 4, senior: 6, staff: 8, principal: 10, executive: 12 };
  const reqLevel = seniorityMap[intel.seniorityLevel] || 6;
  const candLevel = Math.min(10, (candidate.yearsExp || 0) * 0.9 + (candidate.promotions || 0) * 0.8);
  const gap = Math.abs(candLevel - reqLevel);
  if (gap <= 1) expScore = Math.min(18, expScore + 2);
  else if (gap > 3) expScore = Math.max(0, expScore - 3);

  // 3. CULTURE & PERSONALITY FIT (16 pts)
  let cultureScore = 0;
  const traits = new Set(candidate.personality || []);
  (intel.cultureSignals || []).forEach(signal => {
    const sL = signal.toLowerCase();
    traits.forEach(trait => {
      if (trait.toLowerCase().includes(sL) || sL.includes(trait.toLowerCase())) cultureScore += 2;
    });
  });
  cultureScore = Math.min(16, cultureScore);

  // 4. PRIORITY WEIGHT ALIGNMENT (18 pts)
  const pw = intel.priorityWeights || {};
  let priorityScore = 0;
  if (pw.technicalDepth > 0.2 && candidate.behavioral?.openSource) priorityScore += pw.technicalDepth * 8;
  if (pw.researchOrientation > 0.2 && (candidate.domains || []).some(d => d.toLowerCase().includes("research"))) priorityScore += pw.researchOrientation * 10;
  if (pw.leadershipPotential > 0.2 && (candidate.promotions || 0) >= 2) priorityScore += pw.leadershipPotential * 8;
  if (pw.velocityAndOutput > 0.2 && (candidate.careerVelocity || 0) > 85) priorityScore += pw.velocityAndOutput * 8;
  if (pw.domainSpecialization > 0.2) {
    const domainMatch = (candidate.domains || []).some(d =>
      intel.domain && intel.domain.toLowerCase().includes(d.toLowerCase().split(" ")[0])
    );
    if (domainMatch) priorityScore += pw.domainSpecialization * 10;
  }
  priorityScore = Math.min(18, priorityScore * 18);

  // 5. GREEN / RED FLAG SIGNALS (10 pts)
  let flagScore = 5;
  (intel.greenFlags || []).forEach(flag => {
    const fl = flag.toLowerCase();
    if (fl.includes("open source") && candidate.behavioral?.openSource) flagScore += 1.5;
    if (fl.includes("publish") && (candidate.domains || []).includes("Research")) flagScore += 1.5;
    if (fl.includes("conference") && candidate.behavioral?.conferences) flagScore += 1;
    if (fl.includes("mentor") && candidate.behavioral?.mentors) flagScore += 1;
    if (fl.includes("startup") && (candidate.personality || []).includes("startup-ready")) flagScore += 1;
  });
  (intel.redFlags || []).forEach(flag => {
    const fl = flag.toLowerCase();
    if (fl.includes("job hop") && candidate.behavioral?.jobHopping) flagScore -= 3;
    if (fl.includes("no ml") && !(candidate.domains || []).some(d => d.toLowerCase().includes("ml"))) flagScore -= 2;
  });
  flagScore = Math.max(0, Math.min(10, flagScore));

  // 6. BEHAVIORAL & ACTIVITY (10 pts)
  let behavScore = 0;
  if (!candidate.behavioral?.jobHopping) behavScore += 2;
  if (candidate.behavioral?.sideProjects) behavScore += 2;
  if (candidate.behavioral?.mentors) behavScore += 1.5;
  if (candidate.behavioral?.conferences) behavScore += 1.5;
  behavScore += Math.min(3, (candidate.promotions || 0) * 1.5);
  let actScore = 0;
  const days = candidate.activity?.lastActiveDays || 0;
  if (days <= 1) actScore += 3; else if (days <= 3) actScore += 2; else if (days <= 7) actScore += 0.5;
  if (candidate.openToWork) actScore += 2;
  actScore += Math.min(5, ((candidate.activity?.responseRate || 80) / 100) * 5);
  const behavioral = Math.min(10, behavScore + actScore * 0.4);

  const total = skillScore + expScore + cultureScore + priorityScore + flagScore + behavioral;
  return {
    total: Math.round(Math.min(99, total)),
    breakdown: {
      skillMatch: Math.round(skillScore),
      experience: Math.round(expScore),
      cultureFit: Math.round(cultureScore),
      priorityAlignment: Math.round(priorityScore),
      flags: Math.round(flagScore),
      behavioral: Math.round(behavioral),
    },
    matchedSkills,
    matchedImplicit,
    matchedDomains: (candidate.domains || []).filter(d =>
      intel.domain && (
        intel.domain.toLowerCase().includes(d.toLowerCase().split(" ")[0]) ||
        d.toLowerCase().includes(intel.domain.toLowerCase().split(" ")[0])
      )
    ),
  };
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function Tag({ label, color }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 3, fontSize: 9,
      fontFamily: "'IBM Plex Mono',monospace", margin: "1px",
      background: color + "18", color, border: `1px solid ${color}28`,
    }}>{label}</span>
  );
}

function MiniBar({ label, val, max, color }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>{label}</span>
        <span style={{ fontSize: 9, color, fontFamily: "'IBM Plex Mono',monospace" }}>{val}/{max}</span>
      </div>
      <div style={{ height: 2, background: C.border, borderRadius: 1 }}>
        <div style={{ height: 2, width: `${(val / max) * 100}%`, background: color, borderRadius: 1, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function ScoreRing({ score, size = 52 }) {
  const r = (size - 7) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 80 ? C.cyan : score >= 65 ? C.amber : C.textMuted;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={3.5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3.5}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ filter: score >= 80 ? `drop-shadow(0 0 5px ${color})` : "none", transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
      />
      <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.27} fontFamily="'IBM Plex Mono',monospace" fontWeight="700">{score}</text>
    </svg>
  );
}

// ─── JD INTEL PANEL ──────────────────────────────────────────────────────────
function IntelPanel({ intel }) {
  if (!intel) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.borderAccent}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.cyan, letterSpacing: 1.5, marginBottom: 12 }}>⚡ JD INTELLIGENCE PARSE</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>ROLE PROFILE</div>
          <div style={{ fontSize: 11, color: C.text, fontFamily: "Inter,sans-serif", lineHeight: 1.6, marginBottom: 8 }}>{intel.roleSummary}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <Tag label={intel.seniorityLevel?.toUpperCase()} color={C.cyan} />
            <Tag label={intel.roleType} color={C.amber} />
            <Tag label={intel.remotePolicy} color={C.green} />
            <Tag label={`${intel.requiredYearsExp}+ yrs`} color={C.purple} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>EXTRACTED REQUIREMENTS</div>
          <div style={{ fontSize: 9, color: C.cyan, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>CORE</div>
          <div style={{ marginBottom: 6 }}>{intel.coreSkills?.slice(0,5).map(s => <Tag key={s} label={s} color={C.cyan} />)}</div>
          <div style={{ fontSize: 9, color: C.amber, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>IMPLICIT</div>
          <div>{intel.implicitSkills?.slice(0,4).map(s => <Tag key={s} label={s} color={C.amber} />)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>PRIORITY WEIGHTS</div>
          {intel.priorityWeights && Object.entries(intel.priorityWeights).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span style={{ fontSize: 9, color: C.cyan, fontFamily: "'IBM Plex Mono',monospace" }}>{Math.round(v * 100)}%</span>
              </div>
              <div style={{ height: 2, background: C.border, borderRadius: 1 }}>
                <div style={{ height: 2, width: `${v * 100}%`, background: C.cyan, borderRadius: 1, opacity: 0.8 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 5 }}>CULTURE SIGNALS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{intel.cultureSignals?.map(s => <Tag key={s} label={s} color={C.purple} />)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 5 }}>FLAGS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {intel.greenFlags?.slice(0,3).map(f => <Tag key={f} label={`✓ ${f}`} color={C.green} />)}
            {intel.redFlags?.slice(0,2).map(f => <Tag key={f} label={`✕ ${f}`} color={C.red} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CANDIDATE CARD ───────────────────────────────────────────────────────────
function CandidateCard({ candidate, score, rank, expanded, onToggle, explanation, loadingExplanation }) {
  const isTop = rank === 1;
  const accentColor = isTop ? C.cyan : rank <= 3 ? C.borderAccent : C.border;

  return (
    <div onClick={onToggle} style={{
      background: expanded ? C.surfaceHover : C.surface,
      border: `1px solid ${expanded ? accentColor : C.border}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 8, marginBottom: 8, cursor: "pointer",
      transition: "all 0.2s ease",
      boxShadow: isTop ? `0 0 16px rgba(0,212,255,0.06)` : "none",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px" }}>
        <div style={{ width: 22, flexShrink: 0, textAlign: "center", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: rank <= 3 ? C.cyan : C.textDim, fontWeight: 700 }}>#{rank}</div>
        <div style={{
          width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
          background: (candidate.avatarColor || C.cyan) + "28",
          border: `1.5px solid ${(candidate.avatarColor || C.cyan)}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: candidate.avatarColor || C.cyan, fontWeight: 700,
        }}>{candidate.avatar || candidate.name?.slice(0,2).toUpperCase()}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "Inter,sans-serif", fontWeight: 600, fontSize: 13, color: C.white }}>{candidate.name}</span>
            {candidate.openToWork && <Tag label="OPEN" color={C.green} />}
            {isTop && <Tag label="⚡ TOP MATCH" color={C.cyan} />}
            {score.matchedImplicit?.length > 0 && <Tag label={`+${score.matchedImplicit.length} implicit`} color={C.purple} />}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, fontFamily: "Inter,sans-serif" }}>
            {candidate.title} · {candidate.company} · {candidate.yearsExp}y exp
          </div>
          <div style={{ marginTop: 5 }}>
            {candidate.skills.slice(0, 5).map(s => (
              <span key={s} style={{
                display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 9, margin: "1px",
                fontFamily: "'IBM Plex Mono',monospace",
                background: score.matchedSkills?.includes(s) ? C.cyanDim : C.border,
                color: score.matchedSkills?.includes(s) ? C.cyan : C.textMuted,
              }}>{score.matchedSkills?.includes(s) ? "✓ " : ""}{s}</span>
            ))}
            {candidate.skills.length > 5 && <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'IBM Plex Mono',monospace" }}> +{candidate.skills.length - 5}</span>}
          </div>
        </div>
        <ScoreRing score={score.total} size={52} />
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 14px" }}>

          {/* WHY THIS SCORE */}
          <div style={{ background: C.bg, border: `1px solid ${C.borderAccent}`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: C.cyan, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1, marginBottom: 6 }}>WHY THIS SCORE</div>
            {loadingExplanation
              ? <div style={{ fontSize: 11, color: C.textDim, fontFamily: "Inter,sans-serif", fontStyle: "italic" }}>Generating reasoning…</div>
              : <div style={{ fontSize: 12, color: C.text, fontFamily: "Inter,sans-serif", lineHeight: 1.7 }}>{explanation || "Click to expand — explanation will appear after ranking."}</div>
            }
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {/* Score breakdown */}
            <div>
              <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1, marginBottom: 8 }}>SCORE BREAKDOWN</div>
              <MiniBar label="Skill Match" val={score.breakdown.skillMatch} max={28} color={C.cyan} />
              <MiniBar label="Experience" val={score.breakdown.experience} max={18} color={C.cyan} />
              <MiniBar label="Culture Fit" val={score.breakdown.cultureFit} max={16} color={C.purple} />
              <MiniBar label="Priority Align" val={score.breakdown.priorityAlignment} max={18} color={C.amber} />
              <MiniBar label="Flags" val={score.breakdown.flags} max={10} color={C.green} />
              <MiniBar label="Behavioral" val={score.breakdown.behavioral} max={10} color={C.amber} />
            </div>

            {/* Semantic matches */}
            <div>
              <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1, marginBottom: 8 }}>SEMANTIC MATCHES</div>
              {score.matchedSkills?.length > 0 && <>
                <div style={{ fontSize: 9, color: C.cyan, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>EXPLICIT</div>
                <div style={{ marginBottom: 7 }}>{score.matchedSkills.map(s => <Tag key={s} label={s} color={C.cyan} />)}</div>
              </>}
              {score.matchedImplicit?.length > 0 && <>
                <div style={{ fontSize: 9, color: C.purple, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>IMPLICIT</div>
                <div style={{ marginBottom: 7 }}>{score.matchedImplicit.map(s => <Tag key={s} label={s} color={C.purple} />)}</div>
              </>}
              {score.matchedDomains?.length > 0 && <>
                <div style={{ fontSize: 9, color: C.amber, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>DOMAIN</div>
                <div>{score.matchedDomains.map(d => <Tag key={d} label={d} color={C.amber} />)}</div>
              </>}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 5 }}>BEHAVIORAL SIGNALS</div>
                {[
                  { on: !candidate.behavioral?.jobHopping, label: "Stable career", color: C.green },
                  { on: candidate.behavioral?.openSource, label: "Open source", color: C.cyan },
                  { on: candidate.behavioral?.conferences, label: "Speaks at conferences", color: C.cyan },
                  { on: candidate.behavioral?.mentors, label: "Mentors others", color: C.amber },
                  { on: candidate.openToWork, label: "Actively seeking", color: C.green },
                ].map(sig => (
                  <div key={sig.label} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: sig.on ? sig.color : C.border, boxShadow: sig.on ? `0 0 4px ${sig.color}` : "none", flexShrink: 0 }} />
                    <span style={{ fontSize: 9, color: sig.on ? C.text : C.textDim, fontFamily: "Inter,sans-serif" }}>{sig.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile intel */}
            <div>
              <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1, marginBottom: 8 }}>PROFILE INTEL</div>
              <div style={{ fontSize: 11, color: C.text, fontFamily: "Inter,sans-serif", lineHeight: 1.6, marginBottom: 10 }}>{candidate.summary}</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.9 }}>
                {candidate.education !== "Not specified" && <div>🎓 {candidate.education}</div>}
                <div>📍 {candidate.location}</div>
                {candidate.salaryExpectation !== "Not specified" && <div style={{ color: C.amber }}>💰 {candidate.salaryExpectation}</div>}
                {candidate.noticePeriod !== "Not specified" && <div>⏱ Notice: {candidate.noticePeriod}</div>}
                <div>💬 Response: <span style={{ color: (candidate.activity?.responseRate || 80) > 80 ? C.green : C.amber }}>{candidate.activity?.responseRate || 80}%</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COMPARISON MODAL ─────────────────────────────────────────────────────────
function ComparisonModal({ candidates, onClose }) {
  if (!candidates?.length) return null;
  const attrs = [
    { label: "Signal Score", get: c => <span style={{ color: C.cyan, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>{c.score}/100</span> },
    { label: "Experience", get: c => `${c.yearsExp}y` },
    { label: "Current Role", get: c => c.title },
    { label: "Company", get: c => c.company },
    { label: "Location", get: c => c.location },
    { label: "Salary", get: c => c.salaryExpectation },
    { label: "Notice", get: c => c.noticePeriod },
    { label: "Open to Work", get: c => c.openToWork ? <span style={{ color: C.green }}>Yes ✓</span> : <span style={{ color: C.textDim }}>No</span> },
    { label: "Open Source", get: c => c.behavioral?.openSource ? <span style={{ color: C.cyan }}>✓</span> : <span style={{ color: C.textDim }}>—</span> },
    { label: "Stable Tenure", get: c => !c.behavioral?.jobHopping ? <span style={{ color: C.green }}>✓</span> : <span style={{ color: C.red }}>⚠</span> },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: C.bg, border: `1px solid ${C.borderAccent}`, borderRadius: 12, maxWidth: 860, width: "100%", maxHeight: "88vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.cyan, letterSpacing: 1 }}>SIDE-BY-SIDE COMPARISON</div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>✕ Close</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 10, color: C.textDim, fontFamily: "'IBM Plex Mono',monospace", width: 130 }} />
              {candidates.map(c => (
                <th key={c.id} style={{ textAlign: "center", padding: "10px 8px", fontSize: 11, color: C.cyan, fontFamily: "'IBM Plex Mono',monospace" }}>
                  <div>{c.name}</div>
                  <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 400, marginTop: 2 }}>{c.title}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attrs.map((attr, i) => (
              <tr key={attr.label} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : "transparent" }}>
                <td style={{ padding: "9px 8px", fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>{attr.label}</td>
                {candidates.map(c => (
                  <td key={c.id} style={{ textAlign: "center", padding: "9px 8px", fontSize: 11, color: C.text, fontFamily: "Inter,sans-serif" }}>
                    {attr.get(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── CSV UPLOAD PANEL ─────────────────────────────────────────────────────────
function CSVUploadPanel({ onCandidatesLoaded, count }) {
  const fileRef = useRef();
  const [status, setStatus] = useState("");

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseCSV(evt.target.result);
        if (!parsed.length) { setStatus("No valid candidates found."); return; }
        setStatus(`✓ ${parsed.length} candidates loaded`);
        onCandidatesLoaded(parsed);
        setTimeout(() => setStatus(""), 3000);
      } catch { setStatus("Error parsing CSV."); }
    };
    reader.readAsText(file);
  };

  const loadExample = () => {
    const parsed = parseCSV(EXAMPLE_CSV);
    setStatus(`✓ ${parsed.length} example candidates loaded`);
    onCandidatesLoaded(parsed);
    setTimeout(() => setStatus(""), 3000);
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${count > 0 ? C.green + "44" : C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: count > 0 ? C.green : C.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>
            {count > 0 ? `✓ ${count} CANDIDATES LOADED` : "STEP 1 — LOAD CANDIDATES"}
          </div>
          <div style={{ fontSize: 9, color: C.textDim, fontFamily: "Inter,sans-serif" }}>
            CSV columns: name, title, company, location, years, skills (;-separated), domains (;-separated), summary, opentowork, salary, notice, personality (;-separated)
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        <button onClick={loadExample} style={{ padding: "5px 10px", background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", whiteSpace: "nowrap" }}>
          Load Example
        </button>
        <button onClick={() => fileRef.current?.click()} style={{ padding: "5px 12px", background: C.cyanDim, border: `1px solid ${C.cyan}`, color: C.cyan, borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", whiteSpace: "nowrap" }}>
          📁 Upload CSV
        </button>
      </div>
      {status && <div style={{ marginTop: 8, fontSize: 10, color: C.green, fontFamily: "'IBM Plex Mono',monospace" }}>{status}</div>}
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────
export default function Signal() {
  const [jd, setJd] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [intel, setIntel] = useState(null);
  const [ranked, setRanked] = useState([]);
  const [explanations, setExplanations] = useState({});
  const [loadingExpl, setLoadingExpl] = useState({});
  const [phase, setPhase] = useState("idle");
  const [parseError, setParseError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("all");
  const [comparison, setComparison] = useState(null);
  const debounceRef = useRef();

  const runPipeline = async (jobDesc, cands) => {
    const pool = cands || candidates;
    if (jobDesc.trim().length < 30 || pool.length === 0) return;
    setPhase("parsing"); setIntel(null); setRanked([]); setExplanations({}); setParseError(""); setExpanded(null);

    try {
      // Stage 1: Claude parses JD into structured intel
      const parsedIntel = await parseJDWithClaude(jobDesc);
      setIntel(parsedIntel);
      setPhase("scoring");

      // Stage 2: Score every candidate against intel
      await new Promise(r => setTimeout(r, 200));
      const scored = pool
        .map(c => ({ candidate: c, score: scoreWithIntel(c, parsedIntel) }))
        .sort((a, b) => b.score.total - a.score.total);
      setRanked(scored);
      setPhase("explaining");

      // Stage 3: Generate per-candidate explanations (top 10, parallel)
      const top = scored.slice(0, 10);
      const loadingMap = {};
      top.forEach(r => { loadingMap[r.candidate.id] = true; });
      setLoadingExpl(loadingMap);

      await Promise.all(top.map(async (r) => {
        const expl = await generateExplanation(r.candidate, r.score, parsedIntel);
        setExplanations(prev => ({ ...prev, [r.candidate.id]: expl }));
        setLoadingExpl(prev => ({ ...prev, [r.candidate.id]: false }));
      }));

      setPhase("done");
    } catch (e) {
      setParseError("Pipeline failed — check connection or JD length.");
      setPhase("idle");
    }
  };

  const handleJdChange = (e) => {
    setJd(e.target.value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runPipeline(e.target.value), 1400);
  };

  const handleCandidatesLoaded = (cands) => {
    setCandidates(cands);
    setRanked([]); setExplanations({}); setIntel(null); setPhase("idle");
  };

  const filtered = ranked.filter(r => {
    if (filter === "open") return r.candidate.openToWork;
    if (filter === "top") return r.score.total >= 75;
    return true;
  });

  const PHASES = [
    { key: "parsing", label: "Parse JD" },
    { key: "scoring", label: "Score Candidates" },
    { key: "explaining", label: "Generate Reasoning" },
    { key: "done", label: "Done" },
  ];
  const phaseIdx = PHASES.findIndex(p => p.key === phase);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "0 0 48px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.border}; }
        textarea:focus { outline: none; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.cyan, boxShadow: `0 0 8px ${C.cyan}` }} />
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 14, color: C.white, letterSpacing: 2 }}>SIGNAL</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.textMuted }}>/ AI RECRUITER</span>
        <Tag label="Claude-Powered · Semantic JD Parsing · Explainable Scores" color={C.purple} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["all","open","top"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "3px 10px", borderRadius: 3, fontSize: 10,
              fontFamily: "'IBM Plex Mono',monospace", cursor: "pointer",
              background: filter === f ? C.cyanDim : "transparent",
              border: `1px solid ${filter === f ? C.cyan : C.border}`,
              color: filter === f ? C.cyan : C.textMuted,
            }}>{f === "all" ? "ALL" : f === "open" ? "OPEN" : "TOP 75+"}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "18px 16px" }}>

        {/* Step 1: CSV Upload */}
        <CSVUploadPanel onCandidatesLoaded={handleCandidatesLoaded} count={candidates.length} />

        {/* Step 2: JD Input */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textMuted, letterSpacing: 1 }}>STEP 2 — JOB DESCRIPTION → CLAUDE PARSES → SEMANTIC SCORING → EXPLANATIONS</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setJd(EXAMPLE_JD); clearTimeout(debounceRef.current); runPipeline(EXAMPLE_JD); }}
                style={{ fontSize: 10, padding: "3px 9px", borderRadius: 3, background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>
                Load Example JD
              </button>
              <button onClick={() => runPipeline(jd)}
                disabled={jd.trim().length < 30 || candidates.length === 0 || (phase !== "idle" && phase !== "done")}
                style={{ fontSize: 10, padding: "3px 9px", borderRadius: 3, background: C.cyanDim, border: `1px solid ${C.cyan}`, color: C.cyan, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", opacity: (jd.trim().length < 30 || candidates.length === 0) ? 0.4 : 1 }}>
                ▶ Parse & Rank
              </button>
            </div>
          </div>
          <textarea value={jd} onChange={handleJdChange}
            placeholder={candidates.length === 0 ? "Load candidates first, then paste a job description…" : `${candidates.length} candidates ready — paste a job description to rank them…`}
            style={{ width: "100%", minHeight: 110, background: "transparent", border: "none", color: C.text, fontFamily: "Inter,sans-serif", fontSize: 13, lineHeight: 1.6, padding: 13, resize: "vertical" }}
          />
        </div>

        {/* Pipeline progress */}
        {phase !== "idle" && phase !== "done" && (
          <div style={{ background: C.surface, border: `1px solid ${C.borderAccent}`, borderRadius: 8, padding: 18, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.cyan, animation: "pulse 1.2s infinite", marginBottom: 10 }}>
              {phase === "parsing" && "⚡ Claude is reading and parsing the job description…"}
              {phase === "scoring" && "⚡ Scoring candidates across 6 semantic dimensions…"}
              {phase === "explaining" && "⚡ Generating per-candidate reasoning…"}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
              {PHASES.slice(0,-1).map((p, i) => {
                const done = phaseIdx > i;
                const active = phaseIdx === i;
                return (
                  <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: done ? C.green : active ? C.cyan : C.border, boxShadow: active ? `0 0 8px ${C.cyan}` : "none", animation: active ? "pulse 0.8s infinite" : "none" }} />
                    <span style={{ fontSize: 9, color: done ? C.green : active ? C.cyan : C.textDim, fontFamily: "'IBM Plex Mono',monospace" }}>{p.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {parseError && <div style={{ color: C.red, fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 12, padding: "8px 12px", background: C.redDim, borderRadius: 4 }}>⚠ {parseError}</div>}

        {/* JD Intel */}
        {intel && <IntelPanel intel={intel} />}

        {/* Status + compare button */}
        {ranked.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: C.textMuted }}>
              {filtered.length} candidates · ranked by Claude semantic intelligence · click any card to expand
            </span>
            <button onClick={() => setComparison(filtered.slice(0,3).map(r => ({ ...r.candidate, score: r.score.total })))}
              style={{ marginLeft: "auto", padding: "5px 12px", background: C.amberDim, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }}>
              👥 Compare Top {Math.min(3, filtered.length)}
            </button>
          </div>
        )}

        {/* Ranked list */}
        {filtered.map(r => (
          <CandidateCard
            key={r.candidate.id}
            candidate={r.candidate}
            score={r.score}
            rank={ranked.indexOf(r) + 1}
            expanded={expanded === r.candidate.id}
            onToggle={() => setExpanded(expanded === r.candidate.id ? null : r.candidate.id)}
            explanation={explanations[r.candidate.id]}
            loadingExplanation={loadingExpl[r.candidate.id]}
          />
        ))}

        {/* Empty state */}
        {phase === "idle" && ranked.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 20px" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚡</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
              {candidates.length === 0 ? "Load candidates to begin" : "Paste a job description to rank"}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, fontFamily: "Inter,sans-serif", maxWidth: 440, margin: "0 auto", lineHeight: 1.7 }}>
              {candidates.length === 0
                ? "Upload a CSV or load the example. Columns: name, title, company, location, years, skills (;-separated), domains, summary, personality."
                : "Claude reads your JD, extracts structured intelligence, scores each candidate across 6 semantic dimensions, and explains every score in plain English."}
            </div>
          </div>
        )}

        {/* Score legend */}
        {ranked.length > 0 && (
          <div style={{ marginTop: 20, padding: "12px 14px", background: C.surface, borderRadius: 6, border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: C.textDim, letterSpacing: 1, marginBottom: 8 }}>SCORING DIMENSIONS (100pt · all driven by Claude JD parse)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
              {[
                { name: "Skill Match", pts: 28, color: C.cyan, desc: "Core + implicit + domain keywords" },
                { name: "Experience", pts: 18, color: C.cyan, desc: "Years vs required + seniority calibration" },
                { name: "Culture Fit", pts: 16, color: C.purple, desc: "Personality vs extracted culture signals" },
                { name: "Priority Align", pts: 18, color: C.amber, desc: "JD-weighted dimension scores" },
                { name: "Flags", pts: 10, color: C.green, desc: "Green/red flag detection" },
                { name: "Behavioral", pts: 10, color: C.amber, desc: "Stability, activity, output signals" },
              ].map(d => (
                <div key={d.name} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: d.color, fontWeight: 700 }}>{d.pts}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: C.textMuted, marginTop: 2 }}>{d.name}</div>
                  <div style={{ fontSize: 8, color: C.textDim, marginTop: 2, lineHeight: 1.4, fontFamily: "Inter,sans-serif" }}>{d.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Comparison modal */}
      <ComparisonModal candidates={comparison} onClose={() => setComparison(null)} />
    </div>
  );
}
