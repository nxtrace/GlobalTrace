import { ArrowLeft, ExternalLink, Globe2, Route, Scale } from "lucide-react";
import type { BackgroundImage } from "../api";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { handleSpaLinkClick } from "./spaNavigation";
import { useI18n } from "../i18n";

interface AboutPageProps {
  backgroundImage?: BackgroundImage | null;
  onBack: () => void;
}

const licenseHref =
  "https://github.com/nxtrace/GlobalTrace/blob/master/LICENSE";

const attributionLinks = [
  { label: "Globalping", href: "https://globalping.io/" },
  {
    label: "Globalping API docs",
    href: "https://globalping.io/docs/api.globalping.io",
  },
  {
    label: "Globalping OpenAPI spec",
    href: "https://api.globalping.io/v1/spec.yaml",
  },
  {
    label: "Globalping GitHub",
    href: "https://github.com/jsdelivr/globalping",
  },
  { label: "NextTrace", href: "https://www.nxtrace.org/" },
  { label: "NextTrace Github", href: "https://github.com/nxtrace/NTrace-core" },
  {
    label: "GlobalTrace GitHub",
    href: "https://github.com/nxtrace/GlobalTrace",
  },
  { label: "GPL-3.0-or-later", href: licenseHref },
];

export function AboutPage({ backgroundImage, onBack }: AboutPageProps) {
  const messages = useI18n();
  return (
    <LiquidGlassSurface
      variant="floatingPanel"
      fullWidth
      className="about-panel-surface"
    >
      <section className="about-panel">
        <div className="about-header">
          <div className="about-copy">
            <h1>GlobalTrace</h1>
            <p>{messages.aboutIntro}</p>
          </div>
          <div className="about-header-actions">
            <LiquidGlassSurface
              variant="button"
              actionRole="none"
              className="liquid-glass-coverage about-action-surface"
            >
              <Button
                asChild
                variant="glass"
                size="sm"
                className="about-action-button"
              >
                <a
                  href="https://github.com/nxtrace/GlobalTrace"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  {messages.sourceCode}
                </a>
              </Button>
            </LiquidGlassSurface>
            <LiquidGlassSurface
              variant="button"
              interactive
              actionRole="none"
              className="liquid-glass-coverage about-action-surface"
            >
              <Button
                asChild
                variant="glass"
                size="sm"
                className="about-action-button"
                aria-label={messages.backToTrace}
              >
                <a
                  href="/"
                  onClick={(event) => handleSpaLinkClick(event, onBack)}
                >
                  <ArrowLeft size={16} />
                  {messages.backToTrace}
                </a>
              </Button>
            </LiquidGlassSurface>
          </div>
        </div>

        <div className="about-grid">
          <LiquidGlassSurface
            variant="panel"
            fullWidth
            className="liquid-glass-coverage about-card-surface"
          >
            <Surface variant="flat" className="about-card">
              <span className="about-card-icon">
                <Globe2 size={20} />
              </span>
              <div>
                <h2>Globalping</h2>
                <p>{messages.aboutGlobalping}</p>
              </div>
            </Surface>
          </LiquidGlassSurface>
          <LiquidGlassSurface
            variant="panel"
            fullWidth
            className="liquid-glass-coverage about-card-surface"
          >
            <Surface variant="flat" className="about-card">
              <span className="about-card-icon">
                <Route size={20} />
              </span>
              <div>
                <h2>NextTrace</h2>
                <p>{messages.aboutNexttrace}</p>
              </div>
            </Surface>
          </LiquidGlassSurface>
          <LiquidGlassSurface
            variant="panel"
            fullWidth
            className="liquid-glass-coverage about-card-surface"
          >
            <Surface variant="flat" className="about-card">
              <span className="about-card-icon">
                <Scale size={20} />
              </span>
              <div>
                <h2>{messages.openSourceLicense}</h2>
                <p>{messages.licenseText}</p>
              </div>
            </Surface>
          </LiquidGlassSurface>
        </div>

        <LiquidGlassSurface
          variant="panel"
          fullWidth
          className="liquid-glass-coverage about-links-surface"
        >
          <Surface variant="flat" className="about-links">
            <h2>{messages.relatedLinks}</h2>
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
          <LiquidGlassSurface
            variant="panel"
            fullWidth
            className="liquid-glass-coverage about-background-credit-surface"
          >
            <Surface variant="flat" className="about-background-credit">
              <a
                href={backgroundImage.copyrightLink}
                target="_blank"
                rel="noreferrer"
              >
                {messages.backgroundCredit(backgroundImage.title || messages.bingDailyImage, backgroundImage.copyright)}
                <ExternalLink size={14} />
              </a>
            </Surface>
          </LiquidGlassSurface>
        )}
      </section>
    </LiquidGlassSurface>
  );
}
