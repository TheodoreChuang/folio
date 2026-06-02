// =====================================================================
// Folio — Hold vs Sell and Reinvest · calculation engine
// ---------------------------------------------------------------------
// Pure functions + the user's existing portfolio. No DOM, no React.
// Everything the UI shows is derived here from one inputs object, so the
// comparison is a pure function of the inputs (live recompute).
//
// The model isolates ONE thing: growth rate vs the friction of switching.
//   purchase_price = sale_price            (equal-value baseline)
//   net_deposit    = sale_price − selling − loan_payouts − CGT − buying
//   new_loan       = purchase_price − net_deposit
//   friction       = selling + buying + CGT + LMI   (the year-0 equity gap)
// Both tracks grow the SAME property value; loans are held static.
//
// Exposed as window.HR = { PROPERTIES, DEFAULTS, calc, fmt… }
// =====================================================================

(function () {
  // ----- The user's existing portfolio (consistent Folio figures) ---
  //   Each property carries its installment loan(s). Selling pays them
  //   all out at settlement. Latest valuation = `value`.
  const PROPERTIES = [
    { id: 'elm',        name: '14 Elm St',     suburb: 'Randwick',     value: 920000,
      loans: [{ lender: 'CBA', name: 'Elm St investment', balance: 615000 }] },
    { id: 'daley',      name: '8 Daley St',    suburb: 'Marrickville', value: 640000,
      loans: [{ lender: 'CBA', name: 'Daley St investment', balance: 480000 }] },
    { id: 'sutherland', name: 'Sutherland Ct', suburb: 'Kingsford',    value: 510000,
      loans: [{ lender: 'Westpac', name: 'Equity line', balance: 45000 }] }
  ];

  function propById(id) { return PROPERTIES.find(p => p.id === id) || PROPERTIES[0]; }
  function loanTotal(p) { return (p.loans || []).reduce((s, l) => s + l.balance, 0); }

  // Selling cost line items (agent is a %, the rest are $). All optional.
  const SELLING_COST_FIELDS = [
    { key: 'marketing', label: 'Marketing' },
    { key: 'legal',     label: 'Legal fees (selling)' },
    { key: 'other',     label: 'Other selling costs' }
  ];

  // Buying cost line items (all $, all optional, default 0).
  const BUYING_COST_FIELDS = [
    { key: 'stampDuty',    label: 'Stamp duty' },
    { key: 'legal',        label: 'Legal fees (buying)' },
    { key: 'buildingPest', label: 'Building & Pest inspection' },
    { key: 'registration', label: 'Registration & Transfer fees' },
    { key: 'buyerAgent',   label: "Buyer's agent fee" },
    { key: 'depreciation', label: 'Depreciation schedule' },
    { key: 'upfrontMaint', label: 'Upfront maintenance' }
  ];

  const HORIZONS = [5, 10, 15, 20];

  // ----- Demo defaults ----------------------------------------------
  // Seeded with realistic figures so the comparison tells a complete
  // story on load (Folio can't compute stamp duty / CGT — these are the
  // kind of estimates a user would enter). CGT is intentionally left
  // blank to surface the "CGT excluded" note. All fields stay editable.
  const DEFAULTS = {
    propertyId: 'daley',
    salePrice: 640000,                 // = latest valuation
    agentPct: 2.2,
    sellingCosts: { marketing: 6500, legal: 1500, other: 0 },
    cgt: '',                           // blank → comparison excludes CGT
    buyingCosts: { stampDuty: 24500, legal: 1800, buildingPest: 600, registration: 350, buyerAgent: 0, depreciation: 0, upfrontMaint: 0 },
    lmi: '',                           // surfaced only when LVR > 80%
    gHold: 3.0,
    gReinvest: 6.0,
    horizon: 10
  };

  // ----- helpers ----------------------------------------------------
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const has = (v) => v !== '' && v != null && isFinite(num(v));
  const sum = (obj) => Object.values(obj || {}).reduce((s, v) => s + num(v), 0);

  // ----- the calculation -------------------------------------------
  function calc(input) {
    const i = input;
    const property = propById(i.propertyId);
    const valuation = property.value;
    const salePrice = num(i.salePrice);
    const ready = salePrice > 0;

    const priceDelta = salePrice - valuation;

    // --- Sale proceeds ---
    const agentPct = num(i.agentPct);
    const agent = salePrice * agentPct / 100;
    const sc = i.sellingCosts || {};
    const sellingCosts = {
      agent,
      marketing: num(sc.marketing),
      legal: num(sc.legal),
      other: num(sc.other),
      total: agent + sum(sc)
    };
    const grossProceeds = salePrice - sellingCosts.total;

    const loanRows = (property.loans || []).map(l => ({
      label: l.lender + ' · ' + l.name, amount: l.balance
    }));
    const loanPayoutTotal = loanTotal(property);
    const outstandingLoans = loanPayoutTotal;          // loans on the held property
    const netCashAfterLoans = grossProceeds - loanPayoutTotal;

    const cgtEntered = has(i.cgt);
    const cgt = cgtEntered ? num(i.cgt) : 0;
    const netCashAfterCGT = netCashAfterLoans - cgt;

    // --- Reinvestment ---
    const purchasePrice = salePrice;                   // fixed equal baseline
    const bc = i.buyingCosts || {};
    const buyingCosts = {};
    BUYING_COST_FIELDS.forEach(f => { buyingCosts[f.key] = num(bc[f.key]); });
    buyingCosts.total = sum(bc);

    const netDeposit = salePrice - sellingCosts.total - loanPayoutTotal - cgt - buyingCosts.total;
    const blocked = ready && netDeposit <= 0;

    const newLoan = Math.max(0, purchasePrice - netDeposit);
    const lvr = purchasePrice > 0 ? newLoan / purchasePrice : 0;
    const lmiRequired = lvr > 0.8;
    const lmi = lmiRequired && has(i.lmi) ? num(i.lmi) : 0;
    const effectiveNewLoan = newLoan + lmi;

    // --- Friction (the year-0 equity gap) ---
    const friction = sellingCosts.total + buyingCosts.total + cgt + lmi;
    const frictionPct = salePrice > 0 ? friction / salePrice : 0;

    // --- Equity trajectories ---
    const V = salePrice;                               // = purchase price
    const gHold = num(i.gHold) / 100;
    const gReinvest = num(i.gReinvest) / 100;
    const horizon = i.horizon || 10;

    const holdYr0 = V - outstandingLoans;
    const reinvestYr0 = V - effectiveNewLoan;

    const series = [];
    for (let n = 0; n <= horizon; n++) {
      series.push({
        year: n,
        hold: V * Math.pow(1 + gHold, n) - outstandingLoans,
        reinvest: V * Math.pow(1 + gReinvest, n) - effectiveNewLoan
      });
    }

    const holdAtN = series[horizon].hold;
    const reinvestAtN = series[horizon].reinvest;
    const holdValueAtN = V * Math.pow(1 + gHold, horizon);
    const reinvestValueAtN = V * Math.pow(1 + gReinvest, horizon);
    const holdGain = holdAtN - holdYr0;
    const reinvestGain = reinvestAtN - reinvestYr0;

    // Break-even: smallest N≥1 where reinvest > hold.
    let breakEven = null;
    for (let n = 1; n <= horizon; n++) {
      if (series[n].reinvest > series[n].hold) { breakEven = n; break; }
    }
    // Whether the curves cross at all (within or beyond horizon).
    const reinvestEverCrosses = gReinvest > gHold;

    return {
      ready, blocked,
      property, valuation, salePrice, priceDelta,
      agentPct, sellingCosts, grossProceeds,
      loanRows, loanPayoutTotal, outstandingLoans, netCashAfterLoans,
      cgtEntered, cgt, netCashAfterCGT,
      purchasePrice, buyingCosts, netDeposit,
      newLoan, lvr, lmiRequired, lmi, effectiveNewLoan,
      friction, frictionPct,
      V, gHold, gReinvest, horizon,
      holdYr0, reinvestYr0, series,
      holdAtN, reinvestAtN, holdValueAtN, reinvestValueAtN, holdGain, reinvestGain,
      breakEven, reinvestEverCrosses
    };
  }

  // ----- formatters -------------------------------------------------
  function fmtMoney(n, opts) {
    opts = opts || {};
    const neg = n < 0;
    const v = Math.round(Math.abs(n));
    const s = '$' + v.toLocaleString('en-AU');
    return (neg ? '−' : (opts.sign && v !== 0 ? '+' : '')) + s;
  }
  function fmtMoneyShort(n) {
    const neg = n < 0; const a = Math.abs(n);
    let s;
    if (a >= 1e6) s = '$' + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    else if (a >= 1e3) s = '$' + Math.round(a / 1e3) + 'k';
    else s = '$' + Math.round(a);
    return (neg ? '−' : '') + s;
  }
  function fmtSignedShort(n) {
    if (Math.round(n) === 0) return '$0';
    return (n > 0 ? '+' : '−') + fmtMoneyShort(Math.abs(n));
  }
  function fmtPct(n, dp) { return (n * 100).toFixed(dp == null ? 0 : dp) + '%'; }

  window.HR = {
    PROPERTIES, SELLING_COST_FIELDS, BUYING_COST_FIELDS, HORIZONS, DEFAULTS,
    propById, loanTotal, calc, num, has, sum,
    fmtMoney, fmtMoneyShort, fmtSignedShort, fmtPct
  };
})();
