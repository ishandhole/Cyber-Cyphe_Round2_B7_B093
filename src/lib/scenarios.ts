/**
 * PROMETHEUS — Scenario Injection Engine
 * ────────────────────────────────────────
 * Injects named failure scenarios into live shipment/assembly state.
 * Used for hackathon demos to trigger dramatic agent responses on demand.
 */

import { Shipment, AssemblyLine } from "./types";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  severity: "medium" | "high" | "critical";
  apply: (ships: Shipment[], lines: AssemblyLine[]) => { ships: Shipment[]; lines: AssemblyLine[] };
}

export const SCENARIOS: Scenario[] = [
  {
    id: "carrier_collapse",
    name: "Carrier Collapse",
    description: "Shadowfax reliability drops to 30% — 3 shipments at risk",
    icon: "🚨",
    severity: "critical",
    apply: (ships, lines) => ({
      lines,
      ships: ships.map(s =>
        s.carrier === "Shadowfax" || s.carrier === "Delhivery"
          ? { ...s, shadowEta: s.shadowEta + 4.5, status: "critical" as const, lastUpdated: Date.now() }
          : s
      ),
    }),
  },
  {
    id: "assembly_thermal",
    name: "Thermal Runaway",
    description: "LINE-3 paint station hits 94°C — shutdown in T+1.5h",
    icon: "🌡️",
    severity: "critical",
    apply: (ships, lines) => ({
      ships,
      lines: lines.map(l =>
        l.id === "LINE-3"
          ? { ...l, temp: 94.2, throughput: 48, stations: ["ok", "critical", "critical", "warn", "ok"] as AssemblyLine["stations"] }
          : l
      ),
    }),
  },
  {
    id: "sla_cascade",
    name: "SLA Cascade",
    description: "4 shipments simultaneously breach SLA buffer — cascade event",
    icon: "⚡",
    severity: "critical",
    apply: (ships, lines) => ({
      lines,
      ships: ships.map((s, i) =>
        i < 4
          ? { ...s, eta: s.sla + 0.5 + i * 0.3, shadowEta: s.sla + 2.5 + i * 0.4, status: "critical" as const, lastUpdated: Date.now() }
          : s
      ),
    }),
  },
  {
    id: "perishables_spoilage",
    name: "Perishables Crisis",
    description: "Cold chain broken — SHP-005 perishables at 26h warehouse hold",
    icon: "🧊",
    severity: "high",
    apply: (ships, lines) => ({
      lines,
      ships: ships.map(s =>
        s.inventoryType === "Perishables"
          ? { ...s, eta: 26, shadowEta: 31, stage: "warehouse" as const, status: "critical" as const, lastUpdated: Date.now() }
          : s
      ),
    }),
  },
  {
    id: "route_jam_mahim",
    name: "Mahim Jam Surge",
    description: "Mahim Causeway jam escalates to 90min — all southern routes blocked",
    icon: "🚦",
    severity: "high",
    apply: (ships, lines) => ({
      lines,
      ships: ships.map(s =>
        (s.to === "del_colaba" || s.to === "del_worli")
          ? { ...s, shadowEta: s.shadowEta + 3, status: "warn" as const, lastUpdated: Date.now() }
          : s
      ),
    }),
  },
  {
    id: "pharma_priority",
    name: "Pharma Priority Surge",
    description: "Hospital order SHP-004 flagged urgent — must deliver in 2h",
    icon: "💊",
    severity: "high",
    apply: (ships, lines) => ({
      lines,
      ships: ships.map(s =>
        s.id === "SHP-004"
          ? { ...s, sla: s.eta - 0.5, status: "critical" as const, orderValue: 180000, lastUpdated: Date.now() }
          : s
      ),
    }),
  },
];
