import { useEffect, useId, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Button } from "./ui/button";

interface GlassOverlayProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  size?: "compact" | "about" | "result";
  chrome?: "default" | "bare";
  placement?: "center" | "sheet";
  dismissible?: boolean;
  priority?: "default" | "blocking";
  surfaceCornerRadius?: number;
}

export function GlassOverlay({
  open,
  title,
  children,
  onClose,
  className = "",
  size = "compact",
  chrome = "default",
  placement = "center",
  dismissible = true,
  priority = "default",
  surfaceCornerRadius,
}: GlassOverlayProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (priority !== "blocking" && document.querySelector(".glass-overlay-blocking")) return;
      if (dismissible && event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissible, onClose, open, priority]);

  if (!open) return null;

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (dismissible && event.target === event.currentTarget) onClose();
  };

  const overlayClassName = [
    "glass-overlay",
    `glass-overlay-${size}`,
    `glass-overlay-${placement}`,
    `glass-overlay-chrome-${chrome}`,
    priority === "blocking" ? "glass-overlay-blocking" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (chrome === "bare") {
    const overlay = (
      <div className={overlayClassName} onMouseDown={closeFromBackdrop}>
        <section
          className={`glass-overlay-bare-surface ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {children}
        </section>
      </div>
    );
    return renderOverlay(overlay);
  }

  return renderOverlay(
    <div className={overlayClassName} onMouseDown={closeFromBackdrop}>
      <LiquidGlassSurface
        variant="floatingPanel"
        fullWidth
        cornerRadius={surfaceCornerRadius}
        className={`glass-overlay-surface ${className}`.trim()}
      >
        <section className="glass-overlay-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <header className="glass-overlay-header">
            <h2 id={titleId}>{title}</h2>
            {dismissible ? (
              <LiquidGlassSurface
                variant="iconButton"
                interactive
                actionRole="none"
                onClick={onClose}
                className="liquid-glass-coverage overlay-close-surface"
              >
                <Button variant="ghost" size="icon" type="button" aria-label={`关闭${title}`}>
                  <X size={18} />
                </Button>
              </LiquidGlassSurface>
            ) : null}
          </header>
          <div className="glass-overlay-body">{children}</div>
        </section>
      </LiquidGlassSurface>
    </div>,
  );
}

function renderOverlay(overlay: ReactNode): ReactNode {
  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
