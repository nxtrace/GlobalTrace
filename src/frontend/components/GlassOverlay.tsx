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
}: GlassOverlayProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const overlayClassName = `glass-overlay glass-overlay-${size} glass-overlay-${placement} glass-overlay-chrome-${chrome}`;

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
      <LiquidGlassSurface variant="floatingPanel" fullWidth className={`glass-overlay-surface ${className}`.trim()}>
        <section className="glass-overlay-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <header className="glass-overlay-header">
            <h2 id={titleId}>{title}</h2>
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
