import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useI18n } from "../i18n";

interface ResultSlideoverProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onOpen: () => void;
  onClose: () => void;
}

const PEEK_SIZE_PX = 40;
const MOBILE_PEEK_HEIGHT_PX = 56;
const MIN_WIDTH_PX = 420;
/** Visual width after damping must fall below this to collapse on release. */
const COLLAPSE_COMMIT_WIDTH_PX = 320;
/** Below 420px, mouse travel shrinks the panel by this factor (rubber-band). */
const WIDTH_COLLAPSE_DAMPING = 0.58;
const DRAG_MIN_WIDTH_PX = 160;
/** Preferred gap when opening without covering the filter column. */
const FILTER_GAP_PX = 4;
/**
 * Desktop max width may cover the filter. Leave enough left margin that the
 * resize handle (extends ~22px past the panel) still exposes a clickable
 * backdrop strip to dismiss the whole result sheet.
 */
const VIEWPORT_EDGE_GAP_PX = 48;
const SLIDE_MS = 240;
const MOBILE_QUERY = "(max-width: 820px)";
const MIN_HEIGHT_VH = 0.4;
const DEFAULT_HEIGHT_VH = 0.7;
const MAX_HEIGHT_VH = 0.92;
const MIN_HEIGHT_PX = 280;
const COLLAPSE_HEIGHT_PX = 220;
const DRAG_MIN_HEIGHT_PX = 120;
const KEYBOARD_RESIZE_STEP_PX = 24;
/** Pull the collapsed peek at least this far to commit open on release. */
const OPEN_DRAG_THRESHOLD_PX = 48;
/** Below this movement, a press is treated as a tap-to-open. */
const OPEN_TAP_SLOP_PX = 8;
/** Drag distance where peek chrome is fully faded at rest speed. */
const CHROME_FADE_DISTANCE_PX = 120;
/** Longer fade travel on mobile so the title eases out more gently. */
const CHROME_FADE_DISTANCE_MOBILE_PX = 180;
/** Converts px/ms velocity into extra fade distance for the chrome. */
const CHROME_SPEED_TO_DISTANCE = 55;
const CHROME_SPEED_TO_DISTANCE_MOBILE = 40;
/** Ignore sub-frame spikes when estimating drag speed. */
const CHROME_VELOCITY_SAMPLE_MS = 8;
/** Cap estimated drag speed used for chrome fading. */
const CHROME_MAX_VELOCITY_PX_MS = 1.4;
/** Keep peek mounted briefly after open so chrome can finish fading out. */
const PEEK_UNMOUNT_DELAY_MS = 220;

type ResizeSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

type ExpandSession = {
  pointerId: number;
  startX: number;
  startY: number;
  delta: number;
  maxDelta: number;
  lastSampleAt: number;
  lastSampleDelta: number;
  velocity: number;
};

export function ResultSlideover({
  open,
  title,
  children,
  onOpen,
  onClose,
}: ResultSlideoverProps) {
  const messages = useI18n();
  const [isMobile, setIsMobile] = useState(() => readIsMobile());
  const [width, setWidth] = useState(() => defaultPanelWidth());
  const [height, setHeight] = useState(() => defaultPanelHeight());
  const [resizing, setResizing] = useState(false);
  const [expandDrag, setExpandDrag] = useState(0);
  const [peekChromeOpacity, setPeekChromeOpacity] = useState(1);
  const [peekRevealed, setPeekRevealed] = useState(() => !open);
  const [peekEntering, setPeekEntering] = useState(false);
  const [backdropShown, setBackdropShown] = useState(open);
  const [backdropLeaving, setBackdropLeaving] = useState(false);
  const resizeRef = useRef<ResizeSession | null>(null);
  const expandRef = useRef<ExpandSession | null>(null);
  const wasOpenRef = useRef(open);
  const sizeRef = useRef({ width, height });
  const rememberedWidthRef = useRef<number | null>(null);
  const rememberedHeightRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const peekRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusRestoreTimerRef = useRef<number | null>(null);
  const backdropOpenRef = useRef(open);
  const suppressPeekClickRef = useRef(false);
  sizeRef.current = { width, height };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector(".overlay")) return;
      if (event.key === "Tab") trapFocus(event, panelRef.current);
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const wasInert = appShell?.inert ?? false;
    if (appShell) appShell.inert = true;
    return () => {
      if (appShell?.isConnected) appShell.inert = wasInert;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const activeElement = document.activeElement;
    previousFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    const timer = window.setTimeout(() => {
      if (!panel.contains(document.activeElement)) {
        (getFocusableElements(panel)[0] ?? panel).focus({ preventScroll: true });
      }
    }, SLIDE_MS);
    return () => {
      window.clearTimeout(timer);
      if (focusRestoreTimerRef.current !== null) {
        window.clearTimeout(focusRestoreTimerRef.current);
        focusRestoreTimerRef.current = null;
      }
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      // Wait for the slide-out so focus restore does not hitch the animation.
      focusRestoreTimerRef.current = window.setTimeout(() => {
        focusRestoreTimerRef.current = null;
        const target =
          previousFocus?.isConnected && !previousFocus.closest("[inert]")
            ? previousFocus
            : peekRef.current;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }, SLIDE_MS);
    };
  }, [open]);

  const finishResize = (pointerId: number) => {
    if (resizeRef.current?.pointerId !== pointerId) return;
    resizeRef.current = null;
    setResizing(false);
    if (isMobile) {
      const nextHeight = sizeRef.current.height;
      if (nextHeight < COLLAPSE_HEIGHT_PX) {
        // Do not restore size here — that flashes full height before slide-out.
        onClose();
        return;
      }
      const clampedHeight = clampPanelHeight(nextHeight);
      rememberedHeightRef.current = clampedHeight;
      setHeight(clampedHeight);
      return;
    }
    const nextWidth = sizeRef.current.width;
    if (nextWidth < COLLAPSE_COMMIT_WIDTH_PX) {
      onClose();
      return;
    }
    const clampedWidth = clampPanelWidth(nextWidth);
    rememberedWidthRef.current = clampedWidth;
    setWidth(clampedWidth);
  };
  const finishResizeRef = useRef(finishResize);
  finishResizeRef.current = finishResize;

  useEffect(() => {
    if (!resizing) return;
    const resetFromWindow = (event: PointerEvent) => {
      finishResizeRef.current(event.pointerId);
    };
    window.addEventListener("pointerup", resetFromWindow);
    window.addEventListener("pointercancel", resetFromWindow);
    return () => {
      window.removeEventListener("pointerup", resetFromWindow);
      window.removeEventListener("pointercancel", resetFromWindow);
    };
  }, [resizing]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (!open) {
      // Peek returns with the sheet; CSS animates title/background in (no rAF setState).
      setPeekRevealed(true);
      setPeekChromeOpacity(1);
      if (wasOpen) {
        setPeekEntering(true);
        const enterDone = window.setTimeout(() => setPeekEntering(false), SLIDE_MS);
        // Restore openable size only after slide-out so close does not flash larger.
        const restoreSize = window.setTimeout(() => {
          if (isMobile) {
            const next = clampPanelHeight(
              rememberedHeightRef.current ?? defaultPanelHeight(),
            );
            sizeRef.current = { ...sizeRef.current, height: next };
            setHeight(next);
            return;
          }
          const next = clampPanelWidth(
            rememberedWidthRef.current ?? defaultPanelWidth(),
          );
          sizeRef.current = { ...sizeRef.current, width: next };
          setWidth(next);
        }, SLIDE_MS);
        return () => {
          window.clearTimeout(enterDone);
          window.clearTimeout(restoreSize);
        };
      }
      setPeekEntering(false);
      return;
    }

    // Only sync while open. Keep the last dragged size across close/reopen;
    // do not expand to max on close (that flashes before the slide-out finishes).
    expandRef.current = null;
    setExpandDrag(0);
    setPeekEntering(false);
    setPeekChromeOpacity(0);
    const unmountPeek = window.setTimeout(() => {
      setPeekRevealed(false);
    }, PEEK_UNMOUNT_DELAY_MS);
    if (isMobile) {
      setHeight(
        clampPanelHeight(rememberedHeightRef.current ?? defaultPanelHeight()),
      );
    } else {
      setWidth(
        clampPanelWidth(rememberedWidthRef.current ?? defaultPanelWidth()),
      );
    }
    const syncSize = () => {
      if (isMobile) {
        setHeight((current) => {
          const next = clampPanelHeight(current);
          if (next >= minPanelHeight()) rememberedHeightRef.current = next;
          return next;
        });
        return;
      }
      setWidth((current) => {
        const next = clampPanelWidth(current);
        if (next >= MIN_WIDTH_PX) rememberedWidthRef.current = next;
        return next;
      });
    };
    window.addEventListener("resize", syncSize);
    return () => {
      window.clearTimeout(unmountPeek);
      window.removeEventListener("resize", syncSize);
    };
  }, [isMobile, open]);

  useEffect(() => {
    if (open) {
      backdropOpenRef.current = true;
      setBackdropShown(true);
      setBackdropLeaving(false);
      return;
    }
    if (!backdropOpenRef.current) {
      setBackdropShown(false);
      setBackdropLeaving(false);
      return;
    }
    backdropOpenRef.current = false;
    setBackdropLeaving(true);
    const hide = window.setTimeout(() => {
      setBackdropShown(false);
      setBackdropLeaving(false);
    }, 180);
    return () => window.clearTimeout(hide);
  }, [open]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0) return;
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: width,
      startHeight: height,
    };
    setResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (isMobile) {
      const next = clampDragPanelHeight(drag.startHeight + (drag.startY - event.clientY));
      sizeRef.current = { ...sizeRef.current, height: next };
      setHeight(next);
      return;
    }
    const next = clampDragPanelWidth(drag.startWidth + (drag.startX - event.clientX));
    sizeRef.current = { ...sizeRef.current, width: next };
    setWidth(next);
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
  };

  const cancelResize = (pointerId: number) => {
    finishResize(pointerId);
  };

  const resizeFromKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "Home") next = isMobile ? minPanelHeight() : Math.min(MIN_WIDTH_PX, maxPanelWidth());
    if (event.key === "End") next = isMobile ? maxPanelHeight() : maxPanelWidth();
    if (isMobile && event.key === "ArrowUp") next = height + KEYBOARD_RESIZE_STEP_PX;
    if (isMobile && event.key === "ArrowDown") next = height - KEYBOARD_RESIZE_STEP_PX;
    if (!isMobile && event.key === "ArrowLeft") next = width + KEYBOARD_RESIZE_STEP_PX;
    if (!isMobile && event.key === "ArrowRight") next = width - KEYBOARD_RESIZE_STEP_PX;
    if (next === null) return;
    event.preventDefault();
    if (isMobile) {
      const clampedHeight = clampPanelHeight(next);
      rememberedHeightRef.current = clampedHeight;
      setHeight(clampedHeight);
      return;
    }
    const clampedWidth = clampPanelWidth(next);
    rememberedWidthRef.current = clampedWidth;
    setWidth(clampedWidth);
  };

  const closeFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const maxExpandDrag = () =>
    Math.max(
      0,
      (isMobile ? sizeRef.current.height : sizeRef.current.width) -
        (isMobile ? MOBILE_PEEK_HEIGHT_PX : PEEK_SIZE_PX),
    );

  const finishExpand = (pointerId: number) => {
    const session = expandRef.current;
    if (!session || session.pointerId !== pointerId) return;
    expandRef.current = null;
    setResizing(false);
    const committed = session.maxDelta >= OPEN_DRAG_THRESHOLD_PX;
    const isTap = session.maxDelta < OPEN_TAP_SLOP_PX;
    // Always consume the synthetic click; open on tap or a committed drag.
    suppressPeekClickRef.current = true;
    if (committed) {
      const peek = isMobile ? MOBILE_PEEK_HEIGHT_PX : PEEK_SIZE_PX;
      const revealed = peek + session.delta;
      if (isMobile) {
        const next = clampPanelHeight(revealed);
        rememberedHeightRef.current = next;
        setHeight(next);
      } else {
        const next = clampPanelWidth(revealed);
        rememberedWidthRef.current = next;
        setWidth(next);
      }
      // Keep expandDrag until open so the preview does not snap back to the peek.
      setPeekChromeOpacity(0);
      onOpen();
      return;
    }
    setExpandDrag(0);
    if (isTap) {
      setPeekChromeOpacity(0);
      onOpen();
      return;
    }
    setPeekChromeOpacity(1);
  };
  const finishExpandRef = useRef(finishExpand);
  finishExpandRef.current = finishExpand;

  useEffect(() => {
    if (!resizing || open) return;
    const resetFromWindow = (event: PointerEvent) => {
      finishExpandRef.current(event.pointerId);
    };
    window.addEventListener("pointerup", resetFromWindow);
    window.addEventListener("pointercancel", resetFromWindow);
    return () => {
      window.removeEventListener("pointerup", resetFromWindow);
      window.removeEventListener("pointercancel", resetFromWindow);
    };
  }, [open, resizing]);

  const startExpand = (event: ReactPointerEvent<HTMLElement>) => {
    if (open || event.button !== 0) return;
    // Ensure backing size is the openable size (no layout jump if already set).
    if (isMobile) {
      const next = clampPanelHeight(
        rememberedHeightRef.current ?? defaultPanelHeight(),
      );
      if (sizeRef.current.height !== next) {
        sizeRef.current = { ...sizeRef.current, height: next };
        setHeight(next);
      }
    } else {
      const next = clampPanelWidth(
        rememberedWidthRef.current ?? maxPanelWidth(),
      );
      if (sizeRef.current.width !== next) {
        sizeRef.current = { ...sizeRef.current, width: next };
        setWidth(next);
      }
    }
    expandRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      delta: 0,
      maxDelta: 0,
      lastSampleAt: performance.now(),
      lastSampleDelta: 0,
      velocity: 0,
    };
    setPeekChromeOpacity(1);
    setResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const moveExpand = (event: ReactPointerEvent<HTMLElement>) => {
    const session = expandRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const delta = isMobile
      ? session.startY - event.clientY
      : session.startX - event.clientX;
    const next = Math.max(0, Math.min(maxExpandDrag(), Math.round(delta)));
    const now = performance.now();
    const elapsed = now - session.lastSampleAt;
    if (elapsed >= CHROME_VELOCITY_SAMPLE_MS) {
      const instantVelocity = Math.min(
        CHROME_MAX_VELOCITY_PX_MS,
        Math.abs(next - session.lastSampleDelta) / elapsed,
      );
      session.velocity = session.velocity * 0.65 + instantVelocity * 0.35;
      session.lastSampleAt = now;
      session.lastSampleDelta = next;
    }
    session.delta = next;
    session.maxDelta = Math.max(session.maxDelta, next);
    setExpandDrag(next);
    setPeekChromeOpacity(
      peekChromeOpacityForDrag(next, session.velocity, isMobile),
    );
  };

  const endExpand = (event: ReactPointerEvent<HTMLElement>) => {
    finishExpand(event.pointerId);
  };

  const openFromPeekClick = () => {
    if (suppressPeekClickRef.current) {
      suppressPeekClickRef.current = false;
      return;
    }
    setPeekChromeOpacity(0);
    onOpen();
  };

  return (
    <>
      {backdropShown ? (
        <div
          className="result-slideover-backdrop"
          data-testid="result-slideover-backdrop"
          data-leaving={backdropLeaving ? "true" : "false"}
          onMouseDown={backdropLeaving ? undefined : closeFromBackdrop}
        />
      ) : null}
      <aside
        className="result-slideover"
        data-open={open ? "true" : "false"}
        data-mobile={isMobile ? "true" : "false"}
        data-resizing={resizing ? "true" : "false"}
        data-peek-entering={peekEntering ? "true" : "false"}
        style={
          {
            "--result-panel-width": `${width}px`,
            "--result-panel-height": `${height}px`,
            "--result-peek-width": `${PEEK_SIZE_PX}px`,
            "--result-peek-height": `${isMobile ? MOBILE_PEEK_HEIGHT_PX : PEEK_SIZE_PX}px`,
            "--result-expand-drag": `${expandDrag}px`,
            "--result-peek-chrome-opacity": String(peekChromeOpacity),
          } as CSSProperties
        }
      >
        <button
          ref={peekRef}
          type="button"
          className="result-slideover-peek"
          hidden={!peekRevealed}
          aria-hidden={open ? true : undefined}
          aria-expanded={open}
          aria-label={messages.viewResult}
          tabIndex={open ? -1 : 0}
          inert={open ? true : undefined}
          onClick={openFromPeekClick}
          onPointerDown={startExpand}
          onPointerMove={moveExpand}
          onPointerUp={endExpand}
          onPointerCancel={endExpand}
          onLostPointerCapture={endExpand}
        >
          <span className="result-slideover-peek-grip" aria-hidden="true" />
          <span className="result-slideover-peek-label">{title}</span>
        </button>

        <section
          ref={panelRef}
          className="result-slideover-panel"
          role={open ? "dialog" : undefined}
          aria-modal={open ? true : undefined}
          aria-label={open ? title : undefined}
          aria-hidden={open ? undefined : true}
          tabIndex={open ? -1 : undefined}
          inert={!open ? true : undefined}
        >
          <div className="result-slideover-body">{children}</div>
          <div
            className="result-slideover-resize"
            hidden={!open}
            role="separator"
            tabIndex={open ? 0 : -1}
            aria-orientation={isMobile ? "horizontal" : "vertical"}
            aria-label={isMobile ? messages.resizeResultPanelHeight : messages.resizeResultPanel}
            aria-valuemin={isMobile ? minPanelHeight() : Math.min(MIN_WIDTH_PX, maxPanelWidth())}
            aria-valuemax={isMobile ? maxPanelHeight() : maxPanelWidth()}
            aria-valuenow={isMobile ? height : width}
            onKeyDown={resizeFromKeyboard}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={(event) => cancelResize(event.pointerId)}
            onLostPointerCapture={(event) => cancelResize(event.pointerId)}
          />
        </section>
      </aside>
    </>
  );
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
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]"),
  );
}

function readIsMobile(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function peekChromeOpacityForDrag(
  deltaPx: number,
  velocityPxPerMs: number,
  mobile: boolean,
): number {
  const fadeDistance = mobile ? CHROME_FADE_DISTANCE_MOBILE_PX : CHROME_FADE_DISTANCE_PX;
  const speedGain = mobile ? CHROME_SPEED_TO_DISTANCE_MOBILE : CHROME_SPEED_TO_DISTANCE;
  const speedBoost = Math.max(0, velocityPxPerMs) * speedGain;
  const t = Math.min(1, (Math.max(0, deltaPx) + speedBoost) / fadeDistance);
  // Smoothstep: slower at the start so the title does not pop away.
  const smoothed = t * t * (3 - 2 * t);
  return Math.max(0, Math.min(1, 1 - smoothed));
}

function preferredUncoveredWidth(): number {
  if (typeof window === "undefined") return 920;
  if (typeof document === "undefined") {
    return Math.max(MIN_WIDTH_PX, Math.floor(window.innerWidth - (16 + 380 + FILTER_GAP_PX)));
  }
  const filter = document.querySelector(".filter-panel");
  const leftEdge =
    filter instanceof HTMLElement
      ? Math.ceil(filter.getBoundingClientRect().right) + FILTER_GAP_PX
      : 16 + 380 + FILTER_GAP_PX;
  return Math.max(MIN_WIDTH_PX, Math.floor(window.innerWidth - leftEdge));
}

function maxPanelWidth(): number {
  if (typeof window === "undefined") return 920;
  if (window.innerWidth <= 820) return window.innerWidth;
  // Allow dragging over the filter column; only keep a thin viewport margin.
  return Math.max(
    MIN_WIDTH_PX,
    Math.floor(window.innerWidth - VIEWPORT_EDGE_GAP_PX),
  );
}

function defaultPanelWidth(): number {
  // First open keeps the filter visible; users can drag past it afterward.
  return clampPanelWidth(preferredUncoveredWidth());
}

function clampPanelWidth(value: number): number {
  const upper = maxPanelWidth();
  const lower = Math.min(MIN_WIDTH_PX, upper);
  return Math.min(upper, Math.max(lower, Math.round(value)));
}

function clampDragPanelWidth(value: number): number {
  const upper = maxPanelWidth();
  const desired = Math.min(upper, Math.round(value));
  if (desired >= MIN_WIDTH_PX) return desired;
  // Rubber-band past 420px so a casual tug does not reach the collapse commit width.
  const overshoot = MIN_WIDTH_PX - desired;
  const damped = MIN_WIDTH_PX - overshoot * WIDTH_COLLAPSE_DAMPING;
  return Math.max(DRAG_MIN_WIDTH_PX, Math.round(damped));
}

function viewportHeight(): number {
  if (typeof window === "undefined") return 800;
  return window.innerHeight || 800;
}

function minPanelHeight(): number {
  return Math.max(MIN_HEIGHT_PX, Math.round(viewportHeight() * MIN_HEIGHT_VH));
}

function maxPanelHeight(): number {
  return Math.max(minPanelHeight(), Math.round(viewportHeight() * MAX_HEIGHT_VH));
}

function defaultPanelHeight(): number {
  return clampPanelHeight(Math.round(viewportHeight() * DEFAULT_HEIGHT_VH));
}

function clampPanelHeight(value: number): number {
  const upper = maxPanelHeight();
  const lower = Math.min(minPanelHeight(), upper);
  return Math.min(upper, Math.max(lower, Math.round(value)));
}

function clampDragPanelHeight(value: number): number {
  const upper = maxPanelHeight();
  const lower = Math.min(DRAG_MIN_HEIGHT_PX, upper);
  return Math.min(upper, Math.max(lower, Math.round(value)));
}
