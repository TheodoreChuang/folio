// =====================================================================
// Folio — Rate sensitivity · calculation engine
// ---------------------------------------------------------------------
// Pure functions + the user's variable loans. No DOM, no React.
// The whole screen is a pure function of ONE input: the rate move (Δ%),
// applied globally to every variable loan. Each loan keeps its own
// current rate, balance and repayment type, so the move lands per-loan.
//
// Exposed as window.RS = { LOANS, HOUSEHOLD, PORTFOLIO, RANGE, calc, fmt… }
// =====================================================================

(function () {
  // ----- The user's variable loans (consistent Folio figures) -------
  //   Each loan can sit on a different rate. The slider moves them all
  //   by the same number of points; the dollar impact differs by balance.
  //   Fixed loans are intentionally absent — they don't respond to a move.
  const LOANS = [
    { id: 'elm',   lender: 'CBA',     property: 'Elm St',  balance: 615000, rate: 6.35, type: 'io', termYrs: 25 },
    { id: 'daley', lender: 'CBA',     property: 'Daley St', balance: 480000, rate: 6.10, type: 'io', termYrs: 27 },
    { id: 'loc',   lender: 'Westpac', property: 'LOC',     balance:  45000, rate: 7.20, type: 'io', termYrs: 30 }
  ];

  // Portfolio cashflow today (matches the rest of Folio). The rate move
  // changes this by exactly the change in total monthly repayments.
  const PORTFOLIO = { netCashflowMo: -1110 };
  const HOUSEHOLD = { surplusMo: 5000 };

  // Slider domain — points of rate move, applied to every variable loan.
  const RANGE = { min: -3, max: 3, step: 0.25, default: 0.5 };

  // ----- helpers ----------------------------------------------------
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };

  function monthlyPI(principal, annualRatePct, years) {
    const r = annualRatePct / 100 / 12;
    const n = Math.max(1, years * 12);
    if (r <= 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  // Monthly repayment for a loan at a given rate (IO = interest only).
  function repayment(loan, ratePct) {
    if (loan.type === 'pi') return monthlyPI(loan.balance, ratePct, loan.termYrs);
    return loan.balance * (ratePct / 100) / 12;          // interest-only
  }

  // ----- the calculation -------------------------------------------
  // delta is in points (e.g. +0.5 = +0.50%). Returns per-loan rows + rollup.
  function calc(delta) {
    const d = num(delta);

    const loans = LOANS.map((l) => {
      const todayPay = repayment(l, l.rate);
      const newRate = l.rate + d;
      const newPay = repayment(l, newRate);
      return {
        ...l,
        newRate,
        today: todayPay,
        scenario: newPay,
        deltaMo: newPay - todayPay
      };
    });

    const todayTotal = loans.reduce((s, l) => s + l.today, 0);
    const scenarioTotal = loans.reduce((s, l) => s + l.scenario, 0);
    const repayDelta = scenarioTotal - todayTotal;          // +ve = pay more

    // Portfolio cashflow shifts down by exactly the extra repayment.
    const cashflowToday = PORTFOLIO.netCashflowMo;
    const cashflowScenario = cashflowToday - repayDelta;
    const cashflowDelta = cashflowScenario - cashflowToday; // = -repayDelta

    // Household buffer — how much of the monthly surplus is consumed.
    const surplus = HOUSEHOLD.surplusMo;
    const consumed = Math.max(0, -cashflowScenario);
    const remaining = surplus - consumed;
    const household = {
      surplus, consumed, remaining,
      pct: surplus > 0 ? Math.min(1.6, consumed / surplus) : 0,
      breached: remaining < 0
    };

    return {
      delta: d,
      loans,
      todayTotal, scenarioTotal, repayDelta,
      cashflowToday, cashflowScenario, cashflowDelta,
      household
    };
  }

  // ----- formatters -------------------------------------------------
  function fmtMoney(n, opts) {
    opts = opts || {};
    const neg = n < -0.5;
    const v = Math.round(Math.abs(n));
    const s = '$' + v.toLocaleString('en-AU');
    return (neg ? '−' : (opts.sign && v !== 0 ? '+' : '')) + s;
  }
  // Signed delta, always shows + or − (or $0).
  function fmtDelta(n) {
    const v = Math.round(n);
    if (v === 0) return '$0';
    return (v > 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString('en-AU');
  }
  // Rate-move label for ticks / tags: −0.50%, Today, +1.00%.
  function fmtMove(d, opts) {
    opts = opts || {};
    if (Math.abs(d) < 0.001) return opts.zero || 'Today';
    const sign = d > 0 ? '+' : '−';
    return sign + Math.abs(d).toFixed(opts.dp == null ? 2 : opts.dp) + '%';
  }
  function fmtRate(r) { return r.toFixed(2) + '%'; }

  window.RS = {
    LOANS, PORTFOLIO, HOUSEHOLD, RANGE,
    calc, repayment, num,
    fmtMoney, fmtDelta, fmtMove, fmtRate
  };
})();
