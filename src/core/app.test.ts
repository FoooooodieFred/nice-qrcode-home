import { describe, expect, it } from 'vitest';
import {
  APP_URL,
  buildAppLink,
  contentHash,
  encodeShareLink,
  parseAppLink,
  parseShareLink,
  type ShareItem,
} from './app';
describe('app link manifest', () => {
  it('hashes deterministically into short base36', () => {
    expect(contentHash('https://www.figma.com')).toBe(contentHash('https://www.figma.com'));
    expect(contentHash('https://figma.com')).not.toBe(contentHash('https://figma.com/'));
    expect(contentHash('微信 weixin')).toMatch(/^[0-9a-z]{1,7}$/);
  });
  it('round-trips titles through the footer link', () => {
    const items: [string, string][] = [
      ['Figma', contentHash('https://www.figma.com')],
      ['好东西 之旅', contentHash('https://example.com/发现')],
    ];
    const parsed = parseAppLink(buildAppLink(items));
    expect(parsed).not.toBeNull();
    expect(parsed!.items).toEqual(items);
  });
  it('returns the bare URL for empty manifests', () => {
    expect(buildAppLink([])).toBe(APP_URL);
    expect(parseAppLink(APP_URL)).toEqual({ items: null });
  });
  it('degrades to the bare URL when the manifest cannot fit', () => {
    const huge = Array.from({ length: 60 }, (_, i) => [
      'AveryLongCardTitle'.repeat(4) + i,
      contentHash('https://example.com/' + i),
    ]) as [string, string][];
    expect(buildAppLink(huge)).toBe(APP_URL);
  });
  it('never emits a link beyond the scannable cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => [
      '这是一个比较长的卡片标题' + i,
      contentHash('https://example.com/' + i),
    ]) as [string, string][];
    const link = buildAppLink(many);
    expect(link === APP_URL || link.length <= 880).toBe(true);
  });
  it('rejects unrelated payloads and malformed manifests', () => {
    expect(parseAppLink('https://example.com')).toBeNull();
    expect(parseAppLink('')).toBeNull();
    expect(parseAppLink(APP_URL + '/about')).toEqual({ items: null });
    expect(parseAppLink(APP_URL + '#nq1=not-base64!!')).toEqual({ items: null });
  });
});

/** Deterministic high-entropy noise so deflate cannot cheat the size budget. */
function noise(seed: number, length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let state = seed >>> 0 || 1;
  let out = '';
  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out += chars[state % chars.length];
  }
  return out;
}
function b64url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
describe('share link (#nq2=)', () => {
  it('round-trips small payloads untouched', async () => {
    const items: ShareItem[] = [
      ['Figma', 'https://www.figma.com', 'team design tool'],
      ['微信团队', 'https://example.com/中文路径', ''],
      ['MDN', 'https://developer.mozilla.org', 'docs'],
    ];
    const encoded = await encodeShareLink(items);
    expect(encoded).not.toBeNull();
    expect(encoded!.included).toBe(3);
    expect(encoded!.link.startsWith(APP_URL + '#nq2=')).toBe(true);
    expect(await parseShareLink(encoded!.link)).toEqual(items);
  });
  it('drops notes before dropping cards, and never exceeds the cap', async () => {
    const items = Array.from({ length: 10 }, (_, i) => [
      'Card ' + i,
      'https://example.com/' + noise(i + 1, 90),
      noise(i + 100, 150),
    ]) as ShareItem[];
    const encoded = await encodeShareLink(items);
    expect(encoded).not.toBeNull();
    expect(encoded!.droppedNotes).toBe(true);
    expect(encoded!.shortenedTitles).toBe(false);
    expect(encoded!.truncated).toBe(false);
    expect(encoded!.included).toBe(10);
    expect(encoded!.link.length).toBeLessThanOrEqual(2280);
    const parsed = await parseShareLink(encoded!.link);
    expect(parsed).not.toBeNull();
    expect(parsed!.length).toBe(10);
    expect(parsed!.every(([, , note]) => note === '')).toBe(true);
  });
  it('shortens titles and truncates the list when content alone is too much', async () => {
    const items = Array.from({ length: 30 }, (_, i) => [
      noise(i + 1, 120),
      'https://example.com/' + noise(i + 500, 120),
      '',
    ]) as ShareItem[];
    const encoded = await encodeShareLink(items);
    expect(encoded).not.toBeNull();
    expect(encoded!.droppedNotes).toBe(false);
    expect(encoded!.shortenedTitles).toBe(true);
    expect(encoded!.truncated).toBe(true);
    expect(encoded!.included).toBeLessThan(30);
    expect(encoded!.link.length).toBeLessThanOrEqual(2280);
    const parsed = await parseShareLink(encoded!.link);
    expect(parsed!.length).toBe(encoded!.included);
    expect(parsed!.every(([title]) => title.length <= 20)).toBe(true);
  });
  it('returns null when a single card cannot fit', async () => {
    const items: ShareItem[] = [['Big', 'https://example.com/' + noise(7, 4000), '']];
    expect(await encodeShareLink(items)).toBeNull();
  });
  it('skips blank-content items and returns null when nothing is left', async () => {
    expect(await encodeShareLink([])).toBeNull();
    expect(await encodeShareLink([['empty', '', 'note']])).toBeNull();
    const encoded = await encodeShareLink([
      ['kept', 'https://example.com', 'note'],
      ['blank', '', 'dropped'],
    ]);
    expect(encoded!.included).toBe(1);
  });
  it('caps field lengths like cardSchema does', async () => {
    const encoded = await encodeShareLink([
      ['x'.repeat(300), 'https://example.com/' + 'y'.repeat(5000), 'z'.repeat(5000)],
    ]);
    expect(encoded!.droppedNotes).toBe(false);
    const parsed = await parseShareLink(encoded!.link);
    expect(parsed).toEqual([
      ['x'.repeat(200), 'https://example.com/' + 'y'.repeat(3980), 'z'.repeat(4000)],
    ]);
  });
  it('parses both raw and deflated modes', async () => {
    const items: ShareItem[] = [['raw card', 'https://example.com/raw', 'raw note']];
    expect(await parseShareLink(APP_URL + '#nq2=r' + b64url(JSON.stringify(items)))).toEqual(items);
    const bytes = new TextEncoder().encode(JSON.stringify(items));
    const piped = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const deflated = new Uint8Array(await new Response(piped).arrayBuffer());
    expect(
      await parseShareLink(APP_URL + '#nq2=z' + b64url(String.fromCharCode(...deflated))),
    ).toEqual(items);
  });
  it('rejects unrelated payloads and malformed share links', async () => {
    expect(await parseShareLink('https://example.com')).toBeNull();
    expect(await parseShareLink('')).toBeNull();
    expect(await parseShareLink(APP_URL)).toBeNull();
    expect(await parseShareLink(buildAppLink([['t', contentHash('c')]]))).toBeNull();
    expect(await parseShareLink(APP_URL + '#nq2=')).toBeNull();
    expect(await parseShareLink(APP_URL + '#nq2=xabc')).toBeNull();
    expect(await parseShareLink(APP_URL + '#nq2=r!!!')).toBeNull();
    expect(await parseShareLink(APP_URL + '#nq2=r' + b64url('not json'))).toBeNull();
    expect(await parseShareLink(APP_URL + '#nq2=r' + b64url(JSON.stringify({ a: 1 })))).toBeNull();
    expect(
      await parseShareLink(APP_URL + '#nq2=r' + b64url(JSON.stringify([['t', 'c']]))),
    ).toBeNull();
    const tooMany = Array.from({ length: 61 }, (_, i) => ['t' + i, 'c' + i, '']) as ShareItem[];
    expect(await parseShareLink(APP_URL + '#nq2=r' + b64url(JSON.stringify(tooMany)))).toBeNull();
  });
});
