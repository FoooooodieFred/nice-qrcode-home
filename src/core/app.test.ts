import { describe, expect, it } from 'vitest';
import { APP_URL, buildAppLink, contentHash, parseAppLink } from './app';
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
