import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProbeTable } from "./ProbeTable";
import type { GlobalpingProbe } from "../../shared/types";

describe("ProbeTable", () => {
  it("renders empty state when filters match no probes", () => {
    render(<ProbeTable probes={[]} totalProbes={42} status="ready" onPick={vi.fn()} />);

    expect(screen.getByText("0 匹配 / 42 在线")).toBeInTheDocument();
    expect(screen.getByText("当前筛选没有匹配在线 probe。")).toBeInTheDocument();
  });

  it("shows probe details and calls onPick from the selection button", () => {
    const onPick = vi.fn();
    render(<ProbeTable probes={[probe]} totalProbes={1} status="ready" onPick={onPick} />);

    expect(screen.getByText("Los Angeles, US")).toBeInTheDocument();
    expect(screen.getByText("AS7922")).toBeInTheDocument();
    expect(screen.getByText("Comcast")).toBeInTheDocument();
    expect(screen.getByText("eyeball")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择 Los Angeles AS7922" }));
    expect(onPick).toHaveBeenCalledWith(probe);
  });

  it("shows loading and error subtitles", () => {
    const { rerender } = render(<ProbeTable probes={[]} totalProbes={0} status="loading" onPick={vi.fn()} />);

    expect(screen.getByText("正在读取 Globalping probes")).toBeInTheDocument();

    rerender(<ProbeTable probes={[]} totalProbes={0} status="error" onPick={vi.fn()} />);
    expect(screen.getByText("读取失败，保留当前筛选")).toBeInTheDocument();
  });

  it("caps visible rows and shows the first-page note", () => {
    const many = Array.from({ length: 161 }, (_, index) => ({
      ...probe,
      location: { ...probe.location, city: `City ${index}`, asn: 7900 + index },
    }));

    render(<ProbeTable probes={many} totalProbes={200} status="ready" onPick={vi.fn()} />);

    expect(screen.getByText("已显示前 160 条；运行时按 probes 上限选择。")).toBeInTheDocument();
    expect(screen.getByText("City 0, US")).toBeInTheDocument();
    expect(screen.queryByText("City 160, US")).not.toBeInTheDocument();
  });
});

const probe: GlobalpingProbe = {
  location: {
    continent: "NA",
    region: "Northern America",
    country: "US",
    state: "CA",
    city: "Los Angeles",
    asn: 7922,
    latitude: 34.05,
    longitude: -118.24,
    network: "Comcast",
  },
  tags: ["eyeball-network", "home"],
  resolvers: [],
};
