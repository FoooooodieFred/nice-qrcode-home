export interface Decoder {
  id: string;
  decode(image: Blob): Promise<string | null>;
}
export class DecoderPipeline {
  constructor(public decoders: Decoder[] = []) {}
  register(decoder: Decoder) {
    this.decoders.push(decoder);
  }
  async decode(image: Blob): Promise<string | null> {
    for (const decoder of this.decoders) {
      try {
        const result = await decoder.decode(image);
        if (result) return result;
      } catch {
        /* A failed engine must not suppress subsequent engines. */
      }
    }
    return null;
  }
}
export const decoderPipeline = new DecoderPipeline([
  {
    id: 'native',
    async decode(blob) {
      const Detector = (
        globalThis as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => {
            detect(image: ImageBitmap): Promise<{ rawValue: string }[]>;
          };
        }
      ).BarcodeDetector;
      if (!Detector) return null;
      const bitmap = await createImageBitmap(blob);
      try {
        return (await new Detector({ formats: ['qr_code'] }).detect(bitmap))[0]?.rawValue ?? null;
      } finally {
        bitmap.close();
      }
    },
  },
  {
    id: 'qr-scanner',
    async decode(blob) {
      const { default: Scanner } = await import('qr-scanner');
      return (
        await Scanner.scanImage(blob, {
          returnDetailedScanResult: true,
          alsoTryWithoutScanRegion: true,
        })
      ).data;
    },
  },
  {
    id: 'jsqr',
    async decode(blob) {
      const { default: jsQR } = await import('jsqr');
      const image = await createImageBitmap(blob);
      try {
        for (const size of [1024, 512, 2048]) {
          const scale = Math.min(size / Math.max(image.width, image.height), 2);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(data.data, data.width, data.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (found) return found.data;
        }
        return null;
      } finally {
        image.close();
      }
    },
  },
]);

/** Native detection sees every code in one pass; null when unsupported or failing. */
async function nativeDetectAll(blob: Blob): Promise<string[] | null> {
  const Detector = (
    globalThis as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect(image: ImageBitmap): Promise<{ rawValue: string }[]>;
      };
    }
  ).BarcodeDetector;
  if (!Detector) return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const codes = await new Detector({ formats: ['qr_code'] }).detect(bitmap);
    return codes.map((code) => code.rawValue).filter(Boolean);
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

type Box = { x: number; y: number; w: number; h: number };
type Corner = { x: number; y: number };

/**
 * Whitespace segmentation for engines that report a single code per pass and
 * often fail outright when another (or partial) code shares the frame. Each
 * region is decoded in a loop — every hit is painted white using the engine's
 * corner points, so sibling codes surface one by one — and regions that stop
 * yielding are split along blank gutters and recursed. Generous sheet margins
 * isolate codes cleanly, and tight single-code crops stay decodable even from
 * noisy JPEG photos where whole-image decoding never succeeds.
 */
async function segmentScan(blob: Blob): Promise<string[]> {
  const { default: jsQR } = await import('jsqr');
  const bitmap = await createImageBitmap(blob);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > 1400 ? 1400 / longest : 1;
    const W = Math.max(1, Math.round(bitmap.width * scale));
    const H = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    const ink = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < ink.length; i++, p += 4) {
      if (data[p + 3] >= 128 && data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114 < 150)
        ink[i] = 1;
    }
    // Integral image of ink for O(1) per-region density queries.
    let integral = new Int32Array((W + 1) * (H + 1));
    const rebuildIntegral = () => {
      for (let y = 0; y < H; y++) {
        let rowAcc = 0;
        for (let x = 0; x < W; x++) {
          rowAcc += ink[y * W + x];
          integral[(y + 1) * (W + 1) + (x + 1)] = integral[y * (W + 1) + (x + 1)] + rowAcc;
        }
      }
    };
    rebuildIntegral();
    const inkIn = (b: Box) =>
      integral[(b.y + b.h) * (W + 1) + b.x + b.w] -
      integral[b.y * (W + 1) + b.x + b.w] -
      integral[(b.y + b.h) * (W + 1) + b.x] +
      integral[b.y * (W + 1) + b.x];
    const minSize = Math.max(40, Math.round(Math.min(W, H) * 0.05));
    const minGap = Math.max(4, Math.round(Math.min(W, H) * 0.012));
    const found = new Set<string>();
    let zxing: typeof import('qr-scanner').default | undefined;

    /** Decode one code inside the box and paint it out of the canvas. */
    async function extractOne(b: Box): Promise<string | null> {
      // A code cropped at its exact ink bounds loses its quiet zone; pad a little.
      const pad = Math.max(2, Math.round(Math.min(b.w, b.h) * 0.03));
      const x = Math.max(0, b.x - pad);
      const y = Math.max(0, b.y - pad);
      const w = Math.min(W - x, b.w + pad * 2);
      const h = Math.min(H - y, b.h + pad * 2);
      const crop = ctx.getImageData(x, y, w, h);
      let text: string | null = null;
      let corners: Corner[] = [];
      const hit = jsQR(crop.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (hit?.data && hit.location) {
        text = hit.data;
        corners = [
          hit.location.topLeftCorner,
          hit.location.topRightCorner,
          hit.location.bottomRightCorner,
          hit.location.bottomLeftCorner,
        ];
      }
      if (!text) {
        try {
          zxing ??= (await import('qr-scanner')).default;
          const tile = document.createElement('canvas');
          tile.width = w;
          tile.height = h;
          tile.getContext('2d')!.putImageData(crop, 0, 0);
          const result = await zxing.scanImage(tile, {
            returnDetailedScanResult: true,
            alsoTryWithoutScanRegion: true,
          });
          if (result?.data) {
            text = result.data;
            corners = result.cornerPoints ?? [];
          }
        } catch {
          /* no code in this region */
        }
      }
      if (!text) return null;
      if (corners.length === 4) {
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        erase(x + Math.min(...xs), y + Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      } else {
        // No position available: clear the middle so the same code cannot loop.
        erase(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5);
      }
      return text;
    }
    function erase(sx: number, sy: number, sw: number, sh: number) {
      const grow = Math.max(4, Math.round(Math.min(sw, sh) * 0.15));
      const ex = Math.max(0, Math.round(sx - grow));
      const ey = Math.max(0, Math.round(sy - grow));
      const ew = Math.min(W - ex, Math.round(sw + grow * 2));
      const eh = Math.min(H - ey, Math.round(sh + grow * 2));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex, ey, ew, eh);
      for (let yy = ey; yy < ey + eh; yy++) ink.fill(0, yy * W + ex, yy * W + ex + ew);
    }
    /** Maximal ink bands along one axis, used as children after a split. */
    function bands(b: Box, axis: 'x' | 'y'): Box[] {
      const runs: Box[] = [];
      let start = -1;
      const count = axis === 'y' ? b.h : b.w;
      for (let i = 0; i <= count; i++) {
        const line: Box =
          axis === 'y'
            ? { x: b.x, y: b.y + i, w: b.w, h: i < count ? 1 : 0 }
            : { x: b.x + i, y: b.y, w: i < count ? 1 : 0, h: b.h };
        const filled = i < count && inkIn(line) > 0;
        if (filled && start < 0) start = i;
        if (!filled && start >= 0) {
          runs.push(
            axis === 'y'
              ? { x: b.x, y: b.y + start, w: b.w, h: i - start }
              : { x: b.x + start, y: b.y, w: i - start, h: b.h },
          );
          start = -1;
        }
      }
      return runs;
    }
    /** First blank gutter of at least minGap between two ink bands, if any. */
    function hasGap(children: Box[], axis: 'x' | 'y'): boolean {
      for (let i = 1; i < children.length; i++) {
        const prev = children[i - 1];
        const next = children[i];
        const gap = axis === 'y' ? next.y - (prev.y + prev.h) : next.x - (prev.x + prev.w);
        if (gap >= minGap) return true;
      }
      return false;
    }
    async function cut(b: Box, depth: number): Promise<void> {
      if (b.w < minSize || b.h < minSize) return;
      for (let i = 0; i < 40 && inkIn(b) > 0; i++) {
        const text = await extractOne(b);
        if (!text) break;
        found.add(text);
      }
      if (depth >= 8) return;
      rebuildIntegral();
      for (const axis of ['y', 'x'] as const) {
        const children = bands(b, axis);
        if (children.length > 1 && hasGap(children, axis)) {
          for (const child of children) await cut(child, depth + 1);
          return;
        }
      }
    }
    await cut({ x: 0, y: 0, w: W, h: H }, 0);
    return [...found];
  } finally {
    bitmap.close();
  }
}

/**
 * Overlapping-window scan — the fallback for busy photos where no clean
 * whitespace gutter exists. jsQR returns one symbol per call, so a code only
 * surfaces when some window isolates it. Each grid factor runs at two window
 * sizes: a tighter overlap that isolates small codes in grids, a wider one
 * that keeps a large code (e.g. a share-card hero QR) whole in coarse
 * windows. Stops once a full grid pass adds nothing new.
 */
async function tileScan(blob: Blob): Promise<string[]> {
  const { default: jsQR } = await import('jsqr');
  const bitmap = await createImageBitmap(blob);
  try {
    const found = new Set<string>();
    const canvas = document.createElement('canvas');
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > 1400 ? 1400 / longest : 1;
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let previous = -1;
    for (const grid of [1, 2, 3, 4]) {
      if (grid >= 3 && found.size === previous) break;
      previous = found.size;
      // Whole image once, then two overlap widths per grid factor.
      for (const overlap of grid > 1 ? [1 / 3, 2 / 3] : [0]) {
        const windowW = (canvas.width / grid) * (1 + overlap);
        const windowH = (canvas.height / grid) * (1 + overlap);
        const strideX = grid > 1 ? (canvas.width - windowW) / (grid - 1) : 0;
        const strideY = grid > 1 ? (canvas.height - windowH) / (grid - 1) : 0;
        for (let ty = 0; ty < grid; ty++) {
          for (let tx = 0; tx < grid; tx++) {
            const x = Math.round(tx * strideX);
            const y = Math.round(ty * strideY);
            const w = Math.min(Math.round(windowW), canvas.width - x);
            const h = Math.min(Math.round(windowH), canvas.height - y);
            if (w < 40 || h < 40) continue;
            const data = ctx.getImageData(x, y, w, h);
            const hit = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
            if (hit?.data) found.add(hit.data);
          }
        }
      }
    }
    return [...found];
  } finally {
    bitmap.close();
  }
}

/** Every QR payload found in one image, deduplicated in discovery order. */
export async function decodeAll(blob: Blob): Promise<string[]> {
  const found = new Set<string>();
  // Native detection is one fast pass but not exhaustive on grids (it can drop
  // individual codes), so segmentation always runs as a complement. When it
  // comes up short — busy photos without clean gutters — the window scan and
  // a whole-image pass fill the gaps.
  const native = await nativeDetectAll(blob).catch(() => null);
  if (native) for (const value of native) found.add(value);
  for (const value of await segmentScan(blob).catch(() => [] as string[])) found.add(value);
  if (found.size <= 1) {
    for (const value of await tileScan(blob).catch(() => [] as string[])) found.add(value);
  }
  if (!found.size) {
    // Last resort for a single hard code every strategy missed.
    try {
      const { default: Scanner } = await import('qr-scanner');
      const result = await Scanner.scanImage(blob, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });
      if (result?.data) found.add(result.data);
    } catch {
      /* pipeline exhausted */
    }
  }
  return [...found];
}
