/**
 * PROMETHEUS — Gradual Degradation / Trend Engine
 * ─────────────────────────────────────────────────
 * Gap #5: detects slow-moving deterioration before thresholds are crossed.
 * Maintains a rolling buffer of signal values per entity.
 * Computes linear slope and fires degradation_trend signals when
 * the slope predicts a threshold breach before it actually happens.
 *
 * This is what Aditya described: "delays emerge gradually from small
 * disruptions." Rules fire at T=breach. Trends fire at T=onset.
 */

import { Signal } from "./types";

export interface TrendBuffer {
  entityId: string;
  metric: string;           // e.g. "reliability", "throughput", "etaDrift"
  readings: { value: number; timestamp: number }[];
  maxReadings: number;
}

export interface TrendResult {
  entityId: string;
  metric: string;
  slope: number;            // change per hour (negative = degrading)
  predictedBreachIn: number | null;  // hours until threshold crossed (null = no breach predicted)
  currentValue: number;
  thresholdValue: number;
  direction: "degrading" | "improving" | "stable";
  confidenceInTrend: number; // 0-1, based on R² of fit
}

// Global buffer — persists across agent cycles
const _buffers: Map<string, TrendBuffer> = new Map();

const TREND_CONFIG: Record<string, { threshold: number; windowReadings: number; minSlope: number }> = {
  reliability:  { threshold: 0.70, windowReadings: 8,  minSlope: -0.005 },
  throughput:   { threshold: 72,   windowReadings: 6,  minSlope: -0.8   },
  etaDrift:     { threshold: 2.0,  windowReadings: 6,  minSlope: 0.08   },
  temperature:  { threshold: 83,   windowReadings: 5,  minSlope: 0.3    },
};

function bufferKey(entityId: string, metric: string) {
  return `${entityId}::${metric}`;
}

export function recordReading(entityId: string, metric: string, value: number) {
  const key = bufferKey(entityId, metric);
  const config = TREND_CONFIG[metric];
  const maxReadings = config?.windowReadings ?? 8;

  if (!_buffers.has(key)) {
    _buffers.set(key, { entityId, metric, readings: [], maxReadings });
  }
  const buf = _buffers.get(key)!;
  buf.readings.push({ value, timestamp: Date.now() });
  if (buf.readings.length > maxReadings) {
    buf.readings = buf.readings.slice(-maxReadings);
  }
}

/**
 * Linear regression: returns slope (change per ms) and R²
 */
function linearRegression(readings: { value: number; timestamp: number }[]): { slope: number; r2: number } {
  const n = readings.length;
  if (n < 3) return { slope: 0, r2: 0 };

  const t0 = readings[0].timestamp;
  const xs = readings.map(r => (r.timestamp - t0) / 3600000); // hours
  const ys = readings.map(r => r.value);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  const slope = ssXX > 0 ? ssXY / ssXX : 0;
  const r2 = ssXX > 0 && ssYY > 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;

  return { slope, r2 };
}

export function analyzeTrend(entityId: string, metric: string): TrendResult | null {
  const key = bufferKey(entityId, metric);
  const buf = _buffers.get(key);
  if (!buf || buf.readings.length < 3) return null;

  const config = TREND_CONFIG[metric];
  if (!config) return null;

  const { slope, r2 } = linearRegression(buf.readings);
  const current = buf.readings[buf.readings.length - 1].value;
  const threshold = config.threshold;

  // Predict when value will cross threshold
  let predictedBreachIn: number | null = null;
  const isDegrading = metric === "temperature" || metric === "etaDrift"
    ? slope > 0   // increasing = bad
    : slope < 0;  // decreasing = bad

  if (isDegrading && r2 > 0.45 && Math.abs(slope) > config.minSlope) {
    const gap = metric === "temperature" || metric === "etaDrift"
      ? threshold - current   // need to reach threshold from below
      : current - threshold;  // need to fall to threshold from above
    if (gap > 0 && Math.abs(slope) > 0.001) {
      predictedBreachIn = gap / Math.abs(slope);
      if (predictedBreachIn < 0 || predictedBreachIn > 72) predictedBreachIn = null;
    }
  }

  const direction: TrendResult["direction"] =
    Math.abs(slope) < config.minSlope * 0.5 ? "stable" :
    isDegrading ? "degrading" : "improving";

  return {
    entityId,
    metric,
    slope,
    predictedBreachIn,
    currentValue: current,
    thresholdValue: threshold,
    direction,
    confidenceInTrend: Math.min(0.95, r2),
  };
}

/**
 * Called from observe() — records current values and emits trend signals
 * when gradual degradation is detected.
 */
export function emitTrendSignals(
  carrierReliabilities: Record<string, number>,
  assemblyData: { id: string; throughput: number; temp: number }[],
  shipmentDrifts: { id: string; etaDrift: number }[],
  ts: number,
): Signal[] {
  const signals: Signal[] = [];

  // Record carrier reliabilities
  for (const [carrierId, reliability] of Object.entries(carrierReliabilities)) {
    recordReading(carrierId, "reliability", reliability);
    const trend = analyzeTrend(carrierId, "reliability");
    if (trend && trend.direction === "degrading" && trend.confidenceInTrend > 0.45) {
      const slopePctPerHour = Math.abs(trend.slope * 100).toFixed(1);
      const breachNote = trend.predictedBreachIn
        ? ` — threshold breach in ~${trend.predictedBreachIn.toFixed(1)}h`
        : "";
      signals.push({
        id: `sig-trend-rel-${carrierId}-${ts}`,
        source: "carrier",
        entityId: carrierId,
        type: "degradation_trend",
        value: trend.slope,
        timestamp: ts,
        severity: trend.predictedBreachIn && trend.predictedBreachIn < 12 ? "high" : "medium",
        description: `${carrierId}: reliability declining ${slopePctPerHour}%/hr (trend, not yet threshold)${breachNote}. ${(trend.confidenceInTrend * 100).toFixed(0)}% fit confidence.`,
      });
    }
  }

  // Record assembly line throughput + temperature
  for (const line of assemblyData) {
    recordReading(line.id, "throughput", line.throughput);
    recordReading(line.id, "temperature", line.temp);

    const tpTrend = analyzeTrend(line.id, "throughput");
    if (tpTrend && tpTrend.direction === "degrading" && tpTrend.confidenceInTrend > 0.45) {
      signals.push({
        id: `sig-trend-tp-${line.id}-${ts}`,
        source: "assembly",
        entityId: line.id,
        type: "degradation_trend",
        value: tpTrend.slope,
        timestamp: ts,
        severity: tpTrend.predictedBreachIn && tpTrend.predictedBreachIn < 6 ? "high" : "medium",
        description: `${line.id}: throughput trending down ${Math.abs(tpTrend.slope).toFixed(1)}%/hr${tpTrend.predictedBreachIn ? ` — bottleneck threshold in ~${tpTrend.predictedBreachIn.toFixed(1)}h` : ""}. Gradual degradation pattern.`,
      });
    }

    const tempTrend = analyzeTrend(line.id, "temperature");
    if (tempTrend && tempTrend.direction === "degrading" && tempTrend.confidenceInTrend > 0.45) {
      signals.push({
        id: `sig-trend-temp-${line.id}-${ts}`,
        source: "assembly",
        entityId: line.id,
        type: "degradation_trend",
        value: tempTrend.slope,
        timestamp: ts,
        severity: tempTrend.predictedBreachIn && tempTrend.predictedBreachIn < 4 ? "high" : "medium",
        description: `${line.id}: temperature rising ${tempTrend.slope.toFixed(2)}°C/hr${tempTrend.predictedBreachIn ? ` — thermal threshold in ~${tempTrend.predictedBreachIn.toFixed(1)}h` : ""}. Pre-threshold warning.`,
      });
    }
  }

  // Record ETA drift per shipment
  for (const { id, etaDrift } of shipmentDrifts) {
    recordReading(id, "etaDrift", etaDrift);
    const driftTrend = analyzeTrend(id, "etaDrift");
    if (driftTrend && driftTrend.direction === "degrading" && driftTrend.confidenceInTrend > 0.5) {
      signals.push({
        id: `sig-trend-drift-${id}-${ts}`,
        source: "shipment",
        entityId: id,
        type: "degradation_trend",
        value: driftTrend.slope,
        timestamp: ts,
        severity: driftTrend.predictedBreachIn && driftTrend.predictedBreachIn < 3 ? "high" : "medium",
        description: `${id}: ETA drift growing +${driftTrend.slope.toFixed(2)}h/hr (shadow diverging)${driftTrend.predictedBreachIn ? ` — alert threshold in ~${driftTrend.predictedBreachIn.toFixed(1)}h` : ""}. Pattern: gradual onset.`,
      });
    }
  }

  return signals;
}

export function clearTrendBuffers() {
  _buffers.clear();
}
