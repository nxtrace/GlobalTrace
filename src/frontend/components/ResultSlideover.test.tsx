import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ResultSlideover } from "./ResultSlideover";

function mockMatchMedia(matchesMobile: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 820px") ? matchesMobile : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockMatchMedia(false);
  document
    .querySelectorAll(".filter-panel, .app-shell")
    .forEach((element) => element.remove());
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 768,
  });
});

describe("ResultSlideover", () => {
  it("shows a peek control when closed and opens once from a pointer tap", () => {
    mockMatchMedia(false);
    const onOpen = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={false} title="诊断结果" onOpen={onOpen} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    expect(root.dataset.open).toBe("false");
    expect(screen.queryByRole("dialog", { name: "诊断结果" })).not.toBeInTheDocument();
    expect(document.querySelector(".result-slideover-peek")).not.toBeNull();
    expect(document.querySelector(".result-slideover-peek-grip")).not.toBeNull();
    expect(document.querySelector(".result-slideover-peek-label")).toHaveTextContent("诊断结果");
    expect(document.querySelector(".result-slideover-panel")).toHaveAttribute("aria-hidden", "true");

    const peek = screen.getByRole("button", { name: "查看结果" });
    fireEvent.pointerDown(peek, { button: 0, clientX: 900, pointerId: 11 });
    fireEvent.pointerUp(peek, { clientX: 900, pointerId: 11 });
    fireEvent.click(peek, { detail: 1 });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("opens from a keyboard or assistive-technology click", () => {
    const onOpen = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={false} title="诊断结果" onOpen={onOpen} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看结果" }), {
      detail: 0,
    });

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("opens by dragging the collapsed peek handle to the dragged width", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1600,
    });
    const onOpen = vi.fn();
    const view = (open: boolean) => (
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={open} title="诊断结果" onOpen={onOpen} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>
    );
    const { rerender } = render(view(false));

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const peek = screen.getByRole("button", { name: "查看结果" });

    fireEvent.pointerDown(peek, { button: 0, clientX: 900, pointerId: 12 });
    expect(root.style.getPropertyValue("--result-peek-chrome-opacity")).toBe("1");
    // Reveal 40 + 560 = 600px, then open at that dragged width.
    fireEvent.pointerMove(peek, { clientX: 340, pointerId: 12 });
    expect(root.style.getPropertyValue("--result-expand-drag")).toBe("560px");
    expect(
      Number(root.style.getPropertyValue("--result-peek-chrome-opacity")),
    ).toBe(0);
    fireEvent.pointerUp(peek, { clientX: 340, pointerId: 12 });

    expect(onOpen).toHaveBeenCalledOnce();
    rerender(view(true));
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("600px");
  });

  it("fades peek chrome with drag distance and restores it on pointer cancel", () => {
    mockMatchMedia(false);
    const onOpen = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={false} title="诊断结果" onOpen={onOpen} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const peek = screen.getByRole("button", { name: "查看结果" });
    fireEvent.pointerDown(peek, { button: 0, clientX: 900, pointerId: 13 });
    expect(root.style.getPropertyValue("--result-peek-chrome-opacity")).toBe("1");

    // 40px is below the open commit threshold but enough to fade the chrome.
    fireEvent.pointerMove(peek, { clientX: 860, pointerId: 13 });
    const midOpacity = Number(root.style.getPropertyValue("--result-peek-chrome-opacity"));
    expect(midOpacity).toBeGreaterThan(0);
    expect(midOpacity).toBeLessThan(1);

    fireEvent.pointerCancel(window, { clientX: 860, pointerId: 13 });

    expect(onOpen).not.toHaveBeenCalled();
    expect(root.dataset.resizing).toBe("false");
    expect(root.style.getPropertyValue("--result-expand-drag")).toBe("0px");
    expect(root.style.getPropertyValue("--result-peek-chrome-opacity")).toBe("1");
  });

  it("aborts a committed peek drag when pointer capture is lost", () => {
    const onOpen = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={false} title="诊断结果" onOpen={onOpen} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const peek = screen.getByRole("button", { name: "查看结果" });
    fireEvent.pointerDown(peek, { button: 0, clientX: 900, pointerId: 14 });
    fireEvent.pointerMove(peek, { clientX: 700, pointerId: 14 });
    expect(root.dataset.resizing).toBe("true");

    fireEvent.lostPointerCapture(peek, { pointerId: 14 });

    expect(onOpen).not.toHaveBeenCalled();
    expect(root.dataset.resizing).toBe("false");
    expect(root.style.getPropertyValue("--result-expand-drag")).toBe("0px");
  });

  it("exposes a dialog when open and closes on Escape or backdrop click", () => {
    mockMatchMedia(false);
    const onClose = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={onClose}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    expect(screen.getByRole("dialog", { name: "诊断结果" })).toBeInTheDocument();
    expect(document.querySelector(".result-slideover")).toHaveAttribute("data-open", "true");
    expect(screen.queryByRole("button", { name: "查看结果" })).not.toBeInTheDocument();
    expect(screen.getByTestId("result-slideover-backdrop")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.mouseDown(screen.getByTestId("result-slideover-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("defaults to the widest width that leaves the filter panel uncovered", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    const filter = document.createElement("aside");
    filter.className = "filter-panel";
    Object.defineProperty(filter, "getBoundingClientRect", {
      value: () => ({
        right: 412,
        left: 16,
        top: 16,
        bottom: 800,
        width: 396,
        height: 784,
        x: 16,
        y: 16,
        toJSON: () => ({}),
      }),
    });
    document.body.append(filter);

    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    // Preferred open: 1440 - filter.right(412) - FILTER_GAP(4)
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("1024px");
    filter.remove();
  });

  it("allows dragging the panel wider than the filter column", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    const filter = document.createElement("aside");
    filter.className = "filter-panel";
    Object.defineProperty(filter, "getBoundingClientRect", {
      value: () => ({
        right: 412,
        left: 16,
        top: 16,
        bottom: 800,
        width: 396,
        height: 784,
        x: 16,
        y: 16,
        toJSON: () => ({}),
      }),
    });
    document.body.append(filter);

    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    expect(handle).toHaveAttribute("aria-valuemax", "1392");

    fireEvent.keyDown(handle, { key: "End" });
    // 1440 - VIEWPORT_EDGE_GAP(48); covers filter but leaves a close strip.
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("1392px");
    filter.remove();
  });

  it("remembers the dragged width when reopened", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1600,
    });
    const view = (open: boolean) => (
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={open} title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>
    );
    const { rerender } = render(view(true));

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    const startWidth = Number.parseInt(
      root.style.getPropertyValue("--result-panel-width"),
      10,
    );

    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 7 });
    fireEvent.pointerMove(handle, {
      clientX: 400 + (startWidth - 640),
      pointerId: 7,
    });
    fireEvent.pointerUp(handle, { clientX: 400 + (startWidth - 640), pointerId: 7 });
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("640px");

    rerender(view(false));
    rerender(view(true));
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("640px");
  });

  it("resizes from the left edge handle", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1600,
    });
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    const readWidth = () =>
      Number.parseInt(root.style.getPropertyValue("--result-panel-width"), 10);

    // Default opens at max width; shrink first so growth has headroom.
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 520, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 520, pointerId: 1 });
    const shrunkWidth = readWidth();

    fireEvent.pointerDown(handle, { button: 0, clientX: 520, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 440, pointerId: 2 });
    fireEvent.pointerUp(handle, { clientX: 440, pointerId: 2 });

    expect(readWidth()).toBe(shrunkWidth + 80);
    expect(root.dataset.resizing).toBe("false");
  });

  it("applies damping below 420px and snaps back unless pulled to the commit width", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1600,
    });
    const onClose = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={onClose}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    const startWidth = Number.parseInt(
      root.style.getPropertyValue("--result-panel-width"),
      10,
    );
    const readWidth = () =>
      Number.parseInt(root.style.getPropertyValue("--result-panel-width"), 10);

    // Mild overshoot past 420: lightly damped, then snaps back.
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 4 });
    fireEvent.pointerMove(handle, {
      clientX: 400 + (startWidth - 400),
      pointerId: 4,
    });
    expect(readWidth()).toBe(408);
    fireEvent.pointerUp(handle, { clientX: 400 + (startWidth - 400), pointerId: 4 });
    expect(onClose).not.toHaveBeenCalled();
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("420px");
  });

  it("collapses only after dragging through the damped zone to the commit width", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1600,
    });
    const onClose = vi.fn();
    const view = (open: boolean) => (
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={open} title="诊断结果" onOpen={vi.fn()} onClose={onClose}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>
    );
    const { rerender } = render(view(true));

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    const startWidth = Number.parseInt(
      root.style.getPropertyValue("--result-panel-width"),
      10,
    );

    // Need ~313px mouse overshoot past 420 for damped width < 320.
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 3 });
    fireEvent.pointerMove(handle, {
      clientX: 400 + (startWidth - 100),
      pointerId: 3,
    });
    const dampedWidth = Number.parseInt(
      root.style.getPropertyValue("--result-panel-width"),
      10,
    );
    expect(dampedWidth).toBeLessThan(320);
    fireEvent.pointerUp(handle, { clientX: 400 + (startWidth - 100), pointerId: 3 });

    expect(onClose).toHaveBeenCalledOnce();
    rerender(view(false));
    // Keep the dragged width through the slide-out (restores after the animation).
    expect(root.style.getPropertyValue("--result-panel-width")).toBe(`${dampedWidth}px`);
  });

  it("exposes separator values and supports keyboard resizing", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1600,
    });
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <button type="button">关闭结果</button>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    const initial = Number(handle.getAttribute("aria-valuenow"));
    expect(handle).toHaveAttribute("aria-valuemin", "420");
    expect(Number(handle.getAttribute("aria-valuemax"))).toBeGreaterThanOrEqual(initial);

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(root.style.getPropertyValue("--result-panel-width")).toBe(`${initial - 24}px`);
    expect(handle).toHaveAttribute("aria-valuenow", String(initial - 24));

    fireEvent.keyDown(handle, { key: "Home" });
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("420px");
  });

  it("ends resizing when pointer capture is lost outside the handle", () => {
    mockMatchMedia(false);
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 9 });
    expect(root.dataset.resizing).toBe("true");

    fireEvent.pointerUp(window, { pointerId: 9 });
    expect(root.dataset.resizing).toBe("false");
  });

  it("restores the starting size when an active resize is canceled", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={onClose}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    const startingWidth = root.style.getPropertyValue("--result-panel-width");
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 15 });
    fireEvent.pointerMove(handle, { clientX: 600, pointerId: 15 });
    expect(root.style.getPropertyValue("--result-panel-width")).not.toBe(startingWidth);

    fireEvent.pointerCancel(handle, { pointerId: 15 });

    expect(root.dataset.resizing).toBe("false");
    expect(root.style.getPropertyValue("--result-panel-width")).toBe(startingWidth);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps focus, inerts the app shell, and restores focus when closed", () => {
    vi.useFakeTimers();
    mockMatchMedia(false);
    const shell = document.createElement("main");
    shell.className = "app-shell";
    const trigger = document.createElement("button");
    trigger.textContent = "运行诊断";
    shell.append(trigger);
    document.body.append(shell);
    trigger.focus();

    const renderSlideover = (open: boolean) => (
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={open} title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <button type="button">关闭结果</button>
          <a href="/details">详情</a>
        </ResultSlideover>
      </I18nProvider>
    );
    const { rerender } = render(renderSlideover(true));
    expect(shell.inert).toBe(true);

    act(() => vi.advanceTimersByTime(240));
    expect(screen.getByRole("button", { name: "关闭结果" })).toHaveFocus();

    const separator = screen.getByRole("separator", { name: "拖拽调整结果面板宽度" });
    separator.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "关闭结果" })).toHaveFocus();

    rerender(renderSlideover(false));
    act(() => vi.advanceTimersByTime(240));
    expect(shell.inert).toBe(false);
    expect(trigger).toHaveFocus();
    shell.remove();
  });

  it("cancels stale focus restoration when the sheet is reopened quickly", () => {
    vi.useFakeTimers();
    const shell = document.createElement("main");
    shell.className = "app-shell";
    const trigger = document.createElement("button");
    trigger.textContent = "运行诊断";
    shell.append(trigger);
    document.body.append(shell);
    trigger.focus();

    const view = (open: boolean) => (
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={open} title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <button type="button">关闭结果</button>
        </ResultSlideover>
      </I18nProvider>
    );
    const { rerender } = render(view(true));
    act(() => {
      vi.advanceTimersByTime(240);
    });
    const closeButton = screen.getByRole("button", { name: "关闭结果" });
    expect(closeButton).toHaveFocus();

    rerender(view(false));
    rerender(view(true));
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(trigger).not.toHaveFocus();
    expect(closeButton).toHaveFocus();

    rerender(view(false));
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(trigger).toHaveFocus();
  });

  it("clears focus timers when unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <button type="button">关闭结果</button>
        </ResultSlideover>
      </I18nProvider>,
    );

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens the mobile peek to the dragged height", () => {
    mockMatchMedia(true);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    const onOpen = vi.fn();
    const view = (open: boolean) => (
      <I18nProvider locale="zh-CN">
        <ResultSlideover open={open} title="诊断结果" onOpen={onOpen} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>
    );
    const { rerender } = render(view(false));

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const peek = screen.getByRole("button", { name: "查看结果" });
    fireEvent.pointerDown(peek, { button: 0, clientY: 800, pointerId: 16 });
    fireEvent.pointerMove(peek, { clientY: 300, pointerId: 16 });
    fireEvent.pointerUp(peek, { clientY: 300, pointerId: 16 });

    expect(onOpen).toHaveBeenCalledOnce();
    rerender(view(true));
    const peekHeight = Number.parseFloat(
      root.style.getPropertyValue("--result-peek-height"),
    );
    const dragDistance = 800 - 300;
    // 56px peek + 500px drag remains below the 844px viewport height cap.
    expect(root.style.getPropertyValue("--result-panel-height")).toBe(
      `${peekHeight + dragDistance}px`,
    );
  });

  it("uses a bottom sheet height under 820px and resizes vertically", () => {
    mockMatchMedia(true);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });

    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={vi.fn()}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    expect(root.dataset.mobile).toBe("true");
    const height = Number.parseInt(root.style.getPropertyValue("--result-panel-height"), 10);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(window.innerHeight);
    expect(height).toBe(Math.round(844 * 0.7));

    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板高度" });
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");

    fireEvent.pointerDown(handle, { button: 0, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 320, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 320, pointerId: 1 });

    const grown = Number.parseInt(root.style.getPropertyValue("--result-panel-height"), 10);
    expect(grown).toBe(height + 80);
    expect(root.dataset.resizing).toBe("false");
  });

  it("collapses the bottom sheet when drag ends below the height threshold", () => {
    mockMatchMedia(true);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    const onClose = vi.fn();

    render(
      <I18nProvider locale="zh-CN">
        <ResultSlideover open title="诊断结果" onOpen={vi.fn()} onClose={onClose}>
          <div>result body</div>
        </ResultSlideover>
      </I18nProvider>,
    );

    const root = document.querySelector(".result-slideover") as HTMLElement;
    const handle = screen.getByRole("separator", { name: "拖拽调整结果面板高度" });
    const startHeight = Number.parseInt(
      root.style.getPropertyValue("--result-panel-height"),
      10,
    );

    fireEvent.pointerDown(handle, { button: 0, clientY: 200, pointerId: 5 });
    fireEvent.pointerMove(handle, {
      clientY: 200 + (startHeight - 180),
      pointerId: 5,
    });
    fireEvent.pointerUp(handle, {
      clientY: 200 + (startHeight - 180),
      pointerId: 5,
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
