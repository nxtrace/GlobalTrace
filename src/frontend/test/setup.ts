import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  if (!window.URL.createObjectURL) {
    Object.defineProperty(window.URL, "createObjectURL", {
      value: () => "blob:maplibre-worker",
    });
  }

  if (!window.URL.revokeObjectURL) {
    Object.defineProperty(window.URL, "revokeObjectURL", {
      value: () => undefined,
    });
  }

  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: matchesMediaQuery(query),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
}

function matchesMediaQuery(query: string): boolean {
  const minWidth = /min-width:\s*(\d+)px/.exec(query);
  const maxWidth = /max-width:\s*(\d+)px/.exec(query);
  if (minWidth && window.innerWidth < Number(minWidth[1])) return false;
  if (maxWidth && window.innerWidth > Number(maxWidth[1])) return false;
  if (minWidth || maxWidth) return true;
  return false;
}
