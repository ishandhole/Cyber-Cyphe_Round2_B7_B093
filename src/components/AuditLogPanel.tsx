"use client";
import { AuditLogEntry } from "@/lib/types";

const ACTION_COL: Record<string, string> = {
  reroute: "#3d9e95", carrier_swap: "#5a6898", pre_stage: "#4a8e64",
  pre_maintenance: "#b08040", reprioritize: "#5a6898", escalate: "#b08040", monitor: "#404660",
};
const OUTCOME_COL: Record<string, string> = {
  success: "#4a8e64", failed: "#a04060", rejected: "#a04060", pending_approval: "#b08040",
};

export function AuditLogPanel({ entries }: { entries: AuditLogEntry[] }) {
  const sorted = [...entries].reverse();
  return (
    <div className="flex flex-col h-full" style={{ background: "#0d0f18" }}>
      <div className="flex items-center justify-between px-5 py-[12px] border-b flex-shrink-0"
        style={{ borderColor: "#1e2230" }}>
        <div>
          <div className="font-display text-[13px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#dce2f4" }}>
            Audit Log
          </div>
          <div className="font-mono text-[10px] mt-[2px]" style={{ color: "#404660" }}>Full traceability</div>
        </div>
        <span className="font-mono text-[11px]" style={{ color: "#404660" }}>{entries.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-[3px]">
        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-16">
            <span className="font-mono text-[8.5px]" style={{ color: "#404660" }}>No entries yet</span>
          </div>
        )}
        {sorted.slice(0, 50).map(e => {
          const t = new Date(e.timestamp);
          const ts = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}:${t.getSeconds().toString().padStart(2, "0")}`;
          const roi = e.penaltyAvoided - e.costDelta;
          return (
            <div key={e.id} className="p-[12px] border card-in"
              style={{ borderRadius: "6px", background: "#141720", borderColor: "#1e2230" }}>
              <div className="flex items-center gap-3 mb-[4px]">
                <span className="font-mono text-[9px]" style={{ color: "#404660" }}>{ts}</span>
                <span className="font-mono text-[11px]" style={{ color: "#8892b0" }}>{e.entityId}</span>
                <span className="font-mono text-[10.5px] font-medium" style={{ color: ACTION_COL[e.action] ?? "#8892b0" }}>
                  {e.action.replace(/_/g, " ")}
                </span>
                {e.llmPowered && (
                  <span className="font-mono text-[8.5px] px-[4.5px] py-[1.5px] border"
                    style={{ borderRadius: "3px", color: "#9a78b8", borderColor: "rgba(106,88,136,0.3)", background: "rgba(106,88,136,0.07)" }}>
                    AI
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px]" style={{ color: OUTCOME_COL[e.outcome] ?? "#8892b0" }}>
                  {e.outcome.replace(/_/g, " ")}
                </span>
              </div>
              <div className="font-body text-[10.5px] leading-[1.5] mb-[6px] line-clamp-2" style={{ color: "#404660" }}>
                {e.rationale}
              </div>
              <div className="flex items-center gap-5 font-mono text-[10px]">
                <span style={{ color: "#404660" }}>conf <span style={{ color: ACTION_COL[e.action] ?? "#8892b0" }}>{(e.confidence * 100).toFixed(0)}%</span></span>
                <span style={{ color: "#404660" }}>cost <span style={{ color: "#b08040" }}>₹{e.costDelta.toLocaleString()}</span></span>
                <span style={{ color: "#404660" }}>ROI <span style={{ color: roi > 0 ? "#4a8e64" : "#a04060" }}>₹{roi.toLocaleString()}</span></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
