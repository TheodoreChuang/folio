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
    // Repayment change is the hero: + = paying more (worse → red), − = less (better → green).
    const repayUp = d.repayDelta > 0.5;     // paying more
    const repayDown = d.repayDelta < -0.5;  // paying less
    const repayClass = repayUp ? 'is-negative' : repayDown ? 'is-positive' : 'is-neutral';
    const cfStr = (cfScenario < 0 ? '−' : '') + '$' + Math.abs(Math.round(cfScenario)).toLocaleString('en-AU');

    return (
      <div className="rs-outputs">
        {/* ===== Headline — total repayment change ===== */}
        <div className="calc-section-label">Total repayment change</div>
        <div className="headline-result rs-headline">
          {atToday ? (
            <span className="value is-neutral">No change</span>
          ) : (
            <>
              <span className={'value ' + repayClass}>
                {repayUp ? '+' : '−'}<span className="unit">$</span>{Math.abs(Math.round(d.repayDelta)).toLocaleString('en-AU')}
              </span>
              <span className={'rs-change-pill ' + (repayUp ? 'more' : 'less')}>
                per month {repayUp ? 'more' : 'less'}
              </span>
            </>
          )}
        </div>
        <div className="rs-context">
          Portfolio cashflow would be{' '}
          <strong className={cfScenario < -0.5 ? 'cf-neg' : cfScenario > 0.5 ? 'cf-pos' : ''}>{cfStr}</strong>{' '}
          per month{atToday ? '' : ' (' + F.fmtDelta(d.cashflowDelta) + ' vs today)'}.
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
              <div className={'fill' + (d.household.pct > 1 ? ' is-over' : '') + (d.household.covered ? ' is-positive' : '')}
                style={{ width: d.household.covered ? '100%' : Math.min(100, d.household.pct * 100) + '%' }} />
            </div>
            <div className="legend">
              {d.household.breached ? (
                <>The servicing exceeds your <strong>{F.fmtMoney(d.household.surplus)}/mo</strong> surplus by <strong>{F.fmtMoney(-d.household.remaining)}/mo</strong> at this move.</>
              ) : d.household.covered ? (
                <>This move frees up <strong>{F.fmtMoney(d.cashflowDelta)}/mo</strong> of cashflow versus today — the servicing no longer draws on your <strong>{F.fmtMoney(d.household.surplus)}/mo</strong> personal surplus.</>
              ) : (
                <>About <strong>{Math.round(d.household.pct * 100)}%</strong> of your <strong>{F.fmtMoney(d.household.surplus)}/mo</strong> surplus would cover the servicing — leaves <strong>{F.fmtMoney(d.household.remaining)}/mo</strong>.</>
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
