import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MagicSuggestionTextarea, SuggestionInput } from "./suggestions";

describe("filter panel suggestions", () => {
  it("selects a regular suggestion with keyboard navigation", () => {
    const onChange = vi.fn();

    render(
      <SuggestionInput
        label="city"
        value=""
        options={["Los Angeles", "Falkenstein", "Tokyo"]}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "city" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("Falkenstein");
  });

  it("closes regular suggestions on Escape and blur", () => {
    render(
      <SuggestionInput
        label="network"
        value="co"
        options={["Comcast", "Cogent"]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "network" });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox", { name: "候选列表" })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "候选列表" })).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getByRole("listbox", { name: "候选列表" })).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByRole("listbox", { name: "候选列表" })).not.toBeInTheDocument();
  });

  it("matches magic suggestions by normalized ASN token", () => {
    const onChange = vi.fn();

    render(
      <MagicSuggestionTextarea
        value="US+AS79"
        options={["US+AS7922+Comcast", "JP+AS17676+SoftBank"]}
        onChange={onChange}
      />,
    );

    const textarea = screen.getByRole("combobox", { name: "magic string" });
    fireEvent.focus(textarea);
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("US+AS7922+Comcast");
  });

  it("replaces only the current magic segment", () => {
    const onChange = vi.fn();

    render(
      <MagicSuggestionTextarea
        value="US+AS7922, JP"
        options={["JP+AS17676+SoftBank"]}
        onChange={onChange}
      />,
    );

    const textarea = screen.getByRole("combobox", { name: "magic string" });
    (textarea as HTMLTextAreaElement).setSelectionRange("US+AS7922, JP".length, "US+AS7922, JP".length);
    fireEvent.focus(textarea);
    fireEvent.mouseDown(within(screen.getByRole("listbox", { name: "候选列表" })).getByRole("option", { name: "JP+AS17676+SoftBank" }));

    expect(onChange).toHaveBeenCalledWith("US+AS7922, JP+AS17676+SoftBank");
  });

  it("keeps world magic suggestions visible for any query and closes after blur", () => {
    vi.useFakeTimers();
    try {
      render(
        <MagicSuggestionTextarea
          value="NoMatch"
          options={["world"]}
          onChange={vi.fn()}
        />,
      );

      const textarea = screen.getByRole("combobox", { name: "magic string" });
      fireEvent.focus(textarea);
      expect(screen.getByRole("option", { name: "world" })).toBeInTheDocument();

      fireEvent.blur(textarea);
      act(() => {
        vi.runAllTimers();
      });

      expect(screen.queryByRole("listbox", { name: "候选列表" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
