import type QRCodeStyling from 'qr-code-styling';
import type { Settings } from './types';
export interface QrRenderer {
  create(content: string, style: Settings['qrStyle']): Promise<QRCodeStyling>;
}
export const qrRenderer: QrRenderer = {
  async create(content, style) {
    const { default: QR } = await import('qr-code-styling');
    return new QR({
      width: 320,
      height: 320,
      data: content,
      margin: 24,
      type: 'svg',
      qrOptions: { errorCorrectionLevel: 'M' },
      dotsOptions: { type: style, color: '#17201b' },
      backgroundOptions: { color: '#ffffff' },
      cornersSquareOptions: { type: style === 'square' ? 'square' : 'extra-rounded' },
    });
  },
};
