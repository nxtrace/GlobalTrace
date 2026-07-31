const displayNamesByLocale = new Map<string, Intl.DisplayNames>();

function regionDisplayNames(locale: string): Intl.DisplayNames | null {
  const cached = displayNamesByLocale.get(locale);
  if (cached) return cached;
  try {
    const formatter = new Intl.DisplayNames([locale], { type: "region" });
    displayNamesByLocale.set(locale, formatter);
    return formatter;
  } catch {
    return null;
  }
}

export function countryDisplayName(code: string, locale: string): string {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return String(code ?? "").trim();
  const name = regionDisplayNames(locale)?.of(normalized);
  return name && name !== normalized ? name : normalized;
}

export function countrySuggestionLabel(code: string, locale: string): string {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return String(code ?? "").trim();
  const name = countryDisplayName(normalized, locale);
  return name === normalized ? normalized : `${name} (${normalized})`;
}
