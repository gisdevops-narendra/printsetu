/**
 * Pixel-level image operations (upscale, plain-background removal, red-eye,
 * spot healing, perspective correction).
 *
 * Each op is described by a small serialisable `PixelOp`, and the editor
 * re-derives the current bitmap by replaying the op list over the original
 * image. That keeps undo/redo and saved edit versions tiny (just the list)
 * and lossless — nothing is ever baked into the source pixels.
 */

export type PixelOp =
  | { t: 'upscale'; k: number }
  | { t: 'bg'; tol: number; color: string }
  | { t: 'redeye'; x: number; y: number; r: number }
  | { t: 'spot'; x: number; y: number; r: number }
  /** Corner quad TL,TR,BR,BL as normalised [x0,y0,x1,y1,x2,y2,x3,y3]. */
  | { t: 'persp'; q: number[] };

const MAX_SIDE = 8000;
const MAX_PIXELS = 48_000_000;
const PERSPECTIVE_MAX_SIDE = 5000;

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function sizeOf(src: CanvasImageSource): { w: number; h: number } {
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  const s = src as { width: number; height: number };
  return { w: s.width, h: s.height };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function cloneCanvas(src: CanvasImageSource): HTMLCanvasElement {
  const { w, h } = sizeOf(src);
  const c = makeCanvas(w, h);
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/** Largest whole-number upscale (max 4x) that stays inside the pixel budget. */
export function maxUpscale(w: number, h: number): number {
  let k = 4;
  while (k > 1 && (w * k > MAX_SIDE || h * k > MAX_SIDE || w * k * h * k > MAX_PIXELS)) k--;
  return k;
}

export async function applyOp(src: CanvasImageSource, op: PixelOp): Promise<HTMLCanvasElement> {
  await nextFrame(); // let the "processing" state paint before the sync loops
  switch (op.t) {
    case 'upscale':
      return upscale(src, op.k);
    case 'bg':
      return removeBackground(src, op.tol, op.color);
    case 'redeye':
      return redEye(src, op);
    case 'spot':
      return spotHeal(src, op);
    case 'persp':
      return warpPerspective(src, op.q);
  }
}

// ---------- Upscale ----------

function upscale(src: CanvasImageSource, factor: number): HTMLCanvasElement {
  const { w, h } = sizeOf(src);
  const k = Math.min(factor, maxUpscale(w, h));
  if (k <= 1) return cloneCanvas(src);
  const targetW = Math.round(w * k);
  const targetH = Math.round(h * k);
  let current: CanvasImageSource = src;
  let cw = w;
  let ch = h;
  // Step by at most 2x so the browser's high-quality filter keeps detail.
  while (cw < targetW || ch < targetH) {
    const nw = Math.min(targetW, Math.round(cw * 2));
    const nh = Math.min(targetH, Math.round(ch * 2));
    const c = makeCanvas(nw, nh);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, nw, nh);
    current = c;
    cw = nw;
    ch = nh;
  }
  const out = current as HTMLCanvasElement;
  sharpen(out, 0.45);
  return out;
}

/** Light unsharp-style 3x3 sharpen to win back edge crispness after resampling. */
function sharpen(canvas: HTMLCanvasElement, amount: number): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const s = img.data;
  const d = new Uint8ClampedArray(s);
  const row = w * 4;
  const center = 1 + 4 * amount;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        d[i + c] = s[i + c] * center - amount * (s[i + c - 4] + s[i + c + 4] + s[i + c - row] + s[i + c + row]);
      }
    }
  }
  ctx.putImageData(new ImageData(d, w, h), 0, 0);
}

// ---------- Plain background removal ----------

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Replaces a plain, roughly uniform background (studio/passport style):
 * the background colour is sampled from the four corners, then flood-filled
 * inward from the image border wherever pixels are within `tol` of it, and
 * the resulting mask is dilated and feathered so no coloured halo remains.
 */
function removeBackground(src: CanvasImageSource, tol: number, colorHex: string): HTMLCanvasElement {
  const canvas = cloneCanvas(src);
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Mean colour of the four corner patches.
  const patch = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  let br = 0;
  let bg = 0;
  let bb = 0;
  let n = 0;
  for (const [cx, cy] of [[0, 0], [w - patch, 0], [0, h - patch], [w - patch, h - patch]]) {
    for (let y = cy; y < cy + patch; y++) {
      for (let x = cx; x < cx + patch; x++) {
        const i = (y * w + x) * 4;
        br += px[i];
        bg += px[i + 1];
        bb += px[i + 2];
        n++;
      }
    }
  }
  br /= n;
  bg /= n;
  bb /= n;

  const thr = tol * 4.41; // tol 0..100 -> RGB distance 0..441
  const thr2 = thr * thr;
  const near = (p: number) => {
    const i = p * 4;
    const dr = px[i] - br;
    const dg = px[i + 1] - bg;
    const db = px[i + 2] - bb;
    return dr * dr + dg * dg + db * db <= thr2;
  };

  const mask = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const seed = (p: number) => {
    if (!mask[p] && near(p)) {
      mask[p] = 1;
      stack[sp++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < w * (h - 1)) seed(p + w);
  }

  // Dilate one pixel (eats the anti-aliased fringe), then feather.
  const dil = new Uint8Array(mask);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!mask[p] && (mask[p - 1] || mask[p + 1] || mask[p - w] || mask[p + w])) dil[p] = 1;
    }
  }
  const alpha = boxBlur(dil, w, h, Math.max(1, Math.round(Math.min(w, h) / 600)));

  const [rr, rg, rb] = hexToRgb(colorHex);
  for (let p = 0; p < w * h; p++) {
    const a = alpha[p] / 255;
    if (a <= 0) continue;
    const i = p * 4;
    px[i] = px[i] * (1 - a) + rr * a;
    px[i + 1] = px[i + 1] * (1 - a) + rg * a;
    px[i + 2] = px[i + 2] * (1 - a) + rb * a;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Separable box blur of a 0/1 mask into 0..255 alpha (two passes ≈ soft edge). */
function boxBlur(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = mask[i] * 255;
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const base = y * w;
      for (let x = -r; x <= r; x++) sum += a[base + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[base + x] = sum / (2 * r + 1);
        sum += a[base + Math.min(w - 1, x + r + 1)] - a[base + Math.max(0, x - r)];
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / (2 * r + 1);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(a[i])));
  return out;
}

// ---------- Red-eye ----------

function redEye(src: CanvasImageSource, op: { x: number; y: number; r: number }): HTMLCanvasElement {
  const canvas = cloneCanvas(src);
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const cx = op.x * w;
  const cy = op.y * h;
  const r = Math.max(3, op.r * w);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(w, Math.ceil(cx + r));
  const y1 = Math.min(h, Math.ceil(cy + r));
  if (x1 <= x0 || y1 <= y0) return canvas;
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const d = img.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > r) continue;
      const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
      const red = d[i];
      const other = (d[i + 1] + d[i + 2]) / 2;
      if (red > other * 1.4 && red > 60) {
        const falloff = dist < r * 0.7 ? 1 : 1 - (dist - r * 0.7) / (r * 0.3);
        const target = other * 0.85;
        d[i] = red + (target - red) * falloff;
      }
    }
  }
  ctx.putImageData(img, x0, y0);
  return canvas;
}

// ---------- Spot healing ----------

function ringMean(px: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, r0: number, r1: number) {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  const steps = 24;
  for (let ring = 0; ring < 3; ring++) {
    const rr = r0 + ((r1 - r0) * ring) / 2;
    for (let k = 0; k < steps; k++) {
      const ang = (k / steps) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(ang) * rr);
      const y = Math.round(cy + Math.sin(ang) * rr);
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      const i = (y * w + x) * 4;
      sr += px[i];
      sg += px[i + 1];
      sb += px[i + 2];
      n++;
    }
  }
  return [sr / n, sg / n, sb / n];
}

/**
 * Removes a blemish/dust speck: copies a nearby clean circular patch (chosen
 * as the candidate whose surroundings best match the target's), colour-matched
 * to the target's ring and feathered at the edge.
 */
function spotHeal(src: CanvasImageSource, op: { x: number; y: number; r: number }): HTMLCanvasElement {
  const canvas = cloneCanvas(src);
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const cx = op.x * w;
  const cy = op.y * h;
  const r = Math.max(3, op.r * w);

  const target = ringMean(px, w, h, cx, cy, r * 1.15, r * 1.6);
  let best: { dx: number; dy: number; score: number; mean: number[] } | null = null;
  for (let a = 0; a < 16; a++) {
    for (const dist of [2.6, 3.6]) {
      const ang = (a / 16) * Math.PI * 2;
      const dx = Math.cos(ang) * r * dist;
      const dy = Math.sin(ang) * r * dist;
      const sx = cx + dx;
      const sy = cy + dy;
      if (sx - r < 0 || sy - r < 0 || sx + r >= w || sy + r >= h) continue;
      const m = ringMean(px, w, h, sx, sy, r * 1.15, r * 1.6);
      const inner = ringMean(px, w, h, sx, sy, 0, r * 0.9);
      if (!m || !inner) continue;
      const score = target
        ? Math.abs(m[0] - target[0]) + Math.abs(m[1] - target[1]) + Math.abs(m[2] - target[2])
        : 0;
      if (!best || score < best.score) best = { dx, dy, score, mean: inner };
    }
  }
  if (!best) return canvas;

  const srcCopy = new Uint8ClampedArray(px);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(w, Math.ceil(cx + r));
  const y1 = Math.min(h, Math.ceil(cy + r));
  const srcRing = ringMean(srcCopy, w, h, cx + best.dx, cy + best.dy, r * 1.15, r * 1.6);
  const shift = target && srcRing ? [target[0] - srcRing[0], target[1] - srcRing[1], target[2] - srcRing[2]] : [0, 0, 0];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > r) continue;
      const t = dist < r * 0.6 ? 1 : 1 - (dist - r * 0.6) / (r * 0.4);
      const a = t * t * (3 - 2 * t); // smoothstep
      const sx = Math.round(x + best.dx);
      const sy = Math.round(y + best.dy);
      const si = (sy * w + sx) * 4;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = srcCopy[si + c] + shift[c];
        px[i + c] = px[i + c] * (1 - a) + Math.max(0, Math.min(255, v)) * a;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------- Perspective correction ----------

/** Solves for the 3x3 homography mapping the 4 `from` points onto the 4 `to` points. */
function homography(from: number[][], to: number[][]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = from[i];
    const [x, y] = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  // Gauss-Jordan elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    const div = A[col][col] || 1e-12;
    for (let c = col; c < 9; c++) A[col][c] /= div;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let c = col; c < 9; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row) => row[8]);
}

/** Flattens the quadrilateral `q` (TL,TR,BR,BL, normalised) into an upright rectangle. */
function warpPerspective(src: CanvasImageSource, q: number[]): HTMLCanvasElement {
  const { w, h } = sizeOf(src);
  const pts: number[][] = [];
  for (let i = 0; i < 4; i++) pts.push([q[i * 2] * w, q[i * 2 + 1] * h]);
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let ow = Math.max(dist(pts[0], pts[1]), dist(pts[3], pts[2]));
  let oh = Math.max(dist(pts[0], pts[3]), dist(pts[1], pts[2]));
  const k = Math.min(1, PERSPECTIVE_MAX_SIDE / Math.max(ow, oh));
  ow = Math.max(2, Math.round(ow * k));
  oh = Math.max(2, Math.round(oh * k));

  const H = homography(
    [[0, 0], [ow, 0], [ow, oh], [0, oh]],
    pts,
  );
  const srcCanvas = cloneCanvas(src);
  const sd = srcCanvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = makeCanvas(ow, oh);
  const octx = out.getContext('2d')!;
  const od = octx.createImageData(ow, oh);
  const o = od.data;
  for (let v = 0; v < oh; v++) {
    for (let u = 0; u < ow; u++) {
      const den = H[6] * u + H[7] * v + 1;
      const x = (H[0] * u + H[1] * v + H[2]) / den;
      const y = (H[3] * u + H[4] * v + H[5]) / den;
      const oi = (v * ow + u) * 4;
      if (x < 0 || y < 0 || x > w - 1 || y > h - 1) {
        o[oi] = o[oi + 1] = o[oi + 2] = 255;
        o[oi + 3] = 255;
        continue;
      }
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x1) * 4;
      const i01 = (y1 * w + x0) * 4;
      const i11 = (y1 * w + x1) * 4;
      for (let c = 0; c < 3; c++) {
        o[oi + c] =
          sd[i00 + c] * (1 - fx) * (1 - fy) + sd[i10 + c] * fx * (1 - fy) + sd[i01 + c] * (1 - fx) * fy + sd[i11 + c] * fx * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}
