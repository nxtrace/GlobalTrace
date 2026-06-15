import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BackgroundImage } from "../api";
import { AboutPage } from "./AboutPage";
import { LiquidGlassPreferenceProvider } from "./LiquidGlassSurface";

const backgroundImage: BackgroundImage = {
  imageUrl: "/api/background/image",
  title: "岁月的层峦",
  copyright: "example credit",
  copyrightLink: "https://example.com/background",
  source: "bing",
};

describe("AboutPage", () => {
  it("adds liquid glass surfaces without changing link and back actions", () => {
    const onBack = vi.fn();

    render(
      <LiquidGlassPreferenceProvider enabled={false} intensity={70}>
        <AboutPage backgroundImage={backgroundImage} onBack={onBack} />
      </LiquidGlassPreferenceProvider>,
    );

    const sourceLink = screen.getByRole("link", { name: "源码" });
    expect(sourceLink).toHaveAttribute("href", "https://github.com/nxtrace/GlobalTrace");
    expect(sourceLink.closest(".about-action-surface[data-liquid-glass]")).not.toBeNull();

    const backLink = screen.getByRole("link", { name: "返回诊断" });
    expect(backLink).toHaveAttribute("href", "/");
    expect(backLink.closest(".about-action-surface[data-liquid-glass]")).not.toBeNull();
    fireEvent.click(backLink);
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(document.querySelectorAll(".about-card-surface[data-liquid-glass]")).toHaveLength(3);
    expect(document.querySelector(".about-links-surface[data-liquid-glass]")).not.toBeNull();
    expect(document.querySelectorAll(".about-link-surface[data-liquid-glass]")).toHaveLength(8);
    expect(document.querySelector(".about-background-credit-surface[data-liquid-glass]")).not.toBeNull();
    expect(screen.getByRole("link", { name: /背景：岁月的层峦/ })).toHaveAttribute(
      "href",
      "https://example.com/background",
    );
  });
});
