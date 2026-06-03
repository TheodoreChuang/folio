// =====================================================================
// Folio — Model a purchase · calculation engine
// ---------------------------------------------------------------------
// Pure functions + the user's existing portfolio. No DOM, no React.
// Everything the UI shows is derived here from a single inputs object,
// so the outputs are a pure function of the inputs (live recompute).
//
// Exposed as window.MP = { PORTFOLIO, HOUSEHOLD, DEFAULTS, calc, fmt… }
// =====================================================================

(function () {
  // ----- The user's existing portfolio (consistent Folio figures) ---
  //   value/debt sum to $2.07M / $1.14M → blended LVR ≈ 55%.
  //   Usable equity is computed at an 80% lend cap: 0.8·value − debt.
  const PROPERTIES = [
    { id: 'elm',        name: '14 Elm St',     suburb: 'Randwick',     value: 920000, debt: 615000 },
    { id: 'daley',      name: '8 Daley St',    suburb: 'Marrickville', value: 640000, debt: 480000 },
    { id: 'sutherland', name: 'Sutherland Ct', suburb: 'Kingsford',    value: 510000, debt:  45000 }
  ];

  function usableEquity(p) { return Math.max(0, 0.8 * p.value - p.debt); }
  // Hard ceiling on what can be released: take the property to 100% LVR.
  function maxEquityDraw(p) { return Math.max(0, p.value - p.debt); }

  const PORTFOLIO = {
    properties: PROPERTIES,
    value: PROPERTIES.reduce((s, p) => s + p.value, 0),   // 2,070,000
    debt:  PROPERTIES.reduce((s, p) => s + p.debt, 0),    // 1,140,000
    netCashflowMo: -1110                                  // today's portfolio cashflow
  };

  const HOUSEHOLD = { surplusMo: 5000 };

  // Line-item definitions (labels + meta) so inputs + funding stack stay
  // in sync. Purchase costs are one-off; running costs are annualised.
  const PURCHASE_COST_FIELDS = [
    { key: 'stampDuty',    label: 'Stamp duty' },
    { key: 'legal',        label: 'Legal & conveyancing' },
    { key: 'buildingPest', label: 'Building & pest' },
    { key: 'depreciation', label: 'Depreciation schedule' },
    { key: 'registration', label: 'Registration & transfer' },
    { key: 'buyerAgent',   label: "Buyer's agent fee" },
    { key: 'renovation',   label: 'Upfront maintenance' }
  ];

  // pct: true → entered as a % of gross rent (PM fee, vacancy). Others $/yr.
  const RUNNING_COST_FIELDS = [
    { key: 'councilRates',      label: 'Council rates' },
    { key: 'water',             label: 'Water & sewerage' },
    { key: 'buildingIns',       label: 'Building insurance' },
    { key: 'landlordIns',       label: 'Landlord insurance' },
    { key: 'strata',            label: 'Strata / body corporate' },
    { key: 'landTax',           label: 'Land tax' },
    { key: 'maintenance',       label: 'Repairs & maintenance' },
    { key: 'admin',             label: 'Accounting & admin' },
    { key: 'pmFeePct',          label: 'Property management', pct: true, hint: '% of rent' },
    { key: 'vacancyPct',        label: 'Vacancy allowance',   pct: true, hint: '% of rent' }
  ];

  const DEFAULTS = {
    price: 780000,
    weeklyRent: 640,
    depositPct: 20,
    lmi: 0,                           // capitalised onto loan when deposit < 20%
    source: 'equity',                 // equity | cash | mix (“Both”)
    equityDraws: { elm: 0, daley: 0, sutherland: 189600 }, // Sutherland funds it
    equityChecked: { elm: false, daley: false, sutherland: true },
    purchaseCosts: { stampDuty: 31200, legal: 1800, buildingPest: 600, depreciation: 0, registration: 0, buyerAgent: 0, renovation: 0 },
    loan: { ratePct: 6.35, type: 'io', ioTermYrs: 5, termYrs: 30 },
    runningCosts: {}                  // all optional, empty by default
  };

  // ----- helpers ----------------------------------------------------
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const sum = (obj) => Object.values(obj || {}).reduce((s, v) => s + num(v), 0);

  function monthlyPI(principal, annualRatePct, years) {
    const r = annualRatePct / 100 / 12;
    const n = Math.max(1, years * 12);
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  // ----- the calculation -------------------------------------------
  function calc(input) {
    const i = input;
    const price = num(i.price);
    const weeklyRent = num(i.weeklyRent);
    const ready = price > 0 && weeklyRent > 0;

    const depositPct = num(i.depositPct);
    const deposit = price * depositPct / 100;
    const baseLoan = Math.max(0, price - deposit);
    // Lending LVR is deposit-based — this is what decides whether LMI applies.
    const newPropLVR = price > 0 ? baseLoan / price : 0;
    const lmiRequired = newPropLVR > 0.8;
    // LMI is not paid in cash — it's capitalised onto the loan.
    const lmi = lmiRequired ? num(i.lmi) : 0;
    const newLoan = baseLoan + lmi;

    const purchaseCostsTotal = sum(i.purchaseCosts);
    const fundsRequired = deposit + purchaseCostsTotal;

    // Funding sources
    const usingEquity = i.source === 'equity' || i.source === 'mix';
    const checked = i.equityChecked || {};
    const equityDrawn = usingEquity ? PROPERTIES.reduce((s, p) =>
      s + (checked[p.id] ? num(i.equityDraws[p.id]) : 0), 0) : 0;
    let cashContribution;
    if (i.source === 'cash') cashContribution = fundsRequired;
    else if (i.source === 'mix') cashContribution = Math.max(0, fundsRequired - equityDrawn); // remainder is cash
    else cashContribution = 0; // equity only
    const allocated = equityDrawn + cashContribution;
    const shortfall = fundsRequired - allocated;

    // Rent & loan
    const annualRent = weeklyRent * 52;
    const monthlyRent = annualRent / 12;
    const loanType = i.loan.type;
    const ratePct = num(i.loan.ratePct);
    const newLoanRepayMo = loanType === 'io'
      ? newLoan * (ratePct / 100) / 12
      : monthlyPI(newLoan, ratePct, num(i.loan.termYrs));
    // Equity release accrues interest too (interest-only on the release).
    const equityInterestMo = equityDrawn * (ratePct / 100) / 12;

    // Running costs → monthly
    const rc = i.runningCosts || {};
    let rcFixedAnnual = 0;
    let rcPctAnnual = 0;
    RUNNING_COST_FIELDS.forEach(f => {
      const v = num(rc[f.key]);
      if (!v) return;
      if (f.pct) rcPctAnnual += annualRent * v / 100;
      else rcFixedAnnual += v;
    });
    const runningCostsMo = (rcFixedAnnual + rcPctAnnual) / 12;

    const propertyCashflowMo = monthlyRent - newLoanRepayMo - runningCostsMo;
    const gearing = propertyCashflowMo > 0.5 ? 'positive'
                  : propertyCashflowMo < -0.5 ? 'negative' : 'neutral';

    // Portfolio rollup
    const newValue = PORTFOLIO.value + price;
    const newDebt = PORTFOLIO.debt + newLoan + equityDrawn;
    const blendedLVRbefore = PORTFOLIO.debt / PORTFOLIO.value;
    const blendedLVRafter = newDebt / newValue;
    const portfolioCashflowAfter = PORTFOLIO.netCashflowMo + propertyCashflowMo - equityInterestMo;

    // Per source-property LVR after the equity draw
    const sourceImpact = (usingEquity ? PROPERTIES : [])
      .filter(p => checked[p.id] && num(i.equityDraws[p.id]) > 0)
      .map(p => {
        const draw = num(i.equityDraws[p.id]);
        return {
          id: p.id, name: p.name,
          lvrBefore: p.debt / p.value,
          lvrAfter: (p.debt + draw) / p.value,
          draw
        };
      });

    // Household — the portfolio's net cashflow after the purchase is fully
    // modelled here (portfolioCashflowAfter), so we can show both directions:
    // negative draws on the personal surplus; positive ADDS to it.
    const consumed = Math.max(0, -portfolioCashflowAfter);
    const contribution = Math.max(0, portfolioCashflowAfter);
    const surplus = HOUSEHOLD.surplusMo;
    const household = {
      surplus,
      consumed,
      contribution,
      contributing: contribution > 0.5,
      pct: surplus > 0 ? Math.min(1.5, consumed / surplus) : 0,
      remaining: surplus - consumed,
      total: surplus + contribution     // total household cashflow / mo
    };

    return {
      ready,
      price, deposit, depositPct, baseLoan, lmi, lmiRequired, newLoan, newPropLVR,
      purchaseCostsTotal, fundsRequired,
      equityDrawn, cashContribution, allocated, shortfall,
      monthlyRent, newLoanRepayMo, equityInterestMo, runningCostsMo,
      propertyCashflowMo, gearing,
      portfolio: {
        valueBefore: PORTFOLIO.value, valueAfter: newValue,
        debtBefore: PORTFOLIO.debt, debtAfter: newDebt,
        lvrBefore: blendedLVRbefore, lvrAfter: blendedLVRafter,
        cashflowBefore: PORTFOLIO.netCashflowMo, cashflowAfter: portfolioCashflowAfter
      },
      sourceImpact,
      household
    };
  }

  // ----- formatters -------------------------------------------------
  function fmtMoney(n, opts) {
    opts = opts || {};
    const neg = n < 0;
    const v = Math.round(Math.abs(n));
    const s = '$' + v.toLocaleString('en-AU');
    const out = (neg ? '−' : (opts.sign && v !== 0 ? '+' : '')) + s;
    return out;
  }
  function fmtMoneyShort(n) {
    const neg = n < 0; const a = Math.abs(n);
    let s;
    if (a >= 1e6) s = '$' + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    else if (a >= 1e3) s = '$' + Math.round(a / 1e3) + 'k';
    else s = '$' + Math.round(a);
    return (neg ? '−' : '') + s;
  }
  function fmtPct(n, dp) { return (n * 100).toFixed(dp == null ? 0 : dp) + '%'; }
  function fmtPctPts(n, dp) {
    const v = n * 100;
    const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
    return sign + Math.abs(v).toFixed(dp == null ? 0 : dp) + 'pp';
  }

  window.MP = {
    PORTFOLIO, HOUSEHOLD, DEFAULTS,
    PURCHASE_COST_FIELDS, RUNNING_COST_FIELDS,
    usableEquity, maxEquityDraw, calc, num, sum,
    fmtMoney, fmtMoneyShort, fmtPct, fmtPctPts
  };
})();
