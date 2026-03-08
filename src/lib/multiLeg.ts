/**
 * PROMETHEUS — Multi-Leg Shipment Dependency Engine
 * ───────────────────────────────────────────────────
 * Gap #1: Models shipments as chains of dependent handoff stages.
 * Each leg has its own ETA, carrier, risk, and handoff window.
 * A delay in leg N cascades to legs N+1..end.
 *
 * Adds a ShipmentChain type overlaid on existing Shipment.
 * The observe() stage checks each handoff for risk.
 */

import { Signal } from "./types";

export type LegStage = "assembly" | "warehouse" | "pickup" | "transit" | "hub_sort" | "last_mile";

export interface ShipmentLeg {
  legId: string;
  stage: LegStage;
  from: string;
  to: string;
  carrier?: string;
  plannedStart: number;   // hours from now
  plannedEnd: number;     // hours from now (= ETA for this leg)
  actualEnd?: number;     // set when completed
  status: "pending" | "active" | "complete" | "delayed" | "at_risk";
  bufferHours: number;    // slack before next leg is impacted
  notes?: string;
}

export interface ShipmentChain {
  shipmentId: string;
  legs: ShipmentLeg[];
  criticalPathIndex: number; // which leg is currently on the critical path
  overallSla: number;
  accumulatedDelayHours: number;
}

// Generates realistic multi-leg chains for the demo shipments
export function makeShipmentChains(): ShipmentChain[] {
  return [
    {
      shipmentId: "SHP-001",
      overallSla: 19,
      accumulatedDelayHours: 0,
      criticalPathIndex: 1,
      legs: [
        { legId:"SHP-001-L1", stage:"warehouse",  from:"wh_dharavi",  to:"hub_kurla",    plannedStart:0,   plannedEnd:2,   status:"complete", bufferHours:1.0 },
        { legId:"SHP-001-L2", stage:"pickup",     from:"hub_kurla",   to:"hub_kurla",    carrier:"BlueDart", plannedStart:2, plannedEnd:3, status:"active",  bufferHours:0.5, notes:"Driver en route" },
        { legId:"SHP-001-L3", stage:"transit",    from:"hub_kurla",   to:"hub_bandra",   carrier:"BlueDart", plannedStart:3, plannedEnd:16,  status:"pending", bufferHours:1.5 },
        { legId:"SHP-001-L4", stage:"last_mile",  from:"hub_bandra",  to:"del_colaba",   carrier:"BlueDart", plannedStart:16, plannedEnd:18, status:"pending", bufferHours:1.0 },
      ],
    },
    {
      shipmentId: "SHP-002",
      overallSla: 19,
      accumulatedDelayHours: 1.5,
      criticalPathIndex: 0,
      legs: [
        { legId:"SHP-002-L1", stage:"assembly",   from:"asm_powai",   to:"asm_powai",    plannedStart:0,  plannedEnd:4,   status:"delayed", bufferHours:0.0, notes:"LINE-3 thermal risk" },
        { legId:"SHP-002-L2", stage:"warehouse",  from:"asm_powai",   to:"wh_andheri",   plannedStart:4,  plannedEnd:6,   status:"pending", bufferHours:0.5 },
        { legId:"SHP-002-L3", stage:"pickup",     from:"wh_andheri",  to:"wh_andheri",   carrier:"Delhivery", plannedStart:6, plannedEnd:8, status:"pending", bufferHours:0.0, notes:"Pickup window 06:00–08:00" },
        { legId:"SHP-002-L4", stage:"transit",    from:"wh_andheri",  to:"del_malad",    carrier:"Delhivery", plannedStart:8, plannedEnd:20, status:"pending", bufferHours:0.0 },
      ],
    },
    {
      shipmentId: "SHP-004",
      overallSla: 20,
      accumulatedDelayHours: 0.5,
      criticalPathIndex: 2,
      legs: [
        { legId:"SHP-004-L1", stage:"warehouse",  from:"hub_kurla",   to:"hub_kurla",    plannedStart:0,   plannedEnd:1,   status:"complete", bufferHours:2.0 },
        { legId:"SHP-004-L2", stage:"pickup",     from:"hub_kurla",   to:"hub_kurla",    carrier:"Ekart",  plannedStart:1, plannedEnd:3,   status:"at_risk", bufferHours:0.5, notes:"Ekart pickup window closing" },
        { legId:"SHP-004-L3", stage:"transit",    from:"hub_kurla",   to:"hub_navi",     carrier:"Ekart",  plannedStart:3, plannedEnd:18,  status:"pending", bufferHours:1.0 },
        { legId:"SHP-004-L4", stage:"hub_sort",   from:"hub_navi",    to:"hub_navi",     plannedStart:18,  plannedEnd:20, status:"pending", bufferHours:0.5 },
        { legId:"SHP-004-L5", stage:"last_mile",  from:"hub_navi",    to:"del_vashi",    carrier:"Ekart",  plannedStart:20, plannedEnd:21, status:"pending", bufferHours:0.0 },
      ],
    },
    {
      shipmentId: "SHP-005",
      overallSla: 21,
      accumulatedDelayHours: 2.0,
      criticalPathIndex: 1,
      legs: [
        { legId:"SHP-005-L1", stage:"warehouse",  from:"wh_thane",    to:"wh_thane",     plannedStart:0,  plannedEnd:0,   status:"active", bufferHours:0.0, notes:"⚠ Perishables: 23h hold" },
        { legId:"SHP-005-L2", stage:"pickup",     from:"wh_thane",    to:"wh_thane",     carrier:"Shadowfax", plannedStart:0, plannedEnd:2, status:"at_risk", bufferHours:0.0, notes:"Shadowfax reliability 57%" },
        { legId:"SHP-005-L3", stage:"transit",    from:"wh_thane",    to:"del_mulund",   carrier:"Shadowfax", plannedStart:2, plannedEnd:23, status:"pending", bufferHours:0.0 },
      ],
    },
  ];
}

/**
 * Analyze a chain for handoff risks and emit signals.
 * Called from observe() alongside existing signal generation.
 */
export function observeChains(chains: ShipmentChain[], ts: number): Signal[] {
  const signals: Signal[] = [];

  for (const chain of chains) {
    const activeLeg = chain.legs.find(l => l.status === "active" || l.status === "at_risk");
    const nextLeg   = activeLeg ? chain.legs[chain.legs.indexOf(activeLeg) + 1] : null;
    const accDelay  = chain.accumulatedDelayHours;

    // Accumulated delay eating into SLA buffer
    if (accDelay > 0.5) {
      const remainingBuffer = chain.overallSla - (activeLeg?.plannedEnd ?? 0) - accDelay;
      signals.push({
        id: `sig-chain-delay-${chain.shipmentId}-${ts}`,
        source: "shipment",
        entityId: chain.shipmentId,
        type: "chain_delay_accumulation",
        value: accDelay,
        timestamp: ts,
        severity: accDelay > 2 ? "high" : accDelay > 1 ? "medium" : "low",
        description: `${chain.shipmentId}: accumulated ${accDelay.toFixed(1)}h delay across ${chain.legs.length} legs. SLA buffer: ${remainingBuffer.toFixed(1)}h remaining.`,
      });
    }

    // Pickup window at risk
    if (activeLeg?.stage === "pickup" && activeLeg.status === "at_risk") {
      signals.push({
        id: `sig-chain-pickup-${chain.shipmentId}-${ts}`,
        source: "carrier",
        entityId: chain.shipmentId,
        type: "pickup_window_risk",
        value: activeLeg.bufferHours,
        timestamp: ts,
        severity: activeLeg.bufferHours <= 0 ? "critical" : "high",
        description: `${chain.shipmentId}: pickup window closing (${activeLeg.notes ?? "carrier en route"}). Buffer: ${activeLeg.bufferHours.toFixed(1)}h. Miss = +4–6h delay to all downstream legs.`,
      });
    }

    // Zero-buffer handoff — no slack before next leg
    if (nextLeg && nextLeg.bufferHours === 0 && activeLeg?.status !== "complete") {
      signals.push({
        id: `sig-chain-handoff-${chain.shipmentId}-${ts}`,
        source: "shipment",
        entityId: chain.shipmentId,
        type: "zero_buffer_handoff",
        value: 0,
        timestamp: ts,
        severity: "medium",
        description: `${chain.shipmentId}: zero-buffer handoff at ${activeLeg?.stage ?? "leg"} → ${nextLeg.stage}. Any delay here directly breaches SLA — no recovery slack.`,
      });
    }

    // Delayed leg cascading forward
    if (activeLeg?.status === "delayed") {
      const downstreamCount = chain.legs.indexOf(activeLeg) < chain.legs.length - 1
        ? chain.legs.length - chain.legs.indexOf(activeLeg) - 1 : 0;
      if (downstreamCount > 0) {
        signals.push({
          id: `sig-chain-cascade-${chain.shipmentId}-${ts}`,
          source: "shipment",
          entityId: chain.shipmentId,
          type: "leg_delay_cascade",
          value: downstreamCount,
          timestamp: ts,
          severity: "high",
          description: `${chain.shipmentId}: ${activeLeg.stage} leg delayed — ${downstreamCount} downstream legs impacted. ${activeLeg.notes ?? ""}`,
        });
      }
    }
  }

  return signals;
}

export const LEG_STAGE_LABEL: Record<LegStage, string> = {
  assembly:  "Assembly",
  warehouse: "Warehouse",
  pickup:    "Pickup",
  transit:   "Transit",
  hub_sort:  "Hub Sort",
  last_mile: "Last Mile",
};

export const LEG_STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  complete: { color: "#5a9e74", bg: "rgba(90,158,116,0.07)",  border: "rgba(90,158,116,0.2)"  },
  active:   { color: "#4aada3", bg: "rgba(74,173,163,0.07)",  border: "rgba(74,173,163,0.2)"  },
  pending:  { color: "#50586e", bg: "transparent",            border: "rgba(40,44,62,0.5)"    },
  delayed:  { color: "#a85468", bg: "rgba(168,84,104,0.07)",  border: "rgba(168,84,104,0.22)" },
  at_risk:  { color: "#b8915a", bg: "rgba(184,145,90,0.07)",  border: "rgba(184,145,90,0.22)" },
};
