// =====================================================================
// Folio — Model a purchase · OUTPUTS column (the hero)
// ---------------------------------------------------------------------
// Pure presentation of the derived figures. The portfolio-impact tiles
// render as Tracks: a muted base (what existed before) plus a coloured
// segment for the change this purchase makes.
// Exposes window.MPOutputs.
// =====================================================================

(function () {
  const F = window.MP;

  // ---- one impact tile (before → after, shown as a Track) ----------
  function Tile({ lab, before, after, fmt, deltaText, deltaDir, single, max, dir }) {
    if (single) {
      return (
        <div className="mp-tile is-single">
          <div className="lab">{lab}</div>
          <div className="single-v">{fmt(after)}</div>
          {deltaText ? <div className={'delta ' + (deltaDir || 'neutral')}>{deltaText}</div> : null}
        </div>);

    }

    const cap = max || Math.max(Math.abs(before), Math.abs(after), 1);
    const beforePct = Math.min(100, Math.abs(before) / cap * 100);
    const afterPct = Math.min(100, Math.abs(after) / cap * 100);
    // Read the bar as: what already existed (muted base) + what this
    // purchase changes (coloured). The boundary between the two is the
    // "before" position, so a full bar still carries meaning.
    const lo = Math.min(beforePct, afterPct);
    const hi = Math.max(beforePct, afterPct);
    const shrank = afterPct < beforePct;
    return (
      <div className="mp-tile t-track">
        <div className="lab">{lab}</div>
        <div className="to">{fmt(after)}</div>
        <div className="from-cap">was {fmt(before)}</div>
        <div className="track">
          <div className="seg-base" style={{ width: lo + '%' }} />
          <div className={'seg-change ' + (dir || 'neutral') + (shrank ? ' is-shrink' : '')}
          style={{ left: lo + '%', width: Math.max(hi - lo, 0.6) + '%' }} />
        </div>
        {deltaText ? <div className={'delta ' + (deltaDir || 'neutral')}>{deltaText}</div> : null}
      </div>);

  }

  function Outputs({ input, d, household }) {
    // ---- empty / not-ready state ----
    if (!d.ready) {
      return (
        <div className="outputs mp-outputs">
          <div className="calc-section-label">Monthly cashflow on this property</div>
          <div className="mp-empty">
            <div className="ghost-headline"><span className="dash">— / mo</span></div>
            <div className="prompt">
              Enter a <strong>purchase price</strong> and <strong>weekly rent</strong> to see the cashflow, funding and portfolio impact.
            </div>
            <div className="ghost-grid">
              {Array.from({ length: 6 }).map((_, k) => <div key={k} className="ghost-tile" />)}
            </div>
          </div>
        </div>);

    }

    const p = d.portfolio;
    const money = (n) => F.fmtMoney(n);
    const short = (n) => F.fmtMoneyShort(n);
    const pct = (n) => F.fmtPct(n);

    const cfClass = d.propertyCashflowMo < -0.5 ? 'is-negative' :
    d.propertyCashflowMo > 0.5 ? 'is-positive' : 'is-neutral';

    // funding stack rows: deposit + each entered purchase cost
    const costRows = F.PURCHASE_COST_FIELDS.
    filter((f) => F.num(input.purchaseCosts[f.key]) > 0).
    map((f) => ({ k: f.label, v: F.num(input.purchaseCosts[f.key]) }));

    const cashflowMax = Math.max(Math.abs(p.cashflowBefore), Math.abs(p.cashflowAfter), 1);

    return (
      <div className="outputs mp-outputs">
        {/* ===== Headline ===== */}
        <div className="calc-section-label">CASHFLOW ON THIS PROPERTY</div>
        <div className="headline-result mp-headline">
          <span className={'value ' + cfClass}>
            {d.propertyCashflowMo < 0 ? '−' : ''}<span className="unit">$</span>{Math.abs(Math.round(d.propertyCashflowMo)).toLocaleString('en-AU')}
            <span className="unit"> / mo</span>
          </span>
          <span className={'mp-gearing ' + d.gearing}>
            {d.gearing === 'negative' ? 'negatively geared' : d.gearing === 'positive' ? 'positively geared' : 'neutral'}
          </span>
        </div>
        <div className="mp-breakdown">
          <span className="term"><span className="lbl">Rent</span><span className="amt">{money(d.monthlyRent)}</span></span>
          <span className="op">−</span>
          <span className="term"><span className="lbl">Loan</span><span className="amt">{money(d.newLoanRepayMo)}</span></span>
          <span className="op">−</span>
          <span className="term"><span className="lbl">Costs</span><span className="amt">{money(d.runningCostsMo)}</span></span>
          <span className="op">=</span>
          <span className="term is-net"><span className="lbl">Net</span><span className="amt">{F.fmtMoney(d.propertyCashflowMo, { sign: false })}</span></span>
        </div>

        {/* ===== Funding ===== */}
        <div className="calc-section-label">Funding</div>
        <div className="funding-stack">
          <div className="row">
            <div className="k">Deposit<span className="sub">{pct(d.depositPct / 100)} of price</span></div>
            <div className="v">{money(d.deposit)}</div>
          </div>
          {costRows.map((r, k) =>
          <div className="row" key={k}>
              <div className="k">{r.k}</div>
              <div className="v">{money(r.v)}</div>
            </div>
          )}
          <div className="row is-total">
            <div className="k">Cash required</div>
            <div className="v">{money(d.fundsRequired)}</div>
          </div>
        </div>
        <div className="mp-funded-by">
          {d.equityDrawn > 0 &&
          <span className="chip"><span className="dot equity" />Equity <strong>{money(d.equityDrawn)}</strong></span>
          }
          {d.cashContribution > 0 &&
          <span className="chip"><span className="dot cash" />Cash <strong>{money(d.cashContribution)}</strong></span>
          }
          {d.equityDrawn === 0 && d.cashContribution === 0 &&
          <span className="chip">Choose a deposit source to fund this</span>
          }
        </div>

        {/* ===== Portfolio impact ===== */}
        <div className="calc-section-label">Impact on portfolio</div>
        <div className="mp-impact-grid">
          <Tile lab="Total value" before={p.valueBefore} after={p.valueAfter}
          fmt={short} deltaText={'+' + short(p.valueAfter - p.valueBefore)} deltaDir="neutral" dir="neutral" />
          <Tile lab="Total debt" before={p.debtBefore} after={p.debtAfter}
          fmt={short} deltaText={'+' + short(p.debtAfter - p.debtBefore)} deltaDir="up" dir="up" />
          <Tile lab="Blended LVR" before={p.lvrBefore} after={p.lvrAfter}
          fmt={pct} max={1} deltaText={F.fmtPctPts(p.lvrAfter - p.lvrBefore)}
          deltaDir={p.lvrAfter >= p.lvrBefore ? 'up' : 'down'} dir={p.lvrAfter >= p.lvrBefore ? 'up' : 'down'} />
          <Tile lab="Net cashflow / mo" before={p.cashflowBefore} after={p.cashflowAfter}
          fmt={(n) => F.fmtMoney(n)} max={cashflowMax}
          deltaText={F.fmtMoney(p.cashflowAfter - p.cashflowBefore, { sign: true }) + ' / mo'}
          deltaDir={p.cashflowAfter >= p.cashflowBefore ? 'down' : 'up'}
          dir={p.cashflowAfter >= p.cashflowBefore ? 'down' : 'up'} />
          <Tile lab="Cash needed" single after={d.fundsRequired}
          fmt={money} deltaText="deposit + costs" deltaDir="neutral" />
          {d.sourceImpact.length > 0 ?
          <Tile lab={d.sourceImpact[0].name + ' LVR'} max={1}
          before={d.sourceImpact[0].lvrBefore} after={d.sourceImpact[0].lvrAfter} fmt={pct}
          deltaText={F.fmtPctPts(d.sourceImpact[0].lvrAfter - d.sourceImpact[0].lvrBefore)}
          deltaDir="up" dir="up" /> :

          <Tile lab="New property LVR" single after={d.newPropLVR}
          fmt={pct} deltaText={d.newPropLVR > 0.8 ? 'LMI territory' : 'within 80%'}
          deltaDir={d.newPropLVR > 0.8 ? 'up' : 'neutral'} />
          }
        </div>

        {/* second source property, if drawn from two ... */}
        {d.sourceImpact.length > 1 &&
        <div className="mp-impact-grid" style={{ marginTop: 'var(--space-3)' }}>
            {d.sourceImpact.slice(1).map((s) =>
          <Tile key={s.id} lab={s.name + ' LVR'} max={1}
          before={s.lvrBefore} after={s.lvrAfter} fmt={pct}
          deltaText={F.fmtPctPts(s.lvrAfter - s.lvrBefore)} deltaDir="up" dir="up" />
          )}
          </div>
        }

        {/* ===== Household surplus ===== */}
        {household === 'populated' ?
        <div className="mp-household">
            <div className="lab-row">
              <span>Household cashflow after this purchase</span>
              <span className="num"><strong>{money(d.household.consumed)}</strong> / {money(d.household.surplus)} mo</span>
            </div>
            <div className="bar">
              <div className={'fill' + (d.household.pct > 1 ? ' is-over' : '')}
            style={{ width: Math.min(100, d.household.pct * 100) + '%' }} />
            </div>
            <div className="legend">
              {d.household.remaining >= 0 ?
            <>About <strong>{pct(d.household.pct)}</strong> of your <strong>{money(d.household.surplus)}/mo</strong> surplus covers portfolio servicing — leaves <strong>{money(d.household.remaining)}/mo</strong>.</> :
            <>This purchase needs <strong>{money(-d.household.remaining)}/mo</strong> more than your <strong>{money(d.household.surplus)}/mo</strong> surplus — the portfolio would run at a shortfall.</>}
            </div>
          </div> :

        <div className="mp-household-prompt">
            <span className="ico">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="6" r="2.5" /><path d="M2.5 14a5.5 5.5 0 0 1 11 0" /></svg>
            </span>
            <span className="txt">
              <strong>Set up your Household</strong> to see how much of your monthly surplus this purchase would use. <a data-goto="household">Add household income →</a>
            </span>
          </div>
        }
      </div>);

  }

  window.MPOutputs = Outputs;
})();