import { z } from 'zod';

export const cardTypes = ['web', 'mini', 'other'] as const;
/** Pre-merge taxonomy kept working by transparently migrating stored values. */
const legacyTypes: Record<string, (typeof cardTypes)[number]> = {
  'wechat-mini': 'mini',
  'alipay-mini': 'mini',
  'wechat-link': 'web',
  'alipay-link': 'web',
};
export function migrateCardType(value: string) {
  return legacyTypes[value] ?? value;
}
export function migrateCard(card: Card): Card {
  return legacyTypes[card.type] ? { ...card, type: legacyTypes[card.type] } : card;
}
export const cardSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  type: z.preprocess(
    (value) => (typeof value === 'string' ? migrateCardType(value) : value),
    z.enum(cardTypes),
  ),
  rawContent: z.string().max(4000),
  groupId: z.string().max(100),
  tags: z.array(z.string().max(40)).max(20),
  note: z.string().max(4000),
  favorite: z.boolean(),
  imageAssetId: z.string().max(100).optional(),
  sortOrder: z.number().finite(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
});
export const groupSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(50),
  sortOrder: z.number().finite(),
  collapsed: z.boolean(),
});
export const settingsSchema = z.object({
  locale: z.enum(['zh', 'en']).default('zh'),
  theme: z.enum(['light', 'dark', 'system']),
  accent: z.string().regex(/^#[\da-f]{6}$/i),
  background: z.enum(['paper', 'white', 'warm']),
  columns: z.number().int().min(2).max(5),
  density: z.enum(['comfortable', 'compact']),
  radius: z.number().int().min(0).max(24),
  qrStyle: z.enum(['square', 'dots', 'rounded']),
  metadata: z.boolean(),
  favicon: z.boolean(),
  extensions: z
    .record(z.union([z.string().max(2000), z.number().finite(), z.boolean()]))
    .default({}),
  title: z.string().min(1).max(60),
  lastBackup: z.number().finite().nullable(),
});
export type Card = z.infer<typeof cardSchema>;
export type Group = z.infer<typeof groupSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Asset = { id: string; blob: Blob };
export type Snapshot = { cards: Card[]; groups: Group[]; settings: Settings; assets: Asset[] };
export const defaultSettings: Settings = {
  locale: 'zh',
  theme: 'system',
  accent: '#2e2e30',
  background: 'paper',
  columns: 3,
  density: 'comfortable',
  radius: 16,
  qrStyle: 'square',
  metadata: false,
  favicon: false,
  title: '我的收藏空间',
  lastBackup: null,
  extensions: {},
};
