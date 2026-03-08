"use client";
import { Decision, ActionResult } from "@/lib/types";

const ACTION_META: Record<string, { label: string; icon: string; color: string }> = {
  reroute: { label: "Reroute", icon: "↻", color: "#3d9e95" },
  carrier_swap: { label: "Carrier Swap", icon: "⇄", color: "#5a6898" },
  pre_stage: { label: "Pre-Stage", icon: "◎", color: "#4a8e64" },
  pre_maintenance: { label: "Maintenance", icon: "⚙", color: "#b08040" },
  reprioritize: { label: "Reprioritize", icon: "↑", color: "#5a6898" },
  escalate: { label: "Escalate", icon: "▲", color: "#b08040" },
  monitor: { label: "Monitor", icon: "◈", color: "#404660" },
};

const TIER_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  autonomous: { label: "Autonomous", color: "#4a8e64", bg: "rgba(74,142,100,0.08)", border: "rgba(74,142,100,0.25)" },
  human_required: { label: "Needs Approval", color: "#b08040", bg: "rgba(176,128,64,0.08)", border: "rgba(176,128,64,0.28)" },
  monitor_only: { label: "Monitoring", color: "#404660", bg: "rgba(64,70,96,0.06)", border: "rgba(64,70,96,0.2)" },
};

const OUTCOME_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  success: { label: "✓ Executed", color: "#4a8e64", bg: "rgba(74,142,100,0.07)", border: "rgba(74,142,100,0.2)" },
  pending_approval: { label: "⏳ Awaiting", color: "#b08040", bg: "rgba(176,128,64,0.07)", border: "rgba(176,128,64,0.25)" },
  rejected: { label: "✕ Rejected", color: "#a04060", bg: "rgba(160,64,96,0.07)", border: "rgba(160,64,96,0.2)" },
  failed: { label: "✕ Expired", color: "#a04060", bg: "rgba(160,64,96,0.07)", border: "rgba(160,64,96,0.2)" },
  success_approved: { label: "✓ Approved", color: "#4a8e64", bg: "rgba(74,142,100,0.07)", border: "rgba(74,142,100,0.2)" },
};

interface Props {
  decisions: Decision[];
  results: ActionResult[];
  onApprove: (id: string, approved: boolean) => void;
}

export function DecisionPanel({ decisions, results, onApprove }: Props) {
  const getResult = (id: string) => results.find(r => r.decisionId === id);
  const pending = decisions.filter(d => d.autonomy === "human_required" && getResult(d.id)?.outcome === "pending_approval");
  const autoCount = decisions.filter(d => d.autonomy === "autonomous").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-[12px] border-b flex-shrink-0"
        style={{ borderColor: "#1e2230" }}>
        <div>
          <div className="font-display text-[13px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#dce2f4" }}>
            Decide · Act
          </div>
          <div className="font-mono text-[10px] mt-[2px]" style={{ color: "#404660" }}>Agent decisions with guardrails</div>
        </div>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="font-mono text-[10px] px-2.5 py-[3px] border soft-pulse"
              style={{ borderRadius: "4px", color: "#c09060", borderColor: "rgba(176,128,64,0.3)", background: "rgba(176,128,64,0.07)" }}>
              {pending.length} need review
            </span>
          )}
          <span className="font-mono text-[11px]" style={{ color: "#4a8e64" }}>{autoCount} auto</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-[5px]">
        {decisions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <div className="font-mono text-[8.5px]" style={{ color: "#404660" }}>No decisions this cycle</div>
          </div>
        )}

        {decisions.map(dec => {
          const res = getResult(dec.id);
          const meta = ACTION_META[dec.action] ?? { label: dec.action, icon: "·", color: "#8892b0" };
          const tier = TIER_STYLE[dec.autonomy];
          const outKey = res?.outcome === "success" && dec.autonomy === "human_required" ? "success_approved" : res?.outcome ?? "";
          const outcome = OUTCOME_STYLE[outKey];
          const needsAct = dec.autonomy === "human_required" && res?.outcome === "pending_approval";
          const isUrgent = needsAct;

          return (
            <div key={dec.id}
              className={`p-[14px] border card-in ${isUrgent ? "urgent-shimmer" : ""}`}
              style={{
                borderRadius: "7px",
                borderColor: isUrgent ? "rgba(176,128,64,0.35)" : "#1e2230",
                background: isUrgent ? "transparent" : "#141720",
              }}>

              {/* Action + entity */}
              <div className="flex items-center justify-between mb-[8px]">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[16px]" style={{ color: meta.color }}>{meta.icon}</span>
                  <div>
                    <span className="font-display text-[13px] font-semibold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="font-mono text-[10.5px] ml-2" style={{ color: "#606880" }}>
                      {dec.entityId}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-[9px] px-[7px] py-[2.5px] border"
                  style={{ borderRadius: "4px", color: tier.color, background: tier.bg, borderColor: tier.border }}>
                  {tier.label}
                </span>
              </div>

              {/* Rationale */}
              <div className="font-body text-[11px] leading-[1.65] mb-[8px]" style={{ color: "#5a6070" }}>
                {dec.rationale}
              </div>

              {/* Cost / penalty row */}
              <div className="flex items-center gap-1 py-[7px] border-t border-b mb-[8px]"
                style={{ borderColor: "#1e2230" }}>
                <div className="flex-1 text-center">
                  <div className="font-mono text-[11px] font-medium" style={{ color: "#b08040" }}>
                    ₹{dec.costDelta.toLocaleString()}
                  </div>
                  <div className="font-mono text-[8.5px] mt-[1px]" style={{ color: "#404660" }}>cost</div>
                </div>
                <div className="w-px h-7" style={{ background: "#1e2230" }} />
                <div className="flex-1 text-center">
                  <div className="font-mono text-[11px] font-medium" style={{ color: "#4a8e64" }}>
                    ₹{dec.penaltyAvoided.toLocaleString()}
                  </div>
                  <div className="font-mono text-[8.5px] mt-[1px]" style={{ color: "#404660" }}>saves</div>
                </div>
                <div className="w-px h-7" style={{ background: "#1e2230" }} />
                <div className="flex-1 text-center">
                  <div className="font-mono text-[11px] font-medium" style={{ color: meta.color }}>
                    {(dec.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="font-mono text-[8.5px] mt-[1px]" style={{ color: "#404660" }}>confidence</div>
                </div>
              </div>

              {/* Outcome */}
              {outcome && (
                <div className="px-3 py-[5px] border font-body text-[8.5px] flex items-center justify-between"
                  style={{ borderRadius: "4px", color: outcome.color, background: outcome.bg, borderColor: outcome.border }}>
                  <span>{outcome.label}{res?.impact ? ` — ${res.impact.slice(0, 60)}` : ""}</span>
                  {res?.googleMapsUrl && (
                    <a href={res.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[8px] ml-2 underline opacity-60 hover:opacity-100">
                      ↗ Maps
                    </a>
                  )}
                </div>
              )}

              {/* Approve / Reject */}
              {needsAct && (
                <div className="flex gap-2.5 mt-[10px]">
                  <button onClick={() => onApprove(dec.id, true)}
                    className="flex-1 py-[8px] font-display text-[11px] font-semibold tracking-[0.06em] border transition-all hover:opacity-90"
                    style={{ borderRadius: "5px", color: "#4a8e64", borderColor: "rgba(74,142,100,0.35)", background: "rgba(74,142,100,0.08)" }}>
                    Approve
                  </button>
                  <button onClick={() => onApprove(dec.id, false)}
                    className="flex-1 py-[8px] font-display text-[11px] font-semibold tracking-[0.06em] border transition-all hover:opacity-90"
                    style={{ borderRadius: "5px", color: "#a04060", borderColor: "rgba(160,64,96,0.35)", background: "rgba(160,64,96,0.08)" }}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
