// =====================================================================
// Folio — Interest-only rollover · SECTIONS
// ---------------------------------------------------------------------
// Three presentational sections, all driven by the engine result `d`:
//   1. Verdict   — the headline jump + household capacity
//   2. Schedule  — global/per-loan P&I assumption · dynamic timeline ·
//                  per-loan rollover table
//   3. Cashflow  — a stepped net-cashflow chart on the SAME time axis as
//                  the timeline, so it scales to 1 … 10+ rollovers
// Exported to window for io-app.jsx.
// =====================================================================

(function () {
  const F = window.IO;

  // ── 1 · Verdict ────────────────────────────────────────────────────
  function Verdict({ d }) {
    const h = d.household;
    const pct = Math.round(h.pct * 100);
    const n = d.loans.length;
    return (
      <section className="calc io-verdict">
        <div className="calc-body">
          <div className="verdict-lead">
            <div className="calc-section-label">
              Once {n === 1 ? 'the loan rolls' : 'all ' + n + ' loans roll'} to P&amp;I
            </div>
            <div className="headline-result">
              <span className="value"><span className="unit">+$</span>{Math.round(d.totalDelta).toLocaleString('en-AU')}</span>
              <span className="delta">/ mo more than today</span>
            </div>
            <p className="headline-context">
              That's <strong>{F.fmtMoney(d.annualDelta)} a year</strong> of extra servicing once
              {n === 1 ? ' the interest-only period expires' : ' every interest-only period expires'} — estimated at each loan's P&amp;I rate, its IO rate less {F.DEFAULT_DISCOUNT.toFixed(2)}% by default.
            </p>
          </div>
          <div className="verdict-aside">
            <div className="capacity-bar">
              <div className="lab-row">
                <span>Surplus consumed once rolled</span>
                <span className="num"><strong>{F.fmtMoney(h.consumed)}</strong> / {F.fmtMoney(h.surplus)} mo</span>
              </div>
              <div className="bar">
                <div className={'fill' + (h.breached ? ' is-breached' : '')} style={{ width: Math.min(100, pct) + '%' }}></div>
              </div>
              <div className="legend">
                {h.breached ?
                <>The fully-rolled shortfall <strong>exceeds</strong> your {F.fmtMoney(h.surplus)} / mo surplus by <strong>{F.fmtMoney(-h.remaining)} / mo</strong>.</> :

                <>The fully-rolled position fits inside your <strong>{F.fmtMoney(h.surplus)} / mo</strong> surplus — leaving <strong>{F.fmtMoney(h.remaining)} / mo</strong> of headroom for further rate rises.</>
                }
              </div>
            </div>
          </div>
        </div>
      </section>);

  }

  // ── 2 · Timeline + schedule ────────────────────────────────────────
  function Timeline({ d }) {
    const s = d.scale;
    const dense = d.loans.length > 4;
    return (
      <div className={'io-timeline' + (dense ? ' is-dense' : '')}>
        <div className="axis">
          <div className="today-marker" style={{ left: s.todayFrac * 100 + '%' }}>
            <span className="lab">Today · {s.nowLabel}</span>
          </div>
          {s.ticks.map((t) =>
          <div key={t.year} className="tick" style={{ left: t.frac * 100 + '%' }}>
              <span className="lab">{t.year}</span>
            </div>
          )}
          {d.loans.map((l, i) => {
            const frac = (l.endDate - s.axisStart) / (s.axisEnd - s.axisStart);
            return (
              <div key={l.id} className={'event' + (i % 2 ? ' is-alt' : '')} style={{ left: frac * 100 + '%' }}>
                <div className="pin"></div>
                <div className="evt-text">
                  {!dense && <div className="label">{l.lender} · {l.property}</div>}
                  <div className="when">{dense ? l.endShort : l.endLong}</div>
                </div>
              </div>);

          })}
        </div>
      </div>);

  }

  function Schedule({ d, onLoanRate }) {
    return (
      <section className="calc">
        <div className="calc-head">
          <div className="title-block">
            <div className="title">When each loan rolls over</div>
            <div className="sub">
              {d.loans.length === 1 ?
              'One interest-only loan flips to principal & interest.' :
              d.loans.length + ' interest-only loans flip to principal & interest over the next ' + Math.max(1, Math.round(s_years(d))) + ' years.'}
            </div>
          </div>
        </div>

        <Timeline d={d} />

        <div className="io-rollover-list is-perloan">
          <div className="row header">
            <div>Loan</div>
            <div className="num">IO ends</div>
            <div className="num">P&amp;I rate</div>
            <div className="num">IO now</div>
            <div className="num">After P&amp;I</div>
            <div className="num">Δ / mo</div>
          </div>
          {d.loans.map((l) =>
          <div className="row" key={l.id}>
              <div>
                <span className="loan-name">{l.lender} · {l.property}</span>
                <span className="loan-sub">{F.fmtK(l.balance)} · {F.fmtRate(l.rate)} IO · {l.termYrs} yr P&amp;I term</span>
              </div>
              <div className="num">{l.endShort}</div>
              <div className="num">
                <span className="rate-field">
                  <input className="num" inputMode="decimal" value={l.piRate.toFixed(2)}
                onChange={(e) => onLoanRate(l.id, F.num(e.target.value))} />
                  <span className="suffix">%</span>
                </span>
              </div>
              <div className="num">{F.fmtMoney(l.ioPay)}</div>
              <div className="num">{F.fmtMoney(l.piPay)}</div>
              <div className="num shock">{F.fmtSigned(l.delta)}</div>
            </div>
          )}
        </div>

        <div className="calc-foot">
          <span>Assumes constant IO rates · IO loans are not refinanced</span>
        </div>
      </section>);

  }

  // ── 3 · Cashflow chart (scales to any number of rollovers) ─────────
  function Cashflow({ d }) {
    const W = 900,H = 248;
    const padL = 16,padR = 16,padT = 26,padB = 26;
    const plotW = W - padL - padR,plotH = H - padT - padB;
    const s = d.scale;
    const surplus = d.household.surplus;

    // y-domain: 0 at top, down past the worse of (final shortfall, surplus limit).
    const worst = Math.min(d.finalShortfall, -surplus);
    const floor = worst * 1.18;
    const x = (frac) => padL + frac * plotW;
    const y = (v) => padT + Math.abs(v) / Math.abs(floor) * plotH;

    // Staircase points across the full axis.
    const v0 = d.todayShortfall;
    const pts = [[0, v0]];
    let cur = v0;
    d.steps.filter((st) => st.kind === 'roll').forEach((st) => {
      pts.push([st.frac, cur]); // travel flat to the rollover
      pts.push([st.frac, st.value]); // step down
      cur = st.value;
    });
    pts.push([1, cur]); // extend to the right edge

    const linePath = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
    const areaPath = 'M' + x(0).toFixed(1) + ' ' + padT + ' ' +
    pts.map((p) => 'L' + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ') +
    ' L' + x(1).toFixed(1) + ' ' + padT + ' Z';

    const rolls = d.steps.filter((st) => st.kind === 'roll');
    const showDotLabels = rolls.length <= 4;
    const surplusY = y(-surplus);

    return (
      <section className="calc">
        <div className="calc-head">
          <div className="title-block">
            <div className="title">Net cashflow as each loan rolls</div>
            <div className="sub">The same timeline, read as your whole-portfolio monthly position.</div>
          </div>
          <div className="io-chart-key">
            <span className="k-line"><i className="swatch line"></i>Net / mo</span>
            <span className="k-line"><i className="swatch limit"></i>Surplus limit</span>
          </div>
        </div>

        <div className="io-chart-wrap">
          <svg className="io-chart" viewBox={'0 0 ' + W + ' ' + H} role="img"
          aria-label="Net monthly cashflow stepping down as each interest-only loan rolls to principal and interest">
            {/* year gridlines + labels (shared axis) */}
            {s.ticks.map((t) =>
            <g key={t.year}>
                <line className="grid" x1={x(t.frac)} x2={x(t.frac)} y1={padT - 6} y2={H - padB} />
                <text className="grid-lab" x={x(t.frac)} y={H - padB + 15} textAnchor="middle">{t.year}</text>
              </g>
            )}
            {/* today marker */}
            <line className="today-line" x1={x(s.todayFrac)} x2={x(s.todayFrac)} y1={padT - 6} y2={H - padB} />

            {/* surplus limit */}
            <line className="surplus-line" x1={padL} x2={W - padR} y1={surplusY} y2={surplusY} />
            <text className="surplus-lab" x={padL + 2} y={surplusY - 6} textAnchor="start">Surplus limit · {F.fmtMoney(-surplus)}/mo</text>

            {/* cost band + step line */}
            <path className="area" d={areaPath} />
            <path className="line" d={linePath} />

            {/* rollover dots */}
            {rolls.map((st) =>
            <g key={st.id}>
                <circle className="dot" cx={x(st.frac)} cy={y(st.value)} r="4" />
                {showDotLabels &&
              <text className="dot-lab" x={x(st.frac)} y={y(st.value) + 18} textAnchor="middle">{F.fmtMoney(st.value)}</text>
              }
              </g>
            )}

            {/* endpoint labels */}
            <text className="end-lab start" x={x(0) + 2} y={y(v0) - 9}>Today · {F.fmtMoney(v0)}</text>
            <text className="end-lab finish" x={x(1) - 2} y={y(cur) - 9} textAnchor="end">Fully rolled · {F.fmtMoney(cur)}</text>
          </svg>
        </div>

        <div className="io-chart-foot">
          <div className="io-stat">
            <div className="lab">Today</div>
            <div className="val">{F.fmtMoney(d.todayShortfall)}<span className="u">/mo</span></div>
          </div>
          <div className="io-stat">
            <div className="lab">Fully rolled</div>
            <div className="val neg">{F.fmtMoney(d.finalShortfall)}<span className="u">/mo</span></div>
          </div>
          <div className="io-stat">
            <div className="lab">{d.household.breached ? 'Surplus shortfall' : 'Surplus headroom left'}</div>
            <div className={'val' + (d.household.breached ? ' neg' : ' pos')}>{F.fmtMoney(d.household.remaining)}<span className="u">/mo</span></div>
          </div>
          <p className="io-note">
            These are <strong>portfolio</strong> figures — the gap your salary already covers. {d.household.breached ?
            <>Once fully rolled the line drops <strong>below</strong> your surplus limit — the portfolio no longer services itself from cashflow.</> :
            <>As long as the line stays above the surplus limit, the rollovers are serviceable from cashflow.</>}
          </p>
        </div>

        <div className="calc-foot">
          <span>Forecast only · ignores offset balances and future rate moves</span>
        </div>
      </section>);

  }

  // helpers
  function s_years(d) {return d.scale.spanYears - 1;} // span includes the +1yr tail

  Object.assign(window, { IOVerdict: Verdict, IOSchedule: Schedule, IOCashflow: Cashflow });
})();