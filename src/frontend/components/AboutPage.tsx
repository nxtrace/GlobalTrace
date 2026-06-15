import { ArrowLeft, ExternalLink, Globe2, Route, Scale } from "lucide-react";
import type { BackgroundImage } from "../api";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { handleSpaLinkClick } from "./spaNavigation";

interface AboutPageProps {
  backgroundImage?: BackgroundImage | null;
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
  { label: "GlobalTrace GitHub", href: "https://github.com/nxtrace/GlobalTrace" },
  { label: "GPL-3.0-or-later", href: licenseHref },
];

export function AboutPage({ backgroundImage, onBack }: AboutPageProps) {
  return (
    <LiquidGlassSurface variant="floatingPanel" fullWidth className="about-panel-surface">
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
          <LiquidGlassSurface
            variant="button"
            actionRole="none"
            className="liquid-glass-coverage about-action-surface"
          >
            <Button asChild variant="glass" size="sm" className="about-action-button">
              <a href="https://github.com/nxtrace/GlobalTrace" target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                源码
              </a>
            </Button>
          </LiquidGlassSurface>
          <LiquidGlassSurface
            variant="button"
            interactive
            actionRole="none"
            className="liquid-glass-coverage about-action-surface"
          >
            <Button asChild variant="glass" size="sm" className="about-action-button" aria-label="返回诊断">
              <a href="/" onClick={(event) => handleSpaLinkClick(event, onBack)}>
                <ArrowLeft size={16} />
                返回诊断
              </a>
            </Button>
          </LiquidGlassSurface>
        </div>
      </div>

      <div className="about-grid">
        <LiquidGlassSurface variant="panel" fullWidth className="liquid-glass-coverage about-card-surface">
          <Surface variant="flat" className="about-card">
            <span className="about-card-icon">
              <Globe2 size={20} />
            </span>
            <div>
              <h2>Globalping</h2>
              <p>使用 Globalping 的全球 Probe 网络，从不同地区发起 MTR measurement。</p>
            </div>
          </Surface>
        </LiquidGlassSurface>
        <LiquidGlassSurface variant="panel" fullWidth className="liquid-glass-coverage about-card-surface">
          <Surface variant="flat" className="about-card">
            <span className="about-card-icon">
              <Route size={20} />
            </span>
            <div>
              <h2>NextTrace</h2>
              <p>Worker 只按 Globalping measurement ID 拉取结果，并使用 NextTrace / NTrace 数据补充 hop。</p>
            </div>
          </Surface>
        </LiquidGlassSurface>
        <LiquidGlassSurface variant="panel" fullWidth className="liquid-glass-coverage about-card-surface">
          <Surface variant="flat" className="about-card">
            <span className="about-card-icon">
              <Scale size={20} />
            </span>
            <div>
              <h2>开源协议</h2>
              <p>GlobalTrace 以 GPL-3.0-or-later 开源发布。</p>
            </div>
          </Surface>
        </LiquidGlassSurface>
      </div>

      <LiquidGlassSurface variant="panel" fullWidth className="liquid-glass-coverage about-links-surface">
        <Surface variant="flat" className="about-links">
          <h2>相关链接</h2>
          <div>
            {attributionLinks.map((link) => (
              <LiquidGlassSurface
                variant="button"
                fullWidth
                actionRole="none"
                className="liquid-glass-coverage about-link-surface"
                key={link.href}
              >
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                  <ExternalLink size={14} />
                </a>
              </LiquidGlassSurface>
            ))}
          </div>
        </Surface>
      </LiquidGlassSurface>

      {backgroundImage && (
        <LiquidGlassSurface variant="panel" fullWidth className="liquid-glass-coverage about-background-credit-surface">
          <Surface variant="flat" className="about-background-credit">
            <a href={backgroundImage.copyrightLink} target="_blank" rel="noreferrer">
              背景：{backgroundImage.title || "Bing 每日美景"} · {backgroundImage.copyright}
              <ExternalLink size={14} />
            </a>
          </Surface>
        </LiquidGlassSurface>
      )}
      </section>
    </LiquidGlassSurface>
  );
}
