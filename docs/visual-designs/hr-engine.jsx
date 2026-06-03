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
  //   `purchasePrice` is the original acquisition price held on file — used
  //   to seed the CGT cost base. Editable in the UI.
  const PROPERTIES = [
    { id: 'elm',        name: '14 Elm St',     suburb: 'Randwick',     value: 920000, purchasePrice: 560000,
      loans: [{ lender: 'CBA', name: 'Elm St investment', balance: 615000 }] },
    { id: 'daley',      name: '8 Daley St',    suburb: 'Marrickville', value: 640000, purchasePrice: 430000,
      loans: [{ lender: 'CBA', name: 'Daley St investment', balance: 480000 }] },
    { id: 'sutherland', name: 'Sutherland Ct', suburb: 'Kingsford',    value: 510000, purchasePrice: 365000,
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

  // CGT cost-base line items — acquisition costs + capital improvements for
  // the property being SOLD (distinct from the reinvestment buying costs).
  // All $, all optional, fed into the cost base.
  const CGT_COST_FIELDS = [
    { key: 'stampDuty',    label: 'Stamp duty (on purchase)' },
    { key: 'legal',        label: 'Legal & conveyancing' },
    { key: 'buildingPest', label: 'Building & pest' },
    { key: 'buyerAgent',   label: "Buyer's agent fee" },
    { key: 'improvements', label: 'Capital improvements' }
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
  // story on load. Stamp duty etc. are the kind of estimates a user would
  // enter. CGT now ESTIMATES from a cost base (purchase price + costs +
  // selling costs) × discount × marginal rate. All fields stay editable.
  const DEFAULTS = {
    propertyId: 'daley',
    salePrice: 640000,                 // = latest valuation
    agentPct: 2.2,
    sellingCosts: { marketing: 6500, legal: 1500, other: 0 },
    // --- CGT ---
    cgtMode: 'estimate',               // 'estimate' (computed) | 'manual' (typed)
    cgt: '',                           // manual override; blank in manual mode → CGT excluded
    cgtPurchasePrice: 430000,          // = daley purchase price (prefilled, editable)
    cgtCosts: { stampDuty: 14800, legal: 1600, buildingPest: 500, buyerAgent: 0, improvements: 28000 },
    cgtDepreciation: 12000,            // Div 40 plant & equipment claimed → added back
    cgtDiscount: 50,                   // % — 50% for individuals holding > 12 months
    cgtRate: 37,                       // % — marginal tax rate applied to the net gain
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

    // --- CGT: estimate from a cost base, or a manual override ---
    const cgtMode = i.cgtMode === 'manual' ? 'manual' : 'estimate';
    const cgtPurchasePrice = num(i.cgtPurchasePrice);
    const cgc = i.cgtCosts || {};
    const cgtCosts = {};
    CGT_COST_FIELDS.forEach(f => { cgtCosts[f.key] = num(cgc[f.key]); });
    cgtCosts.total = sum(cgc);
    const cgtDepreciation = num(i.cgtDepreciation);
    const cgtDiscountPct = has(i.cgtDiscount) ? num(i.cgtDiscount) : 50;
    const cgtRate = num(i.cgtRate);

    // Cost base = original price + acquisition/improvement costs + the
    // selling costs already entered above. Div 40 depreciation is added
    // back to the gain (it reduced the cost base over the hold).
    const costBase = cgtPurchasePrice + cgtCosts.total + sellingCosts.total;
    const rawGain = salePrice - costBase;
    const grossGain = rawGain + cgtDepreciation;
    const isCapitalLoss = grossGain < 0;
    const assessableGain = Math.max(0, grossGain);
    const cgtDiscountAmount = assessableGain * (cgtDiscountPct / 100);
    const netCapitalGain = assessableGain - cgtDiscountAmount;
    const estimatedCgt = netCapitalGain * (cgtRate / 100);

    let cgtEntered, cgt;
    if (cgtMode === 'manual') {
      cgtEntered = has(i.cgt);                 // blank → CGT excluded
      cgt = cgtEntered ? num(i.cgt) : 0;
    } else {
      cgtEntered = true;                       // estimate is always shown (may be $0)
      cgt = estimatedCgt;
    }
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
      cgtMode, cgtPurchasePrice, cgtCosts, cgtDepreciation, cgtDiscountPct, cgtRate,
      costBase, rawGain, grossGain, isCapitalLoss, assessableGain, cgtDiscountAmount, netCapitalGain, estimatedCgt,
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
    PROPERTIES, SELLING_COST_FIELDS, CGT_COST_FIELDS, BUYING_COST_FIELDS, HORIZONS, DEFAULTS,
    propById, loanTotal, calc, num, has, sum,
    fmtMoney, fmtMoneyShort, fmtSignedShort, fmtPct
  };
})();
