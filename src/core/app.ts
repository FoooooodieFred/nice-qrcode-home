import { z } from 'zod';

/**
 * The footer QR printed on share images. Scanning it with any camera opens the
 * project page. Two link flavors exist:
 * - `#nq1=` compact manifest of [title, contentHash] pairs — sheet footers keep
 *   this small so the QR stays robust at footer size; content comes from the
 *   QR codes printed in the sheet itself.
 * - `#nq2=` full share manifest of [title, content, note] triples — a single
 *   large QR that alone carries everything needed for one-tap import.
 * Consumers must try parseShareLink (nq2) before parseAppLink (nq1).
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
  return bytesToB64Url(new TextEncoder().encode(text));
}

function fromB64Url(encoded: string): string {
  return new TextDecoder().decode(bytesFromB64Url(encoded));
}

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64Url(encoded: string): Uint8Array {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * App link plus manifest when it fits, shrinking titles once before giving up
 * and returning the bare URL — never a QR too dense to survive re-sharing.
 */
export function buildAppLink(items: ManifestItem[]): string {
  if (!items.length) return APP_URL;
  for (const titleCap of [40, 14]) {
    const manifest = JSON.stringify(items.map(([title, hash]) => [title.slice(0, titleCap), hash]));
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

/* ---------- #nq2= full-content share links ---------- */

/** A shared card reduced to what travels inside one big QR: title, content, note. */
export type ShareItem = [title: string, content: string, note: string];
export type ShareEncodeResult = {
  link: string;
  included: number;
  /** Notes were stripped from some cards to fit the link budget. */
  droppedNotes: boolean;
  /** Titles were shortened to 20 characters to fit. */
  shortenedTitles: boolean;
  /** Some cards were left out entirely; only the first `included` ones made it. */
  truncated: boolean;
};

const SHARE_PREFIX = '#nq2=';
/** QR version 40 at ECC M holds 2331 bytes; stay under so dense payloads still scan. */
const SHARE_LINK_CAP = 2280;
/** Mirrors cardSchema limits so imported items validate as cards downstream. */
const shareItemSchema = z.tuple([
  z.string().max(200),
  z.string().min(1).max(4000),
  z.string().max(4000),
]);
const shareListSchema = z.array(shareItemSchema).min(1).max(60);

/** deflates when `decompress` is false, inflates raw-deflate when true. */
async function pipeThrough(bytes: Uint8Array, decompress: boolean): Promise<Uint8Array | null> {
  if (!decompress && typeof CompressionStream === 'undefined') return null;
  if (decompress && typeof DecompressionStream === 'undefined') return null;
  try {
    const source = new Blob([bytes]).stream();
    // Both stream classes take the same 'deflate-raw' wire format.
    const piped = decompress
      ? source.pipeThrough(new DecompressionStream('deflate-raw'))
      : source.pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(piped).arrayBuffer());
  } catch {
    return null;
  }
}

/** Pick the shortest link (raw 'r' or deflated 'z') that fits the budget. */
async function shortestShareLink(json: string): Promise<string | null> {
  const payload = new TextEncoder().encode(json);
  const candidates = [APP_URL + SHARE_PREFIX + 'r' + bytesToB64Url(payload)];
  const deflated = await pipeThrough(payload, false);
  if (deflated) candidates.push(APP_URL + SHARE_PREFIX + 'z' + bytesToB64Url(deflated));
  return (
    candidates
      .filter((link) => link.length <= SHARE_LINK_CAP)
      .sort((a, b) => a.length - b.length)[0] ?? null
  );
}

/**
 * Pack cards into one share link, shrinking gracefully: full payload → notes
 * dropped → titles shortened to 20 chars → fewer cards (never zero). Returns
 * null only when even a single bare item exceeds the budget.
 */
export async function encodeShareLink(items: ShareItem[]): Promise<ShareEncodeResult | null> {
  const usable = items
    .filter(([, content]) => content.trim())
    .map(
      ([title, content, note]) =>
        [title.slice(0, 200), content.slice(0, 4000), note.slice(0, 4000)] as ShareItem,
    );
  if (!usable.length) return null;
  const hadNotes = usable.some(([, , note]) => note);
  const hadLongTitles = usable.some(([title]) => title.length > 20);
  const noNotes = usable.map(([title, content]) => [title, content, ''] as ShareItem);
  const shortTitled = noNotes.map(
    ([title, content]) => [title.slice(0, 20), content, ''] as ShareItem,
  );
  const attempts: {
    list: ShareItem[];
    droppedNotes: boolean;
    shortenedTitles: boolean;
    truncated: boolean;
  }[] = [
    { list: usable, droppedNotes: false, shortenedTitles: false, truncated: false },
    { list: noNotes, droppedNotes: hadNotes, shortenedTitles: false, truncated: false },
    { list: shortTitled, droppedNotes: hadNotes, shortenedTitles: hadLongTitles, truncated: false },
  ];
  for (let count = usable.length - 1; count >= 1; count--)
    attempts.push({
      list: shortTitled.slice(0, count),
      droppedNotes: hadNotes,
      shortenedTitles: hadLongTitles,
      truncated: true,
    });
  for (const attempt of attempts) {
    const link = await shortestShareLink(JSON.stringify(attempt.list));
    if (link)
      return {
        link,
        included: attempt.list.length,
        droppedNotes: attempt.droppedNotes,
        shortenedTitles: attempt.shortenedTitles,
        truncated: attempt.truncated,
      };
  }
  return null;
}

/** Recognise and validate a share link; null for anything else (incl. #nq1=). */
export async function parseShareLink(content: string): Promise<ShareItem[] | null> {
  const head = APP_URL + SHARE_PREFIX;
  if (!content.startsWith(head)) return null;
  const tail = content.slice(head.length);
  const mode = tail[0];
  if (mode !== 'r' && mode !== 'z') return null;
  let bytes: Uint8Array;
  try {
    bytes = bytesFromB64Url(tail.slice(1));
  } catch {
    return null;
  }
  let json: string;
  if (mode === 'r') json = new TextDecoder().decode(bytes);
  else {
    const inflated = await pipeThrough(bytes, true);
    if (!inflated) return null;
    json = new TextDecoder().decode(inflated);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = shareListSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
