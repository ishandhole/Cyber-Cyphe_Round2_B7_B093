"use client";
import clsx from "clsx";
import { Shipment, AssemblyLine } from "@/lib/types";
import { LOCATIONS, STATION_NAMES, AUTONOMY_MATRIX } from "@/lib/data";
import { ShipmentChain } from "@/lib/multiLeg";
import { MonteCarloResult } from "@/lib/monteCarlo";
import { ChainView } from "./ChainView";
import { MonteCarloView } from "./MonteCarloView";

type Tab = "ships" | "assembly" | "policy" | "chain" | "shadow";

const STAGE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  assembly: { color: "#6a5888", bg: "rgba(106,88,136,0.08)", border: "rgba(106,88,136,0.22)" },
  warehouse: { color: "#b08040", bg: "rgba(176,128,64,0.08)", border: "rgba(176,128,64,0.2)" },
  transit: { color: "#3d9e95", bg: "rgba(61,158,149,0.08)", border: "rgba(61,158,149,0.2)" },
  delivery: { color: "#4a8e64", bg: "rgba(74,142,100,0.08)", border: "rgba(74,142,100,0.2)" },
};

const STATUS_LEFT: Record<string, string> = {
  ok: "#4a8e64",
  warn: "#b08040",
  critical: "#a04060",
};

const TABS: { id: Tab; label: string }[] = [
  { id: "ships", label: "Ships" },
  { id: "chain", label: "Chain" },
  { id: "shadow", label: "Shadow" },
  { id: "assembly", label: "Lines" },
  { id: "policy", label: "Policy" },
];

interface Props {
  ships: Shipment[]; lines: AssemblyLine[];
  tab: Tab; onTab: (t: Tab) => void;
  onPreventLine: () => void;
  chains?: ShipmentChain[];
  monteCarloResults?: Map<string, MonteCarloResult>;
}

export function ShipmentList({ ships, lines, tab, onTab, onPreventLine, chains = [], monteCarloResults = new Map() }: Props) {
  const crits = ships.filter(s => s.status === "critical");
  const warns = ships.filter(s => s.status === "warn");

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0d0f18", borderRight: "1px solid #1e2230" }}>

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b flex-shrink-0" style={{ borderColor: "#1e2230" }}>
        <div className="flex items-center justify-between">
          <div className="font-display text-[14px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#dce2f4" }}>
            Operations
          </div>
          <span className="font-mono text-[11px]" style={{ color: "#404660" }}>{ships.length} active</span>
        </div>
        <div className="flex items-center gap-3 mt-[8px]">
          {crits.length > 0 && (
            <span className="font-mono text-[10px] px-2.5 py-[3px] border soft-pulse"
              style={{ borderRadius: "4px", color: "#c06080", borderColor: "rgba(160,64,96,0.3)", background: "rgba(160,64,96,0.07)" }}>
              {crits.length} critical
            </span>
          )}
          {warns.length > 0 && (
            <span className="font-mono text-[10px] px-2.5 py-[3px] border"
              style={{ borderRadius: "4px", color: "#c09060", borderColor: "rgba(176,128,64,0.25)", background: "rgba(176,128,64,0.06)" }}>
              {warns.length} at risk
            </span>
          )}
          {crits.length === 0 && warns.length === 0 && (
            <span className="font-mono text-[10px]" style={{ color: "#4a8e64" }}>All nominal</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 border-b" style={{ borderColor: "#1e2230" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => onTab(t.id)}
            className="flex-1 py-[10px] font-mono text-[10px] font-medium tracking-[0.05em] uppercase transition-colors"
            style={{
              color: tab === t.id ? "#dce2f4" : "#404660",
              borderBottom: tab === t.id ? "1.5px solid rgba(61,158,149,0.5)" : "1.5px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* SHIPS */}
        {tab === "ships" && (
          <div className="p-2 space-y-[4px]">
            {ships.map(s => {
              const stg = STAGE_STYLE[s.stage] ?? STAGE_STYLE.transit;
              const lCol = STATUS_LEFT[s.status] ?? "#404660";
              const breached = s.eta > s.sla;
              const etaCol = breached ? "#c06080" : s.eta > s.sla - 1 ? "#c09060" : "#4a8e64";
              return (
                <div key={s.id} className="p-[14px] border-l-2 card-in"
                  style={{
                    borderRadius: "6px",
                    borderLeft: `3px solid ${lCol}`,
                    background: "#141720",
                    border: `1px solid #1e2230`,
                    borderLeftColor: lCol,
                    borderLeftWidth: "3px",
                  }}>
                  <div className="flex items-center justify-between mb-[5px]">
                    <span className="font-mono text-[12px] font-semibold" style={{ color: "#8892b0" }}>{s.id}</span>
                    <span className="font-mono text-[10px] px-[6px] py-[2px] border"
                      style={{ borderRadius: "3px", ...stg }}>{s.stage}</span>
                  </div>
                  <div className="font-display text-[14px] font-medium leading-[1.3] mb-[6px]" style={{ color: "#c8d0e8" }}>
                    {LOCATIONS[s.from]?.name ?? s.from} → {LOCATIONS[s.to]?.name ?? s.to}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-body text-[11px]" style={{ color: "#404660" }}>
                      {s.carrier} · ₹{(s.orderValue / 1000).toFixed(0)}K · {s.inventoryType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-[6px]">
                    <span className="font-mono text-[12px] font-medium" style={{ color: etaCol }}>
                      ETA {s.eta.toFixed(1)}h / SLA {s.sla}h {breached ? "⚠" : "✓"}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "rgba(106,88,136,0.55)" }}>
                      ◈ {s.shadowEta.toFixed(1)}h
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CHAIN */}
        {tab === "chain" && <ChainView chains={chains} />}

        {/* SHADOW */}
        {tab === "shadow" && <MonteCarloView results={monteCarloResults} shipIds={ships.map(s => s.id)} />}

        {/* ASSEMBLY */}
        {tab === "assembly" && (
          <div className="p-3 space-y-4">
            {lines.map(l => {
              const hasCrit = l.stations.includes("critical");
              const hasWarn = l.stations.includes("warn");
              const lCol = hasCrit ? "#c06080" : hasWarn ? "#c09060" : "#4a8e64";
              const statusBg: Record<string, string> = {
                ok: "rgba(74,142,100,0.12)",
                warn: "rgba(176,128,64,0.12)",
                critical: "rgba(160,64,96,0.12)",
              };
              const statusBorder: Record<string, string> = {
                ok: "rgba(74,142,100,0.25)",
                warn: "rgba(176,128,64,0.25)",
                critical: "rgba(160,64,96,0.25)",
              };
              return (
                <div key={l.id}>
                  <div className="flex items-center justify-between mb-[6px]">
                    <span className="font-display text-[11px] font-semibold" style={{ color: lCol }}>{l.name}</span>
                    <div className="flex gap-3 font-mono text-[8px]" style={{ color: "#404660" }}>
                      <span>{l.throughput}% tp</span>
                      <span style={{ color: l.temp > 83 ? "#c06080" : "#404660" }}>{l.temp}°C</span>
                    </div>
                  </div>
                  <div className="flex gap-[3px]">
                    {STATION_NAMES.map((sn, i) => (
                      <div key={sn} className="flex-1 py-[5px] border flex items-center justify-center font-mono text-[7.5px]"
                        style={{
                          borderRadius: "3px",
                          background: statusBg[l.stations[i]] ?? "transparent",
                          borderColor: statusBorder[l.stations[i]] ?? "#1e2230",
                          color: l.stations[i] === "critical" ? "#c06080" : l.stations[i] === "warn" ? "#c09060" : "#404660",
                        }}>
                        {sn}
                      </div>
                    ))}
                  </div>
                  <div className="font-body text-[8px] mt-[4px]" style={{ color: "#404660" }}>
                    {hasCrit ? "Shadow: shutdown T+2.5h" : hasWarn ? "Shadow: throughput drop T+4h" : "Shadow: nominal"}
                  </div>
                </div>
              );
            })}

            {/* Line-3 cascade card */}
            <div className="p-3 border" style={{ borderRadius: "5px", background: "#141720", borderColor: "rgba(160,64,96,0.2)" }}>
              <div className="font-display text-[9.5px] font-semibold mb-2" style={{ color: "#dce2f4" }}>
                LINE-3 Shadow Cascade
              </div>
              <div className="font-mono text-[8px] leading-[2] space-y-[1px]" style={{ color: "#505878" }}>
                <div>T+0:00  Paint station 87.4°C</div>
                <div>T+1:30  Throughput → 40%</div>
                <div style={{ color: "#c06080" }}>T+2:30  Shutdown (72% prob)</div>
                <div style={{ color: "#c06080" }}>T+3:00  3 SLA breaches cascade</div>
              </div>
              <button onClick={onPreventLine}
                className="mt-3 w-full py-[6px] font-display text-[9px] font-semibold tracking-[0.06em] border transition-all hover:opacity-90"
                style={{ borderRadius: "4px", color: "#4a8e64", borderColor: "rgba(74,142,100,0.3)", background: "rgba(74,142,100,0.07)" }}>
                Submit for Human Approval
              </button>
            </div>
          </div>
        )}

        {/* POLICY */}
        {tab === "policy" && (
          <div className="p-2 space-y-[4px]">
            <div className="font-body text-[8.5px] px-1 mb-2" style={{ color: "#404660" }}>
              Autonomy guardrails — hard-coded policy
            </div>
            {AUTONOMY_MATRIX.map((row, i) => {
              const col = row.tier === "autonomous" ? "#4a8e64" : row.tier === "human_required" ? "#b08040" : "#404660";
              const bg = row.tier === "autonomous" ? "rgba(74,142,100,0.06)" : row.tier === "human_required" ? "rgba(176,128,64,0.06)" : "transparent";
              const bc = row.tier === "autonomous" ? "rgba(74,142,100,0.2)" : row.tier === "human_required" ? "rgba(176,128,64,0.18)" : "#1e2230";
              return (
                <div key={i} className="p-[9px] border" style={{ borderRadius: "4px", borderColor: bc, background: bg }}>
                  <div className="flex items-center justify-between mb-[2px]">
                    <span className="font-mono text-[8.5px] font-medium" style={{ color: "#8892b0" }}>
                      {row.action.replace(/_/g, " ")}
                    </span>
                    <span className="font-body text-[7.5px]" style={{ color: col }}>
                      {row.tier.replace("_", " ")}
                    </span>
                  </div>
                  <div className="font-body text-[8px] leading-[1.35]" style={{ color: "#404660" }}>
                    {row.condition}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
