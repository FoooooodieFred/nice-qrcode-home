import { create } from 'zustand';
import { localAdapter, type DataAdapter } from './core/storage';
import { dict } from './i18n';
import {
  defaultSettings,
  type Snapshot,
  type Card,
  type Group,
  type Settings,
  type Asset,
} from './core/types';
let adapter: DataAdapter = localAdapter;
export function setDataAdapter(next: DataAdapter) {
  adapter = next;
}
interface State extends Snapshot {
  saveMany(entries: { card: Card; asset?: Asset }[]): Promise<void>;
  ready: boolean;
  error: string | null;
  refresh(): Promise<void>;
  save(card: Card, asset?: Asset): Promise<void>;
  remove(id: string): Promise<void>;
  setGroups(groups: Group[]): Promise<void>;
  configure(patch: Partial<Settings>): Promise<void>;
  reorder(cards: Card[]): Promise<void>;
  restore(snapshot: Snapshot): Promise<void>;
  clear(): Promise<void>;
}
export const useStore = create<State>((set, get) => ({
  cards: [],
  groups: [],
  assets: [],
  settings: { ...defaultSettings },
  ready: false,
  error: null,
  async refresh() {
    try {
      set({ ...(await adapter.load()), ready: true, error: null });
    } catch {
      set({ error: dict().errors.storage, ready: true });
    }
  },
  async save(card, asset) {
    await adapter.saveCard(card, asset);
    await get().refresh();
  },
  async saveMany(entries) {
    await adapter.saveCards(entries);
    await get().refresh();
  },
  async remove(id) {
    await adapter.deleteCard(id);
    await get().refresh();
  },
  async setGroups(groups) {
    await adapter.saveGroups(groups);
    await get().refresh();
  },
  async configure(patch) {
    const settings = { ...get().settings, ...patch };
    await adapter.saveSettings(settings);
    set({ settings });
  },
  async reorder(cards) {
    await adapter.reorder(cards);
    await get().refresh();
  },
  async restore(snapshot) {
    await adapter.restore(snapshot);
    await get().refresh();
  },
  async clear() {
    await adapter.clear();
    await get().refresh();
  },
}));
