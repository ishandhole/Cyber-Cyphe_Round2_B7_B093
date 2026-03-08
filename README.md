# 🔱 PROMETHEUS — Agentic Supply Chain Command

> **Observe → Reason → Decide → Act → Learn**
> A production-grade agentic AI system for logistics and supply chain operations.

---

## Problem Statement Compliance

| Requirement | Implementation |
|-------------|----------------|
| **Observe**: Ingest live signals | `agent.ts:observe()` — 7 signal types across shipments, assembly, carriers, traffic, weather, inventory |
| **Reason**: Pattern recognition + hypotheses | `agent.ts:reason()` — multi-factor Bayesian confidence scoring, cascade analysis, antibody matching |
| **Decide**: Multi-objective intervention | `agent.ts:decide()` — cost/penalty tradeoff, autonomy policy, confidence thresholds |
| **Act with guardrails** | `agent.ts:act()` — 3 autonomous action types, human queue for restricted actions |
| **Learn**: Outcome feedback loop | `agent.ts:learn()` — threshold adaptation, antibody library, error detection, crossover |
| **Not rules-based** | Each cycle reasons from current state; thresholds evolve; novel patterns handled |
| **Explains decisions** | Every decision has full rationale, confidence, cost delta, constraints, alternatives |
| **Autonomy policy** | Explicit matrix — what's autonomous, what requires humans, what's monitored only |
| **Error detection** | Failed outcomes raise thresholds, flag antibodies, trigger controlled amnesia |

---

## Architecture

```
src/
├── lib/
│   ├── types.ts          # All shared types (Signal, Hypothesis, Decision, etc.)
│   ├── data.ts           # Mumbai logistics data, carrier profiles, autonomy matrix
│   └── agent.ts          # Core: observe/reason/decide/act/learn functions
├── app/
│   ├── page.tsx          # Main dashboard — full loop orchestration
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       └── agent/
│           ├── cycle/route.ts    # POST: run agent cycle
│           └── approve/route.ts  # POST: human approve/reject
└── components/
    ├── MetricsBar.tsx    # Header KPIs + loop stage bar + controls
    ├── LoopBar.tsx       # Visual OBSERVE→REASON→DECIDE→ACT→LEARN indicator
    ├── MapCanvas.tsx     # Canvas dual maps: real-world + shadow +6h
    ├── ShipmentList.tsx  # Left: shipments, assembly lines, policy view
    ├── SignalPanel.tsx   # OBSERVE: live signal feed
    ├── HypothesisPanel.tsx # REASON: hypotheses + evidence + confidence
    ├── DecisionPanel.tsx # DECIDE+ACT: decisions with rationale + approve/reject
    └── LearningPanel.tsx # LEARN: thresholds, antibodies, divergence, notes
```

---

## The Agent Loop

### 1. OBSERVE
Ingests 7 types of signals from simulated live feeds:
- `eta_drift` — shadow ETA diverging from real ETA
- `sla_breach_imminent` — SLA buffer < 1h
- `carrier_degradation` — carrier reliability drift above baseline
- `route_jam` — jam zone intersects delivery path
- `inventory_risk` — perishables held too long
- `weather_impact` — rain × carrier sensitivity
- `temperature_spike` / `throughput_drop` — assembly anomalies

### 2. REASON
Multi-factor Bayesian confidence model:
```
breach_prob = f(eta_drift, sla_proximity, carrier_reliability, jam, rain, inventory)
```
Forms hypotheses with: pattern, root cause, evidence list, cascade risk, antibody match.

### 3. DECIDE
Multi-objective decision with explicit policy:

| Confidence | Order Value | Action | Tier |
|------------|-------------|--------|------|
| ≥75% | ≤₹1L | reroute | **Autonomous** |
| ≥80% | any | carrier_swap (if pre-approved) | **Autonomous** |
| ≥70% | any | pre_stage | **Autonomous** |
| always | any | pre_maintenance | **Human required** |
| <75% or >₹1L | any | escalate | **Human required** |
| <30% | any | monitor | Monitor only |

### 4. ACT (with guardrails)
- Autonomous actions: execute immediately, update ship state, log everything
- Human-required: queue with 15min expiry, attach shadow replay
- All actions: full rationale, cost delta, penalty avoided, alternatives
- Google Maps URL generated for reroute actions

### 5. LEARN
- **Positive feedback**: tightens confidence thresholds, reinforces antibodies
- **Negative feedback**: raises thresholds, flags patterns, logs error
- **Antibody crossover**: combines top-2 high-efficacy antibodies into hybrid
- **Model drift detection**: ≥3 recent failures → all thresholds raised, amnesia triggered
- **Divergence monitor**: tracks shadow↔reality drift ratio

---

## New Features
- Expanded graph containers for Track tab (wider layout, max‑w 1800px, sidebar reduced to 480px).
- Dummy AI endpoint (`/api/ai/dummy`) for offline testing and quota fallback.
- Gemini 2.5‑flash model integration for reasoning and explanation.
- Automatic quota‑exhaustion fallback that returns realistic mock responses.
- Updated UI to use Gemini 2.5 and fallback logic.

## Quick Start

```bash
# Unzip
unzip prometheus-nextjs-v2.zip && cd prometheus-next

# Install
npm install

# Run
npm run dev
# → http://localhost:3000

# Build
npm run build && npm start
```

---

## Demo Script (4-minute presentation)

1. **Load dashboard** → See 8 live shipments on dual maps, real vs shadow world
2. **Click ▶ START AGENT** → Watch loop bar animate OBSERVE→REASON→DECIDE→ACT→LEARN
3. **OBSERVE panel**: signals appear — SHP-002 eta drift, Shadowfax degradation, Mahim jam
4. **REASON panel**: hypotheses form with breach probability bars and cascade analysis
5. **DECIDE+ACT panel**: autonomous reroutes execute, human approvals appear
6. **Assembly tab**: click SUBMIT FOR HUMAN APPROVAL → approve → watch line intervention
7. **LEARN panel**: watch antibody library build, thresholds evolve, divergence meter
8. **Toggle 🌧 RAIN** → watch cascade of signals, increased breach probabilities
9. **Policy tab**: show explicit autonomy matrix — "this is what makes us not rules-based"
10. **Pitch**: "Every other system tells you a shipment is late. PROMETHEUS sees it fail in a parallel universe 6 hours from now — and stops it."
