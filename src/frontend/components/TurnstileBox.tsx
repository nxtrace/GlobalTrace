import { useEffect, useRef, useState } from "react";
import { deferUntilIdle } from "../lib/defer";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

interface TurnstileBoxProps {
  siteKey: string;
  resetNonce?: number;
  onToken: (token: string) => void;
}

export function TurnstileBox({ siteKey, resetNonce = 0, onToken }: TurnstileBoxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const lastResetNonceRef = useRef(resetNonce);
  const [state, setState] = useState(siteKey ? "等待验证" : "本地模式");

  useEffect(() => {
    if (!siteKey) {
      onToken("");
      setState("本地模式");
      return;
    }
    setState("等待验证");
    let active = true;
    let pendingScript: HTMLScriptElement | null = null;

    const render = () => {
      if (!active || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          onToken(token);
          setState("已验证");
        },
        "expired-callback": () => {
          onToken("");
          setState("已过期");
        },
        "error-callback": () => {
          onToken("");
          setState("验证失败");
        },
      });
    };

    const handleScriptLoad = () => {
      pendingScript?.setAttribute("data-loaded", "true");
      render();
    };
    const handleScriptError = () => {
      if (active) setState("验证失败");
    };
    const ensureScript = () => {
      if (window.turnstile) {
        render();
        return;
      }
      pendingScript = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!pendingScript) {
        pendingScript = document.createElement("script");
        pendingScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        pendingScript.async = true;
        pendingScript.defer = true;
        pendingScript.dataset.turnstile = "true";
        document.head.appendChild(pendingScript);
      }
      pendingScript.addEventListener("load", handleScriptLoad, { once: true });
      pendingScript.addEventListener("error", handleScriptError, { once: true });
    };

    const cancel = deferUntilIdle(ensureScript);
    return () => {
      active = false;
      cancel();
      pendingScript?.removeEventListener("load", handleScriptLoad);
      pendingScript?.removeEventListener("error", handleScriptError);
    };
  }, [onToken, siteKey]);

  useEffect(() => {
    if (resetNonce === lastResetNonceRef.current) return;
    lastResetNonceRef.current = resetNonce;
    if (!siteKey || !widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    onToken("");
    setState("等待验证");
  }, [onToken, resetNonce, siteKey]);

  return (
    <div className="turnstile-box" aria-live="polite">
      {siteKey && (
        <div className="turnstile-widget-shell">
          <div className="turnstile-widget" ref={containerRef} />
        </div>
      )}
      <span>{state}</span>
    </div>
  );
}
