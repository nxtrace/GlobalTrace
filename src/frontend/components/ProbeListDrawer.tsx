import { X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".overlay")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const endDrag = (clientY: number) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag) return;

    const distance = Math.max(0, clientY - drag.startY);
    if (!drag.moved) {
      onClose();
      setDragY(0);
      return;
    }

    const shouldDismiss =
      distance >= DISMISS_DISTANCE_PX ||
      (distance >= 40 && drag.velocity >= DISMISS_VELOCITY_PX_MS);

    if (shouldDismiss) {
      onClose();
      setDragY(0);
      return;
    }

    setDragY(0);
  };

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
      <div
        className="probe-drawer-grab"
        role="button"
        tabIndex={open ? 0 : -1}
        aria-label={messages.dragToClose(title)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClose();
          }
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
          endDrag(event.clientY);
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          setDragging(false);
          setDragY(0);
        }}
      >
        <div className="probe-drawer-handle" aria-hidden="true" />
      </div>
      <div className="probe-drawer-body">
        <Button
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
