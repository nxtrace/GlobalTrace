import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input, NativeSelect } from "./input";
import { Switch } from "./switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

describe("local ui components", () => {
  it("supports button composition and input/select changes", () => {
    render(
      <>
        <Button asChild>
          <a href="/share">打开分享 URL</a>
        </Button>
        <label>
          目标
          <Input defaultValue="globalping.io" />
        </label>
        <label>
          协议
          <NativeSelect defaultValue="ICMP">
            <option value="ICMP">ICMP</option>
            <option value="TCP">TCP</option>
          </NativeSelect>
        </label>
      </>,
    );

    expect(screen.getByRole("link", { name: "打开分享 URL" })).toHaveAttribute("href", "/share");
    fireEvent.change(screen.getByLabelText("目标"), { target: { value: "example.com" } });
    fireEvent.change(screen.getByLabelText("协议"), { target: { value: "TCP" } });

    expect(screen.getByLabelText("目标")).toHaveValue("example.com");
    expect(screen.getByLabelText("协议")).toHaveValue("TCP");
  });

  it("toggles switch and checkbox controls", () => {
    render(
      <>
        <label>
          eyeball
          <Switch aria-label="eyeball" />
        </label>
        <label>
          datacenter
          <Checkbox aria-label="datacenter" />
        </label>
      </>,
    );

    fireEvent.click(screen.getByLabelText("eyeball"));
    fireEvent.click(screen.getByLabelText("datacenter"));

    expect(screen.getByLabelText("eyeball")).toBeChecked();
    expect(screen.getByLabelText("datacenter")).toBeChecked();
  });

  it("renders tabs, table, badge, and tooltip without a page-level provider", () => {
    render(
      <>
        <Tabs defaultValue="route">
          <TabsList aria-label="结果视图">
            <TabsTrigger value="route">route</TabsTrigger>
            <TabsTrigger value="raw">raw</TabsTrigger>
          </TabsList>
          <TabsContent value="route">hop table</TabsContent>
          <TabsContent value="raw">raw output</TabsContent>
        </Tabs>
        <Badge variant="accent">ready</Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>说明</Button>
          </TooltipTrigger>
          <TooltipContent>tooltip copy</TooltipContent>
        </Tooltip>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TTL</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>1</TableCell>
              <TableCell>8.8.8.8</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>,
    );

    expect(screen.getByRole("tab", { name: "route" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "说明" })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("8.8.8.8")).toBeInTheDocument();
  });
});
