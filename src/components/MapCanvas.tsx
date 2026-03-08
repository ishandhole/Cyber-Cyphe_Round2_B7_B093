"use client";
import { useEffect, useRef } from "react";
import { LOCATIONS, JAM_ZONES, ll2xy } from "@/lib/data";
import { Shipment } from "@/lib/types";

// Warm-slate color palette for canvas
const COL = {
  bgReal: "#0c0e16",
  bgShadow: "#0d0c18",
  grid: "rgba(74,173,163,0.035)",
  gridSh: "rgba(122,104,152,0.04)",
  shore: "rgba(74,173,163,0.15)",
  shoreSh: "rgba(122,104,152,0.18)",
  ok: "#5a9e74",
  warn: "#b8915a",
  crit: "#a85468",
  shadow: "#7a6898",
  shadowBr: "#a85468",
  alt: "#4aada3",
  node: "rgba(74,173,163,0.7)",
  nodeSh: "rgba(122,104,152,0.7)",
  label: "rgba(142,150,180,0.55)",
  labelSh: "rgba(162,142,180,0.55)",
  jamHigh: "rgba(168,84,104,",
  jamMed: "rgba(184,145,90,",
  jamLow: "rgba(106,120,168,",
};

function draw(canvas: HTMLCanvasElement, ships: Shipment[], isShadow: boolean) {
  const el = canvas.parentElement;
  if (!el) return;
  const W = el.clientWidth, H = el.clientHeight;
  if (W < 10 || H < 10) return;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext("2d")!;
  const now = Date.now();

  // Background
  ctx.fillStyle = isShadow ? COL.bgShadow : COL.bgReal;
  ctx.fillRect(0, 0, W, H);

  // Grid
  const gc = isShadow ? COL.gridSh : COL.grid;
  ctx.strokeStyle = gc; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Shoreline
  ctx.strokeStyle = isShadow ? COL.shoreSh : COL.shore;
  ctx.setLineDash([4, 8]); ctx.lineWidth = 1.2;
  const shore = [[18.88, 72.82], [18.92, 72.83], [18.96, 72.815], [19.01, 72.83], [19.05, 72.82], [19.09, 72.84], [19.13, 72.83], [19.17, 72.85], [19.21, 72.87], [19.26, 72.875]];
  ctx.beginPath();
  shore.forEach(([la, ln], i) => { const [x, y] = ll2xy(la, ln, W, H); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke(); ctx.setLineDash([]);

  // Jam zones — muted, soft
  JAM_ZONES.forEach((j, ji) => {
    const [jx, jy] = ll2xy(j.lat, j.lng, W, H);
    const r = (j.severity === "high" ? 26 : j.severity === "medium" ? 19 : 13) * (W / 500);
    const pulse = 0.45 + 0.3 * Math.sin(now / 1200 + ji * 1.7);
    const base = j.severity === "high" ? COL.jamHigh : j.severity === "medium" ? COL.jamMed : COL.jamLow;
    const gr = ctx.createRadialGradient(jx, jy, 0, jx, jy, r * (2 + pulse * .4));
    gr.addColorStop(0, base + "0.2)");
    gr.addColorStop(0.55, base + "0.08)");
    gr.addColorStop(1, base + "0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(jx, jy, r * (2 + pulse * .4), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = base + "0.4)"; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(jx, jy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = base + "0.6)";
    ctx.font = `${Math.max(9, 10 * (W / 500))}px 'DM Mono',monospace`;
    ctx.fillText(j.name, jx + r + 6, jy + 4);
  });

  // Route lines
  ships.forEach((sh, si) => {
    const fl = LOCATIONS[sh.from], tl = LOCATIONS[sh.to]; if (!fl || !tl) return;
    const [fx, fy] = ll2xy(fl.lat, fl.lng, W, H);
    const [tx, ty] = ll2xy(tl.lat, tl.lng, W, H);
    const breach = sh.shadowEta > sh.sla;
    const col = isShadow
      ? (breach ? COL.shadowBr : COL.shadow)
      : sh.status === "critical" ? COL.crit : sh.status === "warn" ? COL.warn : COL.ok;

    // Main route
    ctx.strokeStyle = col + (isShadow ? "55" : "70"); ctx.lineWidth = sh.status === "critical" ? 3.5 : 2.5;
    if (isShadow || sh.status === "critical") ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);

    // Alternate route arc (real world only, non-ok ships)
    if (!isShadow && sh.status !== "ok") {
      const mx = (fx + tx) / 2 + (ty - fy) * 0.2, my = (fy + ty) / 2 - (tx - fx) * 0.2;
      ctx.strokeStyle = COL.alt + "60"; ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Animated flow dot
    const t = ((now / 2200 + si * 0.4) % 1);
    const [fdx, fdy] = [fx + (tx - fx) * t, fy + (ty - fy) * t];
    ctx.fillStyle = col + "cc"; ctx.beginPath(); ctx.arc(fdx, fdy, 3.5, 0, Math.PI * 2); ctx.fill();
  });

  // Location nodes
  Object.entries(LOCATIONS).forEach(([, v]) => {
    if (v.type === "delivery") return;
    const [nx, ny] = ll2xy(v.lat, v.lng, W, H);
    const nc = isShadow ? COL.nodeSh : COL.node;
    ctx.strokeStyle = nc; ctx.lineWidth = 1.5;
    ctx.fillStyle = nc.replace("0.7", "0.1");
    if (v.type === "assembly") { ctx.beginPath(); ctx.rect(nx - 6, ny - 6, 12, 12); ctx.fill(); ctx.stroke(); }
    else {
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.rect(-5, -5, 10, 10); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    const lc = isShadow ? COL.labelSh : COL.label;
    ctx.fillStyle = lc;
    ctx.font = `${Math.max(9, 10 * (W / 500))}px 'DM Mono',monospace`;
    ctx.fillText(v.name, nx + 10, ny + 4);
  });

  // Shipment markers
  ships.forEach((sm, i) => {
    const loc = LOCATIONS[sm.to]; if (!loc) return;
    let lat = loc.lat, lng = loc.lng;
    if (isShadow) { lat += Math.sin(i * 7.1) * 0.006; lng += Math.cos(i * 5.3) * 0.006; }
    const [smx, smy] = ll2xy(lat, lng, W, H);
    const breach = sm.shadowEta > sm.sla;
    const col = isShadow
      ? (breach ? COL.shadowBr : COL.shadow)
      : sm.status === "critical" ? COL.crit : sm.status === "warn" ? COL.warn : COL.ok;
    const sz = (sm.status === "critical" || breach) ? 11 : 8;
    const pulse = 0.5 + 0.4 * Math.sin(now / 700 + i * 1.3);

    const gr = ctx.createRadialGradient(smx, smy, 0, smx, smy, sz * 3.5);
    gr.addColorStop(0, col + "55"); gr.addColorStop(1, col + "00");
    ctx.fillStyle = gr; ctx.beginPath();
    ctx.arc(smx, smy, sz * (2.5 + (sm.status === "critical" || breach ? pulse * 0.7 : 0)), 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(smx, smy, sz, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col + "99"; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.arc(smx, smy, sz + 3.5, 0, Math.PI * 2); ctx.stroke();

    const fs = Math.max(12, 14 * (W / 500));
    ctx.font = `600 ${fs}px 'DM Mono',monospace`; ctx.fillStyle = col;
    ctx.fillText(sm.id, smx + sz + 7, smy - 3);
    ctx.font = `${Math.max(10, 11 * (W / 500))}px 'DM Mono',monospace`;
    ctx.fillStyle = col + "aa";
    if (isShadow) ctx.fillText(breach ? "⚠ breach" : `${sm.shadowEta.toFixed(1)}h`, smx + sz + 7, smy + 10);
    else ctx.fillText(`${sm.eta.toFixed(1)}h / ${sm.sla}h`, smx + sz + 7, smy + 10);
  });
}

export function MapCanvas({ ships, isShadow }: { ships: Shipment[]; isShadow: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const loop = () => { if (!live || !ref.current) return; draw(ref.current, ships, isShadow); requestAnimationFrame(loop); };
    loop(); return () => { live = false; };
  }, [ships, isShadow]);

  const now = new Date(), sh = new Date(now.getTime() + 6 * 3600000);
  const f = (x: number) => String(x).padStart(2, "0");
  const label = isShadow ? "Shadow World  +6h ahead" : "Real World  live";
  const time = isShadow ? `${f(sh.getHours())}:${f(sh.getMinutes())}` : `${f(now.getHours())}:${f(now.getMinutes())}`;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap font-body text-[9px] tracking-[0.12em] uppercase px-3 py-[3px] border"
        style={{
          borderRadius: "3px",
          color: isShadow ? "#7a6898" : "#4aada3",
          borderColor: isShadow ? "rgba(122,104,152,0.28)" : "rgba(74,173,163,0.28)",
          background: isShadow ? "rgba(122,104,152,0.07)" : "rgba(74,173,163,0.07)",
        }}
      >
        {label}
      </div>
      <div
        className="absolute top-2 right-2 z-10 pointer-events-none font-mono text-[9px] px-2 py-[2px]"
        style={{ color: isShadow ? "rgba(122,104,152,0.5)" : "rgba(74,173,163,0.5)" }}
      >
        {time}
      </div>
      {!isShadow && (
        <div className="absolute bottom-3 left-3 z-10 space-y-[4px]">
          {[["#5a9e74", "On track"], ["#b8915a", "At risk"], ["#a85468", "Critical"], ["#4aada3", "Alt route"]].map(([c, l]) => (
            <div key={l} className="flex items-center gap-[5px]">
              <div className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: c, opacity: 0.7 }} />
              <span className="font-mono text-[8px]" style={{ color: "rgba(142,150,180,0.45)" }}>{l}</span>
            </div>
          ))}
        </div>
      )}
      <canvas ref={ref} className="w-full h-full block" />
    </div>
  );
}
