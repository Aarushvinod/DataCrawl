import { useAuth0 } from '@auth0/auth0-react';
import { ArrowRight, ChartCandlestick, LayoutDashboard, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandWordmark from '../Brand/BrandWordmark';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';
import AnimatedHeroHeadline from './AnimatedHeroHeadline';
import AnimatedHeroWordmark from './AnimatedHeroWordmark';
import NumericRainCanvas from './NumericRainCanvas';
import SpiderField from './SpiderField';

interface ConstellationNode {
  title: string;
  description: string;
  examples: string[];
}

const CONSTELLATION_NODES: ConstellationNode[] = [
  {
    title: 'Discover',
    description: 'Spot the financial sources that matter, from market calendars and macro releases to filings and public pricing pages.',
    examples: ['SEC filings', 'Treasury releases', 'Market calendars'],
  },
  {
    title: 'Collect',
    description: 'Pull the exact fields you need, then organize them into a run that stays easy to understand and revise.',
    examples: ['Symbols', 'Rates', 'Volumes', 'Issuer details'],
  },
  {
    title: 'Refine',
    description: 'Shape the captured output into a finance-ready dataset with clear versions, traceable context, and follow-up revisions.',
    examples: ['Versioned datasets', 'Quality checks', 'Synthetic scenarios'],
  },
];

const HERO_MARKETS = ['Rates', 'Equities', 'Macro', 'Filings', 'Credit', 'Alternative signals'];

export default function LandingPage() {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeNodeIndex, setActiveNodeIndex] = useState(0);
  const [parallaxOffset, setParallaxOffset] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined;
    }

    let frameId = 0;
    let queued = false;
    const onScroll = () => {
      if (queued) {
        return;
      }
      queued = true;
      frameId = window.requestAnimationFrame(() => {
        queued = false;
        setParallaxOffset(window.scrollY);
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(frameId);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveNodeIndex((current) => (current + 1) % CONSTELLATION_NODES.length);
    }, 3600);

    return () => window.clearInterval(intervalId);
  }, [prefersReducedMotion]);

  const handlePrimaryAction = async () => {
    if (isAuthenticated) {
      navigate('/projects');
      return;
    }

    await loginWithRedirect({
      appState: { returnTo: '/projects' },
    });
  };

  const scrollToHowItWorks = () => {
    const section = document.getElementById('how-it-works');
    if (!section) {
      return;
    }

    const top = section.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({
      top,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="dc-landing">
      <NumericRainCanvas reducedMotion={prefersReducedMotion} />
      <SpiderField reducedMotion={prefersReducedMotion} />

      <div className="dc-landing__content">
        <header className="dc-landing__header">
          <BrandWordmark size="nav" />
          <div className="dc-landing__header-actions">
            {isAuthenticated && (
              <button className="btn btn--secondary" type="button" onClick={() => navigate('/projects')}>
                <LayoutDashboard size={16} />
                Open console
              </button>
            )}
            <button className="btn btn--ghost" type="button" onClick={scrollToHowItWorks}>
              How it works
            </button>
          </div>
        </header>

        <section className="dc-hero">
          <div
            className="dc-hero__content"
            style={{ transform: `translate3d(0, ${prefersReducedMotion ? 0 : parallaxOffset * -0.04}px, 0)` }}
          >
            <AnimatedHeroWordmark reducedMotion={prefersReducedMotion} />
            <p className="dc-hero__eyebrow">Built for financial data collection and synthetic market scenarios.</p>
            <AnimatedHeroHeadline
              reducedMotion={prefersReducedMotion}
              text="Crawl the web for market signals, filings, and macro data without losing the thread."
            />
            <p className="dc-hero__subtitle">
              DataCrawl is designed for financial research teams that need structured datasets from live web sources, public disclosures, and synthetic what-if modeling in one place.
            </p>

            <div className="dc-hero__market-strip" aria-label="financial coverage">
              {HERO_MARKETS.map((item) => (
                <span key={item} className="dc-market-pill">{item}</span>
              ))}
            </div>

            <div className="dc-hero__actions">
              <button className="btn btn--primary btn--hero" type="button" onClick={handlePrimaryAction}>
                {isAuthenticated ? 'Open console' : 'Start crawling'}
                <ArrowRight size={16} />
              </button>
              <button className="btn btn--secondary btn--hero" type="button" onClick={scrollToHowItWorks}>
                See how it works
              </button>
            </div>

            <div className="dc-hero__metrics">
              <div className="dc-hero__metric">
                <span className="dc-hero__metric-value">Rates</span>
                <span className="dc-hero__metric-label">Track moves, curves, and release timing.</span>
              </div>
              <div className="dc-hero__metric">
                <span className="dc-hero__metric-value">Filings</span>
                <span className="dc-hero__metric-label">Follow disclosures, issuers, and public updates.</span>
              </div>
              <div className="dc-hero__metric">
                <span className="dc-hero__metric-value">Scenarios</span>
                <span className="dc-hero__metric-label">Generate synthetic financial datasets when live crawl is not the goal.</span>
              </div>
            </div>

            <div className="dc-finance-ribbon card">
              <div className="dc-finance-ribbon__item">
                <ChartCandlestick size={16} />
                <span>Market structure tracking</span>
              </div>
              <div className="dc-finance-ribbon__item">
                <TrendingUp size={16} />
                <span>Macro and rates monitoring</span>
              </div>
              <div className="dc-finance-ribbon__item">
                <span className="mono">10Y · CPI · 13F · 8-K</span>
              </div>
            </div>
          </div>
        </section>

        <section className="dc-section dc-section--constellation" id="how-it-works">
          <div className="dc-section__intro">
            <p className="dc-section__eyebrow">How DataCrawl works</p>
            <h2 className="dc-section__title">A crawl path built for financial research and data operations.</h2>
            <p className="dc-section__copy">
              Follow the thread from first market discovery to a clean dataset. Hover each node to preview the kinds of finance-focused information that show up along the way.
            </p>
          </div>

          <div className="dc-constellation">
            <div className="dc-constellation__map">
              <svg className="dc-constellation__lines" viewBox="0 0 640 280" preserveAspectRatio="none" aria-hidden="true">
                <path d="M90 170C160 120 215 118 290 138C368 160 420 105 548 120" />
                <path d="M96 176C172 208 224 212 296 194C392 170 458 212 548 192" />
              </svg>
              {CONSTELLATION_NODES.map((node, index) => (
                <button
                  key={node.title}
                  type="button"
                  className={`dc-constellation__node${activeNodeIndex === index ? ' is-active' : ''}`}
                  style={{ ['--node-index' as string]: index }}
                  onMouseEnter={() => setActiveNodeIndex(index)}
                  onFocus={() => setActiveNodeIndex(index)}
                >
                  <span className="dc-constellation__node-ring" />
                  <span className="dc-constellation__node-title">{node.title}</span>
                </button>
              ))}
            </div>
            <div className="dc-constellation__detail card">
              <div className="dc-constellation__detail-title">{CONSTELLATION_NODES[activeNodeIndex]?.title}</div>
              <p>{CONSTELLATION_NODES[activeNodeIndex]?.description}</p>
              <div className="dc-tag-grid">
                {CONSTELLATION_NODES[activeNodeIndex]?.examples.map((example) => (
                  <span key={example} className="dc-tag">{example}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="dc-section">
          <div className="dc-section__intro">
            <p className="dc-section__eyebrow">Two ways to build data</p>
            <h2 className="dc-section__title">Collect live financial data or generate synthetic finance datasets with the same workspace context.</h2>
          </div>
          <div className="dc-mode-grid">
            <article className="card dc-mode-card dc-mode-card--real">
              <div className="dc-mode-card__badge">Real data</div>
              <h3>Live web and source collection</h3>
              <p>Best when you want DataCrawl to move across public pages, direct sources, and structured feeds to build a grounded financial dataset.</p>
              <ul className="dc-feature-list">
                <li>Explore filings, calendars, releases, and public market pages</li>
                <li>Keep context around each crawl and revision</li>
                <li>Trace each saved dataset back to its collection path</li>
              </ul>
            </article>
            <article className="card dc-mode-card dc-mode-card--synthetic">
              <div className="dc-mode-card__badge">Synthetic data</div>
              <h3>Scenario-ready numeric generation</h3>
              <p>Best when you need plausible finance-shaped data quickly, such as testing pipelines, model evaluation, or controlled scenarios.</p>
              <ul className="dc-feature-list">
                <li>Skip live crawl steps entirely</li>
                <li>Focus on ranges, structure, and scenario coverage</li>
                <li>Save each revision as a fresh dataset version</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="dc-section dc-section--workspace">
          <div className="dc-section__intro">
            <p className="dc-section__eyebrow">Inside the workspace</p>
            <h2 className="dc-section__title">A financial data console for projects, live runs, and finished datasets.</h2>
          </div>
          <div className="dc-workspace-preview card">
            <div className="dc-workspace-preview__sidebar">
              <BrandWordmark size="nav" />
              <div className="dc-workspace-preview__nav"><span className="is-active">Projects</span><span>Billing</span></div>
            </div>
            <div className="dc-workspace-preview__main">
              <div className="dc-workspace-preview__stats">
                <div className="dc-preview-stat"><strong>14</strong><span>active datasets</span></div>
                <div className="dc-preview-stat"><strong>06</strong><span>live runs</span></div>
                <div className="dc-preview-stat"><strong>$82.40</strong><span>run budget</span></div>
              </div>
              <div className="dc-workspace-preview__panels">
                <div className="dc-preview-panel dc-preview-panel--project"><span className="dc-preview-panel__label">Project</span><strong>Rate-sensitive market tracker</strong><p>Collect treasuries, filings, or public pricing pages while keeping follow-up revisions connected.</p></div>
                <div className="dc-preview-panel dc-preview-panel--run"><span className="dc-preview-panel__label">Live run</span><strong>Collecting macro and issuer signals</strong><p>Progress stays visible while notes, approvals, and changes stay in the same financial data thread.</p></div>
                <div className="dc-preview-panel dc-preview-panel--dataset"><span className="dc-preview-panel__label">Dataset</span><strong>Clean, versioned output</strong><p>Finished tables open fast, preview cleanly, and remain easy to download or revise.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="dc-section dc-section--cta">
          <div className="card dc-closing-card">
            <div className="dc-closing-card__copy">
              <p className="dc-section__eyebrow">Ready to build with DataCrawl?</p>
              <h2 className="dc-section__title">Bring market discovery, web crawling, and finance-ready datasets into one console.</h2>
            </div>
            <button className="btn btn--primary btn--hero" type="button" onClick={handlePrimaryAction}>
              {isAuthenticated ? 'Open console' : 'Start crawling'}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
