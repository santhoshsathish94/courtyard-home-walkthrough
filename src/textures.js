// Procedural, tileable canvas textures and the shared material library.
// Everything is generated at load time, so the site has no image dependencies.
// Texture coordinates are in metres (see worldUV in build3d.js), so each texture
// is created with repeat = 1 / (tile size in metres).
import * as THREE from 'three';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Tileable fractal value noise as a Float32Array heightfield (N × N, 0..1).
function fbm(N, seed, cells = 4, octaves = 5, gain = 0.5) {
  const out = new Float32Array(N * N);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const P = cells << o, r = rng(seed + o * 7919), g = new Float32Array(P * P);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * P, y0 = Math.floor(fy), ty = fy - y0, v = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % P) * P, r1 = ((y0 + 1) % P) * P;
      for (let x = 0; x < N; x++) {
        const fxp = (x / N) * P, x0 = Math.floor(fxp), tx = fxp - x0, u = tx * tx * (3 - 2 * tx);
        const c0 = x0 % P, c1 = (x0 + 1) % P;
        const a = g[r0 + c0], b = g[r0 + c1], c = g[r1 + c0], d = g[r1 + c1];
        out[y * N + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function paint(N, fn) {
  const c = canvas(N), ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [r, g, b, a = 255] = fn(x, y, y * N + x), i = (y * N + x) * 4;
    img.data[i] = clamp255(r); img.data[i + 1] = clamp255(g); img.data[i + 2] = clamp255(b); img.data[i + 3] = clamp255(a);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function normalFrom(h, N, strength) {
  return paint(N, (x, y) => {
    const l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)];
    const u = h[((y - 1 + N) % N) * N + x], d = h[((y + 1) % N) * N + x];
    const nx = (l - r) * strength, ny = (d - u) * strength, len = Math.hypot(nx, ny, 1);
    return [(nx / len * 0.5 + 0.5) * 255, (ny / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
  });
}
function tex(c, tile, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// ------------------------------------------------------------- surfaces ----
function limePlaster(N, seed, base = 0xefe7d8, amp = 1) {
  const n = fbm(N, seed, 3, 6, 0.55), m = fbm(N, seed + 11, 12, 3, 0.5);
  const [r, g, b] = hex(base);
  const col = paint(N, (x, y, i) => { const k = 1 - 0.1 * amp + (n[i] * 0.14 - m[i] * 0.05) * amp; return [r * k, g * k, b * (k - 0.01 * amp)]; });
  const h = new Float32Array(N * N);
  for (let i = 0; i < h.length; i++) h[i] = n[i] * 0.6 + m[i] * 0.4;
  return { map: col, normal: normalFrom(h, N, 2.2 * amp) };
}
// Board-formed concrete: horizontal plank bands, fine grain and form-tie holes.
function concreteBoard(N, seed) {
  const n = fbm(N, seed, 4, 6, 0.55), g = fbm(N, seed + 5, 64, 2, 0.5), r = rng(seed), bands = 8, tone = [];
  for (let k = 0; k < bands; k++) tone.push(0.94 + r() * 0.1);
  const col = paint(N, (x, y, i) => {
    const band = Math.floor((y / N) * bands), edge = ((y / N) * bands) % 1;
    const k = tone[band] * (0.9 + n[i] * 0.16 + (g[i] - 0.5) * 0.08) * (edge < 0.03 ? 0.86 : 1);
    return [168 * k, 165 * k, 158 * k];
  });
  const ctx = col.getContext('2d');
  ctx.fillStyle = 'rgba(60,58,54,0.55)';
  for (let k = 0; k < bands; k += 2) for (const fx of [0.25, 0.75]) { ctx.beginPath(); ctx.arc(fx * N, ((k + 0.5) / bands) * N, N / 180, 0, Math.PI * 2); ctx.fill(); }
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const e = ((y / N) * bands) % 1; h[y * N + x] = (e < 0.03 ? 0 : 0.6) + n[y * N + x] * 0.4; }
  return { map: col, normal: normalFrom(h, N, 2.5) };
}
// Large honed stone slabs (600 mm) with hairline joints.
function stoneSlabs(N, seed, base, perSide = 2) {
  const s = stone(N, seed, base, base - 0x101010, { veins: 0.08, grain: 0.12, cells: 4 }), c = s.map, x = c.getContext('2d'), t = N / perSide, r = rng(seed);
  for (let j = 0; j < perSide; j++) for (let i = 0; i < perSide; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.03})`; x.fillRect(i * t, j * t, t, t); }
  x.strokeStyle = 'rgba(60,58,52,0.45)'; x.lineWidth = Math.max(1, N / 600);
  for (let k = 0; k <= perSide; k++) { x.beginPath(); x.moveTo(k * t, 0); x.lineTo(k * t, N); x.stroke(); x.beginPath(); x.moveTo(0, k * t); x.lineTo(N, k * t); x.stroke(); }
  return c;
}
// Terrazzo: a calm ground with marble and terracotta chips.
function terrazzo(N, seed, base, chips) {
  const n = fbm(N, seed, 3, 4, 0.5), [r, g, b] = hex(base);
  const c = paint(N, (x, y, i) => { const k = 0.96 + n[i] * 0.06; return [r * k, g * k, b * k]; });
  const x = c.getContext('2d'), rr = rng(seed + 1);
  for (let i = 0; i < N * N * 0.004; i++) {
    x.fillStyle = chips[Math.floor(rr() * chips.length)];
    const cx = rr() * N, cy = rr() * N, s = (0.6 + rr() * 2.2) * (N / 512);
    x.beginPath(); x.ellipse(cx, cy, s * (1 + rr()), s, rr() * Math.PI, 0, Math.PI * 2); x.fill();
  }
  return c;
}
function redOxide(N, seed) {
  const n = fbm(N, seed, 2, 6, 0.6), s = fbm(N, seed + 3, 24, 2, 0.5);
  const col = paint(N, (x, y, i) => { const k = 0.82 + n[i] * 0.3 + s[i] * 0.05; return [128 * k, 40 * k, 30 * k]; });
  const rough = paint(N, (x, y, i) => { const v = 70 + n[i] * 60; return [v, v, v]; });
  return { map: col, rough };
}
// Athangudi handmade tiles (200 mm): a cream ground with oxide-red and green petals,
// ochre centres and red corner roundels that join into circles across four tiles.
function athangudi(N, seed) {
  const c = canvas(N), x = c.getContext('2d'), t = N / 4, r = rng(seed);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i + j) % 2 ? '#e4d3ae' : '#e9dbba'; x.fillRect(i * t, j * t, t, t); }
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) { x.fillStyle = '#8a3324'; x.beginPath(); x.arc(i * t, j * t, t * 0.14, 0, Math.PI * 2); x.fill(); }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = i * t + t / 2, cy = j * t + t / 2, alt = (i + j) % 2;
    x.fillStyle = alt ? '#8a3324' : '#3c6457';
    for (let k = 0; k < 4; k++) {
      x.save(); x.translate(cx, cy); x.rotate((k * Math.PI) / 2 + (alt ? Math.PI / 4 : 0));
      x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(t * 0.16, -t * 0.2, 0, -t * 0.36); x.quadraticCurveTo(-t * 0.16, -t * 0.2, 0, 0); x.fill();
      x.restore();
    }
    x.fillStyle = '#c99634'; x.beginPath(); x.arc(cx, cy, t * 0.075, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 0.05 + r() * 0.05; x.fillStyle = '#3a2416'; x.fillRect(i * t, j * t, t, t); x.globalAlpha = 1;
  }
  x.strokeStyle = 'rgba(70,50,35,0.45)'; x.lineWidth = Math.max(1, N / 400);
  for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * t, 0); x.lineTo(k * t, N); x.stroke(); x.beginPath(); x.moveTo(0, k * t); x.lineTo(N, k * t); x.stroke(); }
  const n = fbm(N, seed + 5, 6, 4, 0.5), img = x.getImageData(0, 0, N, N);
  for (let i = 0; i < N * N; i++) { const k = 0.92 + n[i] * 0.14; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
  x.putImageData(img, 0, 0);
  return c;
}
function stone(N, seed, base, vein, { grain = 0.25, veins = 0.35, cells = 3 } = {}) {
  const n = fbm(N, seed, cells, 6, 0.55), g = fbm(N, seed + 9, 48, 2, 0.5), v = fbm(N, seed + 4, 2, 5, 0.6);
  const [r, gg, b] = hex(base), [vr, vg, vb] = hex(vein);
  const col = paint(N, (x, y, i) => {
    const line = Math.pow(1 - Math.abs(Math.sin((v[i] * 9 + x / N * 2) * Math.PI)), 12) * veins;
    const k = 0.86 + n[i] * 0.24 + (g[i] - 0.5) * grain;
    return [mix(r * k, vr, line), mix(gg * k, vg, line), mix(b * k, vb, line)];
  });
  return { map: col, h: n };
}
function granite(N, seed, base = 0x6e6a66) {
  const r = rng(seed), n = fbm(N, seed, 6, 4, 0.5);
  const c = paint(N, (x, y, i) => { const k = 0.85 + n[i] * 0.3; const [a, b, d] = hex(base); return [a * k, b * k, d * k]; });
  const ctx = c.getContext('2d');
  for (let i = 0; i < N * N * 0.03; i++) {
    const v = r();
    ctx.fillStyle = v < 0.45 ? 'rgba(25,22,22,0.5)' : v < 0.8 ? 'rgba(230,226,220,0.45)' : 'rgba(150,105,90,0.45)';
    const s = 1 + r() * (N / 256) * 1.1;
    ctx.fillRect(r() * N, r() * N, s, s);
  }
  return c;
}
// Square tiles with grout and per-tile colour variation (terracotta pavers etc.).
function tiles(N, seed, perSide, base, { grout = '#8a7a6a', vary = 0.12, groutW = 0.035 } = {}) {
  const c = canvas(N), x = c.getContext('2d'), t = N / perSide, r = rng(seed), [br, bg, bb] = hex(base);
  x.fillStyle = grout; x.fillRect(0, 0, N, N);
  const gw = Math.max(1, t * groutW);
  for (let j = 0; j < perSide; j++) for (let i = 0; i < perSide; i++) {
    const k = 1 - vary / 2 + r() * vary, w = r() * 0.06;
    x.fillStyle = `rgb(${br * k + w * 30},${bg * k},${bb * k - w * 10})`;
    x.fillRect(i * t + gw / 2, j * t + gw / 2, t - gw, t - gw);
  }
  const n = fbm(N, seed + 1, 8, 4, 0.5), ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, N, N);
  for (let i = 0; i < N * N; i++) { const k = 0.88 + n[i] * 0.22; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
  ctx.putImageData(img, 0, 0);
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const fx = (xx % t) / t, fy = (y % t) / t, e = Math.min(fx, 1 - fx, fy, 1 - fy);
    h[y * N + xx] = Math.min(1, e / groutW) * 0.8 + n[y * N + xx] * 0.2;
  }
  return { map: c, normal: normalFrom(h, N, 3.5) };
}
// Coursed random rubble with lime pointing (compound wall).
function rubble(N, seed) {
  const c = canvas(N), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#cfc5b2'; x.fillRect(0, 0, N, N);
  const h = new Float32Array(N * N);
  const rows = 6, rh = N / rows;
  for (let j = 0; j < rows; j++) {
    let cx = -r() * rh;
    while (cx < N) {
      const w = rh * (0.8 + r() * 1.3), y0 = j * rh + r() * rh * 0.12, hh = rh * (0.78 + r() * 0.18);
      const tone = 95 + r() * 70, warm = r() * 25;
      for (const off of [-N, 0, N]) {
        x.fillStyle = `rgb(${tone + warm},${tone + warm * 0.6},${tone - 5})`;
        x.beginPath();
        const rx = cx + off + 3, ry = y0 + 3, rw = w - 6, rhh = hh - 6, k = Math.min(rw, rhh) * 0.3;
        x.moveTo(rx + k, ry); x.lineTo(rx + rw - k, ry); x.quadraticCurveTo(rx + rw, ry, rx + rw, ry + k);
        x.lineTo(rx + rw, ry + rhh - k); x.quadraticCurveTo(rx + rw, ry + rhh, rx + rw - k, ry + rhh);
        x.lineTo(rx + k, ry + rhh); x.quadraticCurveTo(rx, ry + rhh, rx, ry + rhh - k); x.lineTo(rx, ry + k); x.quadraticCurveTo(rx, ry, rx + k, ry);
        x.fill();
      }
      cx += w;
    }
  }
  const n = fbm(N, seed + 2, 10, 4, 0.55), ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, N, N);
  for (let i = 0; i < N * N; i++) {
    const lum = img.data[i * 4] / 255;
    h[i] = (lum > 0.78 ? 0 : 0.7) + n[i] * 0.3;
    const k = 0.85 + n[i] * 0.3;
    img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return { map: c, normal: normalFrom(h, N, 4) };
}
function wood(N, seed, base = 0x6b4126, { dark = 0.55, rings = 22 } = {}) {
  const n = fbm(N, seed, 4, 5, 0.55), f = fbm(N, seed + 3, 32, 2, 0.5), [r, g, b] = hex(base);
  return paint(N, (x, y, i) => {
    const t = Math.sin((y / N) * rings * Math.PI * 2 + n[i] * 9) * 0.5 + 0.5;
    const k = 1 - (1 - dark) * Math.pow(t, 3) * 0.6 + (f[i] - 0.5) * 0.12;
    return [r * k, g * k, b * k];
  });
}
// Jaali: perforated screens. Alpha marks the holes.
// Modern brick jaali: hit-and-miss terracotta bricks in staggered courses.
function jaaliTerracotta(N) {
  const c = canvas(N), x = c.getContext('2d'), rows = 6, rh = N / rows, L = N / 3, gap = N / 6, r = rng(7);
  for (let j = 0; j < rows; j++) {
    const off = j % 2 ? (L + gap) / 2 : 0;
    for (let k = -1; k < 3; k++) {
      const x0 = k * (L + gap) + off, tone = 0.9 + r() * 0.18;
      x.fillStyle = `rgb(${178 * tone},${92 * tone},${58 * tone})`;
      x.fillRect(x0 + 1, j * rh + 1, L - 2, rh - 2);
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(x0 + 1, j * rh + rh - 3, L - 2, 2);
    }
  }
  return c;
}
// Vertical timber slats (stair screen, transoms, pooja doors).
function jaaliTimber(N) {
  const c = canvas(N), x = c.getContext('2d'), n = 6, p = N / n;
  for (let i = 0; i < n; i++) {
    const g = x.createLinearGradient(i * p, 0, i * p + p * 0.62, 0);
    g.addColorStop(0, '#7a5434'); g.addColorStop(0.5, '#8e6540'); g.addColorStop(1, '#6a4729');
    x.fillStyle = g; x.fillRect(i * p, 0, p * 0.62, N);
  }
  return c;
}
function grassTex(N, seed) {
  const n = fbm(N, seed, 4, 6, 0.55), r = rng(seed);
  const c = paint(N, (x, y, i) => { const k = 0.72 + n[i] * 0.5, dry = Math.max(0, n[i] - 0.55) * 1.6; return [(78 + dry * 60) * k, (96 + dry * 25) * k, (46 + dry * 10) * k]; });
  const ctx = c.getContext('2d');
  for (let i = 0; i < N * 6; i++) {
    const px = r() * N, py = r() * N, l = 2 + r() * (N / 90);
    ctx.strokeStyle = r() < 0.5 ? 'rgba(120,160,70,0.5)' : 'rgba(30,55,22,0.45)';
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (r() - 0.5) * 2, py - l); ctx.stroke();
  }
  return c;
}
function soilTex(N, seed) {
  const n = fbm(N, seed, 6, 5, 0.6), r = rng(seed + 1);
  const c = paint(N, (x, y, i) => { const k = 0.7 + n[i] * 0.5; return [92 * k, 66 * k, 46 * k]; });
  const ctx = c.getContext('2d');
  for (let i = 0; i < N * 3; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(160,130,95,0.5)' : 'rgba(40,28,20,0.5)'; const s = 1 + r() * 2; ctx.fillRect(r() * N, r() * N, s, s); }
  return c;
}
function gravelTex(N, seed) {
  const r = rng(seed), c = canvas(N), x = c.getContext('2d');
  x.fillStyle = '#8f877a'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < N * N * 0.012; i++) {
    const v = 120 + r() * 100, s = 1.5 + r() * (N / 128);
    x.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
    x.beginPath(); x.ellipse(r() * N, r() * N, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2); x.fill();
  }
  return c;
}
function asphaltTex(N, seed) {
  const n = fbm(N, seed, 8, 5, 0.6), r = rng(seed);
  const c = paint(N, (x, y, i) => { const k = 0.8 + n[i] * 0.35; return [58 * k, 58 * k, 60 * k]; });
  const ctx = c.getContext('2d');
  for (let i = 0; i < N * N * 0.01; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(140,140,140,0.5)' : 'rgba(20,20,20,0.5)'; ctx.fillRect(r() * N, r() * N, 1.2, 1.2); }
  return c;
}
function fabricStripes(N, colors, seed) {
  const c = canvas(N), x = c.getContext('2d'), r = rng(seed);
  let y = 0;
  while (y < N) { const h = N / 24 + r() * N / 10; x.fillStyle = colors[Math.floor(r() * colors.length)]; x.fillRect(0, y, N, h); y += h; }
  x.globalAlpha = 0.12;
  for (let i = 0; i < N; i += 2) { x.fillStyle = i % 4 ? '#000' : '#fff'; x.fillRect(i, 0, 1, N); }
  x.globalAlpha = 1;
  return c;
}
function caneTex(N) {
  const c = canvas(N), x = c.getContext('2d');
  x.fillStyle = '#c9a56a'; x.fillRect(0, 0, N, N);
  x.strokeStyle = '#8a6a3a'; x.lineWidth = N / 64;
  const k = N / 8;
  for (let i = -8; i < 16; i++) { x.beginPath(); x.moveTo(i * k, 0); x.lineTo(i * k + N, N); x.stroke(); x.beginPath(); x.moveTo(i * k + N, 0); x.lineTo(i * k, N); x.stroke(); }
  x.fillStyle = '#e2c48c';
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(i * k + k / 2, j * k + k / 2, k * 0.18, 0, Math.PI * 2); x.fill(); }
  return c;
}
function solarTex(N) {
  const c = canvas(N), x = c.getContext('2d');
  x.fillStyle = '#c8ccd2'; x.fillRect(0, 0, N, N);
  const cells = 6, k = N / cells;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const g = x.createLinearGradient(i * k, j * k, (i + 1) * k, (j + 1) * k);
    g.addColorStop(0, '#1b2a4a'); g.addColorStop(1, '#0d1830');
    x.fillStyle = g; x.fillRect(i * k + 2, j * k + 2, k - 4, k - 4);
    x.strokeStyle = 'rgba(160,170,190,0.35)'; x.lineWidth = 1;
    for (let b = 1; b < 4; b++) { x.beginPath(); x.moveTo(i * k + 2, j * k + (b * k) / 4); x.lineTo((i + 1) * k - 2, j * k + (b * k) / 4); x.stroke(); }
  }
  return c;
}
// Leaf cards (alpha): clusters of leaves drawn on transparent canvases.
function leafCard(N, seed, { color = [58, 105, 40], leaf = 'broad', count = 26 } = {}) {
  const c = canvas(N), x = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < count; i++) {
    const cx = N * (0.18 + r() * 0.64), cy = N * (0.18 + r() * 0.64), a = r() * Math.PI * 2;
    const L = N * (leaf === 'broad' ? 0.16 + r() * 0.1 : 0.08 + r() * 0.05), W = L * (leaf === 'broad' ? 0.42 : 0.5);
    const k = 0.75 + r() * 0.5;
    x.save(); x.translate(cx, cy); x.rotate(a);
    x.fillStyle = `rgb(${color[0] * k},${color[1] * k},${color[2] * k})`;
    x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(W, L * 0.5, 0, L); x.quadraticCurveTo(-W, L * 0.5, 0, 0); x.fill();
    x.strokeStyle = `rgba(30,45,20,0.5)`; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, L); x.stroke();
    x.restore();
  }
  return c;
}
function flowerCard(N, seed) {
  const c = leafCard(N, seed, { color: [50, 98, 42], count: 22 }), x = c.getContext('2d'), r = rng(seed + 3);
  for (let i = 0; i < 9; i++) {
    const cx = N * (0.2 + r() * 0.6), cy = N * (0.2 + r() * 0.6), s = N * 0.035;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + r() * 0.2;
      x.fillStyle = '#fbf6ea'; x.beginPath(); x.ellipse(cx + Math.cos(a) * s, cy + Math.sin(a) * s, s * 0.95, s * 0.55, a, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = '#f2c14e'; x.beginPath(); x.arc(cx, cy, s * 0.55, 0, Math.PI * 2); x.fill();
  }
  return c;
}
function frondCard(N) {
  const c = canvas(N, N / 4), x = c.getContext('2d'), H = N / 4;
  x.strokeStyle = '#6b6a35'; x.lineWidth = H * 0.05; x.beginPath(); x.moveTo(0, H / 2); x.lineTo(N, H / 2); x.stroke();
  for (let i = 4; i < N; i += N / 48) {
    const t = i / N, len = H * 0.48 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 2;
    x.strokeStyle = `rgb(${70 + t * 30},${110 + t * 10},${38})`; x.lineWidth = Math.max(1.5, H * 0.035);
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(i, H / 2); x.lineTo(i + len * 0.5, H / 2 + s * len); x.stroke(); }
  }
  return c;
}
function barkTex(N, seed) {
  const n = fbm(N, seed, 4, 5, 0.6);
  return paint(N, (x, y, i) => { const ring = Math.pow(Math.abs(Math.sin((y / N) * Math.PI * 10)), 6) * 0.35; const k = 0.75 + n[i] * 0.4 - ring; return [118 * k, 100 * k, 82 * k]; });
}
function kolamTex(N) {
  const c = canvas(N), x = c.getContext('2d');
  x.fillStyle = '#9c3b25'; x.fillRect(0, 0, N, N);
  x.strokeStyle = '#f4ead8'; x.lineWidth = N / 80; x.fillStyle = '#f4ead8';
  const k = N / 4;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = i * k + k / 2, cy = j * k + k / 2;
    x.beginPath(); x.arc(cx, cy, k * 0.08, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(cx, cy, k * 0.32, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(cx - k / 2, cy); x.quadraticCurveTo(cx, cy - k * 0.6, cx + k / 2, cy); x.stroke();
  }
  return c;
}
function booksTex(N, seed) {
  const c = canvas(N), x = c.getContext('2d'), r = rng(seed);
  const cols = ['#7a2b22', '#2f4f6f', '#3e5e3a', '#b98a3e', '#5b3a5e', '#d8cbb0', '#1f2a33', '#8c4a2f'];
  const rows = 4, rh = N / rows;
  x.fillStyle = '#3b2616'; x.fillRect(0, 0, N, N);
  for (let j = 0; j < rows; j++) {
    let cx = 2;
    while (cx < N - 4) {
      const w = N / 64 + r() * N / 40, h = rh * (0.62 + r() * 0.3);
      x.fillStyle = cols[Math.floor(r() * cols.length)]; x.fillRect(cx, j * rh + rh - h - 3, w - 1, h);
      x.fillStyle = 'rgba(255,240,200,0.35)'; x.fillRect(cx, j * rh + rh - h * 0.75, w - 1, 2);
      cx += w;
    }
    x.fillStyle = '#4a301c'; x.fillRect(0, j * rh + rh - 3, N, 3);
  }
  return c;
}
function gratingTex(N) {
  const c = canvas(N), x = c.getContext('2d');
  x.fillStyle = '#2b2a28'; x.fillRect(0, 0, N, N);
  x.globalCompositeOperation = 'destination-out';
  const k = N / 8;
  for (let i = 0; i < 8; i++) x.fillRect(i * k + k * 0.28, N * 0.06, k * 0.44, N * 0.88);
  return c;
}
function idolTex(N) {
  const c = canvas(N), x = c.getContext('2d');
  const g = x.createRadialGradient(N / 2, N * 0.4, N * 0.05, N / 2, N / 2, N * 0.6);
  g.addColorStop(0, '#f6d77a'); g.addColorStop(1, '#8a5a1c');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return c;
}

// --------------------------------------------------------- material set ----
export function makeMaterials(renderer, quality = 'high') {
  const N = quality === 'high' ? 512 : 256, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const T = (c, tile, o = {}) => tex(c, tile, { aniso, ...o });
  const std = (o) => new THREE.MeshStandardMaterial(o);

  const lime = limePlaster(N, 11, 0xf3f0ea, 0.55), limeOut = limePlaster(N, 23, 0xf0ece4, 0.7), kaavi = limePlaster(N, 31, 0xa04a2e);
  const ox = redOxide(N, 41), kota = stone(N, 51, 0x7d8478, 0x5b6158, { veins: 0.15 }), kadappa = stone(N, 61, 0x2a2b2b, 0x3d3f40, { veins: 0.2, grain: 0.1 });
  const terr = tiles(N, 71, 4, 0xb15f39, { grout: '#7e5a44', vary: 0.18 }), bath = tiles(N, 81, 4, 0xdcd9d2, { grout: '#b9b5ac', vary: 0.03, groutW: 0.012 });
  const rub = rubble(N, 91), board = concreteBoard(N, 97);

  const M = {
    lime: std({ map: T(lime.map, 2.4), normalMap: T(lime.normal, 2.4, { srgb: false }), normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.93, envMapIntensity: 0.55 }),
    limeExt: std({ map: T(limeOut.map, 3), normalMap: T(limeOut.normal, 3, { srgb: false }), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95 }),
    kaavi: std({ map: T(kaavi.map, 2.4), normalMap: T(kaavi.normal, 2.4, { srgb: false }), normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.85 }),
    redOxide: std({ map: T(ox.map, 3), roughnessMap: T(ox.rough, 3, { srgb: false }), roughness: 0.55, envMapIntensity: 0.8 }),
    athangudi: std({ map: T(athangudi(N, 101), 0.8), roughness: 0.32, envMapIntensity: 0.75 }),
    kota: std({ map: T(kota.map, 1.6), roughness: 0.6, envMapIntensity: 0.6 }),
    kadappa: std({ map: T(kadappa.map, 1.2), roughness: 0.22, envMapIntensity: 0.9 }),
    granite: std({ map: T(granite(N, 111), 0.9), roughness: 0.38, envMapIntensity: 0.8 }),
    graniteBlack: std({ map: T(granite(N, 112, 0x262422), 0.9), roughness: 0.2, envMapIntensity: 1.0 }),
    terracotta: std({ map: T(terr.map, 1.2), normalMap: T(terr.normal, 1.2, { srgb: false }), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.88 }),
    bathTile: std({ map: T(bath.map, 1.2), normalMap: T(bath.normal, 1.2, { srgb: false }), normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.4 }),
    clayTile: std({ color: 0xa24a2c, roughness: 0.78 }),
    rubble: std({ map: T(rub.map, 1.6), normalMap: T(rub.normal, 1.6, { srgb: false }), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.96 }),
    teak: std({ map: T(wood(N, 121, 0x7a4a2a), 1.4), roughness: 0.55, envMapIntensity: 0.6 }),
    teakDark: std({ map: T(wood(N, 131, 0x4e2f1b, { dark: 0.45 }), 1.4), roughness: 0.6, envMapIntensity: 0.5 }),
    concrete: std({ color: 0xbdbcb7, roughness: 0.9 }),
    brass: std({ color: 0xc9a14a, metalness: 1.0, roughness: 0.28 }),
    copper: std({ color: 0xb4683d, metalness: 1.0, roughness: 0.35 }),
    steel: std({ color: 0xb8bcc0, metalness: 0.95, roughness: 0.32 }),
    iron: std({ color: 0x2c2b29, metalness: 0.6, roughness: 0.55 }),
    porcelain: std({ color: 0xf4f2ee, roughness: 0.18, envMapIntensity: 0.9 }),
    white: std({ color: 0xf1efe9, roughness: 0.5 }),
    mattress: std({ color: 0xf3efe6, roughness: 0.95 }),
    fabricRed: std({ map: T(fabricStripes(256, ['#8e2a22', '#b5442e', '#d9a441', '#6e1d18'], 7), 0.9), roughness: 0.95 }),
    fabricGreen: std({ map: T(fabricStripes(256, ['#2f5d50', '#3f7a5a', '#d9c38f', '#1d3b33'], 9), 0.9), roughness: 0.95 }),
    fabricIndigo: std({ map: T(fabricStripes(256, ['#2b3a67', '#3e5591', '#e0d7c3', '#a33a2a'], 13), 0.9), roughness: 0.95 }),
    cushion: std({ color: 0xc9902f, roughness: 0.9 }),
    cane: std({ map: T(caneTex(128), 0.25), roughness: 0.8 }),
    grass: std({ map: T(grassTex(N, 141), 2.0), roughness: 1.0, envMapIntensity: 0.4 }),
    soil: std({ map: T(soilTex(N, 151), 1.5), roughness: 1.0, envMapIntensity: 0.3 }),
    gravel: std({ map: T(gravelTex(N, 161), 1.2), roughness: 0.95 }),
    asphalt: std({ map: T(asphaltTex(N, 171), 3), roughness: 0.9 }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x1f3d3a, roughness: 0.04, metalness: 0.0, transmission: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }),
    solar: std({ map: T(solarTex(256), 1.0), roughness: 0.2, metalness: 0.35, envMapIntensity: 1.1 }),
    jaaliClay: std({ map: T(jaaliTerracotta(256), 0.4), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),
    jaaliTeak: std({ map: T(jaaliTimber(256), 0.3), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
    grating: std({ map: T(gratingTex(128), 0.24), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }),
    leaf: std({ map: tex(leafCard(256, 181), 1, { aniso }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
    leafDark: std({ map: tex(leafCard(256, 191, { color: [40, 82, 34], leaf: 'small', count: 60 }), 1, { aniso }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    tulsi: std({ map: tex(leafCard(256, 197, { color: [64, 100, 46], leaf: 'small', count: 80 }), 1, { aniso }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    frangipani: std({ map: tex(flowerCard(256, 201), 1, { aniso }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
    frond: std({ map: tex(frondCard(512), 1, { aniso }), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }),
    bark: std({ map: T(barkTex(256, 211), 1.0), roughness: 0.95 }),
    trunk: std({ color: 0x6d5a45, roughness: 0.95 }),
    barkSmooth: std({ color: 0x8c8172, roughness: 0.9 }),
    kolam: std({ map: T(kolamTex(256), 0.5), roughness: 0.85 }),
    books: std({ map: tex(booksTex(512, 221), 1, { aniso }), roughness: 0.8 }),
    idol: std({ map: tex(idolTex(64), 1), metalness: 0.9, roughness: 0.3, color: 0xffe2a0 }),
    marigold: std({ color: 0xf08a1c, roughness: 0.8 }),
    jasmine: std({ color: 0xfbf7ec, roughness: 0.8 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc35a }),
    rubber: std({ color: 0x1b1b1b, roughness: 0.85 }),
    paintRed: std({ color: 0x9b2c22, roughness: 0.45, metalness: 0.2 }),
    mirror: std({ color: 0xdfe5e8, metalness: 1.0, roughness: 0.04 }),
    glassDark: std({ color: 0x15181a, roughness: 0.1, metalness: 0.4 }),
    // ---- modern palette (cycle 3): crisp lime white, board-formed concrete, honed stone,
    // terrazzo, light timber, dark aluminium and clear glass.
    concreteBoard: std({ map: T(board.map, 1.6), normalMap: T(board.normal, 1.6, { srgb: false }), normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.88 }),
    kotaSlab: std({ map: T(stoneSlabs(N, 53, 0xd4cbbb), 1.2), roughness: 0.42, envMapIntensity: 0.7 }),
    terrazzoWarm: std({ map: T(terrazzo(N, 57, 0xd9cdb8, ['#f4efe6', '#b9ab95', '#8f7f6a', '#b06a48', '#3e3a35']), 0.8), roughness: 0.38, envMapIntensity: 0.75 }),
    oak: std({ map: T(wood(N, 141, 0xb08458, { dark: 0.75, rings: 30 }), 1.2), roughness: 0.5, envMapIntensity: 0.6 }),
    frameDark: std({ color: 0x2d2a26, metalness: 0.55, roughness: 0.42 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xd8e8ea, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide }),
    cabinet: std({ color: 0xe8e2d6, roughness: 0.68 }),
    cabinetSage: std({ color: 0x7f8c79, roughness: 0.7 }),
    quartz: std({ color: 0xf1eee8, roughness: 0.22, envMapIntensity: 0.9 }),
    fabricGrey: std({ color: 0x8e8a82, roughness: 0.96 }),
    fabricLinen: std({ color: 0xe2d9c8, roughness: 0.96 }),
    fabricSage: std({ color: 0x8c9a83, roughness: 0.95 }),
    fabricRust: std({ color: 0xa65a3a, roughness: 0.95 }),
  };
  return M;
}
