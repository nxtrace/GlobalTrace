import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type maplibregl from "maplibre-gl";
import type { GlobalpingProbe } from "../../../shared/types";

interface UseProbeBoxSelectionArgs {
  boxMode: boolean;
  boxRef: MutableRefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  onBoxSelectRef: MutableRefObject<(probes: GlobalpingProbe[]) => void>;
  probesRef: MutableRefObject<GlobalpingProbe[]>;
  setBoxMode: Dispatch<SetStateAction<boolean>>;
}

export function useProbeBoxSelection({
  boxMode,
  boxRef,
  mapRef,
  onBoxSelectRef,
  probesRef,
  setBoxMode,
}: UseProbeBoxSelectionArgs) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boxMode) return;
    let start: { x: number; y: number } | null = null;
    const canvas = map.getCanvas();

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = pointerPoint(event, canvas);
      start = point;
      map.dragPan.disable();
      canvas.setPointerCapture?.(event.pointerId);
      if (boxRef.current) {
        boxRef.current.style.display = "block";
        boxRef.current.style.left = `${point.x}px`;
        boxRef.current.style.top = `${point.y}px`;
        boxRef.current.style.width = "0px";
        boxRef.current.style.height = "0px";
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!start || !boxRef.current) return;
      const current = pointerPoint(event, canvas);
      const minX = Math.min(start.x, current.x);
      const minY = Math.min(start.y, current.y);
      const maxX = Math.max(start.x, current.x);
      const maxY = Math.max(start.y, current.y);
      boxRef.current.style.left = `${minX}px`;
      boxRef.current.style.top = `${minY}px`;
      boxRef.current.style.width = `${maxX - minX}px`;
      boxRef.current.style.height = `${maxY - minY}px`;
    };

    const finishSelection = (event: PointerEvent) => {
      if (!start) return;
      const current = pointerPoint(event, canvas);
      const minX = Math.min(start.x, current.x);
      const minY = Math.min(start.y, current.y);
      const maxX = Math.max(start.x, current.x);
      const maxY = Math.max(start.y, current.y);
      const projected = validProbes(probesRef.current).map((probe) => ({
        city: probe.location.city,
        point: projectedProbePoint(map, probe, (minX + maxX) / 2),
      }));
      const selected = validProbes(probesRef.current).filter((probe) => {
        const point = projectedProbePoint(map, probe, (minX + maxX) / 2);
        return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      });
      if (import.meta.env.DEV) {
        (canvas as HTMLCanvasElement & { __globalTraceLastBox?: unknown }).__globalTraceLastBox = {
          minX,
          minY,
          maxX,
          maxY,
          projected,
          selected: selected.map((probe) => probe.location.city),
        };
      }
      onBoxSelectRef.current(selected);
      start = null;
      map.dragPan.enable();
      if (boxRef.current) boxRef.current.style.display = "none";
      setBoxMode(false);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishSelection);
    window.addEventListener("pointercancel", finishSelection);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishSelection);
      window.removeEventListener("pointercancel", finishSelection);
      map.dragPan.enable();
      if (boxRef.current) boxRef.current.style.display = "none";
    };
  }, [boxMode, boxRef, mapRef, onBoxSelectRef, probesRef, setBoxMode]);
}

function pointerPoint(event: PointerEvent, element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function projectedProbePoint(
  map: maplibregl.Map,
  probe: GlobalpingProbe,
  targetX: number,
): { x: number; y: number } {
  const { longitude, latitude } = probe.location;
  return [longitude - 360, longitude, longitude + 360]
    .map((lng) => map.project([lng, latitude]))
    .sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX))[0];
}

function validProbes(probes: GlobalpingProbe[]): GlobalpingProbe[] {
  return probes.filter((probe) => Number.isFinite(probe.location.longitude) && Number.isFinite(probe.location.latitude));
}
