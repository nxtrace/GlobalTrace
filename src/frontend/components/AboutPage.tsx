import { ArrowLeft, ExternalLink } from "lucide-react";
import type { BackgroundImage } from "../api";
import { Button } from "./ui/button";
import { handleSpaLinkClick } from "./spaNavigation";
import { useI18n } from "../i18n";

interface AboutPageProps {
  backgroundImage?: BackgroundImage | null;
  onBack: () => void;
}

const licenseHref =
  "https://github.com/nxtrace/GlobalTrace/blob/master/LICENSE";

const linkGroups = [
  {
    title: "Globalping",
    links: [
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
    ],
  },
  {
    title: "NextTrace",
    links: [
      { label: "NextTrace", href: "https://www.nxtrace.org/" },
      {
        label: "NextTrace Github",
        href: "https://github.com/nxtrace/NTrace-core",
      },
    ],
  },
  {
    title: "GlobalTrace",
    links: [
      {
        label: "GlobalTrace GitHub",
        href: "https://github.com/nxtrace/GlobalTrace",
      },
      { label: "GPL-3.0-or-later", href: licenseHref },
    ],
  },
] as const;

export function AboutPage({ backgroundImage, onBack }: AboutPageProps) {
  const messages = useI18n();
  return (
    <section className="about-panel">
      <header className="about-toolbar">
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="about-action-button"
          aria-label={messages.backToTrace}
        >
          <a href="/" onClick={(event) => handleSpaLinkClick(event, onBack)}>
            <ArrowLeft size={16} />
            {messages.backToTrace}
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm" className="about-action-button">
          <a
            href="https://github.com/nxtrace/GlobalTrace"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            {messages.sourceCode}
          </a>
        </Button>
      </header>

      <div className="about-hero">
        <h1 className="brand-title about-brand-title" aria-label="GlobalTrace">
          <span className="brand-title-lead">Global</span>
          <span className="brand-title-mark">Trace</span>
        </h1>
        <p>{messages.aboutIntro}</p>
      </div>

      <div className="about-body">
        <section className="about-section">
          <h2>Globalping</h2>
          <p>{messages.aboutGlobalping}</p>
        </section>

        <section className="about-section">
          <h2>NextTrace</h2>
          <p>{messages.aboutNexttrace}</p>
        </section>

        <section className="about-section">
          <h2>{messages.openSourceLicense}</h2>
          <p>{messages.licenseText}</p>
        </section>

        <section className="about-section about-links" aria-label={messages.relatedLinks}>
          <h2>{messages.relatedLinks}</h2>
          <div className="about-link-groups">
            {linkGroups.map((group) => (
              <div className="about-link-group" key={group.title}>
                <p className="about-link-group-label">{group.title}</p>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} target="_blank" rel="noreferrer">
                        <span>{link.label}</span>
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      {backgroundImage ? (
        <footer className="about-background-credit">
          <a
            href={backgroundImage.copyrightLink}
            target="_blank"
            rel="noreferrer"
          >
            {messages.backgroundCredit(
              backgroundImage.title || messages.bingDailyImage,
              backgroundImage.copyright,
            )}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </footer>
      ) : null}
    </section>
  );
}
