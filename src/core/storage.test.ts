import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalAdapter, parseBackup } from './storage';
import { defaultSettings, type Settings } from './types';
import { makeCard } from './content';
let db: LocalAdapter;
beforeEach(() => {
  db = new LocalAdapter('nice-test-' + crypto.randomUUID());
});
afterEach(async () => {
  await db.delete();
});
describe('local storage transactions', () => {
  it('persists cards, settings and binary assets', async () => {
    const card = { ...makeCard('https://example.com'), imageAssetId: 'asset' };
    await db.saveCard(card, { id: 'asset', blob: new Blob(['original'], { type: 'image/png' }) });
    await db.saveSettings({ ...defaultSettings, theme: 'dark' });
    db.close();
    await db.open();
    const state = await db.load();
    expect(state.cards[0]).toEqual(card);
    expect(await state.assets[0].blob.text()).toBe('original');
    expect(state.settings.theme).toBe('dark');
  });
  it('deleting a group keeps its cards in ungrouped', async () => {
    await db.saveGroups([{ id: 'g', name: 'Group', sortOrder: 0, collapsed: false }]);
    const card = makeCard('https://example.com', 'g');
    await db.saveCard(card);
    await db.saveGroups([]);
    expect((await db.load()).cards[0].groupId).toBe('');
  });
  it('only removes an image after the final referencing card is deleted', async () => {
    const a = { ...makeCard('a'), imageAssetId: 'shared' },
      b = { ...makeCard('b'), imageAssetId: 'shared' };
    await db.saveCard(a, { id: 'shared', blob: new Blob(['image']) });
    await db.saveCard(b);
    await db.deleteCard(a.id);
    expect(await db.assets.count()).toBe(1);
    await db.deleteCard(b.id);
    expect(await db.assets.count()).toBe(0);
  });
  it('rolls back the entire restore on a write-time validation failure', async () => {
    const original = makeCard('precious');
    await db.saveCard(original);
    await expect(
      db.restore({
        cards: [makeCard('replacement')],
        groups: [],
        assets: [],
        settings: { ...defaultSettings, columns: 99 } as Settings,
      }),
    ).rejects.toThrow();
    expect((await db.load()).cards).toEqual([original]);
  });
  it('rejects an invalid batch before writing any cards or assets', async () => {
    const valid = makeCard('valid'),
      invalid = { ...makeCard('invalid'), title: '' };
    await expect(
      db.saveCards([
        { card: valid, asset: { id: 'a', blob: new Blob(['image']) } },
        { card: invalid },
      ]),
    ).rejects.toThrow();
    expect(await db.cards.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
  });
});
function backup(patch: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: [],
    groups: [],
    settings: defaultSettings,
    assets: [],
    ...patch,
  });
}
describe('backup validation', () => {
  it('accepts a supported complete backup', async () => {
    const card = makeCard('https://example.com');
    expect((await parseBackup(backup({ cards: [card] }))).cards[0]).toEqual(card);
  });
  it('rejects unsupported versions and malformed documents', async () => {
    await expect(parseBackup(backup({ version: 2 }))).rejects.toThrow();
    await expect(parseBackup('{}')).rejects.toThrow();
    await expect(parseBackup('{invalid')).rejects.toThrow();
  });
  it('rejects duplicate IDs and dangling image/group references', async () => {
    const card = makeCard('a');
    await expect(parseBackup(backup({ cards: [card, card] }))).rejects.toThrow('重复');
    await expect(
      parseBackup(backup({ cards: [{ ...card, imageAssetId: 'missing' }] })),
    ).rejects.toThrow('引用');
    await expect(parseBackup(backup({ cards: [{ ...card, groupId: 'missing' }] }))).rejects.toThrow(
      '引用',
    );
  });
  it('rejects active-image formats and non-image data URLs', async () => {
    await expect(
      parseBackup(backup({ assets: [{ id: 'a', data: 'data:image/svg+xml;base64,PHN2Zy8+' }] })),
    ).rejects.toThrow();
    await expect(
      parseBackup(backup({ assets: [{ id: 'a', data: 'data:text/html;base64,SGVsbG8=' }] })),
    ).rejects.toThrow();
  });
  it('bounds settings and user-supplied strings', async () => {
    await expect(
      parseBackup(backup({ settings: { ...defaultSettings, accent: 'url(evil)' } })),
    ).rejects.toThrow();
    await expect(
      parseBackup(backup({ cards: [{ ...makeCard('a'), rawContent: 'x'.repeat(4001) }] })),
    ).rejects.toThrow();
  });
});

describe('backup round trip', () => {
  it('round-trips original image bytes, references and custom settings', async () => {
    const { serialize } = await import('./storage');
    const bytes = Uint8Array.from(
      atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
      (c) => c.charCodeAt(0),
    );
    const card = {
      ...makeCard(''),
      imageAssetId: 'original',
      title: 'Mini program',
      type: 'wechat-mini',
    } as unknown as ReturnType<typeof makeCard>;
    const original = {
      cards: [card],
      groups: [],
      settings: { ...defaultSettings, extensions: { 'plugin.caption': 'keep me' } },
      assets: [{ id: 'original', blob: new Blob([bytes], { type: 'image/gif' }) }],
    };
    const restored = await parseBackup(await serialize(original));
    expect(restored.cards[0].type).toBe('mini');
    expect(restored.cards[0].imageAssetId).toBe('original');
    expect(restored.cards[0].id).toBe(card.id);
    expect(restored.settings.extensions).toEqual(original.settings.extensions);
    expect(new Uint8Array(await restored.assets[0].blob.arrayBuffer())).toEqual(
      new Uint8Array(bytes),
    );
  });
  it('migrates legacy card types when loading pre-merge records', async () => {
    const legacy = {
      ...makeCard('https://example.com'),
      type: 'alipay-link',
    } as unknown as ReturnType<typeof makeCard>;
    const mini = {
      ...makeCard(''),
      type: 'alipay-mini',
    } as unknown as ReturnType<typeof makeCard>;
    await db.cards.bulkPut([legacy, mini]);
    const loaded = (await db.load()).cards;
    expect(loaded.find((c) => c.id === legacy.id)?.type).toBe('web');
    expect(loaded.find((c) => c.id === mini.id)?.type).toBe('mini');
  });
  it('writes complete batches with assets in a single successful operation', async () => {
    const a = makeCard('first'),
      b = { ...makeCard('second'), imageAssetId: 'binary' };
    await db.saveCards([
      { card: a },
      { card: b, asset: { id: 'binary', blob: new Blob(['bytes']) } },
    ]);
    const state = await db.load();
    expect(state.cards).toHaveLength(2);
    expect(state.assets).toHaveLength(1);
  });
});
