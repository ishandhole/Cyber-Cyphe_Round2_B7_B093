"use client";
/**
 * PROMETHEUS — Delivery Timeline
 * ────────────────────────────────
 * Gantt-style horizontal timeline per shipment showing:
 * - Each leg as a coloured bar (assembly, warehouse, pickup, transit, last-mile)
 * - Pickup window as a hard-edged bracket — if carrier ETA falls outside, it's flagged
 * - Monte Carlo P10–P90 uncertainty band overlaid on each transit bar
 * - SLA deadline as a vertical red line
 * - Current time as a moving cursor
 * - Google Maps link on each transit/last-mile leg
 *
 * Renders on an HTML5 canvas for pixel-precision, same as MapCanvas.
 * Replaces the bottom Observe+Reason panel when toggled.
 */

import { useEffect, useRef, useCallback } from "react";
import { ShipmentChain, LEG_STAGE_LABEL } from "@/lib/multiLeg";
import { MonteCarloResult } from "@/lib/monteCarlo";
import { Shipment } from "@/lib/types";
import { LOCATIONS } from "@/lib/data";

interface Props {
  chains: ShipmentChain[];
  ships: Shipment[];
  mcResults: Map<string, MonteCarloResult>;
  onSelectShipment?: (id: string) => void;
  selectedShipment?: string | null;
}

// ── Palette — muted, consistent with design system ──────
const C = {
  bg: "#0c0e16",
  gridLine: "rgba(40,44,62,0.8)",
  gridText: "rgba(80,88,110,0.7)",
  rowBg: "rgba(22,25,35,0.6)",
  rowBgHov: "rgba(27,30,43,0.9)",
  rowBorder: "rgba(40,44,62,0.5)",
  slaLine: "rgba(168,84,104,0.55)",
  nowLine: "rgba(74,173,163,0.45)",
  mcBand: "rgba(106,120,168,0.14)",
  mcEdge: "rgba(106,120,168,0.30)",
  windowBracket: "rgba(184,145,90,0.6)",
  windowFill: "rgba(184,145,90,0.06)",
  windowMiss: "rgba(168,84,104,0.55)",
  windowMissFill: "rgba(168,84,104,0.07)",
  legs: {
    assembly: { fill: "rgba(122,104,152,0.28)", stroke: "rgba(122,104,152,0.55)", text: "#9a8aac" },
    warehouse: { fill: "rgba(184,145,90,0.20)", stroke: "rgba(184,145,90,0.45)", text: "#c9a472" },
    pickup: { fill: "rgba(74,173,163,0.18)", stroke: "rgba(74,173,163,0.45)", text: "#4aada3" },
    transit: { fill: "rgba(106,120,168,0.20)", stroke: "rgba(106,120,168,0.45)", text: "#7d8eb8" },
    hub_sort: { fill: "rgba(90,158,116,0.18)", stroke: "rgba(90,158,116,0.40)", text: "#7ab893" },
    last_mile: { fill: "rgba(90,158,116,0.22)", stroke: "rgba(90,158,116,0.50)", text: "#5a9e74" },
  } as Record<string, { fill: string; stroke: string; text: string }>,
  status: {
    complete: "rgba(90,158,116,0.35)",
    active: "rgba(74,173,163,0.35)",
    pending: "rgba(50,54,73,0.4)",
    delayed: "rgba(168,84,104,0.35)",
    at_risk: "rgba(184,145,90,0.35)",
  } as Record<string, string>,
};

const ROW_H = 65;   // px per shipment row
const LABEL_W = 100;  // px for left shipment ID column
const HEADER_H = 40;   // px for time header
const PAD_RIGHT = 20;
const LEG_Y_OFF = 18;   // vertical offset of leg bar within row
const LEG_H = 28;   // height of leg bar
const MC_Y_OFF = 14;   // mc band y offset (above leg bar)

function hoursToLabel(h: number): string {
  const now = new Date();
  const t = new Date(now.getTime() + h * 3600000);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function draw(
  canvas: HTMLCanvasElement,
  chains: ShipmentChain[],
  ships: Shipment[],
  mcResults: Map<string, MonteCarloResult>,
  selected: string | null,
  hoveredRow: number,
) {
  const el = canvas.parentElement;
  if (!el) return;
  const W = el.clientWidth;
  const H = Math.max(el.clientHeight, chains.length * ROW_H + HEADER_H + 20); // Dynamic height
  if (W < 10 || H < 10) return;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  if (chains.length === 0) {
    ctx.fillStyle = C.gridText;
    ctx.font = "14px 'DM Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("No shipment chains loaded. Start agent to populate.", W / 2, H / 2);
    return;
  }

  // ── Compute time domain ──────────────────────────────
  // Span from -0.5h before now to max(SLA + 2h) across all chains
  const maxHour = Math.max(...chains.map(c => c.overallSla)) + 2;
  const minHour = -0.5;
  const timeSpan = maxHour - minHour;

  const plotW = W - LABEL_W - PAD_RIGHT;
  const toX = (h: number) => LABEL_W + ((h - minHour) / timeSpan) * plotW;

  // ── Time grid ─────────────────────────────────────────
  ctx.font = `11px 'DM Mono', monospace`;
  ctx.textAlign = "center";

  // Draw hour ticks every 2h
  for (let h = Math.ceil(minHour); h <= maxHour; h += 2) {
    const x = toX(h);
    ctx.strokeStyle = C.gridLine;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(x, HEADER_H); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.gridText;
    ctx.fillText(hoursToLabel(h), x, 24);
  }

  // ── Now line ─────────────────────────────────────────
  const nowX = toX(0);
  ctx.strokeStyle = C.nowLine;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(nowX, HEADER_H); ctx.lineTo(nowX, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.nowLine;
  ctx.font = "10px 'DM Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("NOW", nowX, HEADER_H - 6);

  // ── Rows ─────────────────────────────────────────────
  chains.forEach((chain, ri) => {
    const ship = ships.find(s => s.id === chain.shipmentId);
    const mc = mcResults.get(chain.shipmentId);
    const rowY = HEADER_H + ri * ROW_H;
    const isHov = hoveredRow === ri;
    const isSel = selected === chain.shipmentId;

    // Row background
    ctx.fillStyle = isSel ? "rgba(74,173,163,0.04)" : isHov ? C.rowBgHov : C.rowBg;
    ctx.fillRect(0, rowY, W, ROW_H);

    // Row border
    ctx.strokeStyle = isSel ? "rgba(74,173,163,0.25)" : C.rowBorder;
    ctx.lineWidth = isSel ? 1 : 0.5;
    ctx.beginPath(); ctx.moveTo(0, rowY + ROW_H - 0.5); ctx.lineTo(W, rowY + ROW_H - 0.5); ctx.stroke();

    // Label column background
    ctx.fillStyle = "rgba(17,19,29,0.6)";
    ctx.fillRect(0, rowY, LABEL_W, ROW_H);

    // Shipment ID
    ctx.font = `500 12px 'DM Mono', monospace`;
    ctx.textAlign = "left";
    ctx.fillStyle = isSel ? "#4aada3" : "#8e96b4";
    ctx.fillText(chain.shipmentId, 12, rowY + 22);

    // Carrier
    if (ship) {
      ctx.font = `10px 'DM Mono', monospace`;
      ctx.fillStyle = "rgba(80,88,110,0.8)";
      ctx.fillText(ship.carrier, 12, rowY + 36);
    }

    // SLA marker in label
    ctx.font = `9px 'DM Mono', monospace`;
    ctx.fillStyle = "rgba(168,84,104,0.7)";
    ctx.fillText(`SLA ${chain.overallSla}h`, 12, rowY + 50);

    // ── SLA deadline line ────────────────────────────
    const slaX = toX(chain.overallSla);
    ctx.strokeStyle = C.slaLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(slaX, rowY + 4); ctx.lineTo(slaX, rowY + ROW_H - 4); ctx.stroke();
    ctx.setLineDash([]);

    // Small SLA triangle marker at top
    ctx.fillStyle = C.slaLine;
    ctx.beginPath();
    ctx.moveTo(slaX - 4, rowY + 4);
    ctx.lineTo(slaX + 4, rowY + 4);
    ctx.lineTo(slaX, rowY + 10);
    ctx.closePath(); ctx.fill();

    // ── Monte Carlo uncertainty band (over transit legs) ─
    if (mc && mc.p10 < mc.p90) {
      const mcX1 = Math.max(toX(mc.p10), LABEL_W);
      const mcX2 = Math.min(toX(mc.p90), W - PAD_RIGHT);
      const mcY = rowY + MC_Y_OFF;
      const mcH = ROW_H - MC_Y_OFF * 2;

      // Band fill
      ctx.fillStyle = C.mcBand;
      ctx.fillRect(mcX1, mcY, mcX2 - mcX1, mcH);

      // Band edges
      ctx.strokeStyle = C.mcEdge;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(mcX1, mcY); ctx.lineTo(mcX1, mcY + mcH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mcX2, mcY); ctx.lineTo(mcX2, mcY + mcH); ctx.stroke();
      ctx.setLineDash([]);

      // P50 median line
      const mcMid = toX(mc.p50);
      if (mcMid > LABEL_W && mcMid < W - PAD_RIGHT) {
        ctx.strokeStyle = "rgba(106,120,168,0.50)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mcMid, mcY + 2); ctx.lineTo(mcMid, mcY + mcH - 2); ctx.stroke();
      }

      // "P10–P90" label
      ctx.font = "9px 'DM Mono', monospace";
      ctx.fillStyle = "rgba(106,120,168,0.55)";
      ctx.textAlign = "left";
      if (mcX2 - mcX1 > 40) ctx.fillText(`P10–P90`, mcX1 + 4, mcY + 10);
    }

    // ── Legs ─────────────────────────────────────────
    chain.legs.forEach((leg) => {
      const x1 = Math.max(toX(leg.plannedStart), LABEL_W);
      const x2 = Math.min(toX(leg.plannedEnd), W - PAD_RIGHT);
      if (x2 <= x1) return;

      const legY = rowY + LEG_Y_OFF;
      const legStyle = C.legs[leg.stage] ?? C.legs.transit;
      const statusCol = C.status[leg.status] ?? C.status.pending;

      // Leg background — status colour
      ctx.fillStyle = statusCol;
      ctx.beginPath();
      ctx.roundRect(x1, legY, x2 - x1, LEG_H, 3);
      ctx.fill();

      // Leg fill — stage colour overlay
      ctx.fillStyle = legStyle.fill;
      ctx.beginPath();
      ctx.roundRect(x1, legY, x2 - x1, LEG_H, 3);
      ctx.fill();

      // Leg border
      ctx.strokeStyle = legStyle.stroke;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(x1, legY, x2 - x1, LEG_H, 3);
      ctx.stroke();

      // ── Pickup window bracket ──────────────────────
      if (leg.stage === "pickup") {
        const ship = ships.find(s => s.id === chain.shipmentId);
        const carrierEta = ship ? ship.eta : leg.plannedEnd;
        const windowMissed = carrierEta > leg.plannedEnd + 0.3;

        // Window fill
        ctx.fillStyle = windowMissed ? C.windowMissFill : C.windowFill;
        ctx.fillRect(x1, legY - 4, x2 - x1, LEG_H + 8);

        // Window brackets — left and right vertical bars
        const bracketCol = windowMissed ? C.windowMiss : C.windowBracket;
        ctx.strokeStyle = bracketCol;
        ctx.lineWidth = 1.5;

        // Left bracket ⌐
        ctx.beginPath();
        ctx.moveTo(x1 + 1, legY - 6);
        ctx.lineTo(x1 + 1, legY + LEG_H + 6);
        ctx.moveTo(x1 + 1, legY - 6);
        ctx.lineTo(x1 + 7, legY - 6);
        ctx.moveTo(x1 + 1, legY + LEG_H + 6);
        ctx.lineTo(x1 + 7, legY + LEG_H + 6);
        ctx.stroke();

        // Right bracket ¬
        ctx.beginPath();
        ctx.moveTo(x2 - 1, legY - 6);
        ctx.lineTo(x2 - 1, legY + LEG_H + 6);
        ctx.moveTo(x2 - 1, legY - 6);
        ctx.lineTo(x2 - 7, legY - 6);
        ctx.moveTo(x2 - 1, legY + LEG_H + 6);
        ctx.lineTo(x2 - 7, legY + LEG_H + 6);
        ctx.stroke();

        // "WINDOW" label above bracket
        ctx.font = "9px 'DM Mono', monospace";
        ctx.fillStyle = bracketCol;
        ctx.textAlign = "center";
        ctx.fillText(windowMissed ? "⚠ WINDOW" : "PICKUP WINDOW", (x1 + x2) / 2, legY - 12);

        // Carrier ETA marker if it falls on timeline
        if (carrierEta >= minHour && carrierEta <= maxHour) {
          const etaX = toX(carrierEta);
          ctx.strokeStyle = windowMissed ? "rgba(168,84,104,0.7)" : "rgba(184,145,90,0.7)";
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(etaX, rowY + 6);
          ctx.lineTo(etaX, rowY + ROW_H - 6);
          ctx.stroke();
          ctx.setLineDash([]);

          // Carrier ETA label
          ctx.font = "7px 'DM Mono', monospace";
          ctx.fillStyle = windowMissed ? "rgba(168,84,104,0.8)" : "rgba(184,145,90,0.8)";
          ctx.textAlign = "center";
          ctx.fillText(`${ship?.carrier ?? ""} ETA`, etaX, rowY + ROW_H - 4);
        }
      }

      // Leg label — only if wide enough
      const legW = x2 - x1;
      if (legW > 28) {
        ctx.font = `7.5px 'DM Mono', monospace`;
        ctx.fillStyle = legStyle.text;
        ctx.textAlign = "center";
        const label = legW > 50 ? LEG_STAGE_LABEL[leg.stage] : leg.stage.slice(0, 3).toUpperCase();
        ctx.fillText(label, (x1 + x2) / 2, legY + 14);
      }

      // Status dot for delayed/at_risk
      if (leg.status === "delayed" || leg.status === "at_risk") {
        const dotCol = leg.status === "delayed" ? "#a85468" : "#b8915a";
        ctx.fillStyle = dotCol;
        ctx.beginPath();
        ctx.arc(x1 + 6, legY + 6, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // ── Accumulated delay annotation ─────────────────
    if (chain.accumulatedDelayHours > 0) {
      ctx.font = "10px 'DM Mono', monospace";
      ctx.fillStyle = "rgba(184,145,90,0.65)";
      ctx.textAlign = "right";
      ctx.fillText(`+${chain.accumulatedDelayHours.toFixed(1)}h delay`, W - PAD_RIGHT - 2, rowY + ROW_H - 10);
    }

    // ── Breach probability from MC ────────────────────
    if (mc) {
      const pct = (mc.breachProbability * 100).toFixed(0);
      const col = mc.breachProbability > 0.5 ? "#a85468"
        : mc.breachProbability > 0.25 ? "#b8915a" : "#5a9e74";
      ctx.font = "10px 'DM Mono', monospace";
      ctx.fillStyle = col;
      ctx.textAlign = "right";
      ctx.fillText(`${pct}% breach`, W - PAD_RIGHT - 2, rowY + 18);
    }
  });

  // ── Legend ────────────────────────────────────────────
  const legY = H - 18;
  const items: [string, string][] = [
    ["rgba(122,104,152,0.6)", "Assembly"],
    ["rgba(184,145,90,0.45)", "Warehouse"],
    ["rgba(74,173,163,0.45)", "Pickup window"],
    ["rgba(106,120,168,0.45)", "Transit"],
    ["rgba(90,158,116,0.5)", "Last mile"],
    ["rgba(106,120,168,0.30)", "P10–P90 band"],
    ["rgba(168,84,104,0.55)", "SLA deadline"],
  ];
  let lx = LABEL_W + 4;
  ctx.font = "7.5px 'DM Mono', monospace";
  ctx.textAlign = "left";
  for (const [col, label] of items) {
    ctx.fillStyle = col;
    ctx.fillRect(lx, legY + 1, 8, 8);
    ctx.fillStyle = "rgba(80,88,110,0.7)";
    ctx.fillText(label, lx + 11, legY + 9);
    lx += ctx.measureText(label).width + 24;
    if (lx > W - 80) break;
  }
}

export function DeliveryTimeline({ chains, ships, mcResults, onSelectShipment, selectedShipment }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hovRow = useRef(-1);
  const selected = selectedShipment ?? null;
  const frameRef = useRef<number>(0);

  const redraw = useCallback(() => {
    if (canvasRef.current) {
      draw(canvasRef.current, chains, ships, mcResults, selected, hovRow.current);
    }
  }, [chains, ships, mcResults, selected]);

  // Animation loop
  useEffect(() => {
    let live = true;
    const loop = () => {
      if (!live) return;
      redraw();
      frameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => { live = false; cancelAnimationFrame(frameRef.current); };
  }, [redraw]);

  // Mouse interaction
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const row = Math.floor((y - HEADER_H) / ROW_H);
    if (row !== hovRow.current) {
      hovRow.current = row >= 0 && row < chains.length ? row : -1;
    }
  }, [chains.length]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;
    const row = Math.floor((y - HEADER_H) / ROW_H);
    if (row >= 0 && row < chains.length) {
      const chain = chains[row];
      onSelectShipment?.(chain.shipmentId);

      // Check if click is on a transit/last_mile leg — open Google Maps
      const ship = ships.find(s => s.id === chain.shipmentId);
      if (!ship) return;
      const el = canvasRef.current?.parentElement;
      if (!el) return;
      const W = el.clientWidth;
      const maxHour = Math.max(...chains.map(c => c.overallSla)) + 2;
      const minHour = -0.5;
      const timeSpan = maxHour - minHour;
      const plotW = W - LABEL_W - PAD_RIGHT;
      const clickHour = ((x - LABEL_W) / plotW) * timeSpan + minHour;

      const clickedLeg = chain.legs.find(leg =>
        (leg.stage === "transit" || leg.stage === "last_mile") &&
        clickHour >= leg.plannedStart && clickHour <= leg.plannedEnd
      );

      if (clickedLeg) {
        const from = LOCATIONS[clickedLeg.from];
        const to = LOCATIONS[clickedLeg.to];
        if (from && to) {
          const url = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;
          window.open(url, "_blank", "noopener");
        }
      }
    }
  }, [chains, ships, onSelectShipment]);

  const handleMouseLeave = useCallback(() => { hovRow.current = -1; }, []);

  // Build summary stats for header strip
  const atRisk = chains.filter(c => c.legs.some(l => l.status === "at_risk" || l.status === "delayed")).length;
  const windowsAtRisk = chains.filter(c => {
    const ship = ships.find(s => s.id === c.shipmentId);
    if (!ship) return false;
    return c.legs.some(l => l.stage === "pickup" && ship.eta > l.plannedEnd + 0.3);
  }).length;

  return (
    <div className="flex flex-col h-full bg-canvas overflow-hidden">

      {/* Header strip */}
      <div className="flex items-center justify-between px-5 py-[10px] border-b flex-shrink-0"
        style={{ borderColor: "rgba(40,44,62,0.7)", background: "rgba(12,14,22,0.95)" }}>
        <div className="flex items-center gap-6">
          <div>
            <span className="font-display text-[14px] font-semibold tracking-[0.14em] uppercase"
              style={{ color: "#8e96b4" }}>Delivery Timeline</span>
            <span className="font-mono text-[10px] ml-4" style={{ color: "rgba(80,88,110,0.8)" }}>
              {chains.length} shipments · click transit leg to open Google Maps routing
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {windowsAtRisk > 0 && (
            <span className="font-mono text-[11px] px-2.5 py-[3.5px] border"
              style={{ borderRadius: "4px", color: "#b8915a", borderColor: "rgba(184,145,90,0.3)", background: "rgba(184,145,90,0.06)" }}>
              {windowsAtRisk} pickup window{windowsAtRisk > 1 ? "s" : ""} at risk
            </span>
          )}
          {atRisk > 0 && (
            <span className="font-mono text-[11px] px-2.5 py-[3.5px] border"
              style={{ borderRadius: "4px", color: "#a85468", borderColor: "rgba(168,84,104,0.3)", background: "rgba(168,84,104,0.06)" }}>
              {atRisk} delayed
            </span>
          )}
          <span className="font-mono text-[10px]" style={{ color: "rgba(74,173,163,0.5)" }}>
            NOW ─── SLA ─── P10–P90 band
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-y-auto">
        <canvas
          ref={canvasRef}
          className="w-full block cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}
