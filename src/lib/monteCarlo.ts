/**
 * PROMETHEUS — Monte Carlo Shadow Simulation
 * ────────────────────────────────────────────
 * Gap #6: Replaces scalar shadowEta with a real forward simulation.
 * Runs N iterations per shipment, applies carrier degradation curves,
 * jam peak probabilities, and weather uncertainty.
 * Returns a probability distribution, not a single number.
 *
 * Lightweight by design: 50 iterations per shipment, <2ms per cycle.
 */

import { Shipment } from "./types";
import { CARRIER_PROFILES, JAM_ZONES } from "./data";

export interface MonteCarloResult {
  shipmentId: string;
  p10: number;       // 10th percentile ETA (optimistic)
  p50: number;       // median ETA
  p90: number;       // 90th percentile ETA (pessimistic)
  mean: number;
  breachProbability: number;  // fraction of iterations that breach SLA
  worstCaseEta: number;
  distributionBuckets: number[]; // 10 buckets for sparkline
  iterations: number;
}

const N_ITERATIONS = 50;

function sampleCarrierDelay(carrier: string, hour: number, raining: boolean): number {
  const p = CARRIER_PROFILES[carrier];
  if (!p) return Math.random() * 3;

  // Base delay from reliability
  const reliability = Math.max(0.1, p.baseReliability
    - (raining ? p.rainSensitivity * 0.5 : 0)
    - (hour >= 14 && hour <= 19 ? p.peakHourPenalty * 0.4 : 0)
  );

  // Sample from an exponential-like delay distribution
  // Higher reliability = shorter tail
  const u = Math.random();
  if (u < reliability) return 0;                           // no delay
  const excessU = (u - reliability) / (1 - reliability);
  return -Math.log(1 - excessU) * (1 / reliability) * 2;  // hours
}

function sampleJamDelay(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  let total = 0;
  const mx = (fromLat + toLat) / 2;
  const my = (fromLng + toLng) / 2;
  for (const j of JAM_ZONES) {
    const d = Math.sqrt((j.lat - mx)**2 + (j.lng - my)**2);
    if (d < 0.06) {
      // Jam only affects route probabilistically
      const jamProb = j.severity === "high" ? 0.72 : j.severity === "medium" ? 0.45 : 0.20;
      if (Math.random() < jamProb) {
        total += (j.delayMin / 60) * (0.7 + Math.random() * 0.6);  // hours, with variance
      }
    }
  }
  return total;
}

export function runMonteCarlo(
  ship: Shipment,
  hour: number,
  raining: boolean,
  fromLat?: number, fromLng?: number,
  toLat?: number, toLng?: number,
): MonteCarloResult {
  const results: number[] = [];
  const baseEta = ship.eta;

  for (let i = 0; i < N_ITERATIONS; i++) {
    let eta = baseEta;

    // Carrier delay sample
    eta += sampleCarrierDelay(ship.carrier, hour, raining);

    // Route jam sample
    if (fromLat && toLat) {
      eta += sampleJamDelay(fromLat, fromLng!, toLat, toLng!);
    }

    // Inventory handling delay (perishables need special handling)
    if (ship.inventoryType === "Perishables" && ship.stage === "warehouse") {
      eta += Math.random() < 0.3 ? Math.random() * 2 : 0;
    }

    // Random operational noise (missed pickup, driver change, etc.)
    if (Math.random() < 0.15) eta += Math.random() * 1.5;

    results.push(eta);
  }

  results.sort((a, b) => a - b);
  const p10 = results[Math.floor(N_ITERATIONS * 0.10)];
  const p50 = results[Math.floor(N_ITERATIONS * 0.50)];
  const p90 = results[Math.floor(N_ITERATIONS * 0.90)];
  const mean = results.reduce((a, b) => a + b, 0) / N_ITERATIONS;
  const breachCount = results.filter(r => r > ship.sla).length;
  const worstCaseEta = results[N_ITERATIONS - 1];

  // Build 10-bucket histogram for sparkline
  const minR = results[0], maxR = worstCaseEta;
  const bucketSize = Math.max(0.1, (maxR - minR) / 10);
  const distributionBuckets = Array(10).fill(0);
  for (const r of results) {
    const bucket = Math.min(9, Math.floor((r - minR) / bucketSize));
    distributionBuckets[bucket]++;
  }

  return {
    shipmentId: ship.id,
    p10, p50, p90, mean,
    breachProbability: breachCount / N_ITERATIONS,
    worstCaseEta,
    distributionBuckets,
    iterations: N_ITERATIONS,
  };
}

export function runAllMonteCarlo(
  ships: Shipment[],
  hour: number,
  raining: boolean,
  locations: Record<string, { lat: number; lng: number }>,
): Map<string, MonteCarloResult> {
  const results = new Map<string, MonteCarloResult>();
  for (const ship of ships) {
    const from = locations[ship.from];
    const to = locations[ship.to];
    results.set(ship.id, runMonteCarlo(
      ship, hour, raining,
      from?.lat, from?.lng, to?.lat, to?.lng,
    ));
  }
  return results;
}
