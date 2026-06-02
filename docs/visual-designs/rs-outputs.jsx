// =====================================================================
// Folio — Rate sensitivity · OUTPUTS (the hero)
// ---------------------------------------------------------------------
// Pure presentation of the derived figures. The centrepiece is one
// loan-centric table: each row IS a loan (identity + today + at-move +
// Δ/mo), so there's a single place per loan and no left/right ping-pong.
// Exposes window.RSOutputs.
// =====================================================================

(function () {
  const F = window.RS;
  const balK = (n) => '$' + Math.round(n / 1000) + 'k';

  function Outputs({ d, household }) {
    const move = F.fmtMove(d.delta);
    const atToday = Math.abs(d.delta) < 0.001;

    const cfScenario = d.cashflowScenario;
    const cfClass = cfScenario < -0.5 ? 'is-negative' : cfScenario > 0.5 ? 'is-positive' : 'is-neutral';
    // paying more (cashflow falls) is the "bad" direction → red
    const cfDeltaClass = d.cashflowDelta < -0.5 ? 'down' : d.cashflowDelta > 0.5 ? 'up' : 'neutral';

    return (
      <div className="rs-outputs">
        {/* ===== Headline ===== */}
        <div className="calc-section-label">
          Monthly cashflow {atToday ? 'today' : 'at ' + move}
        </div>
        <div className="headline-result rs-headline">
          <span className={'value ' + cfClass}>
            {cfScenario < 0 ? '−' : ''}<span className="unit">$</span>{Math.abs(Math.round(cfScenario)).toLocaleString('en-AU')}
            <span className="unit"> / mo</span>
          </span>
          {!atToday && (
            <span className={'delta ' + cfDeltaClass}>
              {F.fmtDelta(d.cashflowDelta)} / mo vs today
            </span>
          )}
        </div>
        <div className="rs-context">
          {atToday ? (
            <>Drag the rate to model a rise or fall across <strong>all {F.LOANS.length} variable loans</strong>. Repayments today total <strong>{F.fmtMoney(d.todayTotal)} / mo</strong>.</>
          ) : household === 'populated' ? (
            d.household.breached ? (
              <>This move needs <strong>{F.fmtMoney(-d.household.remaining)} / mo</strong> more than your <strong>{F.fmtMoney(d.household.surplus)} / mo</strong> personal surplus — the portfolio would run at a shortfall.</>
            ) : (
              <>Still inside your <strong>{F.fmtMoney(d.household.surplus)} / mo</strong> personal surplus — buffer drops to <strong>{F.fmtMoney(d.household.remaining)} / mo</strong>.</>
            )
          ) : (
            <>Total repayments move <strong>{F.fmtDelta(d.repayDelta)} / mo</strong> — from {F.fmtMoney(d.todayTotal)} to <strong>{F.fmtMoney(d.scenarioTotal)} / mo</strong>.</>
          )}
        </div>

        {/* ===== Per-loan impact (combined identity + outcome) ===== */}
        <div className="calc-section-label">Per-loan impact</div>
        <div className="rs-loan-table">
          <div className="rs-row rs-head">
            <div className="loan">Loan</div>
            <div className="num">Today</div>
            <div className="num">{atToday ? 'Rate' : 'At ' + move}</div>
            <div className="num">Δ / mo</div>
          </div>

          {d.loans.map((l) => {
            const dc = l.deltaMo > 0.5 ? 'up' : l.deltaMo < -0.5 ? 'down' : 'neutral';
            return (
              <div className="rs-row" key={l.id}>
                <div className="loan">
                  <span className="nm">{l.lender} · {l.property}</span>
                  <span className="sub">{balK(l.balance)} · {F.fmtRate(l.rate)}{l.type === 'io' ? ' · IO' : ' · P&I'}</span>
                </div>
                <div className="num">{F.fmtMoney(l.today)}</div>
                <div className="num">
                  {F.fmtMoney(l.scenario)}
                  {!atToday && <span className="sub-rate">{F.fmtRate(l.newRate)}</span>}
                </div>
                <div className={'num delta ' + dc}>{atToday ? '—' : F.fmtDelta(l.deltaMo)}</div>
              </div>
            );
          })}

          <div className="rs-row rs-total">
            <div className="loan">All variable loans</div>
            <div className="num">{F.fmtMoney(d.todayTotal)}</div>
            <div className="num">{F.fmtMoney(d.scenarioTotal)}</div>
            <div className={'num delta ' + (d.repayDelta > 0.5 ? 'up' : d.repayDelta < -0.5 ? 'down' : 'neutral')}>
              {atToday ? '—' : F.fmtDelta(d.repayDelta)}
            </div>
          </div>
        </div>

        {/* ===== Household buffer ===== */}
        {household === 'populated' ? (
          <div className="rs-household">
            <div className="lab-row">
              <span>Personal surplus used at {atToday ? 'today’s rates' : move}</span>
              <span className="num"><strong>{F.fmtMoney(d.household.consumed)}</strong> / {F.fmtMoney(d.household.surplus)} mo</span>
            </div>
            <div className="bar">
              <div className={'fill' + (d.household.pct > 1 ? ' is-over' : '')}
                style={{ width: Math.min(100, d.household.pct * 100) + '%' }} />
            </div>
            <div className="legend">
              {d.household.remaining >= 0 ? (
                <>About <strong>{Math.round(d.household.pct * 100)}%</strong> of your <strong>{F.fmtMoney(d.household.surplus)}/mo</strong> surplus would cover the servicing — leaves <strong>{F.fmtMoney(d.household.remaining)}/mo</strong>.</>
              ) : (
                <>The servicing exceeds your <strong>{F.fmtMoney(d.household.surplus)}/mo</strong> surplus by <strong>{F.fmtMoney(-d.household.remaining)}/mo</strong> at this move.</>
              )}
            </div>
          </div>
        ) : (
          <div className="rs-household-prompt">
            <span className="ico">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="6" r="2.5" /><path d="M2.5 14a5.5 5.5 0 0 1 11 0" /></svg>
            </span>
            <span className="txt">
              <strong>Set up your Household</strong> to see how much of your monthly surplus a rate move would use. <a data-goto="household">Add household income →</a>
            </span>
          </div>
        )}
      </div>
    );
  }

  window.RSOutputs = Outputs;
})();
