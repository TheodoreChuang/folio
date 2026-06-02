// =====================================================================
// Folio — Hold vs Sell and Reinvest · INPUTS column
// ---------------------------------------------------------------------
// Controlled three-step form. Every change calls setField(path, value)
// on the parent, which recomputes the comparison. Exposes window.HRInputs.
//   Step 1 — Sale          (property, price, selling costs, CGT)
//   Step 2 — Reinvestment  (purchase price fixed, buying costs)
//   Step 3 — Comparison    (growth rates, time horizon)
// =====================================================================

(function () {
  const { useState } = React;
  const F = window.HR;

  // Currency input with a $ prefix. Emits a plain number; "" stays "".
  function Money({ value, onChange, placeholder, suffix, prefix = '$', allowBlank }) {
    const display = value === '' || value == null ? '' :
    value === 0 && allowBlank ? '' : Number(value).toLocaleString('en-AU');
    return (
      <div className="input-affix">
        {prefix ? <span className="prefix">{prefix}</span> : null}
        <input
          className="input num"
          inputMode="decimal"
          value={display}
          placeholder={placeholder || '0'}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange(raw === '' ? '' : F.num(raw));
          }} />
        
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </div>);

  }

  function Pct({ value, onChange, dp = 1 }) {
    return <DecimalInput value={value} onChange={onChange} suffix="% p.a." />;
  }

  // Decimal/percent input that keeps the user's raw keystrokes (e.g. "2."
  // or "2.5") in a local buffer while focused, so trailing dots and
  // mid-typing decimals aren't reparsed away. Emits a number to the parent.
  function DecimalInput({ value, onChange, suffix, prefix, className }) {
    const [buf, setBuf] = useState(null); // null → show the canonical prop value
    const shown = buf != null ? buf : value === '' || value == null ? '' : String(value);
    return (
      <div className={'input-affix' + (className ? ' ' + className : '')}>
        {prefix ? <span className="prefix">{prefix}</span> : null}
        <input className="input num" inputMode="decimal"
        value={shown}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.\-]/g, '');
          setBuf(raw);
          onChange(raw === '' || raw === '.' || raw === '-' ? 0 : F.num(raw));
        }}
        onBlur={() => setBuf(null)} />
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </div>);

  }

  function Collapsible({ title, summary, open, onToggle, children }) {
    return (
      <div className={'mp-collapse' + (open ? ' is-open' : '')}>
        <button type="button" className="mp-collapse-head" onClick={onToggle} aria-expanded={open}>
          <span className="twist" />
          <span className="ttl">{title}</span>
          {summary}
        </button>
        <div className="mp-collapse-body">{children}</div>
      </div>);

  }

  function Inputs({ input, setField, d }) {
    const [buyOpen, setBuyOpen] = useState(true);

    const bcItems = F.BUYING_COST_FIELDS.filter((f) => F.num((input.buyingCosts || {})[f.key]) > 0);
    const buySummary = bcItems.length ?
    <span className="summary"><span className="n">{bcItems.length}</span> item{bcItems.length > 1 ? 's' : ''} · <span className="n">{F.fmtMoney(d.buyingCosts.total)}</span></span> :
    <span className="summary empty">Optional — none added</span>;

    const delta = d.priceDelta;
    const deltaTxt = delta === 0 ? 'Matches latest valuation' :
    (delta > 0 ? '+' : '−') + F.fmtMoney(Math.abs(delta)).replace('−', '') + ' vs latest valuation';

    return (
      <div className="inputs">

        {/* ============ STEP 1 — SALE ============ */}
        <div className="mp-section hr-step">
          <div className="hr-step-head">
            <span className="hr-step-no">1</span>
            <span className="hr-step-ttl">Sale</span>
          </div>

          <div className="calc-input-row">
            <label>Property to sell</label>
            <select className="select" value={input.propertyId}
            onChange={(e) => setField('__property', e.target.value)}>
              {F.PROPERTIES.map((p) =>
              <option key={p.id} value={p.id}>
                  {p.name} · {p.suburb} · {F.fmtMoneyShort(p.value)}
                </option>
              )}
            </select>
          </div>

          <div className="calc-input-row" style={{ marginTop: 'var(--space-5)' }}>
            <label>Sale price</label>
            <Money value={input.salePrice} onChange={(v) => setField('salePrice', v)} placeholder="640,000" />
            <div className={'hr-delta' + (delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : '')}>{deltaTxt}</div>
          </div>

          <div className="hr-sub-label"><span className="lab">Selling costs</span><span className="opt">all optional</span></div>
          <div className="calc-input-row">
            <label>Agent commission</label>
            <div className="hr-pair">
              <DecimalInput className="hr-pct-narrow" value={input.agentPct} suffix="%"
              onChange={(v) => setField('agentPct', v)} />
              <span className="hr-pair-out">{F.fmtMoney(d.sellingCosts.agent)}</span>
            </div>
          </div>
          <div className="mp-cost-grid" style={{ marginTop: 'var(--space-4)' }}>
            {F.SELLING_COST_FIELDS.map((f) =>
            <div key={f.key} className="mp-cost-field">
                <label>{f.label}</label>
                <Money value={(input.sellingCosts || {})[f.key]} allowBlank
              onChange={(v) => setField('sellingCosts.' + f.key, v)} />
              </div>
            )}
          </div>

          <div className="hr-sub-label"><span className="lab">Capital gains tax</span><span className="opt">optional estimate</span></div>
          <div className="calc-input-row">
            <Money value={input.cgt} allowBlank
            onChange={(v) => setField('cgt', v)} placeholder="Estimated CGT" />
            <div className="input-help hr-cgt-help">
              CGT can be substantial. Enter your estimate to see cash after tax. It depends on ownership history, depreciation claimed, and your marginal rate.
            </div>
          </div>
        </div>

        {/* ============ STEP 2 — REINVESTMENT COSTS ============ */}
        <div className="mp-section hr-step">
          <div className="hr-step-head">
            <span className="hr-step-no">2</span>
            <span className="hr-step-ttl">Reinvestment costs</span>
          </div>

          <div className="hr-fixed-row">
            <div className="hr-fixed-k">New purchase price</div>
            <div className="hr-fixed-v">{F.fmtMoney(d.purchasePrice)}</div>
            <div className="hr-fixed-note">Fixed to the sale price — an equal-value baseline so the comparison isolates growth vs friction, not asset scale.</div>
          </div>

          <Collapsible title="Buying costs" summary={buySummary}
          open={buyOpen} onToggle={() => setBuyOpen((o) => !o)}>
            <div className="mp-cost-grid">
              {F.BUYING_COST_FIELDS.map((f) =>
              <div key={f.key} className="mp-cost-field">
                  <label>{f.label}</label>
                  <Money value={(input.buyingCosts || {})[f.key]} allowBlank
                onChange={(v) => setField('buyingCosts.' + f.key, v)} />
                </div>
              )}
            </div>
            <p className="hr-fineprint">
              <strong>Upfront maintenance</strong> covers known make-ready costs.
            </p>
          </Collapsible>

          {/* LMI — conditional on LVR > 80% */}
          {d.ready && !d.blocked && d.lmiRequired &&
          <div className="hr-lmi">
              <div className="hr-lmi-head">
                <span className="hr-lmi-flag">LMI likely</span>
                <span>New loan is <strong>{F.fmtPct(d.lvr)}</strong> of the purchase price — over the 80% threshold.</span>
              </div>
              <div className="calc-input-row" style={{ marginTop: 'var(--space-3)' }}>
                <label>Lender's LMI estimate<span className="hint">added to the new loan</span></label>
                <Money value={input.lmi} allowBlank onChange={(v) => setField('lmi', v)} placeholder="0" />
              </div>
            </div>
          }
        </div>

        {/* ============ STEP 3 — COMPARISON PARAMETERS ============ */}
        <div className="mp-section hr-step">
          <div className="hr-step-head">
            <span className="hr-step-no">3</span>
            <span className="hr-step-ttl">Comparison</span>
          </div>

          <div className="mp-row-2">
            <div className="calc-input-row">
              <label>Growth if held<span className="hint">current property</span></label>
              <Pct value={input.gHold} onChange={(v) => setField('gHold', v)} />
            </div>
            <div className="calc-input-row">
              <label>Growth if reinvested<span className="hint">new market</span></label>
              <Pct value={input.gReinvest} onChange={(v) => setField('gReinvest', v)} />
            </div>
          </div>

          <div className="calc-input-row" style={{ marginTop: 'var(--space-5)' }}>
            <label>Time horizon</label>
            <div className="seg hr-seg">
              {F.HORIZONS.map((h) =>
              <button key={h} type="button" className={input.horizon === h ? 'is-on' : ''}
              onClick={() => setField('horizon', h)}>{h}yr</button>
              )}
            </div>
          </div>
        </div>
      </div>);

  }

  window.HRInputs = Inputs;
})();