// =====================================================================
// Folio — Model a purchase · INPUTS column
// ---------------------------------------------------------------------
// Controlled form. Every change calls setField(path, value) on the
// parent, which recomputes the outputs. Exposes window.MPInputs.
// =====================================================================

(function () {
  const { useState } = React;
  const F = window.MP;

  // Currency input with a $ prefix; emits a plain number string.
  function Money({ value, onChange, placeholder, suffix, prefix = '$' }) {
    return (
      <div className="input-affix">
        {prefix ? <span className="prefix">{prefix}</span> : null}
        <input
          className="input num"
          inputMode="decimal"
          value={value === 0 || value === '' || value == null ? '' : Number(value).toLocaleString('en-AU')}
          placeholder={placeholder || '0'}
          onChange={(e) => onChange(F.num(e.target.value))}
        />
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </div>
    );
  }

  // Percentage input that keeps a local draft string so a decimal point can be
  // typed freely (a controlled numeric value would strip "12." back to "12").
  function Pct({ value, onChange, suffix = '%', inputMode = 'decimal' }) {
    const [draft, setDraft] = React.useState(null);
    const shown = draft != null ? draft : Number(Number(value).toFixed(1)).toString();
    return (
      <div className="input-affix">
        <input
          className="input num"
          inputMode={inputMode}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value;
            // Allow digits, one dot, optional sign while editing.
            if (/^-?\d*\.?\d*$/.test(raw)) {
              setDraft(raw);
              onChange(F.num(raw));
            }
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="suffix">{suffix}</span>
      </div>
    );
  }

  function Collapsible({ id, title, summary, open, onToggle, children }) {
    return (
      <div className={'mp-collapse' + (open ? ' is-open' : '')}>
        <button type="button" className="mp-collapse-head" onClick={onToggle} aria-expanded={open}>
          <span className="twist" />
          <span className="ttl">{title}</span>
          {summary}
        </button>
        <div className="mp-collapse-body">{children}</div>
      </div>
    );
  }

  function Inputs({ input, setField, derived }) {
    const [costsOpen, setCostsOpen] = useState(false);
    const [runningOpen, setRunningOpen] = useState(false);

    // ---- summaries for collapsed sections ----
    const costItems = F.PURCHASE_COST_FIELDS.filter(f => F.num(input.purchaseCosts[f.key]) > 0);
    const costsSummary = costItems.length
      ? <span className="summary"><span className="n">{costItems.length}</span> item{costItems.length > 1 ? 's' : ''} · <span className="n">{F.fmtMoney(derived.purchaseCostsTotal)}</span></span>
      : <span className="summary empty">Optional — none added</span>;

    const rcItems = F.RUNNING_COST_FIELDS.filter(f => F.num((input.runningCosts || {})[f.key]) > 0);
    const rcSummary = rcItems.length
      ? <span className="summary"><span className="n">{rcItems.length}</span> item{rcItems.length > 1 ? 's' : ''} · <span className="n">{F.fmtMoney(derived.runningCostsMo * 12)}</span>/yr</span>
      : <span className="summary empty">Optional — none added</span>;

    const isIO = input.loan.type === 'io';
    const lvrWarn = derived.newPropLVR > 0.8;

    return (
      <div className="inputs">
        {/* ----- Property ----- */}
        <div className="mp-section">
          <div className="calc-section-label">Property</div>
          <div className="calc-input-row">
            <label>Purchase price</label>
            <Money value={input.price} onChange={(v) => setField('price', v)} placeholder="780,000" />
          </div>
          <div className="calc-input-row" style={{ marginTop: 'var(--space-5)' }}>
            <label>Weekly rent</label>
            <Money value={input.weeklyRent} onChange={(v) => setField('weeklyRent', v)} suffix="/ wk" placeholder="640" />
          </div>
        </div>

        {/* ----- Deposit & source ----- */}
        <div className="mp-section">
          <div className="calc-section-label">Deposit</div>
          <div className="mp-row-2">
            <div className="calc-input-row">
              <label>Deposit amount</label>
              <Money
                value={Math.round(derived.deposit)}
                onChange={(v) => setField('depositPct', input.price > 0 ? (v / input.price) * 100 : 0)}
                placeholder="156,000" />
            </div>
            <div className="calc-input-row">
              <label>Deposit %</label>
              <Pct value={input.depositPct}
                onChange={(v) => setField('depositPct', v)} />
            </div>
          </div>
          <div className="mp-deposit-line">
            <span>New loan {F.fmtMoney(derived.baseLoan)}{derived.lmi > 0 ? ' + ' + F.fmtMoney(derived.lmi) + ' LMI' : ''}</span>
            <span className={'lvr' + (lvrWarn ? ' is-warn' : '')}>
              LVR <strong>{F.fmtPct(derived.newPropLVR)}</strong>{lvrWarn ? ' · under 20%' : ''}
            </span>
          </div>

          {derived.lmiRequired && (
            <div className="calc-input-row mp-lmi-row" style={{ marginTop: 'var(--space-4)' }}>
              <label>LMI<span className="hint">deposit under 20% — capitalised onto the loan</span></label>
              <Money value={F.num(input.lmi)} onChange={(v) => setField('lmi', v)} placeholder="0" />
            </div>
          )}

          <div className="calc-input-row" style={{ marginTop: 'var(--space-5)' }}>
            <label>Funded from</label>
            <div className="seg mp-seg">
              {[['equity', 'Equity'], ['cash', 'Cash'], ['mix', 'Both']].map(([val, lbl]) => (
                <button key={val} type="button" className={input.source === val ? 'is-on' : ''}
                  onClick={() => setField('source', val)}>{lbl}</button>
              ))}
            </div>
          </div>

          {(input.source === 'equity' || input.source === 'mix') && (
            <div className="mp-equity-list">
              {F.PORTFOLIO.properties.map(p => {
                const maxDraw = F.maxEquityDraw(p);          // up to 100% LVR
                const on = !!input.equityChecked[p.id];
                const none = maxDraw <= 0;
                const draw = Math.min(F.num(input.equityDraws[p.id]), maxDraw);
                const curLVR = p.value > 0 ? p.debt / p.value : 0;
                const newLVR = p.value > 0 ? (p.debt + draw) / p.value : 0;
                const setDraw = (v) => setField('equityDraws.' + p.id, Math.max(0, Math.min(maxDraw, Math.round(F.num(v)))));
                return (
                  <div key={p.id} className={'mp-equity-item' + (on ? ' is-on' : '') + (none ? ' is-depleted' : '')}>
                    <label className="mp-equity-head">
                      <input type="checkbox" className="mp-check" checked={on} disabled={none}
                        onChange={(e) => {
                          setField('equityChecked.' + p.id, e.target.checked);
                          // Auto-fill a sensible draw the first time it's ticked.
                          if (e.target.checked && F.num(input.equityDraws[p.id]) === 0) {
                            const need = Math.max(0, derived.fundsRequired - derived.equityDrawn);
                            setField('equityDraws.' + p.id, Math.min(maxDraw, Math.round(need)));
                          }
                        }} />
                      <span className="meta">
                        <div className="nm">{p.name}</div>
                        <div className={'eq' + (none ? ' none' : '')}>
                          {none ? 'Already at 100% LVR' : F.fmtMoney(p.value) + ' · ' + F.fmtPct(curLVR) + ' LVR now'}
                        </div>
                      </span>
                    </label>
                    {on && !none && (
                      <div className="mp-equity-draw">
                        <div className="ed-fields">
                          <div className="ed-field">
                            <label>Draw</label>
                            <Money value={draw} onChange={setDraw} />
                          </div>
                          <div className="ed-field">
                            <label>To LVR</label>
                            <div className="input-affix">
                              <input className="input num" inputMode="decimal"
                                value={Number((newLVR * 100).toFixed(0)).toString()}
                                onChange={(e) => {
                                  const lvr = Math.min(100, Math.max(0, F.num(e.target.value)));
                                  setDraw(lvr / 100 * p.value - p.debt);
                                }} />
                              <span className="suffix">%</span>
                            </div>
                          </div>
                        </div>
                        <div className="ed-meter">
                          <span className="bar">
                            <span className="was" style={{ width: (curLVR * 100) + '%' }} />
                            <span className="add" style={{ left: (curLVR * 100) + '%', width: Math.max(0, (newLVR - curLVR) * 100) + '%' }} />
                            <span className="tick" style={{ left: '80%' }} />
                          </span>
                          <span className="cap">80% common cap · up to {F.fmtMoney(maxDraw)} at 100%</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* allocation status */}
          {input.source === 'mix' && derived.ready && (
            <div className="mp-cash-note">
              Remaining <strong>{F.fmtMoney(Math.max(0, derived.cashContribution))}</strong> funded by cash
            </div>
          )}
          {derived.ready && (
            <div className={'mp-alloc ' + (Math.abs(derived.shortfall) < 1 ? 'is-ok' : derived.shortfall > 0 ? 'is-short' : '')}>
              <span className="k">
                {Math.abs(derived.shortfall) < 1 ? 'Funds fully allocated'
                  : derived.shortfall > 0 ? 'Still to fund'
                  : 'Over-allocated'}
              </span>
              <span className="v">
                {Math.abs(derived.shortfall) < 1 ? F.fmtMoney(derived.fundsRequired)
                  : F.fmtMoney(Math.abs(derived.shortfall))}
              </span>
            </div>
          )}
        </div>

        {/* ----- Purchase costs (collapsible) ----- */}
        <div className="mp-section">
          <div className="calc-section-label">Purchase costs</div>
          <Collapsible title="One-off costs" summary={costsSummary}
            open={costsOpen} onToggle={() => setCostsOpen(o => !o)}>
            <div className="mp-cost-grid">
              {F.PURCHASE_COST_FIELDS.map(f => (
                <div key={f.key} className="mp-cost-field">
                  <label>{f.label}</label>
                  <Money value={F.num(input.purchaseCosts[f.key])}
                    onChange={(v) => setField('purchaseCosts.' + f.key, v)} />
                </div>
              ))}
            </div>
          </Collapsible>
        </div>

        {/* ----- New loan ----- */}
        <div className="mp-section">
          <div className="calc-section-label">New loan</div>
          <div className="mp-row-2">
            <div className="calc-input-row">
              <label>Interest rate</label>
              <Pct value={input.loan.ratePct}
                onChange={(v) => setField('loan.ratePct', v)} suffix="% p.a." />
            </div>
            <div className="calc-input-row">
              <label>Repayment type</label>
              <div className="seg mp-seg">
                <button type="button" className={isIO ? 'is-on' : ''} onClick={() => setField('loan.type', 'io')}>Interest-only</button>
                <button type="button" className={!isIO ? 'is-on' : ''} onClick={() => setField('loan.type', 'pi')}>P&amp;I</button>
              </div>
            </div>
          </div>
          <div className="mp-row-2" style={{ marginTop: 'var(--space-5)' }}>
            {isIO && (
              <div className="calc-input-row">
                <label>IO term</label>
                <div className="input-affix">
                  <input className="input num" inputMode="numeric"
                    value={Number(input.loan.ioTermYrs).toString()}
                    onChange={(e) => setField('loan.ioTermYrs', F.num(e.target.value))} />
                  <span className="suffix">yr</span>
                </div>
              </div>
            )}
            <div className="calc-input-row">
              <label>Loan term</label>
              <div className="input-affix">
                <input className="input num" inputMode="numeric"
                  value={Number(input.loan.termYrs).toString()}
                  onChange={(e) => setField('loan.termYrs', F.num(e.target.value))} />
                <span className="suffix">yr</span>
              </div>
            </div>
          </div>
        </div>

        {/* ----- Running costs (collapsible) ----- */}
        <div className="mp-section">
          <div className="calc-section-label">Running costs</div>
          <Collapsible title="Annual holding costs" summary={rcSummary}
            open={runningOpen} onToggle={() => setRunningOpen(o => !o)}>
            <div className="mp-cost-grid">
              {F.RUNNING_COST_FIELDS.map(f => (
                <div key={f.key} className="mp-cost-field">
                  <label>{f.label}{f.hint ? <span className="hint">{f.hint}</span> : null}</label>
                  <Money value={F.num((input.runningCosts || {})[f.key])}
                    prefix={f.pct ? '' : '$'} suffix={f.pct ? '%' : '/ yr'}
                    onChange={(v) => setField('runningCosts.' + f.key, v)} />
                </div>
              ))}
            </div>
          </Collapsible>
        </div>
      </div>
    );
  }

  window.MPInputs = Inputs;
})();
