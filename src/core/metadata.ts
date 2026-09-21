export interface MetadataProvider {
  id: string;
  fetchMeta(url: string): Promise<{ title?: string; description?: string } | null>;
}
export const metadataProviders: MetadataProvider[] = [
  {
    id: 'direct',
    async fetchMeta(url) {
      if (!/^https?:\/\//i.test(url)) return null;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) return null;
      const html = (await response.text()).slice(0, 500_000);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return {
        title: doc.querySelector('title')?.textContent?.trim().slice(0, 200),
        description: doc
          .querySelector('meta[name="description"]')
          ?.getAttribute('content')
          ?.slice(0, 2000),
      };
    },
  },
];
export function registerMetadataProvider(provider: MetadataProvider) {
  metadataProviders.push(provider);
}
export async function fetchMetadata(url: string) {
  for (const provider of metadataProviders) {
    try {
      const result = await provider.fetchMeta(url);
      if (result) return result;
    } catch {
      /* CORS and offline failures are expected. */
    }
  }
  return null;
}
