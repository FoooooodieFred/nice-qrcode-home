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
