import maplibregl, { type ControlPosition, type Map as MapLibreMap } from "maplibre-gl";

const COLLAPSED_LABEL = "OpenFreeMap";

function ensureCollapsedLabel(element: HTMLElement): void {
  if (element.querySelector(".map-attrib-label")) return;
  const label = document.createElement("span");
  label.className = "map-attrib-label";
  label.textContent = COLLAPSED_LABEL;
  label.setAttribute("aria-hidden", "true");
  element.append(label);
}

/** Collapse MapLibre attribution to the compact OpenFreeMap chip. */
export function collapseMapAttribution(map: MapLibreMap): void {
  const element = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
  if (!(element instanceof HTMLElement)) return;
  ensureCollapsedLabel(element);
  element.classList.add("maplibregl-compact");
  element.classList.remove("maplibregl-compact-show");
  element.removeAttribute("open");
}

/**
 * Add bottom-left compact attribution that stays collapsed by default.
 * Collapsed chip shows icon + OpenFreeMap; expand reveals full credits.
 * MapLibre's compact mode still expands on wide maps / resize; we undo that.
 */
export function addMapAttribution(map: MapLibreMap, position: ControlPosition = "bottom-left"): void {
  map.addControl(new maplibregl.AttributionControl({ compact: true }), position);
  const element = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
  let manuallyExpanded = false;
  const compactButton = element?.querySelector(".maplibregl-ctrl-attrib-button");
  compactButton?.addEventListener("click", () => {
    manuallyExpanded = element?.classList.contains("maplibregl-compact-show") ?? false;
  });
  const collapse = () => {
    manuallyExpanded = false;
    collapseMapAttribution(map);
  };
  collapse();
  map.on("load", collapse);
  map.on("resize", () => {
    if (!manuallyExpanded) collapseMapAttribution(map);
  });
}
