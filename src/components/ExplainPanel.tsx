"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { geminiExplain, ExplainMessage } from "@/lib/geminiExplain";
import { Shipment, Hypothesis, Decision, Signal, Antibody } from "@/lib/types";

const QUICK_PROMPTS = [
  "Which shipments are at highest risk right now?",
  "Why was SHP-004 escalated?",
  "What if I reject the reroute?",
  "Explain the Shadowfax degradation",
  "Cascade risk if LINE-3 shuts down?",
];

interface Props {
  ships: Shipment[]; signals: Signal[]; hypotheses: Hypothesis[];
  decisions: Decision[]; antibodies: Antibody[];
  raining: boolean; cycleCount: number;
}

export function ExplainPanel({ ships, signals, hypotheses, decisions, antibodies, raining, cycleCount }: Props) {
  const [messages, setMessages] = useState<ExplainMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);

  const ask = useCallback(async (q: string) => {
    if (!q.trim() || thinking) return;
    const userMsg: ExplainMessage = { role: "user", content: q.trim() };
    setMessages(prev => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setThinking(true);

    await geminiExplain(q.trim(), messages,
      { ships, signals, hypotheses, decisions, antibodies, raining, cycleCount },
      (chunk) => setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: chunk }]),
    );
    setThinking(false);
  }, [messages, ships, signals, hypotheses, decisions, antibodies, raining, cycleCount, thinking]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#0d0f18" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-[9px] border-b flex-shrink-0"
        style={{ borderColor: "#1e2230" }}>
        <div>
          <div className="font-display text-[13px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#dce2f4" }}>
            Ask PROMETHEUS
          </div>
          <div className="font-mono text-[10px] mt-[2px]" style={{ color: "#404660" }}>Grounded in live state</div>
        </div>
        <div className="w-[6px] h-[6px] rounded-full animate-breathe" style={{ background: "#6a5888" }} />
      </div>

      {/* Quick prompts — shown only when empty */}
      {messages.length === 0 && (
        <div className="p-4 space-y-[6px] flex-shrink-0">
          <div className="font-mono text-[9px] mb-2 px-1" style={{ color: "#404660" }}>Suggested questions</div>
          {QUICK_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => ask(p)}
              className="w-full text-left px-4 py-[9px] border transition-all hover:opacity-80"
              style={{ borderRadius: "5px", borderColor: "#1e2230", background: "#141720" }}>
              <span className="font-body text-[10.5px] leading-[1.4]" style={{ color: "#505878" }}>{p}</span>
            </button>
          ))}
        </div>
      )}

      {/* Dialogue */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-[92%] px-4 py-[9px]"
              style={{
                borderRadius: m.role === "user" ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                background: m.role === "user" ? "rgba(61,158,149,0.08)" : "#141720",
                border: m.role === "user" ? "1px solid rgba(61,158,149,0.18)" : "1px solid #1e2230",
              }}>
              <p className="font-body text-[11px] leading-[1.65] whitespace-pre-wrap"
                style={{ color: m.role === "user" ? "rgba(61,158,149,0.85)" : "#8892b0" }}>
                {m.content || (thinking && i === messages.length - 1 ? "…" : "")}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3 border-t" style={{ borderColor: "#1e2230" }}>
        <div className="flex items-center gap-2 border px-4 py-[8px]"
          style={{ borderRadius: "6px", background: "#141720", borderColor: "#1e2230" }}>
          <input ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            placeholder="Ask about any shipment or decision…"
            disabled={thinking}
            className="flex-1 bg-transparent font-body text-[11px] outline-none"
            style={{ color: "#a0a8c0", caretColor: "#3d9e95" }}
          />
          <button onClick={() => ask(input)} disabled={!input.trim() || thinking}
            className="flex-shrink-0 px-2 py-[3px] font-mono text-[8px] border transition-all disabled:opacity-30"
            style={{ borderRadius: "3px", color: "#3d9e95", borderColor: "rgba(61,158,149,0.3)", background: "rgba(61,158,149,0.06)" }}>
            Ask
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="mt-[4px] font-mono text-[7.5px] transition-colors"
            style={{ color: "#404660" }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
