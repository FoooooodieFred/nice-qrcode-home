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

/**
 * Overlapping-window scan for engines that report a single code per pass:
 * jsQR returns one symbol per call and tends to fail outright when a window
 * holds several complete codes, so a code only surfaces when some window
 * isolates it. Each grid factor runs at two window sizes — a tighter overlap
 * that isolates small codes in grids, a wider one that keeps a large code
 * (e.g. a share-card hero QR) whole in coarse windows. Scans at native
 * resolution (shrunk only for speed) — upscaling adds nothing. Stops once a
 * full grid pass adds nothing new.
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
  // individual codes), so tiling always runs as a complement; its stagnation
  // rule keeps single-code screenshots to a handful of windows.
  const native = await nativeDetectAll(blob).catch(() => null);
  if (native) for (const value of native) found.add(value);
  for (const value of await tileScan(blob).catch(() => [] as string[])) found.add(value);
  if (!found.size) {
    // Last resort for single hard codes the window scan missed wholesale.
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
