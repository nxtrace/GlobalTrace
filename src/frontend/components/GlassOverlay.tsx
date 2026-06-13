import { useEffect, useId, type MouseEvent, type ReactNode } from "react";
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
}

export function GlassOverlay({ open, title, children, onClose, className = "", size = "compact" }: GlassOverlayProps) {
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

  return (
    <div className={`glass-overlay glass-overlay-${size}`} onMouseDown={closeFromBackdrop}>
      <LiquidGlassSurface variant="panel" fullWidth className={`glass-overlay-surface ${className}`.trim()}>
        <section className="glass-overlay-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <header className="glass-overlay-header">
            <h2 id={titleId}>{title}</h2>
            <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label={`关闭${title}`}>
              <X size={18} />
            </Button>
          </header>
          <div className="glass-overlay-body">{children}</div>
        </section>
      </LiquidGlassSurface>
    </div>
  );
}
