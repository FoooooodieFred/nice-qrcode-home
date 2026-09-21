import { describe, it, expect } from 'vitest';
import { safeUrl, classify, normalizeContent, makeCard } from './content';
describe('safe content handling', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'java\nscript:alert(1)',
  ])('never turns executable input into a link: %s', (value) => expect(safeUrl(value)).toBeNull());
  it.each([
    'https://example.com',
    'http://localhost:3000',
    'weixin://dl/test',
    'alipays://platformapi/startapp',
  ])('permits explicitly supported schemes: %s', (value) => expect(safeUrl(value)).not.toBeNull());
  it('keeps proprietary codes manually classified rather than guessing', () => {
    expect(classify('weixin://example')).toBe('web');
    expect(classify('https://mp.weixin.qq.com/x')).toBe('web');
    expect(classify('https://weixin.qq.com/a/abc')).toBe('web');
    expect(classify('https://qr.alipay.com/abc')).toBe('web');
    expect(classify('unrecognized payload')).toBe('other');
  });
  it('never auto-classifies a card as a mini-program code', () => {
    for (const value of ['weixin://dl/test', 'https://mp.weixin.qq.com/a/~x', 'alipays://x'])
      expect(classify(value)).not.toBe('mini');
  });
  it('normalizes domains without rewriting text', () => {
    expect(normalizeContent(' example.com/path ')).toBe('https://example.com/path');
    expect(normalizeContent('hello world')).toBe('hello world');
    expect(normalizeContent('ftp://example.com')).toBe('ftp://example.com');
  });
  it('creates independent cards and preserves the original payload', () => {
    const a = makeCard('Hello QR');
    const b = makeCard('Hello QR');
    expect(a.id).not.toBe(b.id);
    expect(a.rawContent).toBe('Hello QR');
    expect(a.title).toBe('Hello QR');
  });
});
