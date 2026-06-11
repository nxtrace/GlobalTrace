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
}
