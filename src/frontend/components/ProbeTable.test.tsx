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

  it("adds a probe from the plus button without requiring map focus", () => {
    const onPick = vi.fn();
    const onFocus = vi.fn();
    render(
      <ProbeTable probes={[probe]} totalProbes={1} status="ready" onPick={onPick} onFocus={onFocus} />,
    );

    expect(screen.getByText("Los Angeles, US")).toBeInTheDocument();
    expect(screen.getByText("AS7922")).toBeInTheDocument();
    expect(screen.getByText("Comcast")).toBeInTheDocument();
    expect(screen.getByText("eyeball")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加 Los Angeles AS7922" })).toHaveAttribute(
      "title",
      "添加 Los Angeles+US+AS7922+eyeball-network",
    );

    fireEvent.click(screen.getByRole("button", { name: "添加 Los Angeles AS7922" }));
    expect(onPick).toHaveBeenCalledWith(probe);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("focuses the map from the map pin without adding the probe", () => {
    const onPick = vi.fn();
    const onFocus = vi.fn();
    render(
      <ProbeTable probes={[probe]} totalProbes={1} status="ready" onPick={onPick} onFocus={onFocus} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "在地图上定位 Los Angeles AS7922" }));
    expect(onFocus).toHaveBeenCalledWith(probe);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("filters to a probe when the row is clicked without adding it", () => {
    const onPick = vi.fn();
    const onFocus = vi.fn();
    const onFilter = vi.fn();
    render(
      <ProbeTable
        probes={[probe]}
        totalProbes={1}
        status="ready"
        onPick={onPick}
        onFocus={onFocus}
        onFilter={onFilter}
      />,
    );

    fireEvent.click(screen.getByText("Los Angeles, US"));
    expect(onFilter).toHaveBeenCalledWith(probe);
    expect(onPick).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("clears the list filter from the floating back-to-all control", () => {
    const onClearListFilter = vi.fn();
    render(
      <ProbeTable
        probes={[probe]}
        matchedCount={1}
        totalProbes={10}
        status="ready"
        listFilterActive
        onPick={vi.fn()}
        onClearListFilter={onClearListFilter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回到所有" }));
    expect(onClearListFilter).toHaveBeenCalledOnce();
  });

  it("shows only the selection browse control when both selection and list filter are active", () => {
    render(
      <ProbeTable
        probes={[probe]}
        matchedCount={1}
        totalProbes={10}
        status="ready"
        selectionActive
        listFilterActive
        browseAll={false}
        isProbeSelected={() => true}
        onBrowseAllChange={vi.fn()}
        onClearListFilter={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "回到所有" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看当前点选" })).not.toBeInTheDocument();
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

    expect(screen.getByText("仅显示前 160 条，运行时按上限选取")).toBeInTheDocument();
    expect(screen.getByText("City 0, US")).toBeInTheDocument();
    expect(screen.queryByText("City 160, US")).not.toBeInTheDocument();
  });

  it("marks selected probes as added and allows removing them", () => {
    const onRemove = vi.fn();
    const onFocus = vi.fn();
    render(
      <ProbeTable
        probes={[probe]}
        matchedCount={1}
        totalProbes={10}
        status="ready"
        selectionActive
        isProbeSelected={() => true}
        onPick={vi.fn()}
        onFocus={onFocus}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("已添加")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加 Los Angeles AS7922" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在地图上定位 Los Angeles AS7922" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "移除 Comcast AS7922" }));
    expect(onRemove).toHaveBeenCalledWith(probe);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("opens exact filters from the filter popover and updates filters", () => {
    const onFiltersChange = vi.fn();
    render(
      <ProbeTable
        probes={[probe]}
        totalProbes={1}
        status="ready"
        filters={{ country: "US" }}
        filterSuggestions={{
          countries: ["US", "DE"],
          cities: ["Los Angeles"],
          asns: ["AS7922"],
          asnNetworks: { AS7922: "Comcast" },
          networks: ["Comcast"],
          tags: ["eyeball-network"],
          magicStrings: [],
        }}
        onFiltersChange={onFiltersChange}
        onPick={vi.fn()}
      />,
    );

    const filterButton = screen.getByRole("button", { name: "筛选" });
    expect(filterButton).toHaveClass("is-active");
    fireEvent.click(filterButton);

    expect(screen.getByText("精确筛选")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("城市"), { target: { value: "Los Angeles" } });
    expect(onFiltersChange).toHaveBeenCalledWith({
      country: "US",
      city: "Los Angeles",
      magic: undefined,
    });
  });

  it("hides the filter popover when filters are not wired", () => {
    render(<ProbeTable probes={[probe]} totalProbes={1} status="ready" onPick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "筛选" })).not.toBeInTheDocument();
  });

  it("toggles between selected-only and all probes when selection is active", () => {
    const onBrowseAllChange = vi.fn();
    const { rerender } = render(
      <ProbeTable
        probes={[probe]}
        matchedCount={1}
        totalProbes={10}
        status="ready"
        selectionActive
        browseAll={false}
        isProbeSelected={() => true}
        onBrowseAllChange={onBrowseAllChange}
        onPick={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回到所有" }));
    expect(onBrowseAllChange).toHaveBeenCalledWith(true);

    rerender(
      <ProbeTable
        probes={[probe, otherProbe]}
        matchedCount={1}
        totalProbes={10}
        status="ready"
        selectionActive
        browseAll
        isProbeSelected={(row) => row.location.asn === probe.location.asn}
        onBrowseAllChange={onBrowseAllChange}
        onPick={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "查看当前点选" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("已添加")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加 Berlin AS24940" })).toBeInTheDocument();
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

const otherProbe: GlobalpingProbe = {
  location: {
    continent: "EU",
    region: "Western Europe",
    country: "DE",
    state: "",
    city: "Berlin",
    asn: 24940,
    latitude: 52.52,
    longitude: 13.4,
    network: "Hetzner",
  },
  tags: ["datacenter-network"],
  resolvers: [],
};
