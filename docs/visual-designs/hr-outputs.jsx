// =====================================================================
// Folio — Hold vs Sell and Reinvest · OUTPUTS
// ---------------------------------------------------------------------
// Pure presentation of the derived figures. Two exported pieces:
//   HRSummaries — right column: the Sale + Reinvestment ledgers
//   HRAnalysis  — full-width: friction banner, equity trajectory chart,
//                 comparison tiles, modeling assumptions, CGT disclaimer
// =====================================================================

(function () {
  const F = window.HR;
  const money = (n) => F.fmtMoney(n);
  const short = (n) => F.fmtMoneyShort(n);

  // ---------------------------------------------------------------
  // Compact ledger row
  // ---------------------------------------------------------------
  function Row({ k, sub, v, total, strong, pos }) {
    return (
      <div className={'row' + (total ? ' is-total' : '') + (strong ? ' is-strong' : '')}>
        <div className="k">{k}{sub ? <span className="sub">{sub}</span> : null}</div>
        <div className={'v' + (pos ? ' is-pos' : '')}>{v}</div>
      </div>);

  }

  // ===============================================================
  // RIGHT COLUMN — Sale + Reinvestment ledgers
  // ===============================================================
  function Summaries({ input, d }) {
    if (!d.ready) {
      return (
        <div className="outputs hr-outputs">
          <div className="calc-section-label">The comparison</div>
          <div className="hr-empty">
            <div className="ghost-headline"><span className="dash">Hold vs reinvest</span></div>
            <div className="prompt">Enter a <strong>sale price</strong> to see what selling frees, what reinvesting costs, and when the switch overtakes holding.</div>
            <div className="ghost-grid">
              {Array.from({ length: 4 }).map((_, k) => <div key={k} className="ghost-tile" />)}
            </div>
          </div>
        </div>);

    }

    const sc = d.sellingCosts;
    return (
      <div className="outputs hr-outputs">
        {/* ---- Sale ledger ---- */}
        <div className="calc-section-label">Sale — what you walk away with</div>
        <div className="funding-stack hr-ledger">
          <Row k="Sale price" v={money(d.salePrice)} />
          <Row k="Agent commission" sub={d.agentPct + '% of sale'} v={'−' + money(sc.agent)} />
          {sc.marketing > 0 && <Row k="Marketing" v={'−' + money(sc.marketing)} />}
          {sc.legal > 0 && <Row k="Legal fees (selling)" v={'−' + money(sc.legal)} />}
          {sc.other > 0 && <Row k="Other selling costs" v={'−' + money(sc.other)} />}
          {d.loanRows.map((l, k) =>
          <Row key={k} k="Loan payout" sub={l.label} v={'−' + money(l.amount)} />
          )}
          <Row k="Net cash after loans" v={money(d.netCashAfterLoans)} total strong
          pos={d.netCashAfterLoans > 0} />
          {d.cgtEntered && <Row k="Estimated CGT" v={'−' + money(d.cgt)} />}
          {d.cgtEntered && <Row k="Net cash after CGT" v={money(d.netCashAfterCGT)} total strong
          pos={d.netCashAfterCGT > 0} />}
        </div>
        {!d.cgtEntered &&
        <div className="hr-note hr-note--cgt">
            <span className="ic">i</span>
            CGT excluded — enter an estimate in Step 1 for a more accurate comparison.
          </div>
        }

        {/* ---- Reinvestment ledger ---- */}
        <div className="calc-section-label">Reinvestment — the new position</div>
        <div className="funding-stack hr-ledger">
          <Row k="Purchase price" sub="= sale price" v={money(d.purchasePrice)} />
          {F.BUYING_COST_FIELDS.filter((f) => d.buyingCosts[f.key] > 0).map((f) =>
          <Row key={f.key} k={f.label} v={'−' + money(d.buyingCosts[f.key])} />
          )}
          <Row k="Net deposit" v={money(d.netDeposit)} total strong pos={d.netDeposit > 0} />
        </div>

        {d.blocked ?
        <div className="hr-note hr-note--block">
            <span className="ic">!</span>
            <span>Selling at this price would not free enough equity to reinvest. Adjust the sale price or reduce costs.</span>
          </div> :

        <div className="hr-mini-grid">
            <div className="hr-mini">
              <div className="lab">New loan</div>
              <div className="val">{money(d.newLoan)}</div>
            </div>
            <div className={'hr-mini' + (d.lmiRequired ? ' is-warn' : '')}>
              <div className="lab">LVR</div>
              <div className="val">{F.fmtPct(d.lvr)}</div>
            </div>
            {d.lmiRequired &&
          <div className="hr-mini">
                <div className="lab">LMI</div>
                <div className="val">{d.lmi > 0 ? money(d.lmi) : '—'}</div>
              </div>
          }
            <div className="hr-mini is-effective">
              <div className="lab">Effective new loan</div>
              <div className="val">{money(d.effectiveNewLoan)}</div>
            </div>
          </div>
        }
      </div>);

  }

  // ===============================================================
  // EQUITY TRAJECTORY CHART (SVG)
  // ===============================================================
  function Chart({ d }) {
    const W = 760,H = 350;
    const padL = 60,padR = 20,padT = 34,padB = 34;
    const plotW = W - padL - padR,plotH = H - padT - padB;

    // Fine-sampled curves for smooth lines + an accurate crossing point.
    const sub = 10,steps = d.horizon * sub;
    const pts = [];
    for (let s = 0; s <= steps; s++) {
      const yr = s / sub;
      pts.push({
        yr,
        hold: d.V * Math.pow(1 + d.gHold, yr) - d.outstandingLoans,
        reinvest: d.V * Math.pow(1 + d.gReinvest, yr) - d.effectiveNewLoan
      });
    }

    // y-domain — zoom to the region the curves actually occupy.
    let lo = Infinity,hi = -Infinity;
    pts.forEach((p) => {lo = Math.min(lo, p.hold, p.reinvest);hi = Math.max(hi, p.hold, p.reinvest);});
    const range = Math.max(hi - lo, 1);
    const yMin = lo - range * 0.10;
    const yMax = hi + range * 0.08;

    const xOf = (yr) => padL + yr / d.horizon * plotW;
    const yOf = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    const pathOf = (key) => pts.map((p, i) => (i ? 'L' : 'M') + xOf(p.yr).toFixed(1) + ' ' + yOf(p[key]).toFixed(1)).join(' ');

    // Crossing point (first place reinvest overtakes hold).
    let cross = null;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i - 1].reinvest <= pts[i - 1].hold && pts[i].reinvest > pts[i].hold) {
        const a = pts[i - 1],b = pts[i];
        const da = a.reinvest - a.hold,db = b.reinvest - b.hold;
        const t = da === db ? 0 : da / (da - db);
        cross = { yr: a.yr + t * (b.yr - a.yr), val: a.hold + t * (b.hold - a.hold) };
        break;
      }
    }

    // Shaded band between the two curves (deficit before cross, lead after).
    function band(fromI, toI, cls) {
      let fwd = '',back = '';
      for (let i = fromI; i <= toI; i++) {
        fwd += (i === fromI ? 'M' : 'L') + xOf(pts[i].yr).toFixed(1) + ' ' + yOf(pts[i].reinvest).toFixed(1) + ' ';
      }
      for (let i = toI; i >= fromI; i--) {
        back += 'L' + xOf(pts[i].yr).toFixed(1) + ' ' + yOf(pts[i].hold).toFixed(1) + ' ';
      }
      return <path className={'hr-band ' + cls} d={fwd + back + 'Z'} />;
    }
    const crossIdx = cross ? Math.round(cross.yr * sub) : null;

    // gridlines
    const gridN = 4;
    const grids = [];
    for (let g = 0; g <= gridN; g++) {
      const v = yMin + (yMax - yMin) * (g / gridN);
      grids.push({ y: yOf(v), label: short(v) });
    }
    // x ticks
    const tickStep = d.horizon <= 5 ? 1 : d.horizon <= 10 ? 2 : 5;
    const xticks = [];
    for (let yr = 0; yr <= d.horizon; yr += tickStep) xticks.push(yr);
    if (xticks[xticks.length - 1] !== d.horizon) xticks.push(d.horizon);

    const hY0 = yOf(d.holdYr0),rY0 = yOf(d.reinvestYr0);

    return (
      <div className="hr-chart">
        <div className="hr-chart-head">
          <div className="hr-chart-title">Equity over {d.horizon} years</div>
          <div className="hr-chart-legend">
            <span className="key hold"><i /> Hold</span>
            <span className="key reinvest"><i /> Sell &amp; reinvest</span>
          </div>
        </div>
        <svg viewBox={'0 0 ' + W + ' ' + H} className="hr-svg" preserveAspectRatio="xMidYMid meet">
          {/* gridlines */}
          {grids.map((g, k) =>
          <g key={k}>
              <line x1={padL} y1={g.y} x2={W - padR} y2={g.y} className="hr-grid" />
              <text x={padL - 8} y={g.y + 3.5} className="hr-axis-y">{g.label}</text>
            </g>
          )}
          {/* x ticks */}
          {xticks.map((yr, k) =>
          <text key={k} x={xOf(yr)} y={H - 12} className="hr-axis-x">{yr === 0 ? 'Now' : 'Yr ' + yr}</text>
          )}

          {/* shaded deficit / lead bands */}
          {cross ?
          <>{band(0, crossIdx, 'is-deficit')}{band(crossIdx, pts.length - 1, 'is-lead')}</> :
          band(0, pts.length - 1, 'is-deficit')}

          {/* curves */}
          <path d={pathOf('hold')} className="hr-line hr-line--hold" />
          <path d={pathOf('reinvest')} className="hr-line hr-line--reinvest" />

          {/* year-0 switching-cost bracket */}
          <line x1={padL} y1={hY0} x2={padL} y2={rY0} className="hr-gap-line" />
          <circle cx={padL} cy={hY0} r="3.5" className="hr-dot hold" />
          <circle cx={padL} cy={rY0} r="3.5" className="hr-dot reinvest" />
          <g transform={'translate(' + (padL + 8) + ',' + (hY0 + rY0) / 2 + ')'}>
            <rect x="0" y="-11" width={64 + F.fmtMoneyShort(d.friction).length * 1} height="22" rx="4" className="hr-gap-tag-bg" />
            <text x="8" y="4" className="hr-gap-tag">↕ {short(d.friction)}</text>
          </g>

          {/* crossover marker */}
          {cross &&
          <g>
              <line x1={xOf(cross.yr)} y1={padT} x2={xOf(cross.yr)} y2={H - padB} className="hr-cross-line" />
              <circle cx={xOf(cross.yr)} cy={yOf(cross.val)} r="4.5" className="hr-cross-dot" />
              <g transform={'translate(' + Math.min(W - padR - 54, Math.max(padL + 54, xOf(cross.yr))) + ',12)'}>
                <rect x="-52" y="0" width="104" height="20" rx="4" className="hr-cross-tag-bg" />
                <text x="0" y="14" className="hr-cross-tag">Breaks even · Yr {d.breakEven}</text>
              </g>
            </g>
          }
        </svg>
        {!cross &&
        <div className="hr-nocross">
            Reinvest growth ({F.fmtPct(d.gReinvest, 1)}) is at or below hold growth ({F.fmtPct(d.gHold, 1)}), so the reinvested track never overtakes holding — the switching cost is permanent.
          </div>
        }
      </div>);

  }

  // ===============================================================
  // COMPARISON TILES
  // ===============================================================
  function CompareTiles({ d }) {
    const money = (n) => F.fmtMoney(n);
    const beTxt = d.breakEven ? 'Year ' + d.breakEven : 'Beyond ' + d.horizon + ' yrs';
    return (
      <div className="hr-compare">
        <div className="hr-compare-row hr-compare-head">
          <div className="cm">Metric</div>
          <div className="ch">Hold</div>
          <div className="cr">Reinvest</div>
        </div>
        <div className="hr-compare-row">
          <div className="cm">Equity today</div>
          <div className="ch">{money(d.holdYr0)}</div>
          <div className="cr">{money(d.reinvestYr0)}<span className="sub">after friction</span></div>
        </div>
        <div className="hr-compare-row">
          <div className="cm">Equity at {d.horizon} years</div>
          <div className="ch">{money(d.holdAtN)}</div>
          <div className="cr">{money(d.reinvestAtN)}</div>
        </div>
        <div className="hr-compare-row">
          <div className="cm">Est. market value at {d.horizon} years</div>
          <div className="ch">{money(d.holdValueAtN)}</div>
          <div className="cr">{money(d.reinvestValueAtN)}</div>
        </div>
        <div className="hr-compare-row">
          <div className="cm">Gain over horizon</div>
          <div className="ch pos">+{money(d.holdGain)}</div>
          <div className="cr pos">+{money(d.reinvestGain)}</div>
        </div>
        <div className="hr-compare-row hr-compare-foot">
          <div className="cm">Break-even</div>
          <div className="ch">—</div>
          <div className={'cr' + (d.breakEven ? ' win' : ' miss')}>{beTxt}</div>
        </div>
      </div>);

  }

  // ===============================================================
  // MODELING ASSUMPTIONS (permanent)
  // ===============================================================
  const ASSUMPTIONS = [
  ['Purchase price = sale price', 'New property assumed to be the same value as the one sold. Isolates growth rate vs friction — does not model scaling up or down.'],
  ['All net proceeds go to deposit', 'No outside cash injected. Deposit = sale proceeds minus all costs.'],
  ['Interest-only loans', 'Principal repayments, offset balances and debt recycling are excluded.'],
  ['Growth applies to full property value', 'Growth rates are applied to the property value, not the equity — reflecting how leveraged returns actually work.'],
  ['No rental income or expenses', 'Pure capital-growth comparison. Cashflow differences are out of scope.'],
  ['CGT and stamp duty are your estimates', 'Accuracy of the projection depends on the quality of your inputs. Speak to your accountant regarding CGT.']];


  function Assumptions() {
    return (
      <div className="hr-assume">
        <div className="hr-assume-head">Modeling assumptions <span className="sub">load-bearing for these projections</span></div>
        <div className="hr-assume-grid">
          {ASSUMPTIONS.map(([t, body], k) =>
          <div className="hr-assume-item" key={k}>
              <div className="t">{t}</div>
              <div className="b">{body}</div>
            </div>
          )}
        </div>
      </div>);

  }

  // ===============================================================
  // FULL-WIDTH ANALYSIS
  // ===============================================================
  function Analysis({ d }) {
    if (!d.ready) return null;
    if (d.blocked) {
      return (
        <div className="hr-analysis">
          <div className="hr-blocked">
            <span className="ic">!</span>
            <div>
              <div className="t">Reinvestment can't be modeled at this sale price</div>
              <div className="b">After selling costs, loan payouts{d.cgtEntered ? ', CGT' : ''} and buying costs, there's no equity left to put down on a new purchase. Raise the sale price or trim costs in Steps 1–2 to compare the two paths.</div>
            </div>
          </div>
          <Assumptions />
        </div>);

    }
    return (
      <div className="hr-analysis">
        {/* friction banner — the headline insight */}
        <div className="hr-friction">
          <div className="hr-friction-fig">{F.fmtMoney(d.friction)}</div>
          <div className="hr-friction-txt">
            <div className="t">Switching cost — <span className="pct">{F.fmtPct(d.frictionPct, 1)} of property value</span></div>
            <div className="b">This is the equity gap the reinvestment must recover before it outperforms holding.</div>
          </div>
          <div className="hr-friction-verdict">
            {d.breakEven ?
            <><span className="big">Yr {d.breakEven}</span><span className="cap">to break even</span></> :
            <><span className="big miss">Never</span><span className="cap">within {d.horizon} yrs</span></>}
          </div>
        </div>

        <div className="hr-cashflow-note">
          <span className="ic">↓</span>
          <span><strong>Note:</strong> Reinvesting also requires servicing a larger loan, which will lower your monthly cashflow. This comparison measures equity growth only — it doesn't model the higher repayments.</span>
        </div>

        <Chart d={d} />
        <CompareTiles d={d} />
        <Assumptions />
      </div>);

  }

  window.HRSummaries = Summaries;
  window.HRAnalysis = Analysis;
})();