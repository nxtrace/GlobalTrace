import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Button } from "./ui/button";
import { useI18n } from "../i18n";

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
  const messages = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (priority !== "blocking" && document.querySelector(".glass-overlay-blocking")) return;
      if (event.key === "Tab") trapFocus(event, dialogRef.current);
      if (dismissible && event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissible, onClose, open, priority]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.contains(document.activeElement)) {
      const target = getFocusableElements(dialog)[0] ?? dialog;
      target.focus({ preventScroll: true });
    }
    return () => {
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

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
          ref={dialogRef}
          className={`glass-overlay-bare-surface ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
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
        <section
          ref={dialogRef}
          className="glass-overlay-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
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
                <Button variant="ghost" size="icon" type="button" aria-label={messages.closeTitle(title)}>
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

function trapFocus(event: KeyboardEvent, dialog: HTMLElement | null): void {
  if (!dialog) return;
  const focusableElements = getFocusableElements(dialog);
  if (!focusableElements.length) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (!dialog.contains(activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
    return;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}
