import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnstileBox } from "./TurnstileBox";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.querySelectorAll("script[data-turnstile]").forEach((script) => script.remove());
  delete window.turnstile;
});

describe("TurnstileBox", () => {
  it("keeps local mode compact when no site key is configured", async () => {
    const onToken = vi.fn();

    render(<TurnstileBox siteKey="" onToken={onToken} />);

    expect(screen.getByText("本地模式")).toBeInTheDocument();
    expect(document.querySelector(".turnstile-widget-shell")).not.toBeInTheDocument();
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(""));
  });

  it("renders the widget container and verification state when a site key exists", async () => {
    vi.useFakeTimers();
    const onToken = vi.fn();
    stubIdleCallback();

    render(<TurnstileBox siteKey="site-key" onToken={onToken} />);

    expect(screen.getByText("等待验证")).toBeInTheDocument();
    expect(document.querySelector(".turnstile-widget-shell")).toBeInTheDocument();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    expect(script).toHaveAttribute("src", "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    window.turnstile = {
      render: vi.fn((element, options) => {
        const widget = document.createElement("div");
        widget.className = "mock-turnstile-widget";
        widget.style.width = "300px";
        widget.style.height = "65px";
        element.appendChild(widget);
        options.callback("turnstile-token");
        return "widget-id";
      }),
      reset: vi.fn(),
    };
    await act(async () => {
      script?.dispatchEvent(new Event("load"));
    });

    expect(window.turnstile.render).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".mock-turnstile-widget")).toBeInTheDocument();
    expect(onToken).toHaveBeenCalledWith("turnstile-token");
    expect(screen.getByText("已验证")).toBeInTheDocument();
  });

  it("resets the widget and accepts the next token when reset nonce changes", async () => {
    vi.useFakeTimers();
    const onToken = vi.fn();
    let callback: ((token: string) => void) | undefined;
    stubIdleCallback();
    window.turnstile = {
      render: vi.fn((element, options) => {
        callback = options.callback;
        const widget = document.createElement("div");
        widget.className = "mock-turnstile-widget";
        element.appendChild(widget);
        options.callback("turnstile-token-1");
        return "widget-id";
      }),
      reset: vi.fn(),
    };

    const { rerender } = render(<TurnstileBox siteKey="site-key" resetNonce={0} onToken={onToken} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onToken).toHaveBeenCalledWith("turnstile-token-1");

    await act(async () => {
      rerender(<TurnstileBox siteKey="site-key" resetNonce={1} onToken={onToken} />);
    });

    expect(window.turnstile?.reset).toHaveBeenCalledWith("widget-id");
    expect(onToken).toHaveBeenCalledWith("");
    expect(screen.getByText("等待验证")).toBeInTheDocument();

    act(() => {
      callback?.("turnstile-token-2");
    });

    expect(onToken).toHaveBeenLastCalledWith("turnstile-token-2");
    expect(screen.getByText("已验证")).toBeInTheDocument();
  });
});

function stubIdleCallback(): void {
  vi.stubGlobal(
    "requestIdleCallback",
    vi.fn((idleCallback: IdleRequestCallback) =>
      window.setTimeout(() => idleCallback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 0),
    ),
  );
  vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => window.clearTimeout(id)));
}
