/**
 * The footer QR printed on share images. Scanning it with any camera opens the
 * project page; scanning it with nice-qrcode itself additionally reveals a
 * compact manifest of [title, contentHash] pairs, so one-tap import can restore
 * card names without OCR. The QR codes in the image carry the actual content —
 * the manifest only carries names.
 */
export const APP_URL = 'https://github.com/FoooooodieFred/nice-qrcode-home';
const MANIFEST_PREFIX = '#nq1=';
/** Keeps the printed QR around version 20 at ECC M, comfortably scannable at footer size. */
const LINK_CAP = 880;

export type ManifestItem = [title: string, hash: string];

/** 32-bit FNV-1a as base36 — short, deterministic, collision-safe for sheet-sized lists. */
export function contentHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * App link plus manifest when it fits, shrinking titles once before giving up
 * and returning the bare URL — never a QR too dense to survive re-sharing.
 */
export function buildAppLink(items: ManifestItem[]): string {
  if (!items.length) return APP_URL;
  for (const titleCap of [40, 14]) {
    const manifest = JSON.stringify(
      items.map(([title, hash]) => [title.slice(0, titleCap), hash]),
    );
    const link = APP_URL + MANIFEST_PREFIX + toB64Url(manifest);
    if (link.length <= LINK_CAP) return link;
  }
  return APP_URL;
}

/**
 * Recognise a decoded payload as this app's footer link. Returns null for
 * anything else; `items` is null when the link carries no (readable) manifest.
 */
export function parseAppLink(content: string): { items: ManifestItem[] | null } | null {
  if (!content.startsWith(APP_URL)) return null;
  const tail = content.slice(APP_URL.length);
  if (!tail.startsWith(MANIFEST_PREFIX)) return { items: null };
  try {
    const raw: unknown = JSON.parse(fromB64Url(tail.slice(MANIFEST_PREFIX.length)));
    if (!Array.isArray(raw)) return { items: null };
    const items = raw.filter(
      (item): item is ManifestItem =>
        Array.isArray(item) &&
        typeof item[0] === 'string' &&
        typeof item[1] === 'string' &&
        item.length === 2,
    );
    return { items: items.length ? items : null };
  } catch {
    return { items: null };
  }
}

/** Classic square QR for print footers — densest and most robust at small sizes. */
export async function renderAppQr(
  data: string,
  size: number,
  ink = '#17181a',
): Promise<Blob | null> {
  try {
    const { default: QRCodeStyling } = await import('qr-code-styling');
    const renderer = new QRCodeStyling({
      width: size,
      height: size,
      type: 'svg',
      data,
      margin: Math.round(size / 24),
      qrOptions: { errorCorrectionLevel: 'M' },
      dotsOptions: { type: 'square', color: ink },
      backgroundOptions: { color: '#ffffff' },
      cornersSquareOptions: { type: 'square' },
      cornersDotOptions: { type: 'square' },
    });
    const blob = await renderer.getRawData('png');
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}
