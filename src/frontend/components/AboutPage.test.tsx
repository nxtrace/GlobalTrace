import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BackgroundImage } from "../api";
import { AboutPage } from "./AboutPage";

const backgroundImage: BackgroundImage = {
  imageUrl: "/api/background/image",
  title: "岁月的层峦",
  copyright: "example credit",
  copyrightLink: "https://example.com/background",
  source: "bing",
};

describe("AboutPage", () => {
  it("renders sections, related links and background credit", () => {
    const onBack = vi.fn();

    render(<AboutPage backgroundImage={backgroundImage} onBack={onBack} />);

    const sourceLink = screen.getByRole("link", { name: "源码" });
    expect(sourceLink).toHaveAttribute("href", "https://github.com/nxtrace/GlobalTrace");

    const backLink = screen.getByRole("link", { name: "返回诊断" });
    expect(backLink).toHaveAttribute("href", "/");
    fireEvent.click(backLink);
    expect(onBack).toHaveBeenCalledTimes(1);

    const brand = screen.getByRole("heading", { level: 1, name: "GlobalTrace" });
    expect(brand).toBeInTheDocument();
    expect(brand.querySelector(".brand-title-lead")).toHaveTextContent("Global");
    expect(brand.querySelector(".brand-title-mark")).toHaveTextContent("Trace");
    expect(document.querySelectorAll(".about-section")).toHaveLength(4);
    const links = document.querySelector(".about-links");
    expect(links).not.toBeNull();
    expect(links?.querySelectorAll("a")).toHaveLength(8);
    expect(document.querySelectorAll(".about-link-group")).toHaveLength(3);
    expect(document.querySelector(".about-background-credit")).not.toBeNull();
    expect(screen.getByRole("link", { name: /背景：岁月的层峦/ })).toHaveAttribute(
      "href",
      "https://example.com/background",
    );
  });
});
