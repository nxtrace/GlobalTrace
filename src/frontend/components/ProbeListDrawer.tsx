import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "./ui/button";
import { useI18n } from "../i18n";

interface ProbeListDrawerProps {
  id: string;
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

const DISMISS_DISTANCE_PX = 72;
const DISMISS_VELOCITY_PX_MS = 0.45;

export function ProbeListDrawer({ id, open, title, children, onClose }: ProbeListDrawerProps) {
  const messages = useI18n();
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const ignoreNextClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setDragging(false);
      dragRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeElement = document.activeElement;
    previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      window.requestAnimationFrame(() => {
        const controller = Array.from(
          document.querySelectorAll<HTMLElement>("[aria-controls]"),
        ).find((element) => element.getAttribute("aria-controls") === id);
        const target = controller?.isConnected ? controller : previousFocus;
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, [id, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".overlay")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const resetDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    setDragY(0);
  }, []);

  const endDrag = useCallback((clientY: number) => {
    const drag = dragRef.current;
    resetDrag();
    if (!drag) return;

    const distance = Math.max(0, clientY - drag.startY);
    if (!drag.moved) {
      onClose();
      return;
    }

    const shouldDismiss =
      distance >= DISMISS_DISTANCE_PX ||
      (distance >= 40 && drag.velocity >= DISMISS_VELOCITY_PX_MS);

    if (shouldDismiss) {
      onClose();
      return;
    }
  }, [onClose, resetDrag]);

  useEffect(() => {
    if (!dragging) return;
    const finish = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      endDrag(event.clientY);
    };
    const cancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      resetDrag();
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, endDrag, resetDrag]);

  return (
    <aside
      id={id}
      className="probe-drawer"
      data-open={open}
      data-dragging={dragging ? "true" : "false"}
      aria-label={title}
      inert={!open ? true : undefined}
      style={
        open && dragY > 0
          ? ({ "--probe-drawer-drag": `${dragY}px` } as CSSProperties)
          : undefined
      }
    >
      <button
        type="button"
        className="probe-drawer-grab"
        tabIndex={open ? 0 : -1}
        aria-label={messages.dragToClose(title)}
        onClick={() => {
          if (ignoreNextClickRef.current) {
            ignoreNextClickRef.current = false;
            return;
          }
          onClose();
        }}
        onPointerDown={(event) => {
          if (!open || event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            lastTime: performance.now(),
            velocity: 0,
            moved: false,
          };
          setDragging(true);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const nextY = Math.max(0, event.clientY - drag.startY);
          const now = performance.now();
          const dt = Math.max(1, now - drag.lastTime);
          drag.velocity = (event.clientY - drag.lastY) / dt;
          drag.lastY = event.clientY;
          drag.lastTime = now;
          if (nextY > 4) drag.moved = true;
          setDragY(nextY);
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          ignoreNextClickRef.current = true;
          window.setTimeout(() => {
            ignoreNextClickRef.current = false;
          }, 0);
          endDrag(event.clientY);
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          resetDrag();
        }}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          resetDrag();
        }}
      >
        <div className="probe-drawer-handle" aria-hidden="true" />
      </button>
      <div className="probe-drawer-body">
        <Button
          ref={closeRef}
          variant="ghost"
          size="icon"
          type="button"
          className="probe-drawer-close"
          aria-label={messages.closeTitle(title)}
          onClick={onClose}
        >
          <X size={18} />
        </Button>
        {children}
      </div>
    </aside>
  );
}
