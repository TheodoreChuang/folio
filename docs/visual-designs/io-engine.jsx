// =====================================================================
// Folio — Interest-only rollover · calculation engine
// ---------------------------------------------------------------------
// Pure functions + the user's interest-only loans. No DOM, no React.
//
// The schedule is a function of the loan set + one assumption: how much
// LOWER the P&I rate is than the IO rate (the platform stores IO rates
// only — P&I rates aren't captured, a deliberate decision — so we
// estimate the rollover repayment at  IO rate − discount). Default 0.3%.
//
// Everything downstream (timeline, schedule table, cashflow ladder) is
// derived here so it adapts to 1 … 10+ loans with no layout assumptions.
//
// Exposed as window.IO = { LOANS, MANY, PORTFOLIO, HOUSEHOLD, NOW,
//                          DEFAULT_DISCOUNT, compute, fmt… }
// =====================================================================

(function () {
  // Internal "today" for the mock — matches the rest of Folio.
  const NOW = new Date(2026, 4, 15); // 15 May 2026

  // Default gap between an IO rate and the P&I rate it rolls onto.
  const DEFAULT_DISCOUNT = 0.3; // percentage points

  // ----- The user's interest-only loans -----------------------------
  //   Only loans with a real IO end date roll over. A revolving LOC has
  //   no rollover, so it's intentionally absent. `termYrs` is the P&I
  //   amortisation term that begins once the IO period expires.
  const LOANS = [
    { id: 'elm',   lender: 'CBA', property: 'Elm St',   balance: 615000, rate: 6.35, termYrs: 25, ends: '2027-06-30' },
    { id: 'daley', lender: 'CBA', property: 'Daley St', balance: 480000, rate: 6.10, termYrs: 27, ends: '2028-03-14' }
  ];

  // A synthetic 8-loan book — used by the "Preview portfolio" tweak to
  // stress-test how the timeline + cashflow chart hold up at scale.
  const MANY = [
    { id: 'm1', lender: 'CBA',     property: 'Elm St',     balance: 615000, rate: 6.35, termYrs: 25, ends: '2026-11-30' },
    { id: 'm2', lender: 'CBA',     property: 'Daley St',   balance: 480000, rate: 6.10, termYrs: 27, ends: '2027-03-14' },
    { id: 'm3', lender: 'Westpac', property: 'Sutherland', balance: 392000, rate: 6.55, termYrs: 28, ends: '2027-09-01' },
    { id: 'm4', lender: 'NAB',     property: 'Kingsway',   balance: 720000, rate: 6.20, termYrs: 24, ends: '2028-02-15' },
    { id: 'm5', lender: 'ANZ',     property: 'Forest Rd',  balance: 305000, rate: 6.70, termYrs: 30, ends: '2028-08-20' },
    { id: 'm6', lender: 'CBA',     property: 'Anzac Pde',  balance: 540000, rate: 6.40, termYrs: 26, ends: '2029-05-10' },
    { id: 'm7', lender: 'Macq.',   property: 'Bunnerong',  balance: 268000, rate: 6.85, termYrs: 29, ends: '2030-01-05' },
    { id: 'm8', lender: 'Westpac', property: 'Maroubra',   balance: 455000, rate: 6.30, termYrs: 25, ends: '2031-04-18' }
  ];

  // Portfolio cashflow today + household buffer (matches the rest of Folio).
  const PORTFOLIO = { netCashflowMo: -1110 };
  const HOUSEHOLD = { surplusMo: 5000 };

  // ----- date helpers -----------------------------------------------
  const MS_YEAR = 365.25 * 24 * 3600 * 1000;
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addMonths(date, n) { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }
  function startOfYear(date) { return new Date(date.getFullYear(), 0, 1); }
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthLabel(date) { return MONTHS[date.getMonth()] + ' ' + date.getFullYear(); }
  function dayLabel(date) { return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear(); }

  // ----- finance helpers --------------------------------------------
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  function monthlyPI(principal, annualRatePct, years) {
    const r = annualRatePct / 100 / 12;
    const n = Math.max(1, Math.round(years * 12));
    if (r <= 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  // The P&I rate a loan defaults to: its IO rate, less the standard
  // discount. P&I rates aren't stored on the platform (a deliberate
  // decision), so this is the starting estimate the user can override.
  function defaultPiRate(l) { return Math.max(0, round2(l.rate - DEFAULT_DISCOUNT)); }

  // ----- the calculation --------------------------------------------
  // opts: { loans, piRates ({id: ratePct} | null) — overrides per loan }
  function compute(opts) {
    opts = opts || {};
    const src = opts.loans || LOANS;
    const piRates = opts.piRates || null;

    // Per-loan rows, sorted by rollover date.
    const loans = src.map((l) => {
      const endDate = parseDate(l.ends);
      const piRate = (piRates && piRates[l.id] != null) ? num(piRates[l.id]) : defaultPiRate(l);
      const ioPay = l.balance * (l.rate / 100) / 12;
      const piPay = monthlyPI(l.balance, piRate, l.termYrs);
      return {
        ...l, endDate,
        ioPay, piRate, piPay,
        delta: piPay - ioPay,
        endShort: monthLabel(endDate),
        endLong: dayLabel(endDate)
      };
    }).sort((a, b) => a.endDate - b.endDate);

    const totalDelta = loans.reduce((s, l) => s + l.delta, 0);

    // ----- time axis: start of this year → latest IO end + 1 year ----
    const axisStart = startOfYear(NOW);
    const lastEnd = loans.length ? loans[loans.length - 1].endDate : addMonths(NOW, 12);
    const axisEnd = addMonths(lastEnd, 12);
    const span = axisEnd - axisStart || 1;
    const fracOf = (date) => Math.max(0, Math.min(1, (date - axisStart) / span));

    // Year ticks, thinned to every 2 years on long spans.
    const spanYears = span / MS_YEAR;
    const stepYrs = spanYears > 7 ? 2 : 1;
    const ticks = [];
    for (let y = axisStart.getFullYear(); y <= axisEnd.getFullYear(); y += stepYrs) {
      ticks.push({ year: y, frac: fracOf(new Date(y, 0, 1)) });
    }

    // ----- cashflow ladder: net position steps down at each rollover -
    const todayShortfall = PORTFOLIO.netCashflowMo;
    const steps = [{
      kind: 'today', label: 'Today', when: monthLabel(NOW),
      frac: fracOf(NOW), value: todayShortfall, delta: 0
    }];
    let running = todayShortfall;
    loans.forEach((l) => {
      running -= l.delta; // more negative = bigger shortfall
      steps.push({
        kind: 'roll', id: l.id,
        label: l.lender + ' · ' + l.property, when: l.endShort,
        frac: fracOf(l.endDate), value: running, delta: l.delta
      });
    });
    const finalShortfall = running;

    // ----- household capacity ----------------------------------------
    const surplus = HOUSEHOLD.surplusMo;
    const consumed = Math.max(0, -finalShortfall);
    const remaining = surplus - consumed;

    return {
      loans, steps,
      totalDelta, annualDelta: totalDelta * 12,
      todayShortfall, finalShortfall,
      household: {
        surplus, consumed, remaining,
        pct: surplus > 0 ? Math.min(1.4, consumed / surplus) : 0,
        breached: remaining < 0
      },
      scale: { axisStart, axisEnd, ticks, todayFrac: fracOf(NOW), nowLabel: monthLabel(NOW), spanYears }
    };
  }

  // ----- formatters -------------------------------------------------
  function fmtMoney(n) {
    const neg = n < -0.5;
    const v = Math.round(Math.abs(n));
    return (neg ? '−' : '') + '$' + v.toLocaleString('en-AU');
  }
  function fmtSigned(n) {
    const v = Math.round(n);
    if (v === 0) return '$0';
    return (v > 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString('en-AU');
  }
  function fmtK(n) {
    const v = Math.round(Math.abs(n) / 1000);
    return '$' + v + 'k';
  }
  function fmtRate(r) { return r.toFixed(2) + '%'; }

  function round2(n) { return Math.round(n * 100) / 100; }

  window.IO = {
    LOANS, MANY, PORTFOLIO, HOUSEHOLD, NOW, DEFAULT_DISCOUNT,
    compute, num, defaultPiRate, round2,
    fmtMoney, fmtSigned, fmtK, fmtRate
  };
})();
