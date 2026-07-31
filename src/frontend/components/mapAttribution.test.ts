import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { addMapAttribution, collapseMapAttribution } from "./mapAttribution";

function createAttribElement() {
  const element = document.createElement("details");
  element.className = "maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show";
  const button = document.createElement("summary");
  button.className = "maplibregl-ctrl-attrib-button";
  element.append(button);
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
    expect(element).not.toHaveAttribute("open");
    expect(element.querySelector(".map-attrib-label")?.textContent).toBe("OpenFreeMap");

    collapseMapAttribution(map);
    expect(element.querySelectorAll(".map-attrib-label")).toHaveLength(1);
  });

  it("does nothing when the attribution control is absent", () => {
    const map = {
      getContainer: () => document.createElement("div"),
    } as unknown as MapLibreMap;

    expect(() => collapseMapAttribution(map)).not.toThrow();
  });
});

describe("addMapAttribution", () => {
  it("uses bottom-left compact attribution and preserves only a manual expansion on resize", () => {
    const element = createAttribElement();
    const container = document.createElement("div");
    container.append(element);
    const handlers = new Map<string, Array<() => void>>();
    const addControl = vi.fn();
    const map = {
      getContainer: () => container,
      addControl,
      on: (event: string, handler: () => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return map;
      },
    } as unknown as MapLibreMap;
    const button = element.querySelector(".maplibregl-ctrl-attrib-button") as HTMLElement;
    button.addEventListener("click", () => {
      element.classList.toggle("maplibregl-compact-show");
    });
    const trigger = (event: string) => {
      for (const handler of handlers.get(event) ?? []) handler();
    };

    addMapAttribution(map);

    expect(addControl).toHaveBeenCalledOnce();
    expect(addControl).toHaveBeenCalledWith(expect.anything(), "bottom-left");
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);

    element.classList.add("maplibregl-compact-show");
    element.setAttribute("open", "");
    trigger("load");
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);
    expect(element).not.toHaveAttribute("open");

    // A MapLibre-driven resize expansion is still collapsed.
    element.classList.add("maplibregl-compact-show");
    element.setAttribute("open", "");
    trigger("resize");
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);
    expect(element).not.toHaveAttribute("open");

    // A user expansion survives resize, and a later user collapse resets that preference.
    button.click();
    expect(element.classList.contains("maplibregl-compact-show")).toBe(true);
    trigger("resize");
    expect(element.classList.contains("maplibregl-compact-show")).toBe(true);

    button.click();
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);
    element.classList.add("maplibregl-compact-show");
    trigger("resize");
    expect(element.classList.contains("maplibregl-compact-show")).toBe(false);
  });
});
