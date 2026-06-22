import { MapPin } from "lucide-react";
import { probeNetworkKind, probeToMagic, summarizeProbeLocation } from "../../shared/filters";
import type { GlobalpingProbe } from "../../shared/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useI18n } from "../i18n";

interface ProbeTableProps {
  probes: GlobalpingProbe[];
  totalProbes: number;
  status: "loading" | "ready" | "error";
  onPick: (probe: GlobalpingProbe) => void;
}

export function ProbeTable({ probes, totalProbes, status, onPick }: ProbeTableProps) {
  const messages = useI18n();
  const visibleRows = probes.slice(0, 160);
  return (
    <Surface asChild className="probe-table-section">
      <section>
      <div className="section-header">
        <div>
          <h2>{messages.onlineProbes}</h2>
          <p>{tableSubtitle(status, probes.length, totalProbes, messages)}</p>
        </div>
        <Badge variant="accent">{probes.length}</Badge>
      </div>
      <div className="table-scroll">
        <Table className="probe-table">
          <TableHeader>
            <TableRow>
              <TableHead>{messages.location}</TableHead>
              <TableHead>ASN</TableHead>
              <TableHead>network</TableHead>
              <TableHead>tag</TableHead>
              <TableHead aria-label={messages.select} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((probe, index) => (
              <TableRow key={`${probe.location.country}-${probe.location.city}-${probe.location.asn}-${index}`}>
                <TableCell title={summarizeProbeLocation(probe)}>
                  {probe.location.city || "-"}, {probe.location.country}
                </TableCell>
                <TableCell>AS{probe.location.asn}</TableCell>
                <TableCell>{probe.location.network}</TableCell>
                <TableCell>
                  <ProbeTags probe={probe} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    title={messages.selectProbeTitle(probeToMagic(probe))}
                    aria-label={messages.selectProbeLabel(probe.location.city || probe.location.country, probe.location.asn)}
                    onClick={() => onPick(probe)}
                  >
                    <MapPin size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {status === "ready" && probes.length === 0 && (
        <div className="table-empty">{messages.noTableProbes}</div>
      )}
      {probes.length > visibleRows.length && (
        <div className="table-note">{messages.tableLimitNote(visibleRows.length)}</div>
      )}
      </section>
    </Surface>
  );
}

function ProbeTags({ probe }: { probe: GlobalpingProbe }) {
  const kind = probeNetworkKind(probe);
  const tags = probe.tags.slice(0, 2);
  return (
    <div className="tag-stack">
      <Badge className={`kind-badge ${kind}`} variant={kind === "eyeball" ? "accent" : kind === "datacenter" ? "warn" : "muted"}>
        {kind}
      </Badge>
      {tags.map((tag) => (
        <Badge key={tag} className="tag-pill" variant="muted">
          {tag}
        </Badge>
      ))}
      {probe.tags.length > tags.length && (
        <Badge className="tag-more" variant="muted">
          +{probe.tags.length - tags.length}
        </Badge>
      )}
    </div>
  );
}

function tableSubtitle(status: "loading" | "ready" | "error", visible: number, total: number, messages?: ReturnType<typeof useI18n>): string {
  if (messages) return messages.tableSubtitle(status, visible, total);
  if (status === "loading") return "正在读取 Globalping probes";
  if (status === "error") return "读取失败，保留当前筛选";
  return `${visible} 匹配 / ${total} 在线`;
}
