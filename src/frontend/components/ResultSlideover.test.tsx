import { fireEvent, render, screen } from "@testing-library/react";
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
  mockMatchMedia(false);
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
  it("shows a peek control when closed and opens on click", () => {
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
    expect(document.querySelector(".result-slideover-peek-label")).toHaveTextContent("诊断结果");
    expect(document.querySelector(".result-slideover-panel")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "查看结果" }));
    expect(onOpen).toHaveBeenCalledOnce();
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
    expect(root.style.getPropertyValue("--result-panel-width")).toBe("1012px");
    filter.remove();
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
});
