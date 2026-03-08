/**
 * PROMETHEUS — Conversational Decision Explainer
 * ────────────────────────────────────────────────
 * Gap #9: Natural language Q&A grounded in current system state.
 * Aditya can ask "Why is SHP-004 escalated?" at 2am and get a real answer.
 *
 * Uses streaming for responsive feel in demo.
 */

import { Shipment, Hypothesis, Decision, Signal, Antibody } from "./types";

const SYSTEM_PROMPT = `You are PROMETHEUS, an agentic AI operations assistant for a Mumbai logistics and supply chain platform. You have full visibility into live shipment states, carrier performance, warehouse conditions, and your own decision history.

You help operations managers like Aditya understand what is happening, why you made specific decisions, and what the consequences of accepting or rejecting interventions would be.

You are precise, grounded, and brief. You refer to specific shipment IDs, carrier names, and numbers. You do not speculate beyond what the data shows. You speak like a sharp analyst, not a chatbot.

When asked "what happens if I reject X", walk through the downstream consequences concretely.
When asked "why did you decide X", cite the specific signals and confidence scores that drove it.
When asked "which shipments should I watch", rank by breach probability and time to impact.
When asked about trends, reference the gradual degradation data if available.

Keep answers under 4 sentences unless the question genuinely requires more detail. Be direct.`;

export interface ExplainMessage {
  role: "user" | "assistant";
  content: string;
}

export async function geminiExplain(
  question: string,
  history: ExplainMessage[],
  context: {
    ships: Shipment[];
    signals: Signal[];
    hypotheses: Hypothesis[];
    decisions: Decision[];
    antibodies: Antibody[];
    raining: boolean;
    cycleCount: number;
  },
  onChunk: (chunk: string) => void,
): Promise<string> {
  const contextSummary = {
    activeShipments: context.ships.map(s => ({
      id: s.id, status: s.status, carrier: s.carrier,
      eta: s.eta, sla: s.sla, stage: s.stage,
      etaDrift: +(s.shadowEta - s.eta).toFixed(2),
      breached: s.eta > s.sla,
      inventoryType: s.inventoryType,
      orderValue: s.orderValue,
    })),
    activeSignals: context.signals.slice(0, 15).map(s => ({
      type: s.type, entity: s.entityId, severity: s.severity, description: s.description,
    })),
    currentHypotheses: context.hypotheses.map(h => ({
      entity: h.entityId, pattern: h.pattern,
      breachProb: (h.breachProbability * 100).toFixed(0) + "%",
      confidence: (h.confidence * 100).toFixed(0) + "%",
      timeToImpact: h.timeToImpact + "h",
      cascadeRisk: h.cascadeRisk,
    })),
    pendingDecisions: context.decisions.map(d => ({
      entity: d.entityId, action: d.action, autonomy: d.autonomy,
      confidence: (d.confidence * 100).toFixed(0) + "%",
      costDelta: d.costDelta, penaltyAvoided: d.penaltyAvoided,
    })),
    environment: {
      raining: context.raining,
      hour: new Date().getHours(),
      cycleCount: context.cycleCount,
      antibodyCount: context.antibodies.length,
    },
  };

  const messages: Array<{ role: string; content: string }> = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `Current system state:\n${JSON.stringify(contextSummary, null, 2)}\n\nQuestion: ${question}`,
    },
  ];

  try {
    const response = await fetch("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        history,
        contextSummary,
        systemPrompt: SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "Unable to generate explanation.";

    onChunk(text);
    return text;
  } catch (err: any) {
    const fallback = `Reasoning engine connection failed: ${err.message}. Current context: ${context.hypotheses.length > 0
      ? context.hypotheses[0].rootCause
      : "monitoring active shipment streams."
      }`;
    onChunk(fallback);
    return fallback;
  }
}
