import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Bot,
  Code2,
  GitBranch,
  Github,
  Rss,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const featureCards = [
  {
    icon: Bot,
    title: "AI changelog interpretation",
    body: "Turn HubSpot developer updates into clear impact summaries, severity, and migration context.",
  },
  {
    icon: Code2,
    title: "Practical codebase scanning",
    body: "Check manifests and source patterns for HubSpot SDK usage before sending noisy alerts.",
  },
  {
    icon: BellRing,
    title: "Targeted delivery",
    body: "Send email alerts and create GitHub issues only when a repository looks affected.",
  },
];

export default function HomePage() {
  return (
    <div className="marketingPage">
      <header className="marketingNav">
        <Logo />
        <nav aria-label="Primary navigation">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="marketingActions">
          <Link href="/login">Log In</Link>
          <Link className="button" href="/signup">
            Get Started
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="heroCopy">
            <h1>
              Stop Chasing <span>Breaking Changes</span>
            </h1>
            <p>
              AI-powered codebase monitoring for HubSpot developers. Sprocky
              Changedust watches the changelog, analyzes impact, and scans
              connected GitHub repositories before alerting your team.
            </p>
            <Link className="button" href="/signup">
              Get Started - Free Plan
            </Link>
          </div>
          <div className="flowPanel" aria-label="Monitoring workflow preview">
            <div className="flowTop">
              <div className="flowNode">
                <Rss size={26} />
                <span>Changelog</span>
              </div>
              <ArrowRight size={22} />
              <div className="flowNode hot">
                <Bot size={30} />
                <span>AI Analysis</span>
              </div>
            </div>
            <div className="flowRepo">
              <Code2 size={23} />
              <GitBranch size={25} />
              <Github size={23} />
            </div>
            <div className="flowBottom">
              <span>
                <Github size={16} />
                Issue Created
              </span>
              <span>
                <BellRing size={16} />
                Email Alert
              </span>
            </div>
          </div>
        </section>

        <section className="features" id="features">
          <h2>AI-Powered Codebase Intelligence</h2>
          <p>
            Stay ahead of the curve with an intelligent monitoring toolkit built
            for modern HubSpot integration work.
          </p>
          <div className="featureGrid">
            {featureCards.map((feature) => {
              const Icon = feature.icon;

              return (
                <article className="card featureCard" key={feature.title}>
                  <span className="featureIcon">
                    <Icon size={23} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="ctaBand" id="pricing">
          <h2>
            Stop Chasing <span>Breaking Changes</span>
          </h2>
          <p>Join the proactive wave of developers building steady HubSpot integrations.</p>
          <Link className="button" href="/signup">
            Get Started - Free Forever
          </Link>
        </section>
      </main>

      <footer className="marketingFooter">
        <Logo compact />
        <span>Not affiliated with HubSpot, Inc.</span>
        <span className="footerLinks">
          <a href="#">Terms</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Status</a>
        </span>
      </footer>
    </div>
  );
}
