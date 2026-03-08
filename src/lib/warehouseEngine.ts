/**
 * PROMETHEUS — Warehouse Congestion Engine
 * ─────────────────────────────────────────
 * Gap #2: Models warehouse capacity, intake rate, and clearance rate.
 * Generates congestion signals when occupancy is high or
 * when intake rate exceeds clearance rate for sustained periods.
 */

import { Signal } from "./types";

export interface WarehouseNode {
  id: string;
  name: string;
  maxCapacity: number;    // units
  currentOccupancy: number;
  intakeRate: number;     // units/hour arriving
  clearanceRate: number;  // units/hour dispatched
  pendingInbound: number; // shipments scheduled to arrive in next 4h
  tempC?: number;         // cold storage temp (perishables)
  coldStorage: boolean;
}

// Simulated warehouse state — drifts each cycle
let _warehouses: WarehouseNode[] = [
  {
    id: "wh_dharavi",  name: "Dharavi WH",
    maxCapacity: 1200, currentOccupancy: 870,
    intakeRate: 42, clearanceRate: 38,
    pendingInbound: 5, coldStorage: false,
  },
  {
    id: "wh_andheri",  name: "Andheri Hub",
    maxCapacity: 800,  currentOccupancy: 740,
    intakeRate: 28, clearanceRate: 19,
    pendingInbound: 7, coldStorage: true, tempC: 6.2,
  },
  {
    id: "wh_thane",    name: "Thane Dist.",
    maxCapacity: 600,  currentOccupancy: 310,
    intakeRate: 15, clearanceRate: 20,
    pendingInbound: 2, coldStorage: true, tempC: 5.8,
  },
  {
    id: "hub_kurla",   name: "Kurla Depot",
    maxCapacity: 400,  currentOccupancy: 380,
    intakeRate: 35, clearanceRate: 30,
    pendingInbound: 8, coldStorage: false,
  },
];

export function getWarehouses(): WarehouseNode[] {
  return _warehouses;
}

export function driftWarehouses(raining: boolean) {
  _warehouses = _warehouses.map(w => {
    const intakeDrift  = (Math.random() - 0.45) * 3;
    const clearDrift   = raining ? -(Math.random() * 4) : (Math.random() - 0.5) * 2;
    const occDrift     = (w.intakeRate - w.clearanceRate) * 0.5 + (Math.random() - 0.5) * 8;
    const tempDrift    = w.coldStorage ? (Math.random() - 0.48) * 0.3 : 0;
    return {
      ...w,
      currentOccupancy: Math.min(w.maxCapacity, Math.max(0, w.currentOccupancy + occDrift)),
      intakeRate: Math.max(2, w.intakeRate + intakeDrift),
      clearanceRate: Math.max(2, w.clearanceRate + clearDrift),
      tempC: w.tempC != null ? Math.max(2, Math.min(12, w.tempC + tempDrift)) : undefined,
    };
  });
}

export function observeWarehouses(ts: number): Signal[] {
  const signals: Signal[] = [];

  for (const w of _warehouses) {
    const utilPct = w.currentOccupancy / w.maxCapacity;
    const netRate = w.intakeRate - w.clearanceRate;
    const hoursToFull = netRate > 0 ? (w.maxCapacity - w.currentOccupancy) / netRate : Infinity;

    // High occupancy
    if (utilPct > 0.88) {
      signals.push({
        id: `sig-wh-cap-${w.id}-${ts}`,
        source: "inventory",
        entityId: w.id,
        type: "warehouse_congestion",
        value: utilPct,
        timestamp: ts,
        severity: utilPct > 0.95 ? "critical" : "high",
        description: `${w.name}: ${(utilPct * 100).toFixed(0)}% capacity (${w.currentOccupancy.toFixed(0)}/${w.maxCapacity} units). ${w.pendingInbound} inbounds expected next 4h.`,
      });
    }

    // Intake > clearance rate (accumulating)
    if (netRate > 5 && w.currentOccupancy > w.maxCapacity * 0.7) {
      signals.push({
        id: `sig-wh-rate-${w.id}-${ts}`,
        source: "inventory",
        entityId: w.id,
        type: "intake_clearance_imbalance",
        value: netRate,
        timestamp: ts,
        severity: hoursToFull < 3 ? "high" : "medium",
        description: `${w.name}: intake ${w.intakeRate.toFixed(0)}/hr vs clearance ${w.clearanceRate.toFixed(0)}/hr — net +${netRate.toFixed(0)}/hr accumulation.${isFinite(hoursToFull) ? ` Full in ~${hoursToFull.toFixed(1)}h.` : ""}`,
      });
    }

    // Cold storage temperature drift
    if (w.coldStorage && w.tempC != null && w.tempC > 8) {
      signals.push({
        id: `sig-wh-cold-${w.id}-${ts}`,
        source: "inventory",
        entityId: w.id,
        type: "cold_chain_risk",
        value: w.tempC,
        timestamp: ts,
        severity: w.tempC > 10 ? "critical" : "high",
        description: `${w.name}: cold storage ${w.tempC.toFixed(1)}°C (limit 8°C) — perishables at spoilage risk.`,
      });
    }
  }

  return signals;
}
