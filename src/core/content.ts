import type { Card } from './types';

/** Only explicitly supported schemes can ever become clickable links. */
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'weixin:', 'alipays:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function normalizeContent(value: string): string {
  const text = value.trim();
  if (/^[\w-]+(?:\.[\w-]+)+(?:[/:?#].*)?$/.test(text)) return `https://${text}`;
  return text;
}
export function classify(value: string): Card['type'] {
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'weixin:', 'alipays:'].includes(url.protocol)) return 'web';
  } catch {
    /* plain text is a valid QR payload */
  }
  return 'other';
}
export function domain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || '应用链接';
  } catch {
    return value ? '文本内容' : '原图二维码';
  }
}
export function makeCard(content: string, groupId = ''): Card {
  const rawContent = normalizeContent(content);
  return {
    id: crypto.randomUUID(),
    title:
      classify(rawContent) === 'other'
        ? rawContent.slice(0, 60) || '未命名二维码'
        : domain(rawContent),
    rawContent,
    description: '',
    groupId,
    tags: [],
    note: '',
    favorite: false,
    type: classify(rawContent),
    sortOrder: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
