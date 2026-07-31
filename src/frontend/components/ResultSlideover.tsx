import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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
const MIN_WIDTH_PX = 360;
const FILTER_GAP_PX = 16;
const SLIDE_MS = 240;
const MOBILE_QUERY = "(max-width: 820px)";
const MIN_HEIGHT_VH = 0.4;
const DEFAULT_HEIGHT_VH = 0.7;
const MAX_HEIGHT_VH = 0.92;
const MIN_HEIGHT_PX = 280;

type ResizeSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
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
  const resizeRef = useRef<ResizeSession | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

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
      if (event.key !== "Escape") return;
      if (document.querySelector(".overlay")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const timer = window.setTimeout(() => {
      if (!panel.contains(document.activeElement)) {
        const focusable = panel.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        (focusable ?? panel).focus({ preventScroll: true });
      }
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const syncSize = () => {
      if (isMobile) {
        setHeight((current) => clampPanelHeight(open ? current : defaultPanelHeight()));
        return;
      }
      setWidth((current) => clampPanelWidth(open ? current : maxPanelWidth()));
    };
    syncSize();
    window.addEventListener("resize", syncSize);
    return () => window.removeEventListener("resize", syncSize);
  }, [isMobile, open]);

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
      const delta = drag.startY - event.clientY;
      setHeight(clampPanelHeight(drag.startHeight + delta));
      return;
    }
    const delta = drag.startX - event.clientX;
    setWidth(clampPanelWidth(drag.startWidth + delta));
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setResizing(false);
  };

  const closeFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <>
      {open ? (
        <div
          className="result-slideover-backdrop"
          data-testid="result-slideover-backdrop"
          onMouseDown={closeFromBackdrop}
        />
      ) : null}
      <aside
        className="result-slideover"
        data-open={open ? "true" : "false"}
        data-mobile={isMobile ? "true" : "false"}
        data-resizing={resizing ? "true" : "false"}
        style={
          {
            "--result-panel-width": `${width}px`,
            "--result-panel-height": `${height}px`,
            "--result-peek-width": `${PEEK_SIZE_PX}px`,
            "--result-peek-height": `${isMobile ? MOBILE_PEEK_HEIGHT_PX : PEEK_SIZE_PX}px`,
          } as CSSProperties
        }
      >
        <button
          type="button"
          className="result-slideover-peek"
          hidden={open}
          aria-expanded={open}
          aria-label={messages.viewResult}
          onClick={onOpen}
        >
          <span className="result-slideover-peek-grip" aria-hidden="true" />
          <span className="result-slideover-peek-label">{title}</span>
        </button>

        <div
          className="result-slideover-resize"
          hidden={!open}
          role="separator"
          aria-orientation={isMobile ? "horizontal" : "vertical"}
          aria-label={isMobile ? messages.resizeResultPanelHeight : messages.resizeResultPanel}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />

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
        </section>
      </aside>
    </>
  );
}

function readIsMobile(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function leftContentEdge(): number {
  if (typeof document === "undefined") return 412;
  const filter = document.querySelector(".filter-panel");
  if (filter instanceof HTMLElement) {
    return Math.ceil(filter.getBoundingClientRect().right) + FILTER_GAP_PX;
  }
  return 16 + 380 + FILTER_GAP_PX;
}

function maxPanelWidth(): number {
  if (typeof window === "undefined") return 920;
  if (window.innerWidth <= 820) return window.innerWidth;
  return Math.max(MIN_WIDTH_PX, Math.floor(window.innerWidth - leftContentEdge()));
}

function defaultPanelWidth(): number {
  return clampPanelWidth(maxPanelWidth());
}

function clampPanelWidth(value: number): number {
  const upper = maxPanelWidth();
  const lower = Math.min(MIN_WIDTH_PX, upper);
  return Math.min(upper, Math.max(lower, Math.round(value)));
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
