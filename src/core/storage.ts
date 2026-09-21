import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { dict } from '../i18n';
import {
  cardSchema,
  groupSchema,
  settingsSchema,
  defaultSettings,
  migrateCard,
  type Asset,
  type Card,
  type Group,
  type Settings,
  type Snapshot,
} from './types';

export interface DataAdapter {
  load(): Promise<Snapshot>;
  saveCard(card: Card, asset?: Asset): Promise<void>;
  saveCards(entries: { card: Card; asset?: Asset }[]): Promise<void>;
  deleteCard(id: string): Promise<void>;
  saveGroups(groups: Group[]): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  reorder(cards: Card[]): Promise<void>;
  restore(snapshot: Snapshot): Promise<void>;
  clear(): Promise<void>;
}
export class LocalAdapter extends Dexie implements DataAdapter {
  cards!: Table<Card, string>;
  groups!: Table<Group, string>;
  assets!: Table<Asset, string>;
  preferences!: Table<{ id: string; value: Settings }, string>;
  constructor(name = 'nice-qrcode-home') {
    super(name);
    this.version(1).stores({
      cards: 'id, groupId, sortOrder, updatedAt',
      groups: 'id, sortOrder',
      assets: 'id',
      preferences: 'id',
    });
  }
  async load(): Promise<Snapshot> {
    return this.transaction(
      'r',
      [this.cards, this.groups, this.assets, this.preferences],
      async () => ({
        cards: (await this.cards.orderBy('sortOrder').toArray()).map(migrateCard),
        groups: await this.groups.orderBy('sortOrder').toArray(),
        assets: await this.assets.toArray(),
        settings: settingsSchema.parse(
          (await this.preferences.get('settings'))?.value ?? { ...defaultSettings },
        ),
      }),
    );
  }
  async saveCard(card: Card, asset?: Asset) {
    cardSchema.parse(card);
    await this.transaction('rw', [this.cards, this.assets], async () => {
      if (asset) await this.assets.put(asset);
      await this.cards.put(card);
    });
  }
  async saveCards(entries: { card: Card; asset?: Asset }[]) {
    for (const entry of entries) cardSchema.parse(entry.card);
    await this.transaction('rw', [this.cards, this.assets], async () => {
      for (const entry of entries) {
        if (entry.asset) await this.assets.put(entry.asset);
        await this.cards.put(entry.card);
      }
    });
  }
  async deleteCard(id: string) {
    await this.transaction('rw', [this.cards, this.assets], async () => {
      const card = await this.cards.get(id);
      await this.cards.delete(id);
      if (
        card?.imageAssetId &&
        (await this.cards.filter((c) => c.imageAssetId === card.imageAssetId).count()) === 0
      )
        await this.assets.delete(card.imageAssetId);
    });
  }
  async saveGroups(groups: Group[]) {
    z.array(groupSchema).parse(groups);
    await this.transaction('rw', [this.groups, this.cards], async () => {
      await this.groups.clear();
      await this.groups.bulkPut(groups);
      const ids = new Set(groups.map((g) => g.id));
      await this.cards.filter((c) => !!c.groupId && !ids.has(c.groupId)).modify({ groupId: '' });
    });
  }
  async saveSettings(settings: Settings) {
    await this.preferences.put({ id: 'settings', value: settingsSchema.parse(settings) });
  }
  async reorder(cards: Card[]) {
    await this.cards.bulkPut(cards);
  }
  async restore(snapshot: Snapshot) {
    await this.transaction(
      'rw',
      [this.cards, this.groups, this.assets, this.preferences],
      async () => {
        await this.cards.clear();
        await this.groups.clear();
        await this.assets.clear();
        await this.cards.bulkPut(snapshot.cards);
        await this.groups.bulkPut(snapshot.groups);
        await this.assets.bulkPut(snapshot.assets);
        await this.saveSettings(snapshot.settings);
      },
    );
  }
  async clear() {
    await this.restore({ cards: [], groups: [], assets: [], settings: { ...defaultSettings } });
  }
}
const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  cards: z.array(cardSchema).max(10000),
  groups: z.array(groupSchema).max(200),
  settings: settingsSchema,
  assets: z
    .array(z.object({ id: z.string().min(1).max(100), data: z.string().max(15_000_000) }))
    .max(1000),
});
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export async function blobData(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return 'data:' + blob.type + ';base64,' + btoa(binary);
}
export async function serialize(snapshot: Snapshot): Promise<string> {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: snapshot.cards,
      groups: snapshot.groups,
      settings: snapshot.settings,
      assets: await Promise.all(
        snapshot.assets.map(async (a) => ({ id: a.id, data: await blobData(a.blob) })),
      ),
    },
    null,
    2,
  );
}
export async function parseBackup(text: string): Promise<Snapshot> {
  const t = dict();
  if (text.length > 60 * 1024 * 1024) throw new Error(t.errors.backupTooLarge);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error(t.errors.backupBadJson);
  }
  const result = backupSchema.safeParse(input);
  if (!result.success) throw new Error(t.errors.backupUnsupported);
  const parsed = result.data;
  for (const list of [parsed.cards, parsed.groups, parsed.assets])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw new Error(t.errors.backupDuplicateIds);
  const groups = new Set(parsed.groups.map((g) => g.id)),
    assets = new Set(parsed.assets.map((a) => a.id));
  if (
    parsed.cards.some(
      (c) =>
        (c.groupId && !groups.has(c.groupId)) || (c.imageAssetId && !assets.has(c.imageAssetId)),
    )
  )
    throw new Error(t.errors.backupBadRefs);
  const decoded = parsed.assets.map((a) => {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      a.data,
    );
    if (!match) throw new Error(t.errors.backupImageType);
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error(t.errors.backupImageTooLarge);
    return { id: a.id, blob: new Blob([bytes], { type: match[1] }) };
  });
  return { cards: parsed.cards, groups: parsed.groups, settings: parsed.settings, assets: decoded };
}
export const localAdapter = new LocalAdapter();
