import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Overlay } from "./Overlay";

describe("Overlay", () => {
  it("renders the close button in the header and preserves close interactions", () => {
    const onClose = vi.fn();

    render(
      <Overlay open title="高级参数" onClose={onClose}>
        <p>content</p>
      </Overlay>,
    );

    const dialog = screen.getByRole("dialog", { name: "高级参数" });
    expect(dialog).toBeVisible();
    const closeButton = screen.getByRole("button", { name: "关闭高级参数" });
    expect(closeButton.closest(".overlay-header")).not.toBeNull();

    fireEvent.click(closeButton);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(document.querySelector(".overlay") as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps the close button while ignoring backdrop clicks when closeOnBackdrop is false", () => {
    const onClose = vi.fn();

    render(
      <Overlay open title="读取诊断结果" closeOnBackdrop={false} onClose={onClose}>
        <p>content</p>
      </Overlay>,
    );

    fireEvent.mouseDown(document.querySelector(".overlay") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "关闭读取诊断结果" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps keyboard focus inside the dialog and restores previous focus", () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <Overlay open title="高级参数" onClose={onClose}>
        <button type="button">确认</button>
      </Overlay>,
    );

    const closeButton = screen.getByRole("button", { name: "关闭高级参数" });
    const confirmButton = screen.getByRole("button", { name: "确认" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    rerender(
      <Overlay open={false} title="高级参数" onClose={onClose}>
        <button type="button">确认</button>
      </Overlay>,
    );
    expect(opener).toHaveFocus();

    opener.remove();
  });
});
