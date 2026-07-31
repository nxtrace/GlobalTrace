export function isInitialMapStyleLoadError(event: unknown, mapStyleUrl: string): boolean {
  if (typeof event !== "object" || event === null || !("error" in event)) return false;
  const error = event.error;
  if (typeof error !== "object" || error === null || !("url" in error)) return false;
  if (typeof error.url !== "string" || !error.url) return false;

  return normalizeResourceUrl(error.url) === normalizeResourceUrl(mapStyleUrl);
}

function normalizeResourceUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}
