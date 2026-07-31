import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProbeListDrawer } from "./ProbeListDrawer";
import { I18nProvider } from "../i18n";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderDrawer(open = true, onClose = vi.fn()) {
  render(
    <I18nProvider locale="zh-CN">
      <ProbeListDrawer id="probe-list-drawer" open={open} title="在线 Probes" onClose={onClose}>
        <div>drawer body</div>
      </ProbeListDrawer>
    </I18nProvider>,
  );
  return onClose;
}

describe("ProbeListDrawer", () => {
  it("closes when the grab handle is tapped without movement", () => {
    const onClose = renderDrawer(true);
    const grab = screen.getByRole("button", { name: "下拉关闭在线 Probes" });
    fireEvent.pointerDown(grab, {
      button: 0,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerUp(grab, {
      clientY: 100,
      pointerId: 1,
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the grab handle is dragged down past the threshold", () => {
    const onClose = renderDrawer(true);
    const grab = screen.getByRole("button", { name: "下拉关闭在线 Probes" });

    fireEvent.pointerDown(grab, { button: 0, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(grab, { clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(grab, { clientY: 140, pointerId: 1 });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close a sub-threshold drag released below the velocity threshold", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const onClose = renderDrawer(true);
    const grab = screen.getByRole("button", { name: "下拉关闭在线 Probes" });

    fireEvent.pointerDown(grab, { button: 0, clientY: 40, pointerId: 1 });
    now = 200;
    fireEvent.pointerMove(grab, { clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(grab, { clientY: 90, pointerId: 1 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes a sub-distance drag released above the velocity threshold", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const onClose = renderDrawer(true);
    const grab = screen.getByRole("button", { name: "下拉关闭在线 Probes" });

    fireEvent.pointerDown(grab, { button: 0, clientY: 40, pointerId: 1 });
    now = 50;
    fireEvent.pointerMove(grab, { clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(grab, { clientY: 90, pointerId: 1 });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses native button activation for the grab handle", () => {
    const onClose = renderDrawer(true);
    fireEvent.click(screen.getByRole("button", { name: "下拉关闭在线 Probes" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("resets dragging when pointerup occurs outside the handle", () => {
    const onClose = renderDrawer(true);
    const drawer = document.querySelector(".probe-drawer") as HTMLElement;
    const grab = screen.getByRole("button", { name: "下拉关闭在线 Probes" });
    fireEvent.pointerDown(grab, { button: 0, clientY: 40, pointerId: 7 });
    fireEvent.pointerMove(grab, { clientY: 50, pointerId: 7 });
    expect(drawer.dataset.dragging).toBe("true");

    fireEvent.pointerUp(window, { clientY: 50, pointerId: 7 });
    expect(drawer.dataset.dragging).toBe("false");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses the close button on open and restores the trigger on close", () => {
    vi.useFakeTimers();
    const trigger = document.createElement("button");
    trigger.textContent = "打开列表";
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const renderState = (open: boolean) => (
      <I18nProvider locale="zh-CN">
        <ProbeListDrawer id="probe-list-drawer" open={open} title="在线 Probes" onClose={onClose}>
          <div>drawer body</div>
        </ProbeListDrawer>
      </I18nProvider>
    );
    const { rerender } = render(renderState(true));

    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(screen.getByRole("button", { name: "关闭在线 Probes" })).toHaveFocus();

    rerender(renderState(false));
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
