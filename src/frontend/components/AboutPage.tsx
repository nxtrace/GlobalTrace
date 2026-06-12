import { ArrowLeft, ExternalLink, Globe2, Route, Scale } from "lucide-react";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";

interface AboutPageProps {
  onBack: () => void;
}

const licenseHref = "https://github.com/nxtrace/GlobalTrace/blob/master/LICENSE";

const attributionLinks = [
  { label: "Globalping", href: "https://globalping.io/" },
  { label: "Globalping API docs", href: "https://globalping.io/docs/api.globalping.io" },
  { label: "Globalping OpenAPI spec", href: "https://api.globalping.io/v1/spec.yaml" },
  { label: "Globalping GitHub", href: "https://github.com/jsdelivr/globalping" },
  { label: "NextTrace", href: "https://www.nxtrace.org/" },
  { label: "NTrace-core GitHub", href: "https://github.com/nxtrace/NTrace-core" },
  { label: "IPinfo", href: "https://ipinfo.io/" },
  { label: "RIPEstat", href: "https://stat.ripe.net/" },
  { label: "GlobalTrace GitHub", href: "https://github.com/nxtrace/GlobalTrace" },
  { label: "GPL-3.0-or-later", href: licenseHref },
];

export function AboutPage({ onBack }: AboutPageProps) {
  return (
    <main className="about-shell">
      <LiquidGlassSurface variant="panel" fullWidth className="about-panel-surface">
        <section className="about-panel">
          <div className="about-header">
            <div className="about-copy">
              <h1>GlobalTrace</h1>
              <p>
                GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe
                发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。
              </p>
            </div>
            <div className="about-header-actions">
              <Button asChild variant="glass" size="sm">
                <a href="https://github.com/nxtrace/GlobalTrace" target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  源码
                </a>
              </Button>
              <Button variant="glass" size="sm" type="button" onClick={onBack} aria-label="返回诊断">
                <ArrowLeft size={16} />
                返回诊断
              </Button>
            </div>
          </div>

          <div className="about-grid">
            <Surface variant="flat" className="about-card">
              <span className="about-card-icon">
                <Globe2 size={20} />
              </span>
              <div>
                <h2>Globalping</h2>
                <p>使用 Globalping 的全球 Probe 网络，从不同地区发起 MTR measurement。</p>
              </div>
            </Surface>
            <Surface variant="flat" className="about-card">
              <span className="about-card-icon">
                <Route size={20} />
              </span>
              <div>
                <h2>NextTrace</h2>
                <p>默认使用 NextTrace / NTrace 数据补充 hop；取消 Turnstile 时由浏览器匿名请求 IPinfo 与 RIPEstat 做有限 fallback。</p>
              </div>
            </Surface>
            <Surface variant="flat" className="about-card">
              <span className="about-card-icon">
                <Scale size={20} />
              </span>
              <div>
                <h2>开源协议</h2>
                <p>GlobalTrace 以 GPL-3.0-or-later 开源发布。</p>
              </div>
            </Surface>
          </div>

          <Surface variant="flat" className="about-links">
            <h2>相关链接</h2>
            <div>
              {attributionLinks.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          </Surface>
        </section>
      </LiquidGlassSurface>
    </main>
  );
}
