// =====================================================================
// Folio — Embedded Assistant  (prototype)
// ---------------------------------------------------------------------
// A drop-in agent surface: a persistent floating launcher (bottom-right)
// that opens a chat drawer overlaying the right edge of any authenticated
// screen. Self-contained — include once on a page (or once in the shared
// layout) and it mounts itself. Does not modify page content.
//
//   • Drawer OPEN/CLOSED   → persists across in-app navigation
//     (sessionStorage; survives the full page-loads this mockup uses).
//   • Conversation thread  → ephemeral. Kept across navigation so a train
//     of thought isn't lost mid-task, RESET on a true page reload, and
//     gone when the tab closes (sessionStorage + Navigation Timing to
//     tell reload from navigation).
//   • Starter prompts      → static, hand-authored, contextual to the
//     current page (Dashboard vs Properties vs Loans …).
//   • Streaming + Stop     → answers stream token-by-token and can be
//     interrupted mid-flight.
//   • Rate limit           → per-user daily message cap; on reach, the
//     assistant says so and the composer locks for the day.
//
// Agent responses here are SCRIPTED for the prototype — the flows show the
// UI vocabulary (plan → tool calls → streamed answer → citations →
// human-in-the-loop action), not a live model. In production these stream
// from the Vercel AI SDK and the daily cap is enforced server-side.
//
// Next.js port: <AssistantDock/> in app/(app)/layout.tsx; thread in React
// state/context (survives client nav, lost on hard refresh) — same model.
// =====================================================================

(function () {
  if (window.__folioAgentMounted) return;
  window.__folioAgentMounted = true;

  const DAILY_CAP = 12;            // per-user message cap (prototype value)

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // ── tiny SVG helpers ───────────────────────────────────────────────
  const I = {
    spark: '<svg class="fa-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3L8.5 12l2.3-1.2z" fill="currentColor" stroke="none"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3v3h-3"/><path d="M13 8a5 5 0 1 1-1.5-3.6L13 6"/></svg>',
    send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h9M8 4l4 4-4 4"/></svg>',
    stop: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1.6"/></svg>',
    check: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5l2.2 2.2L9.5 3.5"/></svg>',
    okmini: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="5.5"/><path d="M4.7 7.2l1.6 1.6 3-3.4"/></svg>',
    spin: '<svg class="fa-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" /></svg>',
    db: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><ellipse cx="7" cy="3.2" rx="4.5" ry="1.7"/><path d="M2.5 3.2v7.6c0 .9 2 1.7 4.5 1.7s4.5-.8 4.5-1.7V3.2"/><path d="M2.5 7c0 .9 2 1.7 4.5 1.7s4.5-.8 4.5-1.7"/></svg>',
    doc: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.5 1.5h4L11 5v7.5H3.5z"/><path d="M7.5 1.5V5H11"/><path d="M5.5 8h3M5.5 10h3"/></svg>',
    chart: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2 12h10"/><path d="M4 12V8M7 12V4M10 12V6"/></svg>',
    home: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2 7l5-4 5 4v5H2z"/><path d="M5.5 12V8.5h3V12"/></svg>',
    bell: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 9.5h7.6l-.9-1.5V6a2.9 2.9 0 0 0-5.8 0v2z"/><path d="M5.7 11a1.3 1.3 0 0 0 2.6 0"/></svg>',
    arrow: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h6M6.5 3.5L9 6l-2.5 2.5"/></svg>',
  };

  const SK = { open: 'folio.agent.open', thread: 'folio.agent.thread', usage: 'folio.agent.usage' };

  // ── persistence: reset the thread on a genuine reload ──────────────
  // Navigation Timing: type 'reload' => user refreshed => wipe the thread.
  // 'navigate' / 'back_forward' => moving between app pages => keep it.
  (function reconcile() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      const type = nav ? nav.type : 'navigate';
      if (type === 'reload') sessionStorage.removeItem(SK.thread);
    } catch (e) {}
  })();

  function loadThread() { try { return JSON.parse(sessionStorage.getItem(SK.thread) || '[]'); } catch (e) { return []; } }
  function saveThread(t) { try { sessionStorage.setItem(SK.thread, JSON.stringify(t)); } catch (e) {} }

  // ── rate limit (per calendar day) ──────────────────────────────────
  function usageToday() {
    const today = new Date().toISOString().slice(0, 10);
    let u = null;
    try { u = JSON.parse(localStorage.getItem(SK.usage) || 'null'); } catch (e) {}
    if (!u || u.date !== today) u = { date: today, count: 0 };
    return u;
  }
  function bumpUsage() {
    const u = usageToday(); u.count += 1;
    try { localStorage.setItem(SK.usage, JSON.stringify(u)); } catch (e) {}
    return u;
  }
  function remaining() { return Math.max(0, DAILY_CAP - usageToday().count); }

  // ── scripted agent flows ───────────────────────────────────────────
  const FLOWS = {
    cashflow: {
      plan: ['Pull 12-month cashflow by property', 'Split loan repayments vs rent', 'Identify the biggest drag'],
      tools: [
        { ico: 'db', label: 'Queried <b>3 properties</b> &middot; rent &amp; expenses, 12-mo', ms: 900 },
        { ico: 'db', label: 'Queried <b>3 loans</b> &middot; scheduled repayments', ms: 800 },
      ],
      answer:
        '<p>Across the portfolio you\u2019re running <span class="fa-num fa-neg">\u2212$1,110/mo</span> after loan repayments. Most of it is one property:</p>' +
        '<p><strong>8&nbsp;Daley&nbsp;St</strong> is <span class="fa-num fa-neg">\u2212$890/mo</span> \u2014 your lowest yield (3.9%) and highest gearing (75%), so rent doesn\u2019t cover the interest-only repayments plus costs. <strong>14&nbsp;Elm&nbsp;St</strong> is mildly negative (<span class="fa-num fa-neg">\u2212$340</span>); <strong>Sutherland&nbsp;Ct</strong> is the only one in the black (<span class="fa-num fa-pos">+$120</span>).</p>' +
        '<p>Household surplus more than covers it, so total surplus is still <span class="fa-num fa-pos">+$1,290/mo</span>. One to watch: Daley St\u2019s IO period ends <strong>Mar&nbsp;2028</strong> \u2014 the gap deepens by roughly <span class="fa-num fa-neg">$500/mo</span> when it rolls to P&amp;I.</p>',
      cites: [
        { n: 1, label: '8 Daley St', goto: 'property' },
        { n: 2, label: 'CBA \u00b7 Daley St', goto: 'loan' },
        { n: 3, label: 'Serviceability', goto: 'dashboard' },
      ],
      action: { title: 'Model the Daley St IO rollover', desc: 'Runs the rollover in the Interest-only tool with the current balance and end date, so you can see the step-up before it lands. Opens a draft \u2014 nothing changes until you save.', cta: 'Open the model', goto: 'interest-only', done: 'Draft opened in Interest-only model' },
    },
    attention: {
      plan: ['Scan open prompts by severity', 'Check lease & statement deadlines', 'Rank by urgency'],
      tools: [
        { ico: 'bell', label: 'Read <b>5 open prompts</b> &middot; sorted by severity', ms: 850 },
        { ico: 'doc', label: 'Checked <b>statements & leases</b> for due dates', ms: 800 },
      ],
      answer:
        '<p>Three things, most pressing first:</p>' +
        '<p><strong>1 &middot; Missing April rent \u2014 14&nbsp;Elm&nbsp;St.</strong> The McGrath statement hasn\u2019t arrived; <span class="fa-num">$3,810</span> expected. Blocks your April position.</p>' +
        '<p><strong>2 &middot; 3 unmatched CBA transactions</strong> (<span class="fa-num">$2,167 / $340 / $128</span>) need routing before April reconciles.</p>' +
        '<p><strong>3 &middot; Lease renewal in 6 weeks</strong> \u2014 14&nbsp;Elm&nbsp;St rent is ~4% under market. Not urgent, worth a decision soon.</p>',
      cites: [ { n: 1, label: '14 Elm St', goto: 'property' }, { n: 2, label: 'Upload', goto: 'upload' } ],
      action: { title: 'Chase the McGrath April statement', desc: 'Drafts a short email to McGrath PM requesting the April statement for 14 Elm St. You review and send.', cta: 'Draft the email', goto: null, done: 'Draft ready in your outbox' },
    },
    rentreview: {
      plan: ['Pull current lease terms & rent', 'Compare to market estimate', 'Draft the note'],
      tools: [
        { ico: 'home', label: 'Read <b>14 Elm St</b> lease &middot; $880/wk, renews 6 wks', ms: 850 },
        { ico: 'chart', label: 'Market estimate &middot; <b>$920/wk</b> (~4% above)', ms: 700 },
      ],
      answer:
        '<p>Here\u2019s a draft to send the tenant ahead of renewal:</p>' +
        '<p style="padding:var(--space-4);border:1px solid hsl(var(--border));border-radius:var(--radius);background:hsl(var(--surface));font-size:var(--text-sm);line-height:var(--leading-loose);color:hsl(var(--foreground-muted));">\u201cHi S. \u2014 your lease at 14&nbsp;Elm&nbsp;St is up for renewal on 30&nbsp;June. We\u2019re proposing a new rent of <strong>$915/wk</strong> (from $880), in line with comparable rentals nearby. Happy to discuss a 12-month term.\u201d</p>' +
        '<p>I pitched <span class="fa-num">$915</span> \u2014 just under market to favour retention. Want it higher or lower?</p>',
      cites: [ { n: 1, label: '14 Elm St', goto: 'property' } ],
      action: { title: 'Save this note to 14 Elm St', desc: 'Attaches the draft to the property\u2019s lease timeline, ready when you renew. Won\u2019t send anything to the tenant.', cta: 'Save to property', goto: 'property', done: 'Saved to 14 Elm St \u00b7 lease timeline' },
    },
    equity: {
      plan: ['Total current values & loan balances', 'Apply 80% LVR lending limit', 'Estimate accessible equity'],
      tools: [
        { ico: 'db', label: 'Valued <b>3 properties</b> &middot; $2.07m total', ms: 850 },
        { ico: 'db', label: 'Summed <b>3 loans</b> &middot; $1.14m owing', ms: 750 },
      ],
      answer:
        '<p>At 80% LVR you have roughly <span class="fa-num fa-pos">$520k</span> of usable equity before purchase costs.</p>' +
        '<p>Most sits in <strong>Sutherland&nbsp;Ct</strong> \u2014 it\u2019s unencumbered and held personally. <strong>14&nbsp;Elm&nbsp;St</strong> adds a fair slice; <strong>8&nbsp;Daley&nbsp;St</strong> is already at 75% so it contributes least.</p>',
      cites: [ { n: 1, label: 'Portfolio LVR', goto: 'dashboard' }, { n: 2, label: 'Sutherland Ct', goto: 'property' } ],
      action: { title: 'Model a deposit from equity', desc: 'Opens the Purchase model pre-filled with $520k available equity to test the next buy.', cta: 'Open purchase model', goto: 'model-purchase', done: 'Draft opened in Purchase model' },
    },
    bestproperty: {
      plan: ['Pull yield & cashflow per property', 'Rank by net return', 'Flag the laggard'],
      tools: [
        { ico: 'home', label: 'Read <b>3 properties</b> &middot; rent, value, costs', ms: 850 },
        { ico: 'chart', label: 'Computed <b>net yield</b> per property', ms: 700 },
      ],
      answer:
        '<p><strong>Sutherland&nbsp;Ct</strong> is your strongest \u2014 the only positive cashflow (<span class="fa-num fa-pos">+$120/mo</span>), your best yield at 5.1%, and it\u2019s unencumbered.</p>' +
        '<p><strong>8&nbsp;Daley&nbsp;St</strong> is the laggard at <span class="fa-num fa-neg">\u2212$890/mo</span> \u2014 3.9% yield, 75% geared, and the gap widens when its IO period ends in Mar&nbsp;2028. <strong>14&nbsp;Elm&nbsp;St</strong> sits in the middle (<span class="fa-num fa-neg">\u2212$340/mo</span>) but has done the heavy lifting on growth (<span class="fa-num fa-pos">+41.5%</span>).</p>',
      cites: [ { n: 1, label: 'Sutherland Ct', goto: 'property' }, { n: 2, label: '8 Daley St', goto: 'property' } ],
      action: null,
    },
    payoff: {
      plan: ['Compare rates across loans', 'Weigh balance vs rate vs deductibility', 'Recommend a target'],
      tools: [ { ico: 'db', label: 'Read <b>3 loans</b> &middot; rates & balances', ms: 850 } ],
      answer:
        '<p>Put extra repayments on the <strong>Westpac&nbsp;LOC</strong> \u2014 it\u2019s your highest rate (variable, ~8.2%) and isn\u2019t tied to a single property.</p>' +
        '<p>Leave the two CBA loans: lower-rate, and the investment-portion interest is deductible, so paying them down saves less after tax.</p>',
      cites: [ { n: 1, label: 'Westpac \u00b7 LOC', goto: 'loan' }, { n: 2, label: 'Loans', goto: 'loans' } ],
      action: { title: 'Set a $500/mo extra payment on the LOC', desc: 'Adds a recurring extra-repayment assumption to your plan. Projection only \u2014 nothing leaves your account.', cta: 'Add to plan', goto: 'plan', done: 'Added to your plan' },
    },
    fixedexpiry: {
      plan: ['Find fixed-rate loans', 'Check rate types across the book', 'Flag the nearest rate event'],
      tools: [ { ico: 'db', label: 'Read <b>3 loans</b> &middot; rate type & terms', ms: 800 } ],
      answer:
        '<p>None of your loans are fixed \u2014 all three are variable, so there\u2019s no fixed-rate cliff coming.</p>' +
        '<p>The nearer-term rate events are the IO expiries: <strong>Elm&nbsp;St</strong> in <strong>Jun&nbsp;2027</strong> (~<span class="fa-num fa-neg">+$730/mo</span>) and <strong>Daley&nbsp;St</strong> in <strong>Mar&nbsp;2028</strong> (~<span class="fa-num fa-neg">+$500/mo</span>). Being fully variable also means rate moves hit immediately \u2014 worth a stress test.</p>',
      cites: [ { n: 1, label: 'Loans', goto: 'loans' }, { n: 2, label: 'Rate sensitivity', goto: 'rate-sensitivity' } ],
      action: { title: 'Stress-test your variable rates', desc: 'Opens Rate sensitivity so you can see the portfolio impact of a +0.5% or +1% move across all three loans.', cta: 'Open rate sensitivity', goto: 'rate-sensitivity', done: 'Opened in Rate sensitivity' },
    },
    ioexpiry: {
      plan: ['Find interest-only loans', 'Read IO end dates', 'Estimate the P&I step-up'],
      tools: [ { ico: 'db', label: 'Read <b>3 loans</b> &middot; repayment type & IO terms', ms: 850 } ],
      answer:
        '<p>Two of your three loans are interest-only, and neither expires imminently:</p>' +
        '<p><strong>CBA &middot; Elm&nbsp;St</strong> rolls to P&amp;I on <strong>30&nbsp;Jun&nbsp;2027</strong> (~14 months) — expect roughly <span class="fa-num fa-neg">+$730/mo</span> when it does. <strong>CBA &middot; Daley&nbsp;St</strong> follows on <strong>14&nbsp;Mar&nbsp;2028</strong> (~22 months), about <span class="fa-num fa-neg">+$500/mo</span>.</p>' +
        '<p>Nothing to act on yet, but the Elm St rollover is worth planning for from early 2027.</p>',
      cites: [ { n: 1, label: 'CBA · Elm St', goto: 'loan' }, { n: 2, label: 'Interest-only model', goto: 'interest-only' } ],
      action: { title: 'Model both IO rollovers', desc: 'Opens the Interest-only tool with both loans on the timeline so you can see the cashflow step-up as each expires.', cta: 'Open the model', goto: 'interest-only', done: 'Opened in Interest-only model' },
    },
    surplus: {
      plan: ['Pull household income & expenses', 'Subtract portfolio cashflow', 'Net it out'],
      tools: [
        { ico: 'home', label: 'Read <b>household</b> &middot; income & expenses', ms: 850 },
        { ico: 'db', label: 'Read <b>portfolio cashflow</b> &middot; 12-mo avg', ms: 700 },
      ],
      answer:
        '<p>Your real monthly surplus is about <span class="fa-num fa-pos">+$1,290</span> \u2014 household surplus of <span class="fa-num">$2,400</span> minus the portfolio\u2019s <span class="fa-num fa-neg">\u2212$1,110</span> drag.</p>' +
        '<p>That\u2019s roughly <span class="fa-num">$15.5k/yr</span> of buffer \u2014 comfortable for now, though Daley St\u2019s IO expiry in Mar&nbsp;2028 will take about <span class="fa-num">$6k/yr</span> of it.</p>',
      cites: [ { n: 1, label: 'Serviceability', goto: 'dashboard' }, { n: 2, label: 'Household', goto: 'household' } ],
      action: null,
    },
    reconcile: {
      plan: ['List statements imported this month', 'Find unmatched transactions', 'Flag missing items'],
      tools: [
        { ico: 'doc', label: 'Scanned <b>April statements</b> &middot; CBA, Westpac', ms: 850 },
        { ico: 'db', label: 'Matched <b>transactions</b> to properties', ms: 700 },
      ],
      answer:
        '<p>Two things are open for April:</p>' +
        '<p><strong>3 unmatched CBA transactions</strong> (<span class="fa-num">$2,167 / $340 / $128</span>) need routing, and <strong>14&nbsp;Elm&nbsp;St rent</strong> (<span class="fa-num">$3,810</span>) hasn\u2019t landed \u2014 the McGrath statement is missing.</p>' +
        '<p>Everything else for the month is reconciled.</p>',
      cites: [ { n: 1, label: 'Upload', goto: 'upload' }, { n: 2, label: '14 Elm St', goto: 'property' } ],
      action: { title: 'Route the 3 unmatched transactions', desc: 'Opens the upload review with the three CBA lines ready to assign. You confirm each match.', cta: 'Open upload review', goto: 'upload', done: 'Opened in upload review' },
    },
    generic: {
      plan: ['Read the question', 'Check the relevant portfolio data', 'Compose an answer'],
      tools: [ { ico: 'db', label: 'Searched your <b>portfolio data</b>', ms: 850 } ],
      answer:
        '<p>This is a prototype, so I\u2019m playing a scripted answer \u2014 but in the live build I\u2019d pull from your properties, loans and household to answer directly, then cite exactly what I used.</p>' +
        '<p>Try a starter to see a full flow: <em>plan \u2192 data lookups \u2192 streamed answer \u2192 citations \u2192 a reviewable action.</em></p>',
      cites: [], action: null,
    },
  };

  // ── page-contextual starter prompts (static, hand-authored) ────────
  const PAGE_PROMPTS = {
    dashboard: [
      { key: 'cashflow', ico: 'chart', text: 'Why is my portfolio cashflow negative?' },
      { key: 'attention', ico: 'bell', text: 'What needs my attention this week?' },
      { key: 'equity', ico: 'home', text: 'How much usable equity could I access?' },
    ],
    properties: [
      { key: 'bestproperty', ico: 'chart', text: 'Which property is performing best?' },
      { key: 'rentreview', ico: 'doc', text: 'Draft a rent-review note for 14 Elm St' },
      { key: 'attention', ico: 'bell', text: 'Any properties that need attention?' },
    ],
    loans: [
      { key: 'payoff', ico: 'chart', text: 'Which loan should I focus on paying down?' },
      { key: 'ioexpiry', ico: 'bell', text: 'Are any IO periods expiring soon?' },
      { key: 'cashflow', ico: 'db', text: 'How are repayments affecting my cashflow?' },
    ],
    household: [
      { key: 'surplus', ico: 'chart', text: 'What\u2019s my real monthly surplus?' },
      { key: 'equity', ico: 'home', text: 'How much could I borrow for the next purchase?' },
      { key: 'cashflow', ico: 'db', text: 'Can the household carry the portfolio?' },
    ],
    upload: [
      { key: 'reconcile', ico: 'doc', text: 'What\u2019s left to reconcile this month?' },
      { key: 'attention', ico: 'bell', text: 'What needs my attention this week?' },
      { key: 'cashflow', ico: 'chart', text: 'How did this month change my cashflow?' },
    ],
    default: [
      { key: 'cashflow', ico: 'chart', text: 'Why is my portfolio cashflow negative?' },
      { key: 'attention', ico: 'bell', text: 'What needs my attention this week?' },
      { key: 'equity', ico: 'home', text: 'How much usable equity could I access?' },
    ],
  };
  function suggestsForPage() {
    const p = (document.body && document.body.dataset.page) || '';
    const group = { dashboard: 'dashboard', properties: 'properties', property: 'properties', loans: 'loans', loan: 'loans', household: 'household', upload: 'upload' }[p] || 'default';
    return PAGE_PROMPTS[group];
  }

  // Light keyword routing so free-typed follow-ups land on a sensible flow.
  function routeFree(text) {
    const t = text.toLowerCase();
    const has = (...w) => w.some((x) => t.includes(x));
    if (has('equity', 'borrow', 'deposit')) return 'equity';
    if (has('cashflow', 'cash flow', 'negative', 'losing', 'repayment')) return 'cashflow';
    if (has('attention', 'urgent', 'this week', 'todo', 'to do')) return 'attention';
    if (has('rent review', 'rent-review', 'renew', 'lease', 'tenant')) return 'rentreview';
    if (has('pay down', 'payoff', 'pay off', 'which loan')) return 'payoff';
    if (has('interest only', 'interest-only', 'io period', 'io expir', 'expire', 'expiring', 'roll')) return 'ioexpiry';
    if (has('fixed')) return 'fixedexpiry';
    if (has('surplus', 'afford', 'carry')) return 'surplus';
    if (has('reconcile', 'unmatched', 'statement', 'upload')) return 'reconcile';
    if (has('best', 'performing', 'performance', 'yield')) return 'bestproperty';
    return 'generic';
  }

  // ── DOM ─────────────────────────────────────────────────────────────
  let root, drawer, threadEl, inputEl, sendBtn, composerEl, footLeft;
  let thread = [];
  let busy = false;
  let run = null;   // active bot turn (abortable)

  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  function mount() {
    root = document.createElement('div');
    root.className = 'fa-root';
    root.innerHTML = `
      <button class="fa-fab" type="button" aria-label="Ask Folio">
        ${I.spark}<span class="fa-fab-label"><span>Ask Folio</span><span class="fa-fab-kbd">\u2318K</span></span>
      </button>
      <aside class="fa-drawer" role="dialog" aria-label="Ask Folio" aria-modal="false">
        <header class="fa-head">
          <span class="fa-mark">${I.spark}</span>
          <span class="fa-title"><b>Ask Folio</b><span>Ephemeral \u00b7 this chat clears on reload</span></span>
          <button class="fa-iconbtn fa-reset" type="button" title="New chat" aria-label="New chat">${I.refresh}</button>
          <button class="fa-iconbtn fa-close" type="button" title="Close" aria-label="Close assistant">${I.close}</button>
        </header>
        <div class="fa-thread" id="fa-thread"></div>
        <div class="fa-composer">
          <div class="fa-inputwrap">
            <textarea class="fa-input" id="fa-input" rows="1" placeholder="Ask about your portfolio\u2026"></textarea>
            <button class="fa-send" id="fa-send" type="button" aria-label="Send" disabled>${I.send}</button>
          </div>
          <div class="fa-foot">
            <span class="fa-foot-note fa-left">Prototype \u00b7 answers are <b>scripted</b></span>
            <span class="fa-foot-note">Enter to send</span>
          </div>
        </div>
      </aside>`;
    document.body.appendChild(root);

    drawer = root.querySelector('.fa-drawer');
    threadEl = root.querySelector('#fa-thread');
    inputEl = root.querySelector('#fa-input');
    sendBtn = root.querySelector('#fa-send');
    composerEl = root.querySelector('.fa-composer');
    footLeft = root.querySelector('.fa-foot .fa-left');

    root.querySelector('.fa-fab').addEventListener('click', open);
    root.querySelector('.fa-close').addEventListener('click', close);
    root.querySelector('.fa-reset').addEventListener('click', resetChat);
    sendBtn.addEventListener('click', () => { busy ? stop() : submit(); });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
      if (!busy) sendBtn.disabled = inputEl.value.trim().length === 0;
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) submit(); }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); root.classList.contains('is-open') ? close() : open();
      } else if (e.key === 'Escape' && root.classList.contains('is-open')) { close(); }
    });

    thread = loadThread();
    render();
    applyRateState();
    if (sessionStorage.getItem(SK.open) === '1') open(true);
  }

  // ── open / close (persisted) ───────────────────────────────────────
  function open(skipFocus) {
    root.classList.add('is-open');
    try { sessionStorage.setItem(SK.open, '1'); } catch (e) {}
    if (!skipFocus) setTimeout(() => inputEl && !inputEl.disabled && inputEl.focus(), 320);
  }
  function close() {
    root.classList.remove('is-open');
    try { sessionStorage.setItem(SK.open, '0'); } catch (e) {}
  }
  function resetChat() {
    if (busy) stop();
    thread = []; saveThread(thread); render();
    if (!inputEl.disabled) inputEl.focus();
  }

  // ── send / stop button state ───────────────────────────────────────
  function setBusyUI(on) {
    busy = on;
    if (on) {
      sendBtn.classList.add('is-stop'); sendBtn.disabled = false;
      sendBtn.setAttribute('aria-label', 'Stop'); sendBtn.innerHTML = I.stop;
    } else {
      sendBtn.classList.remove('is-stop'); sendBtn.innerHTML = I.send;
      sendBtn.setAttribute('aria-label', 'Send');
      sendBtn.disabled = inputEl.value.trim().length === 0;
    }
  }

  // ── rate-limit UI ──────────────────────────────────────────────────
  function applyRateState() {
    const r = remaining();
    if (r <= 0) {
      composerEl.classList.add('is-locked');
      inputEl.disabled = true;
      inputEl.placeholder = 'Daily limit reached \u2014 resets at midnight';
      footLeft.innerHTML = '<b>Daily limit reached</b> \u00b7 resets at midnight';
      footLeft.classList.add('is-low');
    } else {
      composerEl.classList.remove('is-locked');
      inputEl.disabled = false;
      inputEl.placeholder = 'Ask about your portfolio\u2026';
      if (r <= 5) {
        footLeft.innerHTML = '<b>' + r + '</b> message' + (r === 1 ? '' : 's') + ' left today';
        footLeft.classList.add('is-low');
      } else {
        footLeft.innerHTML = 'Prototype \u00b7 answers are <b>scripted</b>';
        footLeft.classList.remove('is-low');
      }
    }
  }

  // ── rendering ──────────────────────────────────────────────────────
  function render() {
    threadEl.innerHTML = '';
    if (thread.length === 0) { threadEl.appendChild(renderEmpty()); }
    else { thread.forEach((m) => threadEl.appendChild(m.role === 'user' ? renderUser(m.text) : renderBot(m))); }
    scrollDown();
  }

  function renderEmpty() {
    const wrap = el('<div class="fa-empty"></div>');
    wrap.appendChild(el('<div class="fa-greet">Hi Theo \u2014 ask me anything about your <em>portfolio</em>.</div>'));
    wrap.appendChild(el('<div class="fa-greet-sub">I can read your properties, loans and household, explain the numbers, and tee up actions for you to approve.</div>'));
    wrap.appendChild(el('<div class="fa-suggest-label">Try</div>'));
    const list = el('<div class="fa-suggests"></div>');
    suggestsForPage().forEach((s) => {
      const c = el(`<button class="fa-chip" type="button"><span class="fa-chip-ico">${I[s.ico]}</span><span>${s.text}</span><span class="fa-chip-arrow">${I.arrow}</span></button>`);
      c.addEventListener('click', () => ask(s.key, s.text));
      list.appendChild(c);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderUser(text) {
    const m = el('<div class="fa-msg fa-msg--user"></div>');
    const b = el('<div class="fa-bubble"></div>'); b.textContent = text; m.appendChild(b);
    return m;
  }

  function renderBot(m) {
    const wrap = el('<div class="fa-msg fa-msg--bot"></div>');
    wrap.appendChild(el(`<div class="fa-byline"><span class="fa-dot">${I.spark}</span> Ask Folio</div>`));
    const body = el('<div class="fa-body"></div>');
    if (m.plan) {
      const plan = el('<div class="fa-plan"><div class="fa-plan-head">Plan</div><ul class="fa-steps"></ul></div>');
      const ul = plan.querySelector('.fa-steps');
      m.plan.forEach((s) => ul.appendChild(el(`<li class="fa-step is-done"><span class="fa-st">${I.check}</span><span>${s}</span></li>`)));
      body.appendChild(plan);
    }
    (m.tools || []).forEach((t) => body.appendChild(el(`<div class="fa-tool"><span class="fa-tool-ico">${I[t.ico]}</span><span>${t.label}</span><span class="fa-tool-ok">${I.okmini}</span></div>`)));
    if (m.answer) body.appendChild(el(`<div class="fa-prose">${m.answer}</div>`));
    if (m.interrupted) body.appendChild(el('<div class="fa-stopped">Stopped</div>'));
    if (m.cites && m.cites.length) { const c = el('<div class="fa-cites"></div>'); m.cites.forEach((ct) => c.appendChild(makeCite(ct))); body.appendChild(c); }
    if (m.action) body.appendChild(makeAction(m.action, m.actionResolved));
    wrap.appendChild(body);
    return wrap;
  }

  function makeCite(ct) {
    const chip = el(`<button class="fa-cite" type="button"><span class="fa-cite-n">${ct.n}</span><span>${ct.label}</span></button>`);
    if (ct.goto) chip.addEventListener('click', () => { window.location.href = ct.goto + '.html'; });
    return chip;
  }

  function makeAction(a, resolved) {
    const card = el(`
      <div class="fa-action${resolved ? ' is-resolved' : ''}">
        <div class="fa-action-t"><span class="fa-ai">${I.spark}</span><span>${a.title}</span></div>
        <div class="fa-action-d">${a.desc}</div>
        <div class="fa-action-row">
          <button class="btn btn--primary btn--sm fa-do" type="button">${a.cta}</button>
          <button class="btn btn--ghost btn--sm fa-skip" type="button">Dismiss</button>
        </div>
        <div class="fa-resolved-note">${I.okmini}<span>${a.done}</span></div>
      </div>`);
    card.querySelector('.fa-do').addEventListener('click', () => {
      card.classList.add('is-resolved');
      const cur = thread[thread.length - 1];
      if (cur && cur.role === 'bot') { cur.actionResolved = true; saveThread(thread); }
      if (a.goto) setTimeout(() => { window.location.href = a.goto + '.html'; }, 650);
    });
    card.querySelector('.fa-skip').addEventListener('click', () => { card.style.display = 'none'; });
    return card;
  }

  // ── ask ─────────────────────────────────────────────────────────────
  function submit() {
    const v = inputEl.value.trim();
    if (!v || busy) return;
    inputEl.value = ''; inputEl.style.height = 'auto'; sendBtn.disabled = true;
    ask(routeFree(v), v);
  }

  function ask(flowKey, userText) {
    if (busy) return;
    if (remaining() <= 0) { applyRateState(); appendLimitNotice(); return; }

    const flow = FLOWS[flowKey] || FLOWS.generic;
    thread.push({ role: 'user', text: userText });
    bumpUsage();
    saveThread(thread);

    if (threadEl.querySelector('.fa-empty')) threadEl.innerHTML = '';
    threadEl.appendChild(renderUser(userText));
    scrollDown();
    applyRateState();
    playBot(flow);
  }

  // tracked timer — cancellable on stop()
  function T(fn, ms) { const id = setTimeout(() => { if (!run || run.aborted) return; fn(); }, ms); if (run) run.timers.push(id); return id; }

  function playBot(flow) {
    const wrap = el('<div class="fa-msg fa-msg--bot"></div>');
    wrap.appendChild(el(`<div class="fa-byline"><span class="fa-dot">${I.spark}</span> Ask Folio</div>`));
    const body = el('<div class="fa-body"></div>');
    wrap.appendChild(body);
    threadEl.appendChild(wrap);
    const typing = el('<div class="fa-typing"><i></i><i></i><i></i></div>');
    body.appendChild(typing);
    scrollDown();

    run = { aborted: false, timers: [], body, prose: null, pushed: false,
            record: { role: 'bot', plan: flow.plan, tools: [], answer: '', cites: [], action: null } };
    setBusyUI(true);

    T(() => { typing.remove(); planPhase(); }, 620);

    function planPhase() {
      const plan = el('<div class="fa-plan"><div class="fa-plan-head">Planning<span style="margin-left:auto">' + I.spin + '</span></div><ul class="fa-steps"></ul></div>');
      const ul = plan.querySelector('.fa-steps');
      const steps = flow.plan.map((s) => { const li = el(`<li class="fa-step"><span class="fa-st">${I.check}</span><span>${s}</span></li>`); ul.appendChild(li); return li; });
      body.appendChild(plan); scrollDown();
      let i = 0;
      const tick = () => {
        if (i > 0) steps[i - 1].classList.remove('is-running');
        if (i < steps.length) { steps[i].classList.add('is-running'); i++; T(tick, 520); }
        else { steps.forEach((s) => s.classList.add('is-done')); plan.querySelector('.fa-plan-head').textContent = 'Plan'; toolsPhase(); }
      };
      T(tick, 360);
    }

    function toolsPhase() {
      let ti = 0;
      const next = () => {
        if (ti >= flow.tools.length) { streamPhase(); return; }
        const t = flow.tools[ti];
        const row = el(`<div class="fa-tool"><span class="fa-tool-ico">${I[t.ico]}</span><span>${t.label}</span><span class="fa-tool-ok">${I.spin}</span></div>`);
        body.appendChild(row); scrollDown();
        T(() => { row.querySelector('.fa-tool-ok').innerHTML = I.okmini; run.record.tools.push(t); ti++; next(); }, t.ms);
      };
      next();
    }

    function streamPhase() {
      const prose = el('<div class="fa-prose fa-stream"></div>');
      body.appendChild(prose); run.prose = prose;
      const tokens = tokenize(flow.answer);
      let idx = 0, html = '';
      const step = () => {
        if (idx < tokens.length) { html += tokens[idx++]; prose.innerHTML = html; scrollDown(); T(step, 18 + Math.random() * 26); }
        else { prose.classList.remove('fa-stream'); finish(); }
      };
      step();
    }

    function finish() {
      if (!run || run.aborted) return;
      run.record.answer = flow.answer;
      if (flow.cites && flow.cites.length) { const c = el('<div class="fa-cites"></div>'); flow.cites.forEach((ct) => c.appendChild(makeCite(ct))); body.appendChild(c); run.record.cites = flow.cites; }
      if (flow.action) { body.appendChild(makeAction(flow.action, false)); run.record.action = flow.action; }
      scrollDown();
      thread.push(run.record); run.pushed = true; saveThread(thread);
      run = null; setBusyUI(false);
      applyRateState();
      if (remaining() <= 0) appendLimitNotice();
      if (!inputEl.disabled) inputEl.focus();
    }
  }

  // ── stop / interrupt ───────────────────────────────────────────────
  function stop() {
    if (!run) { setBusyUI(false); return; }
    run.aborted = true;
    run.timers.forEach(clearTimeout);
    const r = run;
    // settle any in-flight visuals
    const typing = r.body.querySelector('.fa-typing'); if (typing) typing.remove();
    r.body.querySelectorAll('.fa-plan-head').forEach((h) => { h.textContent = 'Plan'; });
    r.body.querySelectorAll('.fa-step.is-running').forEach((s) => s.classList.remove('is-running'));
    r.body.querySelectorAll('.fa-tool-ok .fa-spin').forEach((sp) => { sp.parentElement.textContent = '\u00b7'; });
    if (r.prose) { r.prose.classList.remove('fa-stream'); r.record.answer = r.prose.innerHTML; }
    r.body.appendChild(el('<div class="fa-stopped">Stopped</div>'));
    r.record.interrupted = true;
    if (!r.pushed) { thread.push(r.record); saveThread(thread); }
    run = null; setBusyUI(false); applyRateState();
    scrollDown();
  }

  function appendLimitNotice() {
    if (threadEl.querySelector('.fa-notice')) return;
    threadEl.appendChild(el(
      '<div class="fa-notice">You\u2019ve reached today\u2019s limit of <b>' + DAILY_CAP +
      ' messages</b>. The assistant is paused until midnight \u2014 your existing replies stay readable.</div>'));
    scrollDown();
  }

  // split HTML into stream tokens: whole tags stay intact, text splits on words
  function tokenize(html) {
    const out = []; const re = /(<[^>]+>)|([^<]+)/g; let m;
    while ((m = re.exec(html))) {
      if (m[1]) out.push(m[1]);
      else m[2].split(/(\s+)/).forEach((w) => { if (w) out.push(w); });
    }
    return out;
  }

  function scrollDown() { requestAnimationFrame(() => { threadEl.scrollTop = threadEl.scrollHeight; }); }

  ready(mount);
})();
