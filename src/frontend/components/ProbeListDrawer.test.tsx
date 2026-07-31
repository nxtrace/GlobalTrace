import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProbeListDrawer } from "./ProbeListDrawer";
import { I18nProvider } from "../i18n";

afterEach(() => {
  cleanup();
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
  it("closes when the grab handle is clicked", () => {
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

  it("does not close when a short drag is released", () => {
    const onClose = renderDrawer(true);
    const grab = screen.getByRole("button", { name: "下拉关闭在线 Probes" });

    fireEvent.pointerDown(grab, { button: 0, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(grab, { clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(grab, { clientY: 50, pointerId: 1 });

    expect(onClose).not.toHaveBeenCalled();
  });
});
