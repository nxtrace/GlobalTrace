import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { addMapAttribution, collapseMapAttribution } from "./mapAttribution";

function createAttribElement() {
  const element = document.createElement("details");
  element.className = "maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show";
  return element;
}

describe("collapseMapAttribution", () => {
  it("collapses the compact attribution control", () => {
    const element = createAttribElement();
    const container = document.createElement("div");
    container.append(element);
    const map = {
      getContainer: () => container,
    } as unknown as MapLibreMap;

    collapseMapAttribution(map);

    expect(element.classList.contains("maplibregl-compact")).toBe(true);
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);
    expect(element.getAttribute("open")).toBe("");
    expect(element.querySelector(".map-attrib-label")?.textContent).toBe("OpenFreeMap");
  });
});

describe("addMapAttribution", () => {
  it("adds compact attribution and keeps it collapsed after load and resize", () => {
    const element = createAttribElement();
    const container = document.createElement("div");
    container.append(element);
    const handlers = new Map<string, () => void>();
    const addControl = vi.fn();
    const map = {
      getContainer: () => container,
      addControl,
      on: (event: string, handler: () => void) => {
        handlers.set(event, handler);
        return map;
      },
    } as unknown as MapLibreMap;

    addMapAttribution(map);

    expect(addControl).toHaveBeenCalledOnce();
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);

    element.classList.add("maplibregl-compact-show");
    element.removeAttribute("open");
    handlers.get("load")?.();
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);

    element.classList.add("maplibregl-compact-show");
    handlers.get("resize")?.();
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);
  });
});
