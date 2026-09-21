# Architecture & extension guide

## State and persistence

src/core/types.ts contains Zod schemas and inferred TypeScript models. A Card has rawContent (text or URL), type, groupId, optional imageAssetId, tags, note, favorite, ordering and timestamps. Images are Blob records in a separate assets table.

LocalAdapter implements DataAdapter using four IndexedDB tables: cards, groups, assets, preferences. Zustand is an in-memory view of that database, not a second persistent store. UI writes complete through the adapter before refreshing the view.

- saveCard writes a card and optional asset in one transaction.
- saveCards validates the whole batch, then writes all cards/assets in one transaction.
- saveGroups reassigns cards from deleted groups to the empty group ID.
- deleteCard removes an asset only when no other card references it.
- restore replaces all four tables in one transaction.
- Schema changes need a new Dexie version and migration; don't change version 1 in a released deployment.

To use a different backend, implement DataAdapter from src/core/storage.ts and call setDataAdapter(adapter) from src/store.ts **before** rendering App. Preserve atomic semantics, shared-asset cleanup, schema validation and error propagation.

## Backup format

JSON version 1 includes exportedAt, cards, groups, settings and assets. Exported assets use raster base64 data URLs. parseBackup checks schema, size, uniqueness and foreign-key references before converting images to Blob. The settings UI previews counts before calling restore.

Restores are replace operations, not merges. Raw text can contain unsupported schemes, but safeUrl never renders them as clickable links. No imported HTML is rendered with dangerouslySetInnerHTML. SVG assets are not accepted.

Limits: 60 MB JSON; 10000 cards; 200 groups; 1000 assets; 10 MB per image. Import form image decode additionally caps dimensions at 24 million pixels.

## Decoder registration

```ts
import { decoderPipeline } from './core/decode';
decoderPipeline.register({
  id: 'custom-qr-format',
  async decode(image: Blob): Promise<string | null> {
    // Return a payload, or null when unsupported.
    return null;
  },
});
```

Built-ins execute sequentially: optional native BarcodeDetector, qr-scanner, jsQR. Each decoder failure is isolated. Libraries load on demand. The jsQR fallback tries scaled images and both polarities. This is a fallback strategy, not a claim about which engine performs best.

No content means the import UI retains the uploaded image and asks the user to classify it. A regular URL from WeChat or Alipay is classified as a link, not automatically a proprietary mini-program code.

## Metadata registration

```ts
import { registerMetadataProvider } from './core/metadata';
registerMetadataProvider({
  id: 'my-allowed-source',
  async fetchMeta(url) {
    // Respect user privacy, CORS and timeouts.
    return { title: 'Example', description: 'Optional description' };
  },
});
```

Providers run in registration order only when metadata is enabled by the user. The default direct provider uses a four-second timeout, omitted credentials and no referrer. Failures return to manual editing. A custom provider must disclose its network destination and bound its request time. No public proxy is configured.

## Card actions

```ts
import { registerCardAction } from './registry';
registerCardAction({
  id: 'copy-markdown',
  label: '复制 Markdown',
  available: (card) => card.type === 'web',
  async run(card) {
    await navigator.clipboard.writeText('[' + card.title + '](' + card.rawContent + ')');
  },
});
```

Registered actions appear in the card's more menu. IDs must be unique. Register extensions at application startup. Plugins execute as trusted source code; they are not sandboxed. Built-in navigation/QR/edit/delete controls stay in CollectionCard.

## Settings fields

```ts
import { registerSetting } from './registry';
registerSetting({
  key: 'my-plugin.caption',
  label: '扩展说明',
  kind: 'text',
  defaultValue: 'Hello',
});
registerSetting({
  key: 'my-plugin.weight',
  label: '扩展强度',
  kind: 'range',
  min: 0,
  max: 10,
  defaultValue: 5,
});
```

Registered fields render in Appearance. Their values live in settings.extensions, survive persistence and backup, and are available through getSettingValue. Your feature must consume its field to change behavior. Registration is not a remote-plugin loader. Built-in appearance fields have typed properties and explicit validation.

## QR rendering

src/core/qr.ts exposes QrRenderer.create(content, style). The default adapter dynamically imports qr-code-styling and returns an instance supporting append/getRawData. Replace qrRenderer.create to customize generation while honoring that contract.

QrModal preserves a white quiet zone, uses dark modules and medium error correction. It renders preserved images for mini-program types by default. SVG export is disabled in original-image mode. PNG conversion, clipboard copy and canvas share-card composition are independent of the page's light/dark theme.

## Appearance and UI

CSS tokens in src/styles.css drive surface, background, foreground, accent, border, radius and columns. The App applies persisted theme settings to the root element and listens to system color-scheme changes. Layout contracts down to a drawer navigation and two/one-column mobile grid. User column count is an upper bound at narrower widths.

Native dialog provides a focus trap and Escape. Buttons have accessible names; dnd-kit has keyboard sorting; prefers-reduced-motion disables transitions. Import owns the camera and destroys it on close/tab change. AssetImage owns and revokes its object URL. Download URLs are revoked after triggering a download.

Top-level copy lives in src/i18n.ts. Full dialog copy migration and a language switch are deferred; do not present the current app as bilingual.

## Source layout

- src/App.tsx — collection view, search, grouping, themes and keyboard shortcuts.
- src/components — modal, import/edit, QR, settings/groups, sortable card, asset image.
- src/core — types, content safety, storage/backup, decoder, metadata, QR adapter.
- src/store.ts — application snapshot and adapter boundary.
- src/registry.ts — card action and setting extension registration.
- src/core/*.test.ts — meaningful data integrity, protocol and fallback tests.

Use npm test and npm run build after behavior changes. See verification.md for manual browser coverage and device-dependent limitations.
