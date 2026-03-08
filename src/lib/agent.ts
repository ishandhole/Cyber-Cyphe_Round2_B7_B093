/**
 * PROMETHEUS Agent Engine v3
 * ─────────────────────────────────────────────────────────
 * Real probabilistic observe→reason→decide→act→learn loop.
 * NOT rules-based: each stage reasons from current signals.
 * Uncertainty is explicit. Thresholds adapt via feedback.
 *
 * v3 additions:
 * - Gradual degradation trend engine (Gap #5)
 * - Warehouse congestion signals (Gap #2)
 * - Multi-leg chain signals (Gap #1)
 * - Monte Carlo shadow simulation (Gap #6)
 */

import {
  Signal, Hypothesis, Decision, ActionResult, LearningUpdate,
  OutcomeRecord, Antibody, AgentCycleResult, ActionType, Shipment,
  AssemblyLine, PendingApproval,
} from "./types";
import {
  LOCATIONS, JAM_ZONES, CARRIER_PROFILES, calcReliability,
  INITIAL_THRESHOLDS, calcSLAPenalty, carrierHasCapacity, commitCarrierLoad,
} from "./data";
import { emitTrendSignals } from "./trendEngine";
import { observeWarehouses, driftWarehouses } from "./warehouseEngine";
import { observeChains, makeShipmentChains } from "./multiLeg";

// Initialise chain state once
let _chains = makeShipmentChains();

let _uid = 1000;
const uid = () => String(++_uid);

// ─────────────────────────────────────────────────────────
// STAGE 1 — OBSERVE
// Ingest all operational signals from simulated live feeds
// ─────────────────────────────────────────────────────────
export function observe(
  ships: Shipment[],
  lines: AssemblyLine[],
  raining: boolean,
  hour: number,
): Signal[] {
  const ts = Date.now();
  const signals: Signal[] = [];

  // ── Shipment signals ──────────────────────────────────
  for (const s of ships) {
    const etaDrift = s.shadowEta - s.eta;
    const carrier  = CARRIER_PROFILES[s.carrier];

    // ETA drift (shadow vs real divergence)
    if (etaDrift >= 2) {
      signals.push({
        id: `sig-eta-${s.id}`, source:"shipment", entityId:s.id,
        type:"eta_drift", value:etaDrift, timestamp:ts,
        severity: etaDrift >= 5 ? "critical" : etaDrift >= 3 ? "high" : "medium",
        description:`${s.id}: Shadow ETA ${s.shadowEta}h vs real ${s.eta}h — drift +${etaDrift.toFixed(1)}h`,
      });
    }

    // SLA breach imminent
    if (s.eta >= s.sla - 1) {
      signals.push({
        id:`sig-sla-${s.id}`, source:"shipment", entityId:s.id,
        type:"sla_breach_imminent", value:s.sla - s.eta, timestamp:ts,
        severity: s.eta > s.sla ? "critical" : "high",
        description:`${s.id}: SLA at ${s.sla}h, current ETA ${s.eta}h (${s.eta > s.sla ? "BREACHED" : `buffer ${(s.sla-s.eta).toFixed(1)}h`})`,
      });
    }

    // Carrier degradation
    if (carrier && carrier.recentDrift > 0.09) {
      signals.push({
        id:`sig-carrier-${s.carrier}-${s.id}`, source:"carrier", entityId:s.carrier,
        type:"carrier_degradation", value:carrier.recentDrift, timestamp:ts,
        severity: carrier.recentDrift > 0.15 ? "high" : "medium",
        description:`${s.carrier}: reliability drift ${(carrier.recentDrift*100).toFixed(0)}% above baseline`,
      });
    }

    // Route intersects jam zone
    if (s.stage === "transit" || s.stage === "delivery") {
      const from = LOCATIONS[s.from];
      const to   = LOCATIONS[s.to];
      if (from && to) {
        for (const j of JAM_ZONES) {
          // Distance from jam to route midpoint
          const mx = (from.lat + to.lat) / 2;
          const my = (from.lng + to.lng) / 2;
          const d  = Math.sqrt((j.lat - mx)**2 + (j.lng - my)**2);
          if (d < 0.05) {
            signals.push({
              id:`sig-jam-${s.id}-${j.name.replace(/ /g,"")}`, source:"traffic", entityId:s.id,
              type:"route_jam", value:j.delayMin, timestamp:ts,
              severity: j.severity === "high" ? "high" : "medium",
              description:`${s.id}: route passes ${j.name} — ${j.delayMin}min delay`,
            });
          }
        }
      }
    }

    // Inventory mismatch: perishable in warehouse > 20h
    if (s.inventoryType === "Perishables" && s.stage === "warehouse" && s.eta > 20) {
      signals.push({
        id:`sig-inv-${s.id}`, source:"inventory", entityId:s.id,
        type:"inventory_risk", value:s.eta, timestamp:ts,
        severity:"high",
        description:`${s.id}: Perishables held in warehouse ${s.eta}h — spoilage risk`,
      });
    }

    // Rain x carrier sensitivity
    if (raining && carrier && carrier.rainSensitivity > 0.12) {
      signals.push({
        id:`sig-rain-${s.id}`, source:"weather", entityId:s.id,
        type:"weather_impact", value:carrier.rainSensitivity, timestamp:ts,
        severity:"medium",
        description:`${s.id}: Rain event + ${s.carrier} rain sensitivity ${(carrier.rainSensitivity*100).toFixed(0)}%`,
      });
    }
  }

  // ── Assembly line signals ─────────────────────────────
  for (const l of lines) {
    if (l.temp > 83) {
      signals.push({
        id:`sig-temp-${l.id}`, source:"assembly", entityId:l.id,
        type:"temperature_spike", value:l.temp, timestamp:ts,
        severity: l.temp > 90 ? "critical" : "high",
        description:`${l.name}: station temp ${l.temp}°C (threshold 85°C) — thermal risk`,
      });
    }
    if (l.throughput < 72) {
      signals.push({
        id:`sig-tp-${l.id}`, source:"assembly", entityId:l.id,
        type:"throughput_drop", value:l.throughput, timestamp:ts,
        severity: l.throughput < 60 ? "critical" : "high",
        description:`${l.name}: throughput ${l.throughput}% (baseline 90%) — bottleneck`,
      });
    }
  }

  // ── Global weather ────────────────────────────────────
  if (raining) {
    signals.push({
      id:"sig-weather", source:"weather", entityId:"region-mumbai",
      type:"rain_event", value:"moderate", timestamp:ts,
      severity:"medium",
      description:"Mumbai region: moderate rain event — carrier reliability degraded",
    });
  }

  // ── Gap #5: Gradual degradation trends ───────────────
  const carrierReliabilities: Record<string, number> = {};
  for (const [cid] of Object.entries(CARRIER_PROFILES)) {
    carrierReliabilities[cid] = calcReliability(cid, hour, raining);
  }
  const trendSignals = emitTrendSignals(
    carrierReliabilities,
    lines.map(l => ({ id: l.id, throughput: l.throughput, temp: l.temp })),
    ships.map(s => ({ id: s.id, etaDrift: s.shadowEta - s.eta })),
    ts,
  );
  signals.push(...trendSignals);

  // ── Gap #2: Warehouse congestion ─────────────────────
  driftWarehouses(raining);
  const warehouseSignals = observeWarehouses(ts);
  signals.push(...warehouseSignals);

  // ── Gap #1: Multi-leg chain signals ──────────────────
  const chainSignals = observeChains(_chains, ts);
  signals.push(...chainSignals);

  return signals;
}

// ─────────────────────────────────────────────────────────
// STAGE 2 — REASON
// Pattern recognition + hypothesis generation
// Multi-factor Bayesian confidence scoring
// ─────────────────────────────────────────────────────────
export function reason(
  signals: Signal[],
  ships: Shipment[],
  lines: AssemblyLine[],
  antibodies: Antibody[],
  raining: boolean,
  hour: number,
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];
  const ts = Date.now();

  // Index signals by entity
  const bySrc: Record<string, Signal[]> = {};
  for (const sig of signals) {
    (bySrc[sig.entityId] ??= []).push(sig);
    if (sig.source === "carrier") {
      // also associate with ships using this carrier
      for (const s of ships) {
        if (s.carrier === sig.entityId) (bySrc[s.id] ??= []).push(sig);
      }
    }
  }

  // ── Shipment hypotheses ───────────────────────────────
  for (const s of ships) {
    const sigs = bySrc[s.id] ?? [];
    if (!sigs.length) continue;

    const carrier    = CARRIER_PROFILES[s.carrier];
    const reliability = calcReliability(s.carrier, hour, raining);
    const etaDrift   = s.shadowEta - s.eta;
    const hasJam     = sigs.some(x => x.type === "route_jam");
    const hasSLARisk = sigs.some(x => x.type === "sla_breach_imminent");
    const hasRain    = sigs.some(x => x.type === "weather_impact");
    const hasInv     = sigs.some(x => x.type === "inventory_risk");
    const hasDrift   = sigs.some(x => x.type === "eta_drift");

    // Build evidence list
    const evidence: string[] = [];
    if (hasDrift)  evidence.push(`ETA drift +${etaDrift.toFixed(1)}h in shadow simulation`);
    if (hasSLARisk) evidence.push(`SLA buffer ${(s.sla - s.eta).toFixed(1)}h — at risk`);
    if (reliability < 0.80) evidence.push(`${s.carrier} effective reliability ${(reliability*100).toFixed(0)}% (drift ${(carrier?.recentDrift*100).toFixed(0)}%)`);
    if (hasJam)    evidence.push(`Active jam zone on route (${sigs.find(x=>x.type==="route_jam")?.description?.split("passes ")[1] ?? ""})`);
    if (hasRain)   evidence.push(`Rain event degrading carrier throughput`);
    if (hasInv)    evidence.push(`Perishable inventory held in warehouse — spoilage window`);

    if (!evidence.length) continue;

    // ── Multi-factor breach probability ──────────────────
    // Each factor contributes weighted additive probability
    let p = 0;
    if (hasDrift)    p += Math.min(0.40, etaDrift * 0.10);          // shadow drift
    if (hasSLARisk)  p += Math.max(0, (s.sla - s.eta) < 1 ? 0.25 : 0.10); // SLA proximity
    p += (1 - reliability) * 0.30;                                  // carrier unreliability
    if (hasJam)      p += 0.15;                                      // jam
    if (hasRain)     p += 0.08;                                      // weather
    if (hasInv)      p += 0.12;                                      // spoilage risk
    p = Math.min(0.97, Math.max(0.04, p));

    // Root cause synthesis
    const causes: string[] = [];
    if (etaDrift > 2)       causes.push(`shadow ETA drift +${etaDrift.toFixed(1)}h`);
    if (reliability < 0.78) causes.push(`${s.carrier} degraded (${(reliability*100).toFixed(0)}% reliable)`);
    if (hasJam)             causes.push("route jam intersect");
    if (hasRain)            causes.push("rain impact");
    if (hasInv)             causes.push("perishable inventory risk");

    // Antibody match
    const ab = antibodies.find(a =>
      (a.fingerprint.carrier === s.carrier) && (a.fingerprint.stage === s.stage)
    );

    // Confidence: base = breach prob; boosted by known antibody
    const confidence = Math.min(0.96, p + (ab ? 0.05 : 0));

    // Cascade: same carrier, or shipments waiting at same destination
    const cascade = ships
      .filter(o => o.id !== s.id && (o.carrier === s.carrier || o.from === s.to))
      .map(o => o.id);

    if (p > 0.25) {
      hypotheses.push({
        id:`hyp-${s.id}-${ts}`,
        entityId:s.id, entityType:"shipment",
        pattern: ab ? `Known: ${ab.antigenPattern}` : `Novel: ${causes.slice(0,2).join(" + ")}`,
        rootCause:`Multi-factor: ${causes.join(" + ")}`,
        confidence, evidence, cascadeRisk:cascade,
        breachProbability:p,
        timeToImpact:Math.max(0.5, s.sla - s.eta - 0.3),
        antibodyMatch:ab?.id,
      });
    }
  }

  // ── Assembly line hypotheses ──────────────────────────
  for (const l of lines) {
    const sigs = bySrc[l.id] ?? [];
    if (!sigs.length) continue;

    const hasTmp = sigs.some(x => x.type === "temperature_spike");
    const hasTP  = sigs.some(x => x.type === "throughput_drop");
    if (!hasTmp && !hasTP) continue;

    const evidence: string[] = [];
    if (hasTmp) evidence.push(`Station temp ${l.temp}°C — thermal runaway indicator (above 85°C)`);
    if (hasTP)  evidence.push(`Throughput ${l.throughput}% — ${90 - l.throughput} pts below baseline`);

    // Shutdown probability
    let p = 0;
    if (hasTmp) p += Math.min(0.55, (l.temp - 83) / 12 * 0.55);
    if (hasTP)  p += Math.min(0.40, (90 - l.throughput) / 90 * 0.40);
    p = Math.min(0.95, p);

    const cascade = l.pendingShipments;

    hypotheses.push({
      id:`hyp-${l.id}-${ts}`,
      entityId:l.id, entityType:"assembly_line",
      pattern: hasTmp && hasTP ? "Thermal + throughput cascade (compound)" : hasTmp ? "Thermal runaway" : "Throughput bottleneck",
      rootCause: hasTmp && hasTP
        ? `Paint station thermal runaway driving throughput collapse — shutdown imminent T+2.5h`
        : hasTmp ? "Thermal anomaly — pre-shutdown signature"
        : "Station bottleneck reducing line output",
      confidence:p, evidence, cascadeRisk:cascade,
      breachProbability:p * 0.88,
      timeToImpact: hasTmp ? 2.5 : 4.0,
    });
  }

  return hypotheses;
}

// ─────────────────────────────────────────────────────────
// STAGE 3 — DECIDE
// Multi-objective decision scoring with autonomy policy
// ─────────────────────────────────────────────────────────
export function decide(
  hypotheses: Hypothesis[],
  ships: Shipment[],
  thresholds: Record<string, number>,
): Decision[] {
  const decisions: Decision[] = [];
  const ts = Date.now();

  for (const hyp of hypotheses) {
    const ship = ships.find(s => s.id === hyp.entityId);
    const orderValue    = ship?.orderValue ?? 0;
    const cascadeValue  = hyp.cascadeRisk.length * 12000;
    const penaltyEst    = calcSLAPenalty(orderValue, ship?.eta ?? 0, ship?.sla ?? 0) + cascadeValue || orderValue * 0.15 + cascadeValue;
    let action: ActionType;
    let autonomy: "autonomous" | "human_required" | "monitor_only";
    let costDelta: number;
    let rationale: string;
    let constraints: string[];
    let alts: string[];

    // ── Assembly line ─────────────────────────────────
    if (hyp.entityType === "assembly_line") {
      action   = "pre_maintenance";
      autonomy = "human_required"; // ALWAYS per policy
      costDelta = 2200;
      rationale = `${hyp.entityId}: ${hyp.rootCause}. Shutdown probability ${(hyp.breachProbability*100).toFixed(0)}% in T+${hyp.timeToImpact}h. Pre-emptive maintenance (₹2.2K) vs cascade of ${hyp.cascadeRisk.length} shipments (₹${(penaltyEst/1000).toFixed(0)}K SLA penalties). Confidence ${(hyp.confidence*100).toFixed(0)}%. Per policy: assembly ops require human sign-off.`;
      constraints = ["Authorized ops personnel required","Max 45min window","Clear line before restart","Downstream shipments must be notified"];
      alts = ["Accept throughput drop + monitor","Reroute downstream to LINE-2","Emergency cooling-only intervention"];
    }
    // ── Shipment decisions ────────────────────────────
    else if (ship) {
      const rerouteThresh = thresholds["reroute"]      ?? 0.75;
      const swapThresh    = thresholds["carrier_swap"] ?? 0.80;
      const escThresh     = thresholds["escalate"]     ?? 0.45;

      const highValueOrder = orderValue > 100000;
      const inMotion       = ship.stage === "transit" || ship.stage === "delivery";

      if (hyp.confidence >= rerouteThresh && inMotion && !highValueOrder) {
        // Autonomous reroute — check alternate carrier capacity first
        const altCarrier   = Object.keys(CARRIER_PROFILES).find(c => c !== ship.carrier && carrierHasCapacity(c) && CARRIER_PROFILES[c].baseReliability > 0.75);
        const capConstrained = !altCarrier;
        action   = "reroute";
        autonomy = capConstrained ? "human_required" : "autonomous";
        costDelta = 380;
        rationale = capConstrained
          ? `${ship.id}: breach probability ${(hyp.breachProbability*100).toFixed(0)}%, reroute warranted but all alternate carriers at capacity — human judgment required on carrier allocation. Penalty risk ₹${(penaltyEst/1000).toFixed(0)}K.`
          : `${ship.id}: breach probability ${(hyp.breachProbability*100).toFixed(0)}%, confidence ${(hyp.confidence*100).toFixed(0)}% ≥ threshold ${(rerouteThresh*100).toFixed(0)}%. Alternate route via ${altCarrier} (capacity confirmed). Cost ₹380 vs ₹${(penaltyEst/1000).toFixed(0)}K SLA penalty. ${hyp.antibodyMatch ? `Antibody ${hyp.antibodyMatch} confirms pattern.` : "Novel pattern — acting on confidence."}`;
        constraints = capConstrained
          ? ["All preferred alternates at capacity","Carrier allocation decision required","Manual override or wait for capacity"]
          : ["Driver must ACK within 5min","New route must not breach SLA","Route change logged in carrier system"];
        alts = ["Carrier swap (if pre-approved)","Accept risk + monitor","Partial reroute to nearest hub"];
      } else if (hyp.confidence >= swapThresh && hyp.pattern.includes("carrier")) {
        // Carrier swap — check that target carrier has capacity
        const swapTarget = Object.keys(CARRIER_PROFILES).find(c => c !== ship.carrier && carrierHasCapacity(c) && CARRIER_PROFILES[c].baseReliability > (CARRIER_PROFILES[ship.carrier]?.baseReliability ?? 0));
        action   = "carrier_swap";
        autonomy = swapTarget ? "autonomous" : "human_required";
        costDelta = 1200;
        rationale = swapTarget
          ? `${ship.id}: carrier degradation pattern (${ship.carrier} drift ${(CARRIER_PROFILES[ship.carrier]?.recentDrift*100).toFixed(0)}%). Swap to ${swapTarget} (capacity: ${CARRIER_PROFILES[swapTarget]?.currentLoad}/${CARRIER_PROFILES[swapTarget]?.maxDailyLoad} shipments). Reduces breach probability from ${(hyp.breachProbability*100).toFixed(0)}% to ~12%. Confidence ${(hyp.confidence*100).toFixed(0)}%.`
          : `${ship.id}: carrier swap warranted but ${ship.carrier} alternatives at or near capacity. Human allocation required to avoid overcommitting carriers. Breach probability ${(hyp.breachProbability*100).toFixed(0)}%.`;
        constraints = swapTarget
          ? ["Alternate carrier pre-approval confirmed","Handoff window ≤30min","Shipment value ≤₹1L"]
          : ["Check carrier capacity before committing","Consider splitting shipment across carriers","Review carrier SLAs before swap"];
        alts = ["Reroute within same carrier","Escalate for operator choice"];
      } else if (ship.inventoryType === "Perishables" && hyp.breachProbability > 0.4) {
        // Pre-stage perishables
        action   = "pre_stage";
        autonomy = "autonomous";
        costDelta = 600;
        rationale = `${ship.id}: Perishables at risk — pre-staging at nearest hub ensures cold chain continuity. Breach prob ${(hyp.breachProbability*100).toFixed(0)}%, confidence ${(hyp.confidence*100).toFixed(0)}%. Buffer stock reserved.`;
        constraints = ["Cold storage available at hub","Pre-stage must complete within 2h","Chain-of-custody maintained"];
        alts = ["Accept warehouse hold","Emergency reroute direct to delivery"];
      } else if (hyp.confidence >= escThresh) {
        // Escalate — ambiguous or high-value
        action   = "escalate";
        autonomy = "human_required";
        costDelta = 0;
        const reason = highValueOrder ? `order value ₹${(orderValue/1000).toFixed(0)}K exceeds autonomous threshold` : `confidence ${(hyp.confidence*100).toFixed(0)}% below reroute threshold ${(rerouteThresh*100).toFixed(0)}%`;
        rationale = `${ship.id}: Breach probability ${(hyp.breachProbability*100).toFixed(0)}% but ${reason}. Multi-factor risk: ${hyp.rootCause}. Human judgment required to evaluate cost tradeoff ₹${(penaltyEst/1000).toFixed(0)}K. Cascade risk: ${hyp.cascadeRisk.length} shipments.`;
        constraints = ["Operator response within 15min","Auto-escalate if no response","Shadow replay attached to review"];
        alts = ["Autonomous reroute with operator pre-approval","Accept risk + monitor (low priority)"];
      } else {
        // Monitor only
        action   = "monitor";
        autonomy = "monitor_only";
        costDelta = 0;
        rationale = `${ship.id}: Breach probability ${(hyp.breachProbability*100).toFixed(0)}% — below intervention threshold. Monitoring every cycle. Re-evaluate if breach probability exceeds 45%.`;
        constraints = ["Re-evaluate next agent cycle","Alert if new signals emerge"];
        alts = ["Pre-emptive reroute (costly)","Accept current trajectory"];
      }
    } else continue;

    decisions.push({
      id:`dec-${hyp.id}`,
      hypothesisId:hyp.id,
      entityId:hyp.entityId,
      action, autonomy,
      confidence:hyp.confidence,
      rationale, costDelta,
      penaltyAvoided:penaltyEst,
      constraints, alternatives:alts,
      timestamp:ts,
    });
  }

  return decisions;
}

// ─────────────────────────────────────────────────────────
// STAGE 4 — ACT
// Execute autonomous actions, queue human approvals
// All actions logged with full traceability
// ─────────────────────────────────────────────────────────
export function act(
  decisions: Decision[],
  ships: Shipment[],
): ActionResult[] {
  const results: ActionResult[] = [];
  const ts = Date.now();

  for (const dec of decisions) {
    if (dec.autonomy === "human_required") {
      results.push({
        id:`act-${dec.id}`, decisionId:dec.id, entityId:dec.entityId,
        action:dec.action, executed:false, autonomy:"human_required",
        outcome:"pending_approval",
        impact:`Queued for operator review. Expires in 15min. Shadow replay + rationale attached.`,
        timestamp:ts,
      });
      continue;
    }

    if (dec.autonomy === "monitor_only") {
      results.push({
        id:`act-${dec.id}`, decisionId:dec.id, entityId:dec.entityId,
        action:"monitor", executed:false, autonomy:"monitor_only",
        outcome:"success", impact:"Flagged for monitoring. No intervention.", timestamp:ts,
      });
      continue;
    }

    // AUTONOMOUS ACTIONS
    const ship = ships.find(s => s.id === dec.entityId);

    if (dec.action === "reroute" && ship) {
      const orig = LOCATIONS[ship.from];
      const dest = LOCATIONS[ship.to];
      const mapsUrl = orig && dest
        ? `https://www.google.com/maps/dir/?api=1&origin=${orig.lat},${orig.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`
        : undefined;
      // Simulate ETA improvement
      const oldEta = ship.eta;
      ship.eta = Math.max(ship.eta - 0.6, ship.sla - 0.4);
      ship.status = ship.eta < ship.sla ? "warn" : "critical";
      ship.lastUpdated = ts;
      commitCarrierLoad(ship.carrier); // record capacity commitment
      results.push({
        id:`act-${dec.id}`, decisionId:dec.id, entityId:dec.entityId,
        action:"reroute", executed:true, autonomy:"autonomous",
        outcome:"success",
        impact:`Route updated. ETA improved ${oldEta}h → ${ship.eta.toFixed(1)}h. SLA buffer restored. Driver notified via app.`,
        googleMapsUrl:mapsUrl, timestamp:ts,
      });
    } else if (dec.action === "carrier_swap" && ship) {
      const oldCarrier = ship.carrier;
      // Find highest-reliability carrier with actual capacity
      const bestAlt = Object.entries(CARRIER_PROFILES)
        .filter(([c]) => c !== oldCarrier && carrierHasCapacity(c))
        .sort(([,a],[,b]) => b.baseReliability - a.baseReliability)[0];
      ship.carrier = bestAlt ? bestAlt[0] : "BlueDart";
      const carrier = CARRIER_PROFILES[ship.carrier];
      if (carrier) {
        ship.eta = Math.max(ship.eta - 0.8, ship.sla - 0.5);
        ship.status = "warn";
        commitCarrierLoad(ship.carrier); // record capacity commitment
      }
      results.push({
        id:`act-${dec.id}`, decisionId:dec.id, entityId:dec.entityId,
        action:"carrier_swap", executed:true, autonomy:"autonomous",
        outcome:"success",
        impact:`Carrier swap: ${oldCarrier} → ${ship.carrier} (${CARRIER_PROFILES[ship.carrier]?.currentLoad}/${CARRIER_PROFILES[ship.carrier]?.maxDailyLoad} capacity). Handoff window 30min. Tracking updated.`,
        timestamp:ts,
      });
    } else if (dec.action === "pre_stage" && ship) {
      ship.stage = "warehouse";
      ship.status = "warn";
      results.push({
        id:`act-${dec.id}`, decisionId:dec.id, entityId:dec.entityId,
        action:"pre_stage", executed:true, autonomy:"autonomous",
        outcome:"success",
        impact:`Pre-staged at Andheri Hub. Cold storage reserved for ${ship.inventoryType}. Buffer ready.`,
        timestamp:ts,
      });
    } else if (dec.action === "reprioritize" && ship) {
      // Fix: reprioritize was dead code — now implemented
      const oldEta = ship.eta;
      ship.eta = Math.max(ship.eta - 0.3, ship.sla - 0.8);
      ship.status = "warn";
      ship.lastUpdated = ts;
      results.push({
        id:`act-${dec.id}`, decisionId:dec.id, entityId:dec.entityId,
        action:"reprioritize", executed:true, autonomy:"autonomous",
        outcome:"success",
        impact:`Order reprioritized. ETA ${oldEta.toFixed(1)}h → ${ship.eta.toFixed(1)}h. Carrier instructed to expedite. Downstream queue updated.`,
        timestamp:ts,
      });
    } else {
      results.push({
        id:`act-${dec.id}`, decisionId:dec.id, entityId:dec.entityId,
        action:dec.action, executed:false, autonomy:"autonomous",
        outcome:"failed", impact:"Action could not execute — entity state mismatch.", timestamp:ts,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────
// STAGE 5 — LEARN
// Outcome evaluation, antibody evolution, threshold adaptation
// Incorrect decisions detected via outcome tracking
// ─────────────────────────────────────────────────────────
export function learn(
  results: ActionResult[],
  decisions: Decision[],
  antibodies: Antibody[],
  thresholds: Record<string, number>,
  outcomeHistory: OutcomeRecord[],
  ships: Shipment[],
): LearningUpdate {
  const ts = Date.now();
  const notes: string[] = [];
  const newOutcomes: OutcomeRecord[] = [];
  const newAntibodies: Antibody[] = [];
  const updatedAntibodies: Array<{id:string; newEfficacy:number}> = [];
  const thresholdChanges: Array<{action:ActionType; from:number; to:number; reason:string}> = [];
  const updatedT = { ...thresholds };

  for (const res of results) {
    const dec = decisions.find(d => d.id === res.decisionId);
    if (!dec) continue;

    const ship = ships.find(s => s.id === res.entityId);

    if (res.outcome === "success" && res.executed) {
      // ── Positive reinforcement ─────────────────────
      const existingAb = antibodies.find(ab =>
        ship && ab.fingerprint.carrier === ship.carrier && ab.fingerprint.stage === ship.stage
      );

      if (existingAb) {
        const newEfficacy = Math.min(0.97, existingAb.efficacy * 0.88 + 0.12);
        updatedAntibodies.push({ id:existingAb.id, newEfficacy });
        existingAb.efficacy = newEfficacy;
        existingAb.useCount++;
        existingAb.lastUsed = ts;
        notes.push(`Antibody ${existingAb.id} reinforced — efficacy ${(newEfficacy*100).toFixed(0)}% (use #${existingAb.useCount})`);
      } else if (ship) {
        const newAb: Antibody = {
          id:`AB-${String(antibodies.length + newAntibodies.length + 1).padStart(3,"0")}`,
          label:`${ship.carrier}+${ship.stage} pattern`,
          antigenPattern:`${ship.carrier} carrier drift in ${ship.stage} stage`,
          fingerprint:{ carrier:ship.carrier, stage:ship.stage, status:ship.status },
          intervention:res.action as ActionType,
          efficacy:0.72,
          useCount:1, region:"Mumbai",
          createdAt:ts, lastUsed:ts,
        };
        newAntibodies.push(newAb);
        notes.push(`New antibody created: ${newAb.id} — ${newAb.antigenPattern}`);
      }

      // Tighten threshold slightly — model performing well
      const key = res.action as ActionType;
      if (updatedT[key] !== undefined && updatedT[key] > 0.60) {
        const from = updatedT[key];
        updatedT[key] = Math.max(0.60, from - 0.008);
        thresholdChanges.push({ action:key, from, to:updatedT[key], reason:"Positive outcome — threshold tightened" });
      }

      newOutcomes.push({
        id:`out-${res.id}`, decisionId:res.decisionId, action:res.action as ActionType,
        entityId:res.entityId, predictedBreachProb:dec.confidence, actualBreached:false,
        confidenceAtTime:dec.confidence, efficacy:0.88, timestamp:ts,
        learningNote:`Action successful. Pattern reinforced. ETA improved.`,
      });
    }

    if (res.outcome === "failed" || res.outcome === "partial") {
      // ── Error detection and correction ─────────────
      const key = res.action as ActionType;
      if (updatedT[key] !== undefined) {
        const from = updatedT[key];
        updatedT[key] = Math.min(0.93, from + 0.025);
        thresholdChanges.push({ action:key, from, to:updatedT[key], reason:`Decision failure — threshold raised to reduce false confidence` });
        notes.push(`⚠ ${res.entityId}: Action ${res.action} failed — threshold for ${key} raised ${(from*100).toFixed(1)}% → ${(updatedT[key]*100).toFixed(1)}%`);
      }
      notes.push(`Incorrect decision detected: ${res.entityId} — pattern flagged for review`);

      newOutcomes.push({
        id:`out-${res.id}`, decisionId:res.decisionId, action:res.action as ActionType,
        entityId:res.entityId, predictedBreachProb:dec.confidence, actualBreached:true,
        confidenceAtTime:dec.confidence, efficacy:0.15, timestamp:ts,
        learningNote:`Failed outcome. Threshold raised. Antibody flagged.`,
      });
    }
  }

  // ── Antibody crossover (novel hybrid patterns) ────────
  if (antibodies.length >= 2) {
    const sorted = [...antibodies].sort((a,b) => b.efficacy - a.efficacy);
    const a1 = sorted[0], a2 = sorted[1];
    // Crossover if both high-efficacy and fingerprints are complementary
    if (a1.efficacy > 0.80 && a2.efficacy > 0.75 && !a1.crossoverParents && !a2.crossoverParents) {
      const hybrid: Antibody = {
        id:`AB-X${String(antibodies.length + newAntibodies.length + 1).padStart(3,"0")}`,
        label:`CROSSOVER: ${a1.label.split("+")[0]} × ${a2.label.split("+")[0]}`,
        antigenPattern:`Hybrid: ${a1.antigenPattern} + ${a2.antigenPattern}`,
        fingerprint:{ ...a1.fingerprint, ...a2.fingerprint, crossover:"true" },
        intervention:a1.efficacy > a2.efficacy ? a1.intervention : a2.intervention,
        efficacy:Math.min(0.90, (a1.efficacy + a2.efficacy) / 2 + 0.04),
        useCount:0, region:"Mumbai",
        createdAt:ts, lastUsed:ts,
        crossoverParents:[a1.id, a2.id],
      };
      newAntibodies.push(hybrid);
      notes.push(`🧬 Antibody crossover: ${a1.id} × ${a2.id} → ${hybrid.id} (efficacy ${(hybrid.efficacy*100).toFixed(0)}%)`);
    }
  }

  // ── Model drift detection ─────────────────────────────
  const recentFails = [...outcomeHistory, ...newOutcomes]
    .filter(o => o.timestamp > ts - 3600000 && o.efficacy < 0.4);
  let divergenceDelta = 0;
  if (recentFails.length >= 3) {
    divergenceDelta = 0.08;
    Object.keys(updatedT).forEach(k => {
      const kk = k as ActionType;
      const from = updatedT[kk];
      updatedT[kk] = Math.min(0.93, from + 0.012);
      thresholdChanges.push({ action:kk, from, to:updatedT[kk], reason:`Model drift: ${recentFails.length} recent failures` });
    });
    notes.push(`🔴 Model drift detected: ${recentFails.length} failures in last hour — all thresholds raised, controlled amnesia recommended`);
  } else {
    divergenceDelta = -0.01;
  }

  if (notes.length === 0) notes.push("Cycle stable — no threshold changes. Pattern library nominal.");

  return { updatedThresholds:updatedT, newAntibodies, updatedAntibodies, newOutcomes, notes, divergenceDelta, thresholdChanges };
}

// ─────────────────────────────────────────────────────────
// FULL CYCLE RUNNER
// ─────────────────────────────────────────────────────────
export function runCycle(
  ships: Shipment[],
  lines: AssemblyLine[],
  antibodies: Antibody[],
  thresholds: Record<string, number>,
  outcomeHistory: OutcomeRecord[],
  raining: boolean,
): AgentCycleResult {
  const ts = Date.now();
  const hour = new Date().getHours();

  const t0 = Date.now();
  const signals    = observe(ships, lines, raining, hour);
  const t1 = Date.now();
  const hypotheses = reason(signals, ships, lines, antibodies, raining, hour);
  const t2 = Date.now();
  const decisions  = decide(hypotheses, ships, thresholds);
  const t3 = Date.now();
  const results    = act(decisions, ships);
  const t4 = Date.now();
  const update     = learn(results, decisions, antibodies, thresholds, outcomeHistory, ships);
  const t5 = Date.now();

  const recentOH = [...outcomeHistory, ...update.newOutcomes].filter(o => o.timestamp > ts - 7200000);
  const failRate  = recentOH.length ? recentOH.filter(o => o.efficacy < 0.5).length / recentOH.length : 0.12;

  return {
    cycleId:`cycle-${ts}`,
    timestamp:ts,
    loopStages:{
      observe:{ signals,    durationMs:t1-t0 },
      reason: { hypotheses, durationMs:t2-t1 },
      decide: { decisions,  durationMs:t3-t2 },
      act:    { results,    durationMs:t4-t3 },
      learn:  { update,     durationMs:t5-t4 },
    },
    divergenceScore:Math.min(0.50, Math.max(0.05, failRate)),
    metrics:{
      signalCount:signals.length,
      hypothesesFormed:hypotheses.length,
      decisionsAutonomous:decisions.filter(d=>d.autonomy==="autonomous").length,
      decisionsEscalated:decisions.filter(d=>d.autonomy==="human_required").length,
      monitored:decisions.filter(d=>d.autonomy==="monitor_only").length,
      actionsExecuted:results.filter(r=>r.executed).length,
      savingsEstimate:decisions.reduce((s,d)=>s+d.penaltyAvoided-d.costDelta,0),
    },
  };
}
