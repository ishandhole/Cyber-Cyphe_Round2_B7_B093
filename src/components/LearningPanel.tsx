"use client";
import { Antibody, LearningUpdate, OutcomeRecord } from "@/lib/types";

function Bar({ val, color }: { val: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[2px] rounded-full overflow-hidden" style={{ background: "#1a1d2a" }}>
        <div className="h-full fill-bar rounded-full" style={{ width: `${val * 100}%`, background: color }} />
      </div>
      <span className="font-mono text-[8.5px] w-7 text-right tabular-nums" style={{ color }}>{(val * 100).toFixed(0)}%</span>
    </div>
  );
}

interface Props {
  learning: LearningUpdate | null;
  antibodies: Antibody[];
  outcomes: OutcomeRecord[];
  thresholds: Record<string, number>;
  divergence: number;
}

export function LearningPanel({ learning, antibodies, outcomes, thresholds, divergence }: Props) {
  const ok = outcomes.filter(o => !o.actualBreached).length;
  const fail = outcomes.filter(o => o.actualBreached).length;
  const avgEff = antibodies.length ? antibodies.reduce((s, a) => s + a.efficacy, 0) / antibodies.length : 0;
  const divCol = divergence > 0.35 ? "#c06080" : divergence > 0.20 ? "#c09060" : "#4a8e64";
  const divLabel = divergence > 0.35 ? "Drift critical" : divergence > 0.20 ? "Elevated" : "Nominal";
  const circ = 2 * Math.PI * 20;

  return (
    <div className="flex flex-col h-full" style={{ background: "#0d0f18" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-[12px] border-b flex-shrink-0"
        style={{ borderColor: "#1e2230" }}>
        <div>
          <div className="font-display text-[13px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#dce2f4" }}>
            Learn
          </div>
          <div className="font-mono text-[10px] mt-[2px]" style={{ color: "#404660" }}>Adaptive feedback</div>
        </div>
        <span className="font-mono text-[11px]" style={{ color: "#6a5888" }}>
          {antibodies.length} patterns
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* Divergence monitor */}
        <div className="p-4 border flex items-center gap-6" style={{ borderRadius: "8px", background: "#141720", borderColor: "#1e2230" }}>
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="25" fill="none" stroke="#1a1d2a" strokeWidth="4.5" />
              <circle cx="28" cy="28" r="25" fill="none" stroke={divCol} strokeWidth="4.5"
                strokeDasharray={2 * Math.PI * 25}
                strokeDashoffset={2 * Math.PI * 25 * (1 - divergence)}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: "stroke-dashoffset 1s ease, stroke 0.4s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[12px] font-semibold" style={{ color: divCol }}>
                {(divergence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div>
            <div className="font-display text-[13px] font-semibold" style={{ color: "#dce2f4" }}>Model Divergence</div>
            <div className="font-body text-[10.5px] mt-[2px]" style={{ color: divCol }}>{divLabel}</div>
            <div className="flex gap-4 mt-[6px] font-mono text-[10px]">
              <span style={{ color: "#404660" }}>✓ <span style={{ color: "#4a8e64" }}>{ok}</span></span>
              <span style={{ color: "#404660" }}>✗ <span style={{ color: "#a04060" }}>{fail}</span></span>
              <span style={{ color: "#404660" }}>eff <span style={{ color: "#6a5888" }}>{(avgEff * 100).toFixed(0)}%</span></span>
            </div>
          </div>
        </div>

        {/* Confidence thresholds */}
        <div className="p-4 border" style={{ borderRadius: "7px", background: "#141720", borderColor: "#1e2230" }}>
          <div className="section-label mb-4">Confidence Thresholds</div>
          {Object.entries(thresholds).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 mb-[9px]">
              <div className="font-mono text-[10px] w-[95px] truncate flex-shrink-0" style={{ color: "#404660" }}>
                {k.replace(/_/g, " ")}
              </div>
              <Bar val={v} color={v > 0.85 ? "#c06080" : v > 0.75 ? "#c09060" : "#3d9e95"} />
            </div>
          ))}
          {learning?.thresholdChanges && learning.thresholdChanges.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-[3px]" style={{ borderColor: "#1e2230" }}>
              {learning.thresholdChanges.slice(0, 3).map((tc, i) => (
                <div key={i} className="font-mono text-[9px]" style={{ color: "#404660" }}>
                  {tc.action.replace(/_/g, " ")} &nbsp;
                  <span style={{ color: "#505878" }}>{(tc.from * 100).toFixed(1)}%</span>
                  <span style={{ color: "#404660" }}> → </span>
                  <span style={{ color: "#6a5888" }}>{(tc.to * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Antibody library */}
        <div className="p-4 border" style={{ borderRadius: "7px", background: "#141720", borderColor: "#1e2230" }}>
          <div className="section-label mb-4">Pattern Memory</div>
          {antibodies.length === 0 && (
            <div className="font-mono text-[10px]" style={{ color: "#404660" }}>Building pattern library…</div>
          )}
          {antibodies.slice(0, 5).map(ab => (
            <div key={ab.id} className="pb-[10px] mb-[10px] border-b last:border-0 last:mb-0 last:pb-0"
              style={{ borderColor: "#1e2230" }}>
              <div className="flex items-center justify-between mb-[4px]">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[10.5px]" style={{ color: "#6a5888" }}>{ab.id}</span>
                  {ab.crossoverParents && (
                    <span className="font-mono text-[8px] px-[5px] py-[1.5px] border"
                      style={{ borderRadius: "3px", color: "#6a5888", borderColor: "rgba(106,88,136,0.25)", background: "rgba(106,88,136,0.07)" }}>
                      hybrid
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10.5px]" style={{ color: "#4a8e64" }}>
                  {(ab.efficacy * 100).toFixed(0)}%
                </span>
              </div>
              <div className="font-body text-[10.5px] leading-[1.4]" style={{ color: "#8892b0" }}>
                {ab.antigenPattern}
              </div>
              <div className="font-mono text-[9px] mt-[4px]" style={{ color: "#404660" }}>
                → <span style={{ color: "#4a8e64" }}>{ab.intervention.replace(/_/g, " ")}</span>
                {" · "}{ab.useCount}× · {ab.region}
              </div>
              <div className="h-[2px] rounded-full overflow-hidden mt-[6px]" style={{ background: "#1a1d2a" }}>
                <div className="h-full fill-bar rounded-full" style={{ width: `${ab.efficacy * 100}%`, background: "rgba(106,88,136,0.5)" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Cycle notes */}
        {learning?.notes && learning.notes.length > 0 && (
          <div className="p-3 border" style={{ borderRadius: "6px", background: "#141720", borderColor: "rgba(106,88,136,0.2)" }}>
            <div className="section-label mb-2">Cycle Notes</div>
            {learning.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-[5px] mb-[3px]">
                <span className="text-[8px] mt-[1px]" style={{ color: "rgba(106,88,136,0.5)" }}>›</span>
                <span className="font-body text-[8.5px] leading-[1.4]" style={{ color: "#505878" }}>{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
