import type { Card, Settings } from './core/types';
export interface CardAction {
  id: string;
  label: string;
  available?: (card: Card) => boolean;
  run: (card: Card) => void | Promise<void>;
}
export const cardActions: CardAction[] = [];
export function registerCardAction(action: CardAction) {
  if (cardActions.some((a) => a.id === action.id)) throw new Error('Duplicate action ID');
  cardActions.push(action);
}
export type SettingField = {
  key: string;
  label: string;
  kind: 'text' | 'range';
  min?: number;
  max?: number;
  defaultValue?: string | number;
};
export const settingFields: SettingField[] = [
  { key: 'title', label: '空间名称', kind: 'text' },
  { key: 'columns', label: '每行卡片', kind: 'range', min: 2, max: 5 },
  { key: 'radius', label: '卡片圆角', kind: 'range', min: 0, max: 24 },
  { key: 'qrSize', label: '二维码尺寸', kind: 'range', min: 220, max: 380, defaultValue: 272 },
];
const builtinKeys = ['title', 'columns', 'radius'];
export function registerSetting(field: SettingField) {
  if (settingFields.some((f) => f.key === field.key)) throw new Error('Duplicate setting key');
  settingFields.push(field);
}
export function getSettingValue(settings: Settings, field: SettingField): string | number {
  return builtinKeys.includes(field.key)
    ? settings[field.key as 'title' | 'columns' | 'radius']
    : ((settings.extensions[field.key] as string | number) ??
        field.defaultValue ??
        (field.kind === 'range' ? (field.min ?? 0) : ''));
}
export function settingPatch(
  settings: Settings,
  field: SettingField,
  value: string | number,
): Partial<Settings> {
  return builtinKeys.includes(field.key)
    ? { [field.key]: value }
    : { extensions: { ...settings.extensions, [field.key]: value } };
}
