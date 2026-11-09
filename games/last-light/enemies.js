/*
  Last Light: new enemy art
  Drawn in the game's own style: code-drawn pixels at the same scale and with
  the same small palettes as the Moth and the Listener. No image files needed.

  Every function draws with the canvas context it is given (g), anchored at
  (x, y) = the point on the floor under the enemy's feet, the same way
  drawListener(g, fx, fy, ...) works in the main game.

  Enemies: Roughneck, Tarling, Knocker, Smother, Tenant, Firedamp, Timekeeper.
  Design notes for each are in the comments above its functions.
*/
const ENEMY_ART = (() => {
  "use strict";

  /* ---------- helpers ---------- */
  const p = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w || 1, h || 1); };
  const SH = "rgba(0,0,0,.45)";
  // pixel ellipse
  function blob(g, cx, cy, w, h, c) {
    for (let dy = -h; dy <= h; dy++) {
      const hw = Math.round(w * Math.sqrt(Math.max(0, 1 - (dy / (h + 0.5)) ** 2)));
      p(g, c, cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  // pixel circle, optional dither (skip every d-th pixel) for fading
  function puff(g, cx, cy, r, c, d) {
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.round(Math.sqrt(r * r - dy * dy));
      for (let i = -hw; i <= hw; i++) {
        if (d && ((i + dy + cx) % d)) continue;
        p(g, c, cx + i, cy + dy);
      }
    }
  }
  // see-through ghost fill (skips every third pixel)
  function ghost(g, c, x, y, w, h) {
    for (let i = 0; i < (w || 1); i++) for (let j = 0; j < (h || 1); j++) {
      if ((Math.round(x) + i + Math.round(y) + j) % 3 === 0) continue;
      p(g, c, x + i, y + j);
    }
  }

  /* =========================================================
     THE ROUGHNECK
     Feral infected oil worker, crawls on all fours, drags a wrench.
     Catch = the key-sequence struggle mini-game.
     Frames: down(0-2), right(0-2) (left = mirror right), lunge.
     Variants: red (default), yellow, orange vest.
     ========================================================= */
  const ROUGHNECK_VARIANTS = {
    red:    { v: "#7a2a22", vd: "#4e1a15" },
    yellow: { v: "#8a7a2a", vd: "#5a4e1a" },
    orange: { v: "#a8501e", vd: "#6a3214" }
  };
  const RN = { C: "#2c2a27", S: "#c2bcae", SD: "#9a9487", VN: "#3a1414", H: "#34312d", HL: "#55504a", E: "#e8e4dc", M: "#1a0806", B: "#3a2618", W: "#5a4a3a" };

  function roughneckDown(g, x, y, f, variant) {
    const { v: V, vd: VD } = ROUGHNECK_VARIANTS[variant] || ROUGHNECK_VARIANTS.red, R = RN;
    const a = f === 1 ? 1 : f === 2 ? -1 : 0;
    p(g, SH, x - 8, y - 1, 16, 2);
    p(g, R.C, x - 5, y - 7, 3, 3); p(g, R.C, x + 2, y - 7, 3, 3);
    const ly = y - 3 - (a > 0 ? 2 : 0), ry = y - 3 - (a < 0 ? 2 : 0);
    p(g, R.S, x - 7, y - 10, 2, ly - (y - 10)); p(g, R.S, x - 9, ly, 4, 2); p(g, R.SD, x - 9, ly + 1); p(g, R.VN, x - 7, y - 8, 1, 2);
    p(g, R.S, x + 5, y - 10, 2, ry - (y - 10)); p(g, R.S, x + 5, ry, 4, 2); p(g, R.SD, x + 8, ry + 1); p(g, R.VN, x + 6, y - 7, 1, 2);
    p(g, R.C, x - 4, y - 12, 8, 7); p(g, V, x - 4, y - 12, 3, 7); p(g, V, x + 1, y - 12, 3, 7); p(g, VD, x - 4, y - 6, 8, 1);
    p(g, R.S, x - 3, y - 16, 6, 5); p(g, R.VN, x - 3, y - 12);
    p(g, R.H, x - 4, y - 19, 8, 3); p(g, R.HL, x - 3, y - 19, 4, 1); p(g, "#0e0d0c", x + 1, y - 19, 1, 2); p(g, R.H, x - 5, y - 16, 10, 1);
    p(g, R.E, x - 2, y - 14); p(g, R.E, x + 1, y - 14); p(g, R.M, x - 1, y - 13, 2, 2);
  }
  function roughneckRight(g, x, y, f, variant) {
    const { v: V, vd: VD } = ROUGHNECK_VARIANTS[variant] || ROUGHNECK_VARIANTS.red, R = RN;
    const lo = f === 1 ? 1 : f === 2 ? -1 : 0, ao = f === 1 ? 2 : f === 2 ? -1 : 0;
    p(g, SH, x - 9, y - 1, 18, 2);
    p(g, R.W, x - 15, y - 2, 6, 1); p(g, R.W, x - 16, y - 3, 2, 3); p(g, R.W, x - 9, y - 3, 2, 1);
    p(g, R.C, x - 8 + lo, y - 4, 5, 3); p(g, R.B, x - 9 + lo, y - 2, 3, 2);
    p(g, R.SD, x + 1 - ao, y - 6, 2, 5); p(g, R.SD, x + 1 - ao, y - 2, 3, 1);
    p(g, R.C, x - 6, y - 10, 10, 5); p(g, V, x - 6, y - 10, 9, 4); p(g, VD, x - 6, y - 7, 9, 1);
    p(g, R.S, x + 4, y - 13, 5, 5); p(g, R.H, x + 3, y - 15, 6, 3); p(g, R.HL, x + 4, y - 15, 3, 1); p(g, R.H, x + 8, y - 13, 2, 1);
    p(g, R.E, x + 7, y - 11); p(g, R.M, x + 7, y - 9, 2, 1);
    p(g, R.S, x + 3 + ao, y - 6, 2, 5); p(g, R.S, x + 3 + ao, y - 2, 4, 2); p(g, R.VN, x + 3 + ao, y - 5, 1, 2);
  }
  function roughneckLunge(g, x, y, variant) {
    const { v: V, vd: VD } = ROUGHNECK_VARIANTS[variant] || ROUGHNECK_VARIANTS.red, R = RN;
    p(g, SH, x - 10, y - 1, 20, 2);
    p(g, R.C, x - 4, y - 6, 3, 5); p(g, R.C, x + 1, y - 6, 3, 5); p(g, R.B, x - 4, y - 2, 3, 2); p(g, R.B, x + 1, y - 2, 3, 2);
    p(g, R.C, x - 4, y - 13, 8, 7); p(g, V, x - 4, y - 13, 3, 7); p(g, V, x + 1, y - 13, 3, 7); p(g, VD, x - 4, y - 7, 8, 1);
    p(g, R.S, x - 12, y - 14, 8, 2); p(g, R.S, x + 4, y - 14, 8, 2); p(g, R.VN, x - 10, y - 14, 2, 1); p(g, R.VN, x + 8, y - 14, 2, 1);
    p(g, R.S, x - 14, y - 17, 2, 5); p(g, R.S, x - 15, y - 18, 1, 2); p(g, R.S, x - 13, y - 18);
    p(g, R.S, x + 12, y - 17, 2, 5); p(g, R.S, x + 14, y - 18, 1, 2); p(g, R.S, x + 12, y - 18);
    p(g, R.S, x - 3, y - 19, 6, 5); p(g, R.H, x - 4, y - 22, 8, 3); p(g, R.HL, x - 3, y - 22, 4, 1); p(g, R.H, x - 5, y - 19, 10, 1);
    p(g, R.E, x - 2, y - 17); p(g, R.E, x + 1, y - 17); p(g, R.M, x - 1, y - 16, 3, 3); p(g, R.E, x - 1, y - 16); p(g, R.E, x + 1, y - 16);
  }

  /* =========================================================
     THE TARLING
     Living sludge puddle. Hides as an ordinary tar puddle (same colors as
     the game's floor puddles: #0a0909 with a #1f2b2b sheen).
     Catch = half sludge. Frames: ooze(0-2), hide(0-2), attack(0-2), baby(f).
     ========================================================= */
  const TL = { K: "#060508", KE: "#141220", P: "#3a2a4a", T: "#1f2b2b", Y: "#4a4a24", EY: "#9a9487", EB: "#cfc6b0" };
  function tarlingOoze(g, x, y, f) {
    const s = [0, 2, 1][f], o = f === 2 ? 1 : 0;
    blob(g, x + o, y - 2, 7 + s, 2, TL.KE); blob(g, x + o, y - 2, 6 + s, 1, TL.K); blob(g, x - 1 + o, y - 4, 4, 1, TL.K);
    const tl = [3, 5, 2][f];
    p(g, TL.K, x + 7 + s + o, y - 2, tl, 1); p(g, TL.K, x + 7 + s + o, y - 3, tl - 1, 1); p(g, TL.KE, x + 7 + s + o + tl, y - 2);
    p(g, TL.P, x - 3 + o, y - 4, 2, 1); p(g, TL.T, x + 1 + o, y - 5, 2, 1); p(g, TL.Y, x - 5 + o, y - 2);
    p(g, TL.EY, x - 2 + o, y - 4); p(g, TL.EY, x + o, y - 4);
  }
  function tarlingHide(g, x, y, f) {
    if (f === 0) { blob(g, x, y - 2, 7, 2, TL.KE); blob(g, x, y - 2, 6, 1, TL.K); blob(g, x, y - 3, 3, 1, TL.K); p(g, TL.T, x + 2, y - 4, 2, 1); p(g, TL.EY, x - 1, y - 3); p(g, TL.EY, x + 1, y - 3); }
    if (f === 1) { blob(g, x, y - 2, 8, 2, "#0a0909"); p(g, TL.T, x - 2, y - 3, 2, 1); p(g, TL.EY, x - 1, y - 2); p(g, TL.EY, x + 1, y - 2); }
    if (f === 2) { blob(g, x, y - 2, 8, 2, "#0a0909"); p(g, TL.T, x - 2, y - 3, 2, 1); }
  }
  function tarlingAttack(g, x, y, f) {
    if (f === 0) { blob(g, x, y - 2, 7, 2, TL.KE); blob(g, x, y - 2, 6, 1, TL.K); p(g, TL.K, x - 2, y - 8, 5, 6); p(g, TL.K, x - 1, y - 10, 3, 2); p(g, TL.P, x - 1, y - 8); p(g, TL.EY, x - 1, y - 6); p(g, TL.EY, x + 1, y - 6); }
    if (f === 1) {
      blob(g, x, y - 2, 8, 2, TL.KE); blob(g, x, y - 2, 7, 1, TL.K);
      p(g, TL.K, x - 3, y - 15, 6, 13); p(g, TL.K, x - 2, y - 17, 5, 2); p(g, TL.K, x + 3, y - 17, 3, 2); p(g, TL.K, x + 5, y - 16, 1, 3);
      p(g, TL.P, x - 2, y - 15, 1, 3); p(g, TL.T, x + 2, y - 12, 1, 2); p(g, TL.Y, x - 2, y - 7); p(g, TL.EY, x - 2, y - 11); p(g, TL.EY, x, y - 11);
      p(g, TL.K, x - 6, y - 12); p(g, TL.K, x + 7, y - 14); p(g, TL.K, x - 5, y - 18);
    }
    if (f === 2) {
      blob(g, x, y - 2, 10, 2, TL.KE); blob(g, x, y - 2, 9, 1, TL.K);
      p(g, TL.K, x - 7, y - 6, 1, 4); p(g, TL.K, x - 3, y - 8, 1, 6); p(g, TL.K, x + 2, y - 9, 1, 7); p(g, TL.K, x + 6, y - 6, 1, 4);
      p(g, TL.K, x - 8, y - 9); p(g, TL.K, x - 3, y - 11); p(g, TL.K, x + 2, y - 12); p(g, TL.K, x + 7, y - 9);
      p(g, TL.P, x - 1, y - 3, 2, 1); p(g, TL.T, x + 4, y - 3, 2, 1);
    }
  }
  // harmless baby blob that runs from the player; f = any counter (legs alternate)
  function tarlingBaby(g, x, y, f) {
    blob(g, x, y - 3, 2, 1, TL.K); p(g, TL.K, x - 1, y - 5, 3, 1); p(g, TL.T, x - 1, y - 5);
    p(g, TL.EB, x - 1, y - 3); p(g, TL.EB, x + 1, y - 3);
    const l = f % 2; p(g, TL.K, x - 2, y - 1 + l); p(g, TL.K, x, y - 1 + (1 - l)); p(g, TL.K, x + 2, y - 1 + l);
  }

  /* =========================================================
     THE KNOCKER
     Workers fused into a broken pipe. Grey-skinned jointed arms (2 only).
     Catch = instant death. Sealed out by turning the red valve wheels.
     Pipe colors match the pipes already on the room walls.
     Frames: hidden(0-2), burst(0-2), reach(0-2), walker(0-1).
     OPEN DECISION: fixed in pipes (hidden/burst/reach) or walking with the
     pipe as a shell (walker). Both are drawn; Shano will choose.
     Variants: rust (default), steel, copper, purple.
     ========================================================= */
  const KNOCKER_VARIANTS = {
    rust:   { b: "#4a3f33", h: "#6b5a46", d: "#2e2720", r: "#7a3a1f", s: "#060508" },
    steel:  { b: "#4a5560", h: "#6a7680", d: "#2e353c", r: "#3a4a2a", s: "#2a3a1a" },
    copper: { b: "#7a4a24", h: "#9a6034", d: "#4a2a14", r: "#5a2a14", s: "#3e1410" },
    purple: { b: "#3a2a48", h: "#55406a", d: "#241a30", r: "#4a2a5a", s: "#1a2a14" }
  };
  const KN = { SK: "#9a9487", JT: "#6e695f", FT: "#060508", FC: "#c2bcae", HO: "#0b0a09", ST: "#8c877d" };
  function knockerPipe(g, x, y, variant, lift) {
    const P = KNOCKER_VARIANTS[variant] || KNOCKER_VARIANTS.rust; const L = lift || 0; y -= L;
    p(g, SH, x - 9, y - 1 + L, 18, 2);
    p(g, P.b, x - 9, y - 8, 18, 6); p(g, P.h, x - 9, y - 8, 18, 1); p(g, P.d, x - 9, y - 3, 18, 1);
    p(g, P.d, x - 4, y - 8, 1, 6); p(g, P.d, x + 4, y - 8, 1, 6); p(g, P.d, x - 10, y - 8, 1, 6);
    p(g, KN.HO, x - 10, y - 7, 2, 4); p(g, KN.HO, x + 1, y - 8, 2, 2); p(g, P.r, x + 6, y - 6, 2, 1); p(g, P.r, x - 2, y - 4);
  }
  function knockerArm(g, sx, sy, n, up) {
    let x = sx, y = sy;
    for (let i = 0; i < n; i++) { const ny = sy + (i % 2 ? (up ? -1 : 1) : 0); x -= 3; p(g, KN.SK, x, ny, 3, 1); p(g, KN.JT, x, ny); y = ny; }
    p(g, KN.SK, x - 2, y - 1, 2, 3); p(g, KN.FT, x - 3, y - 1); p(g, KN.FT, x - 3, y + 1); p(g, KN.FT, x - 3, y);
  }
  function knockerFace(g, x, y, variant) {
    const P = KNOCKER_VARIANTS[variant] || KNOCKER_VARIANTS.rust;
    p(g, KN.FC, x - 12, y - 9, 4, 7); p(g, KN.FT, x - 12, y - 7); p(g, KN.FT, x - 10, y - 7); p(g, "#1a0806", x - 11, y - 5, 2, 2);
    p(g, P.s, x - 11, y - 2, 1, 2); p(g, P.s, x - 9, y - 2); p(g, P.s, x - 13, y - 1, 4, 1);
  }
  function knockerHidden(g, x, y, f, variant) {
    knockerPipe(g, x + (f === 1 ? 1 : 0), y, variant);
    if (f === 1) { p(g, KN.HO, x - 2, y - 11, 1, 2); p(g, KN.HO, x + 11, y - 11, 1, 2); }
    if (f === 2) { p(g, KN.ST, x + 1, y - 10, 2, 1); p(g, KN.ST, x + 2, y - 11); p(g, KN.ST, x + 6, y - 10); }
  }
  function knockerBurst(g, x, y, f, variant) {
    knockerPipe(g, x, y, variant);
    if (f === 0) { p(g, KN.SK, x - 12, y - 5, 2, 1); p(g, KN.FT, x - 13, y - 5); p(g, KN.FT, x - 13, y - 4); }
    if (f >= 1) { knockerArm(g, x - 10, y - 5, 2, true); knockerArm(g, x - 10, y - 3, 2, false); }
    if (f === 2) knockerFace(g, x, y, variant);
  }
  function knockerReach(g, x, y, f, variant) {
    knockerPipe(g, x, y, variant);
    const n = 3 + f; knockerArm(g, x - 10, y - 5, n, true); knockerArm(g, x - 10, y - 3, n, false);
    if (f >= 1) knockerFace(g, x, y, variant);
  }
  function knockerWalker(g, x, y, f, variant) {
    knockerPipe(g, x, y, variant, 3); const a = f ? 1 : -1;
    p(g, KN.SK, x - 7, y - 5, 1, 4); p(g, KN.SK, x - 8 + a, y - 1, 2, 1); p(g, KN.JT, x - 7, y - 3);
    p(g, KN.SK, x + 6, y - 5, 1, 4); p(g, KN.SK, x + 5 - a, y - 1, 2, 1); p(g, KN.JT, x + 6, y - 3);
    p(g, KN.SK, x - 11, y - 8, 1, 5); p(g, KN.SK, x - 12 - a, y - 3, 2, 1); knockerFace(g, x, y - 3, variant);
  }

  /* =========================================================
     THE SMOTHER
     Huge drifting mass that eats light. About twice the Listener's height.
     Faint edge outline so players get a fair warning on dark floors.
     The Moth flees any room it enters. Catch = lantern put out.
     Frames: drift f (any counter), glow stage 2/1/0 (bright/small/gone),
     fade dither 0 (solid), 2, 4.
     ========================================================= */
  const SM = { BODY: "#060508", EDGE: "#1c1a24", HOLE: "#000000", O: "#e8a94a", O2: "#a8401a", LT: "#fff1c8" };
  function smotherWidth(dy, f) {
    const base = dy < 12 ? 8 + dy / 4 : dy < 30 ? 11 - (dy - 12) / 6 : 8 - (dy - 30) / 2.5;
    return Math.max(2, Math.round(base + Math.sin(dy * 0.55 + f * 1.7)));
  }
  function smother(g, x, y, f, dither) {
    p(g, SH, x - 10, y - 1, 20, 2);
    for (let dy = 2; dy < 40; dy++) {
      const w = smotherWidth(dy, f), ry = y - dy;
      for (let i = -w; i < w; i++) { if (dither && ((i + dy) % dither)) continue; p(g, SM.BODY, x + i, ry); }
      if (!dither || dy % dither === 0) { p(g, SM.EDGE, x - w - 1, ry); p(g, SM.EDGE, x + w, ry); }
    }
    [-7, -4, -1, 2, 5, 7].forEach((o, k) => { if (dither && k % 2) return; const L = 2 + ((k * 3 + f) % 4); p(g, SM.BODY, x + o, y - 2, 1, L); p(g, SM.EDGE, x + o, y - 2 + L); });
    for (let k = 0; k < 7; k++) { if (dither && k % 2) continue; const a = k * 0.9 + f * 0.6, r = 12 + (k % 3); p(g, SM.EDGE, x + Math.round(Math.cos(a) * r), y - 22 + Math.round(Math.sin(a) * r * 1.4)); }
    if (!dither) { p(g, SM.HOLE, x - 2, y - 32, 4, 3); p(g, SM.EDGE, x - 3, y - 32, 1, 3); p(g, SM.EDGE, x + 2, y - 32, 1, 3); }
  }
  // stage 2 = pulling a lantern's light in, 1 = small ember, 0 = light gone
  function smotherGlow(g, x, y, stage) {
    if (stage === 2) {
      p(g, SM.O, x - 2, y - 24, 5, 5); p(g, SM.O2, x - 3, y - 23, 1, 3); p(g, SM.O2, x + 3, y - 23, 1, 3); p(g, SM.LT, x - 1, y - 23, 3, 3);
      [[-8, -30], [8, -28], [-9, -16], [9, -18]].forEach(([dx, dy]) => { p(g, SM.O2, x + dx, y + dy); p(g, SM.O2, x + dx * 0.6, y + dy * 0.75 + 3); });
    }
    if (stage === 1) { p(g, SM.O, x - 1, y - 23, 3, 3); p(g, SM.LT, x, y - 22); }
    if (stage === 0) p(g, SM.HOLE, x - 2, y - 24, 4, 4);
  }

  /* =========================================================
     THE TENANT
     Lives in one of the game's existing green lockers (same art as the
     lockers room). Hiding in its locker = instant death (the one allowed
     cheap death), kept fair by tells: cracked door, eyes, flies, rattle.
     (x, y) = top-left of the locker tile, like the game's locker drawing.
     ========================================================= */
  const TN = { LB: "#2e3a36", LD: "#1c2422", LH: "#3e4c47", HN: "#6a6a60", GAP: "#050505", EY: "#e8e4dc", FL: "#0b0a09", TB: "#2a2826", TH: "#4a4744", TS: "#9a9487" };
  function tenantLocker(g, x, y, shake) {
    x += shake || 0;
    p(g, SH, x + 1, y + 22, 14, 2); p(g, TN.LB, x + 1, y, 14, 22); p(g, TN.LD, x + 1, y, 1, 22); p(g, TN.LH, x + 1, y, 14, 1);
    for (let i = 0; i < 3; i++) p(g, TN.LD, x + 4, y + 3 + i * 2, 8, 1);
    p(g, TN.HN, x + 12, y + 11, 1, 3); p(g, TN.LD, x + 1, y + 21, 14, 1);
  }
  function tenantFlies(g, x, y, f) {
    [[0, -3], [16, 2], [8, -5]].forEach(([dx, dy], k) => { const w = (f + k) % 2; p(g, TN.FL, x + dx + w, y + dy + ((f + k) % 3) - 1); });
  }
  // tells layered on a closed locker: 1 = cracked, 2 = + eyes, 3 = + fingers
  function tenantTells(g, x, y, level) {
    if (level >= 1) p(g, TN.GAP, x + 2, y + 1, 2, 20);
    if (level >= 2) { p(g, TN.EY, x + 2, y + 7); p(g, TN.EY, x + 3, y + 7); }
    if (level >= 3) { [10, 12, 14].forEach(r => { p(g, TN.TS, x + 4, y + r, 2, 1); p(g, "#060508", x + 6, y + r); }); }
  }
  function tenantOpenLocker(g, x, y) {
    p(g, SH, x + 1, y + 22, 14, 2); p(g, TN.LB, x + 1, y, 14, 22); p(g, TN.LH, x + 1, y, 14, 1); p(g, TN.GAP, x + 3, y + 2, 10, 19);
    p(g, TN.LB, x + 15, y, 3, 22); p(g, TN.LH, x + 15, y, 3, 1); p(g, TN.LD, x + 17, y, 1, 22);
  }
  // the figure bursting out; wide = arms spread for the lunge
  function tenantFigure(g, x, y, wide) {
    const cx = x + 8, r = wide ? 10 : 6;
    p(g, TN.TB, cx - 2, y + 5, 4, 12); p(g, TN.TH, cx - 2, y + 5, 1, 12); p(g, TN.TB, cx - 2, y + 17, 1, 5); p(g, TN.TB, cx + 1, y + 17, 1, 5);
    p(g, TN.TH, cx - 2, y + 1, 4, 4); p(g, TN.EY, cx - 1, y + 2); p(g, TN.EY, cx + 1, y + 2); p(g, "#060508", cx - 1, y + 4, 2, 1);
    p(g, TN.TB, cx - 2 - r, y + 7, r, 1); p(g, TN.TB, cx + 2, y + 7, r, 1); p(g, TN.TB, cx - 2 - r, y + 7, 1, 4); p(g, TN.TB, cx + 1 + r, y + 7, 1, 4);
    p(g, TN.TS, cx - 3 - r, y + 10, 1, 2); p(g, TN.TS, cx - 1 - r, y + 11, 1, 2); p(g, TN.TS, cx + r, y + 11, 1, 2); p(g, TN.TS, cx + 2 + r, y + 10, 1, 2);
  }

  /* =========================================================
     FIREDAMP
     Creeping mine gas with a faint hunched figure inside. Explodes near a
     bright lantern (instant death; also kills the Moth). Dim the lantern
     to pass. Warning = turns bright yellow-green and sparks.
     Stages: drift (GREEN), warn (BRIGHT + sparks), explode, dissolve.
     ========================================================= */
  const FD = {
    GREEN:  { d: "#2e3a1a", m: "#4a5a24", l: "#6a7a2e", fig: "#1e2414" },
    BRIGHT: { d: "#4a5a24", m: "#8aa030", l: "#b8c84a", fig: "#2e3a1a" },
    FIRE:   { d: "#a8401a", m: "#e8a94a", l: "#fff1c8" },
    SMOKE:  { d: "#141210", m: "#2a2622", l: "#3a3530" }
  };
  const FD_PUFFS = [[-9, -8, 6], [0, -12, 7], [9, -8, 6], [-6, -4, 5], [6, -4, 5], [0, -7, 7]];
  function firedampCloud(g, x, y, f, pal, dither, grow) {
    const P = typeof pal === "string" ? FD[pal] : pal, s = grow || 0;
    FD_PUFFS.forEach(([dx, dy, r], k) => puff(g, x + dx + Math.round(Math.sin(k + f)), y + dy, r + 1 + s, P.d, dither));
    FD_PUFFS.forEach(([dx, dy, r], k) => puff(g, x + dx + Math.round(Math.sin(k + f)), y + dy, r + s, P.m, dither));
    FD_PUFFS.slice(0, 3).forEach(([dx, dy, r], k) => puff(g, x + dx - 1 + Math.round(Math.sin(k + f)), y + dy - 2, Math.max(1, r - 4), P.l, dither));
  }
  function firedampFigure(g, x, y, f, bright) {
    const c = bright ? FD.BRIGHT.fig : FD.GREEN.fig, o = (f % 3) - 1;
    p(g, c, x - 1 + o, y - 15, 3, 3); p(g, c, x - 2 + o, y - 12, 4, 5); p(g, c, x + 2 + o, y - 11, 3, 1); p(g, c, x + 4 + o, y - 10, 1, 2);
    p(g, c, x - 4 + o, y - 10, 2, 1); p(g, c, x - 2 + o, y - 7, 1, 2); p(g, c, x + 1 + o, y - 7, 1, 2);
  }
  function firedampSparks(g, x, y, n, f) {
    for (let k = 0; k < n; k++) { const a = k * 1.3 + f * 0.7, r = 14 + (k % 4); p(g, k % 2 ? "#f2c35a" : "#e8a94a", x + Math.round(Math.cos(a) * r), y - 8 + Math.round(Math.sin(a) * r * 0.8)); }
  }
  // ready-made frames
  function firedampDrift(g, x, y, f) { firedampCloud(g, x, y, f, "GREEN"); firedampFigure(g, x, y, Math.round(f), false); }
  function firedampWarn(g, x, y, stage, f) { // stage 0..2
    if (stage === 0) { firedampCloud(g, x, y, f, "GREEN"); firedampFigure(g, x, y, f, false); firedampSparks(g, x, y, 3, f); }
    if (stage === 1) { firedampCloud(g, x, y, f, "BRIGHT"); firedampFigure(g, x, y, f, true); firedampSparks(g, x, y, 6, f); }
    if (stage === 2) { firedampCloud(g, x, y, f, "BRIGHT", 0, 1); firedampFigure(g, x, y, f, true); firedampSparks(g, x, y, 10, f); }
  }
  function firedampExplode(g, x, y, stage, f) { // stage 0..2
    if (stage === 0) { firedampCloud(g, x, y, 0, "BRIGHT"); puff(g, x, y - 8, 5, FD.FIRE.d); puff(g, x, y - 8, 3, FD.FIRE.m); puff(g, x, y - 8, 1, FD.FIRE.l); }
    if (stage === 1) { firedampCloud(g, x, y, 1, "FIRE", 0, 2); puff(g, x, y - 7, 4, FD.FIRE.l); firedampSparks(g, x, y, 12, f); }
    if (stage === 2) { firedampCloud(g, x, y, 2, "SMOKE", 0, 1); p(g, FD.FIRE.d, x - 4, y - 8); p(g, FD.FIRE.m, x + 2, y - 10); p(g, FD.FIRE.d, x + 5, y - 4); p(g, FD.FIRE.m, x - 6, y - 4); }
  }
  function firedampDissolve(g, x, y, stage) { // stage 0..2
    if (stage === 0) { firedampCloud(g, x, y, 0, "GREEN", 2); firedampFigure(g, x, y, 0, false); }
    if (stage === 1) firedampCloud(g, x, y, 1, "GREEN", 4);
    if (stage === 2) for (let k = 0; k < 6; k++) p(g, FD.GREEN.l, x - 8 + k * 3, y - 8 - (k % 3) * 4);
  }

  /* =========================================================
     THE TIMEKEEPER
     Ghost of the shift boss. Clock dial for a face, brass pocket watch.
     Appears if the player stays in one room too long. Catch = half sludge.
     Arms are see-through (ghost dither). Frames: down/up/right (0-2,
     left = mirror right), clockIn (0 raise, 1 spinning, 2 reach).
     ========================================================= */
  const TK = { CAP: "#2a2826", CAPH: "#3e3a36", RIM: "#9a7a3a", FACE: "#e8e4dc", HND: "#1a1814", WC: "#2c2420", SHT: "#8f8778", TR: "#2a2826", TRS: "#3a3632", SK: "#8a877f", K: "#060508", GD: "#c9a04a", BOOT: "#141210" };
  function tkHead(g, x, y, a) {
    p(g, TK.RIM, x - 3, y - 23, 6, 6); p(g, TK.FACE, x - 2, y - 22, 4, 4); p(g, TK.HND, x, y - 21, 1, 2);
    const d = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][((a % 8) + 8) % 8];
    p(g, TK.HND, x + d[0], y - 20 + d[1]); p(g, TK.K, x - 2, y - 19);
    p(g, TK.CAP, x - 4, y - 26, 8, 3); p(g, TK.CAPH, x - 3, y - 26, 5, 1); p(g, TK.CAP, x - 4, y - 24, 9, 1);
  }
  function timekeeperDown(g, x, y, f) {
    const l = f === 1 ? 2 : 0, r = f === 2 ? 2 : 0, sw = f === 1 ? 1 : f === 2 ? -1 : 0;
    p(g, SH, x - 5, y - 1, 10, 2);
    p(g, TK.TR, x - 3, y - 9, 2, 8 - l); p(g, TK.TRS, x - 2, y - 9, 1, 8 - l); p(g, TK.TR, x + 1, y - 9, 2, 8 - r); p(g, TK.TRS, x + 2, y - 9, 1, 8 - r);
    p(g, TK.BOOT, x - 3, y - 2 - l, 2, 1); p(g, TK.BOOT, x + 1, y - 2 - r, 2, 1);
    p(g, TK.WC, x - 3, y - 17, 6, 8); p(g, TK.SHT, x - 1, y - 17, 2, 2); p(g, TK.RIM, x, y - 14); p(g, TK.RIM, x, y - 12);
    ghost(g, TK.SK, x - 5, y - 17 + sw, 2, 8); ghost(g, TK.SK, x + 3, y - 17 - sw, 2, 8); p(g, TK.K, x - 5, y - 11 + sw, 1, 2); p(g, TK.K, x + 4, y - 12 - sw);
    p(g, TK.RIM, x + 4, y - 9 - sw, 1, 2); p(g, TK.GD, x + 3, y - 7 - sw, 3, 3); p(g, TK.FACE, x + 4, y - 6 - sw);
    tkHead(g, x, y, f * 2);
  }
  function timekeeperUp(g, x, y, f) {
    const l = f === 1 ? 2 : 0, r = f === 2 ? 2 : 0, sw = f === 1 ? 1 : f === 2 ? -1 : 0;
    p(g, SH, x - 5, y - 1, 10, 2);
    p(g, TK.TR, x - 3, y - 9, 2, 8 - l); p(g, TK.TR, x + 1, y - 9, 2, 8 - r); p(g, TK.BOOT, x - 3, y - 2 - l, 2, 1); p(g, TK.BOOT, x + 1, y - 2 - r, 2, 1);
    p(g, TK.WC, x - 3, y - 17, 6, 8); p(g, TK.CAPH, x - 1, y - 17, 2, 8);
    ghost(g, TK.SK, x - 5, y - 17 - sw, 2, 8); ghost(g, TK.SK, x + 3, y - 17 + sw, 2, 8); p(g, TK.K, x + 3, y - 11 + sw, 1, 2);
    p(g, TK.RIM, x - 3, y - 23, 6, 6); p(g, "#3a3632", x - 2, y - 22, 4, 4); p(g, TK.CAP, x - 4, y - 26, 8, 3); p(g, TK.CAPH, x - 3, y - 26, 5, 1);
    p(g, TK.GD, x - 6, y - 8 + sw, 3, 3); p(g, TK.RIM, x - 5, y - 10 + sw, 1, 2);
  }
  function timekeeperRight(g, x, y, f) {
    const st = [[0, 0], [3, -3], [-3, 3]][f];
    p(g, SH, x - 5, y - 1, 10, 2);
    p(g, TK.TR, x - 1 + st[1], y - 9, 2, 8); p(g, TK.BOOT, x - 1 + st[1], y - 2, 3, 1); p(g, TK.TRS, x - 1 + st[0], y - 9, 2, 8); p(g, TK.BOOT, x - 1 + st[0], y - 2, 3, 1);
    p(g, TK.WC, x - 2, y - 17, 4, 8); p(g, TK.SHT, x + 1, y - 17, 1, 2);
    ghost(g, TK.SK, x - 2 - (f === 1 ? 1 : 0), y - 16, 2, 7);
    p(g, TK.RIM, x - 2, y - 23, 5, 6); p(g, TK.FACE, x, y - 22, 2, 4); p(g, TK.HND, x + 1, y - 21, 1, 2); p(g, TK.K, x - 1, y - 19);
    p(g, TK.CAP, x - 3, y - 26, 6, 3); p(g, TK.CAPH, x - 2, y - 26, 3, 1); p(g, TK.CAP, x, y - 24, 4, 1);
    ghost(g, TK.SK, x + 2, y - 15, 4, 1); p(g, TK.SK, x + 5, y - 15, 1, 2); p(g, TK.RIM, x + 5, y - 13); p(g, TK.GD, x + 4, y - 12, 3, 3); p(g, TK.FACE, x + 5, y - 11);
  }
  function timekeeperClockIn(g, x, y, f) {
    p(g, SH, x - 5, y - 1, 10, 2);
    p(g, TK.TR, x - 3, y - 9, 2, 8); p(g, TK.TR, x + 1, y - 9, 2, 8); p(g, TK.BOOT, x - 3, y - 2, 2, 1); p(g, TK.BOOT, x + 1, y - 2, 2, 1);
    p(g, TK.WC, x - 3, y - 17, 6, 8); ghost(g, TK.SK, x - 5, y - 17, 2, 8); p(g, TK.K, x - 5, y - 11, 1, 2);
    if (f < 2) { ghost(g, TK.SK, x + 3, y - 19, 2, 5); p(g, TK.GD, x + 4, y - 23, 3, 3); p(g, TK.FACE, x + 5, y - 22); p(g, TK.RIM, x + 5, y - 20); }
    else {
      ghost(g, TK.SK, x + 3, y - 15, 6, 2); p(g, TK.SK, x + 8, y - 17, 2, 5); p(g, TK.SK, x + 10, y - 18, 1, 2);
      p(g, TK.SK, x + 10, y - 14, 1, 2); p(g, TK.SK, x + 10, y - 16); p(g, TK.K, x + 9, y - 13, 1, 2);
    }
    p(g, TK.RIM, x - 3, y - 23, 6, 6); p(g, TK.FACE, x - 2, y - 22, 4, 4);
    if (f === 1) { // hands spinning into a blur
      p(g, "#8f8778", x - 2, y - 22, 4, 1); p(g, "#8f8778", x - 2, y - 19, 4, 1); p(g, "#8f8778", x - 2, y - 21, 1, 2); p(g, "#8f8778", x + 1, y - 21, 1, 2);
      p(g, TK.HND, x, y - 21); p(g, TK.FACE, x - 6, y - 22); p(g, TK.FACE, x + 6, y - 24); p(g, TK.FACE, x - 5, y - 18);
    } else { p(g, TK.HND, x, y - 22, 1, 3); p(g, TK.HND, x + 1, y - 20); }
    p(g, TK.K, x - 2, y - 19); p(g, TK.CAP, x - 4, y - 26, 8, 3); p(g, TK.CAPH, x - 3, y - 26, 5, 1); p(g, TK.CAP, x - 4, y - 24, 9, 1);
  }

  /* ---------- left-facing helper ----------
     Draw any right-facing frame mirrored around x:
       mirrorX(g, x, () => roughneckRight(g, x, y, f));                    */
  function mirrorX(g, x, drawFn) { g.save(); g.translate(Math.round(x) * 2, 0); g.scale(-1, 1); drawFn(); g.restore(); }

  return {
    ROUGHNECK_VARIANTS, KNOCKER_VARIANTS,
    roughneckDown, roughneckRight, roughneckLunge,
    tarlingOoze, tarlingHide, tarlingAttack, tarlingBaby,
    knockerHidden, knockerBurst, knockerReach, knockerWalker,
    smother, smotherGlow,
    tenantLocker, tenantFlies, tenantTells, tenantOpenLocker, tenantFigure,
    firedampDrift, firedampWarn, firedampExplode, firedampDissolve,
    timekeeperDown, timekeeperUp, timekeeperRight, timekeeperClockIn,
    mirrorX
  };
})();
