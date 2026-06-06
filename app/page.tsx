import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Folio — Property investment, finally legible',
  description:
    'Understand your Australian property portfolio, stay ahead of important events, and model your next move — without maintaining another spreadsheet.',
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <polyline points="3,7 6,10 11,4" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Skip link */}
      <a
        href="#main-content"
        className="fixed top-0 left-0 -translate-y-full focus:translate-y-0 z-[100] bg-surface-raised text-foreground text-sm font-medium px-4 py-2 border-b border-r border-border rounded-br-md transition-transform"
      >
        Skip to main content
      </a>

      {/* TOP NAV */}
      <nav className="sticky top-0 z-50 bg-surface-raised border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-display text-xl text-foreground">
            Folio<em> · beta</em>
          </span>
          <div className="flex items-center gap-4 md:gap-6">
            <a
              href="#decisions"
              className="hidden md:inline text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Decisions
            </a>
            <a
              href="#how"
              className="hidden md:inline text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              How it works
            </a>
            <a
              href="#principles"
              className="hidden md:inline text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              What it is
            </a>
            <a
              href="#access"
              className="hidden md:inline text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Early access
            </a>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Get early access</Link>
            </Button>
          </div>
        </div>
      </nav>

      <main id="main-content">
      {/* HERO */}
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Copy */}
          <div>
            <span className="inline-flex items-center gap-2 text-sm text-foreground-muted mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-positive inline-block flex-shrink-0" />
              Private beta · Australia
            </span>
            <h1 className="font-display text-4xl md:text-5xl leading-tight mb-6">
              Property investment,
              <br />
              <em>finally legible.</em>
            </h1>
            <p className="text-foreground-muted leading-relaxed mb-8 max-w-md">
              Understand your portfolio, stay ahead of important events, and model your next move,
              without maintaining another spreadsheet.
            </p>
            <div className="flex gap-3 flex-wrap mb-4">
              <Button size="lg" asChild>
                <Link href="/signup">Get early access</Link>
              </Button>
              <Button variant="ghost" size="lg" asChild>
                <a href="#how">See how it works</a>
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground-subtle mb-10">
              <span className="text-positive flex-shrink-0">
                <CheckIcon />
              </span>
              Free while in beta · No credit card
            </div>

            <div className="bg-surface-sunken rounded-lg p-4">
              <div className="text-xs font-medium text-foreground-muted mb-3 uppercase tracking-wider">
                Know at a glance
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  'Is my portfolio performing?',
                  'What needs my attention?',
                  'Which property is helping, or hurting, my portfolio most?',
                  'What happens if I make my next move?',
                ].map((q) => (
                  <li key={q} className="flex items-start gap-2 text-sm text-foreground-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground-faint mt-1.5 flex-shrink-0 inline-block" />
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Hero stage mockup */}
          <div aria-hidden="true" className="hidden lg:flex flex-col gap-3 select-none">
            <div className="bg-surface-raised border border-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-warning-soft flex items-center justify-center text-xs font-bold text-warning">
                  !
                </span>
                <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                  Action needed
                </span>
              </div>
              <p className="text-sm text-foreground mb-3">
                No rent recorded for 14 Elm Street in April. The McGrath statement hasn't arrived.
              </p>
              <div className="flex gap-5 text-xs text-foreground-subtle">
                <span>
                  <span className="text-foreground-faint">Expected </span>$3,810
                </span>
                <span>
                  <span className="text-foreground-faint">Last received </span>27 Mar
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-raised border border-border rounded-lg p-4 shadow-sm">
                <div className="text-xs text-foreground-muted mb-2">Total value</div>
                <div className="font-display text-2xl text-foreground leading-none">
                  <span className="text-base">$</span>2.07<span className="text-base">m</span>
                </div>
                <div className="flex items-center gap-2 text-xs mt-2">
                  <span className="text-positive">+1.4%</span>
                  <span className="text-foreground-muted">3 properties</span>
                </div>
              </div>
              <div className="bg-surface-raised border border-border rounded-lg p-4 shadow-sm">
                <div className="text-xs text-foreground-muted mb-2">Net cashflow · mo</div>
                <div className="font-display text-2xl text-negative leading-none">
                  −<span className="text-base">$</span>1,110
                </div>
                <div className="flex items-center gap-2 text-xs mt-2">
                  <span className="text-negative">−$240 vs Mar</span>
                  <span className="text-foreground-muted">avg, 3mo</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-raised border border-border rounded-lg p-4 shadow-sm">
              <div className="text-sm font-medium text-foreground mb-1">McGrath PM · Apr</div>
              <div className="text-[9px] text-foreground-subtle mb-3">
                14 Elm Street · Statement
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 bg-surface-sunken rounded-full" />
                <div className="h-1.5 bg-surface-sunken rounded-full w-4/5" />
                <div className="h-1.5 bg-surface-sunken rounded-full" />
                <div className="h-1.5 bg-surface-sunken rounded-full w-3/5" />
              </div>
            </div>

            <div className="text-center text-xs text-foreground-subtle italic">
              extracted &amp; routed automatically
            </div>
          </div>
        </div>
      </div>

        {/* VALUE PROPS */}
        <section id="value" className="border-t border-border py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-sm font-medium text-foreground-muted mb-3">What Folio does</div>
            <h2 className="font-display text-3xl md:text-4xl leading-tight mb-12">
              Know where you stand,
              <br />
              <em>and what to do next.</em>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              {[
                {
                  num: '01',
                  title: 'Know where your portfolio stands',
                  body: 'Track cashflow, equity, leverage, and performance across your entire portfolio, without combining data from multiple spreadsheets and apps.',
                  foot: 'Properties · Loans · Cashflow · Equity · LVR. One connected model.',
                },
                {
                  num: '02',
                  title: 'Model decisions before you make them',
                  body: 'Explore the impact of a purchase, sale, refinance, renovation, or rate rise before you commit, with your real numbers, not a generic calculator.',
                  foot: 'Buy · Sell · Refinance · Renovate · Hold. Modelled, not guessed.',
                },
                {
                  num: '03',
                  title: 'Stay ahead of important events',
                  body: 'Track lease renewals, insurance, interest-only expiries, missing statements, and the follow-ups that property managers occasionally miss.',
                  foot: 'Folio watches the calendar so nothing slips through.',
                },
              ].map((card) => (
                <article
                  key={card.num}
                  className="bg-surface-raised border border-border rounded-lg p-6 flex flex-col"
                >
                  <div className="font-display text-3xl text-foreground-faint mb-4">{card.num}</div>
                  <h3 className="font-semibold text-foreground mb-3">{card.title}</h3>
                  <p className="text-sm text-foreground-muted leading-relaxed flex-1 mb-4">{card.body}</p>
                  <div className="pt-4 border-t border-border text-xs text-foreground-subtle">
                    {card.foot}
                  </div>
                </article>
              ))}
            </div>

            <p className="flex flex-col sm:flex-row gap-3 items-start text-sm text-foreground-muted">
              <span className="inline-flex items-center px-2.5 py-0.5 bg-surface-sunken rounded text-xs font-medium text-foreground whitespace-nowrap flex-shrink-0">
                And it stays current
              </span>
              <span>
                Drop a PM statement, bank export, or rates notice and Folio reads it, classifies it, and
                routes every transaction to the right property and loan, so the numbers above are always up
                to date without the typing.
              </span>
            </p>
          </div>
        </section>

        {/* DECISIONS */}
        <section id="decisions" className="border-t border-border py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-sm font-medium text-foreground-muted mb-3">Planning</div>
            <h2 className="font-display text-3xl md:text-4xl leading-tight mb-6">
              Built for the decisions
              <br />
              <em>investors actually make.</em>
            </h2>
            <p className="text-foreground-muted mb-10 max-w-xl">
              Every portfolio comes down to a handful of recurring questions. Folio is built to help you
              answer them with your own numbers.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
              {[
                { action: 'Buy', q: 'Can I afford another property?' },
                { action: 'Refinance', q: 'What happens if my rate changes?' },
                { action: 'Hold', q: 'Is this property still performing?' },
                { action: 'Sell', q: 'How would a sale affect the portfolio?' },
                { action: 'Renovate', q: 'Will the numbers stack up?' },
              ].map((card) => (
                <article
                  key={card.action}
                  className="bg-surface-raised border border-border rounded-lg p-4"
                >
                  <div className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">
                    {card.action}
                  </div>
                  <div className="text-sm text-foreground leading-snug">{card.q}</div>
                </article>
              ))}
            </div>

            <p className="text-sm text-foreground-muted max-w-2xl">
              Folio starts with portfolio visibility and operational awareness. Decision modelling is
              expanding over time, guided by the scenarios investors actually use.
            </p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="border-t border-border py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-sm font-medium text-foreground-muted mb-3">How it works</div>
            <h2 className="font-display text-3xl md:text-4xl leading-tight mb-6">
              Set up in an afternoon.
              <br />
              <em>Then mostly forget about it.</em>
            </h2>
            <p className="text-foreground-muted mb-12 max-w-xl">
              Folio is built around the rhythm of how property investors actually work: statements arrive
              monthly, decisions happen quarterly, big moves happen yearly. The product matches that pace.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div>
                <h3 className="font-semibold text-foreground mb-3">Build your portfolio</h3>
                <p className="text-sm text-foreground-muted leading-relaxed mb-4">
                  List the properties, loans, and entities you hold. Folio fills in valuations and
                  balances as documents arrive, so you don't have to be exact upfront.
                </p>
                <div className="bg-surface-sunken rounded-lg p-3 text-sm text-foreground-muted">
                  <strong className="text-foreground font-semibold">14 Elm Street</strong> · House ·
                  Randwick
                  <br />
                  Okafor Family Trust · $920k · 1 loan
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3">Keep information up to date</h3>
                <p className="text-sm text-foreground-muted leading-relaxed mb-4">
                  Forward your PM emails, drop your bank PDFs, scan a rates notice with your phone.
                  Folio reads each document and keeps every number current.
                </p>
                <div className="bg-surface-sunken rounded-lg p-3 text-sm text-foreground-muted">
                  <strong className="text-foreground font-semibold">4 documents</strong> · 2 matched, 2
                  need input
                  <br />
                  <span className="text-positive">+1 new property found</span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3">Use it to make decisions</h3>
                <p className="text-sm text-foreground-muted leading-relaxed mb-4">
                  Model a rate rise, a sale, a renovation. Track the interest-only rollover that's years
                  out. Folio holds the context so you can act with confidence.
                </p>
                <div className="bg-surface-sunken rounded-lg p-3 text-sm text-foreground-muted">
                  <strong className="text-foreground font-semibold">Rate sensitivity</strong> · +0.5%
                  <br />
                  Cashflow: −$1,110 → <span className="text-negative">−$2,150 / mo</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section id="principles" className="border-t border-border py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-sm font-medium text-foreground-muted mb-3">
              What Folio is, and isn't
            </div>
            <h2 className="font-display text-3xl md:text-4xl leading-tight mb-6">
              An honest shape.
              <br />
              <em>No more, no less.</em>
            </h2>
            <p className="text-foreground-muted mb-12 max-w-xl">
              Property tools get sold with grand promises. Here's the smaller, more accurate version.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div>
                <h4 className="font-semibold text-foreground mb-5">✦ What Folio is</h4>
                <ul className="space-y-4">
                  {[
                    'A single, calm view of your property portfolio',
                    'A model of your loans, valuations, cashflow, and net position',
                    'Calculators for what-if decisions investors actually make',
                    'Automatically extracts and organises information from the documents you already receive',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-foreground-muted">
                      <span className="flex-shrink-0 text-positive mt-0.5">
                        <CheckIcon />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground-muted mb-5">What it isn't</h4>
                <ul className="space-y-4">
                  {[
                    "A tax tool. We don't compute CGT, depreciation, or your return. Your accountant does.",
                    "A broker. We don't shop loans or recommend products.",
                    "A property data service. We don't sell suburb medians or comparables.",
                    'Connected to your bank. You upload statements. We never see your password.',
                    'An AI chatbot for your portfolio. We use automation where it helps, but prefer structured tools and clear answers over generic advice.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-foreground-muted">
                      <span className="flex-shrink-0 text-foreground-faint mt-0.5 leading-none">×</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* EARLY ACCESS */}
        <section id="access" className="border-t border-border py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-sm font-medium text-foreground-muted mb-3">Early access</div>
            <h2 className="font-display text-3xl md:text-4xl leading-tight mb-10">
              We're building Folio
              <br />
              <em>with early investors.</em>
            </h2>

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 bg-surface-raised border border-border rounded-xl p-8">
              <div>
                <p className="text-foreground mb-3">
                  Folio is currently in <em>private beta.</em>
                </p>
                <p className="text-sm text-foreground-muted mb-4">
                  We're working closely with early investors to shape the product and prioritise new
                  capabilities.
                </p>
                <div className="flex items-center gap-2 text-sm text-foreground-subtle">
                  <span className="text-positive flex-shrink-0">
                    <CheckIcon />
                  </span>
                  Free during beta
                </div>
              </div>
              <div className="flex-shrink-0">
                <Button size="lg" asChild>
                  <Link href="/signup">Request early access</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="bg-foreground text-white py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <h2 className="font-display text-3xl md:text-4xl leading-tight mb-6 max-w-2xl mx-auto">
              Understand your portfolio. Stay ahead of problems. Make better investment decisions.
              <br />
              <em>Built for the long game.</em>
            </h2>
            <p className="text-white/60 mb-8">No setup call. No sales email. Just a sign-in link.</p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button
                size="lg"
                className="bg-white text-foreground hover:bg-surface"
                asChild
              >
                <Link href="/signup">Get early access</Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white/80 hover:text-white hover:bg-white/10"
                asChild
              >
                <Link href="/login">Already have an account →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-sm text-foreground-muted">© 2026 Folio · Made in Sydney</div>
        </div>
      </footer>
    </div>
  )
}
