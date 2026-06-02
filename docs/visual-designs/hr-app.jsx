// =====================================================================
// Folio — Hold vs Sell and Reinvest · APP (state + tweaks + mount)
// ---------------------------------------------------------------------
// Owns the single inputs object, runs the engine on every change, and
// lays out: Inputs | Summaries  (two columns), then the full-width
// Analysis (friction, chart, comparison, assumptions, disclaimer).
// The Tweaks panel shares this tree so toggles recompute live.
// =====================================================================

(function () {
  const { useState, useEffect } = React;
  const F = window.HR;
  const LS = 'folio.hr.input';
  const LS_T = 'folio.hr.tweaks';

  function freshInput() {
    const d = F.DEFAULTS;
    return {
      ...d,
      sellingCosts: { ...d.sellingCosts },
      buyingCosts: { ...d.buyingCosts }
    };
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    const next = Array.isArray(obj) ? obj.slice() : { ...obj };
    let cur = next;
    for (let k = 0; k < keys.length - 1; k++) {
      cur[keys[k]] = { ...cur[keys[k]] };
      cur = cur[keys[k]];
    }
    cur[keys[keys.length - 1]] = value;
    return next;
  }

  // Growth-scenario presets (Tweaks demo helper).
  const SCENARIOS = {
    strong:   { gHold: 3.0, gReinvest: 6.0, note: 'Target market grows ~2× the held property — reinvest overtakes early.' },
    marginal: { gHold: 4.0, gReinvest: 5.0, note: 'A slight growth edge — friction takes most of the horizon to recover.' },
    none:     { gHold: 5.0, gReinvest: 4.0, note: 'Target grows slower than what you hold — the switch never pays off.' }
  };

  function App() {
    const [input, setInput] = useState(() => {
      try { const s = localStorage.getItem(LS); if (s) return { ...freshInput(), ...JSON.parse(s) }; } catch (e) {}
      return freshInput();
    });
    const [tweaks, setTweaks] = useState(() => {
      try { const s = localStorage.getItem(LS_T); if (s) return JSON.parse(s); } catch (e) {}
      return { scenario: 'strong', cgt: 'excluded' };
    });

    useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(input)); } catch (e) {} }, [input]);
    useEffect(() => { try { localStorage.setItem(LS_T, JSON.stringify(tweaks)); } catch (e) {} }, [tweaks]);

    // setField with a couple of special paths.
    const setField = (path, value) => {
      if (path === '__property') {
        const p = F.propById(value);
        setInput((prev) => ({ ...prev, propertyId: value, salePrice: p.value }));
        return;
      }
      setInput((prev) => setPath(prev, path, value));
    };
    const setTweak = (k, v) => setTweaks((prev) => ({ ...prev, [k]: v }));

    function applyScenario(name) {
      setTweak('scenario', name);
      const s = SCENARIOS[name];
      setInput((prev) => ({ ...prev, gHold: s.gHold, gReinvest: s.gReinvest }));
    }
    function applyCgt(mode) {
      setTweak('cgt', mode);
      setInput((prev) => ({ ...prev, cgt: mode === 'estimate' ? 45000 : '' }));
    }

    const d = F.calc(input);

    const Inputs = window.HRInputs;
    const Summaries = window.HRSummaries;
    const Analysis = window.HRAnalysis;
    const Tweaks = window.HRTweaks;

    return (
      <>
        <section className="calc" id="hold-reinvest">
          <div className="calc-head">
            <div className="title-block">
              <div className="title">Hold vs Sell and Reinvest</div>
              <div className="sub">Compare holding a property against selling and reinvesting the proceeds in a higher-growth market.</div>
            </div>
          </div>
          <div className="calc-body hr-body">
            <Inputs input={input} setField={setField} d={d} />
            <Summaries input={input} d={d} />
          </div>
          <Analysis d={d} />
          <div className="calc-foot">
            <span>Capital-growth comparison only · loans held static · CGT &amp; stamp duty are your estimates</span>
            <span className="right">
              <a href="#" className="reset-link" onClick={(e) => { e.preventDefault(); setInput(freshInput()); }}>Reset</a>
            </span>
          </div>
        </section>

        <Tweaks tweaks={tweaks} setTweak={setTweak} applyScenario={applyScenario} applyCgt={applyCgt} scenarios={SCENARIOS} />
      </>
    );
  }

  window.HRApp = App;

  function mount() {
    const root = document.getElementById('hr-root');
    if (!root || !window.HRInputs || !window.HRSummaries || !window.HRAnalysis || !window.HRTweaks) {
      return setTimeout(mount, 30);
    }
    ReactDOM.createRoot(root).render(<App />);
  }
  mount();
})();
