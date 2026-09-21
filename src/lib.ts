import { dict } from './i18n';
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copy(text: string) {
  if (!navigator.clipboard) throw new Error(dict().errors.clipboardUnsupported);
  await navigator.clipboard.writeText(text);
}
export function errorMessage(error: unknown) {
  const t = dict();
  return error instanceof Error
    ? error.name === 'ZodError'
      ? t.errors.invalidInput
      : error.message
    : t.errors.generic;
}
