// =====================================================================
// Folio — Model a purchase · APP (state + tweaks + mount)
// ---------------------------------------------------------------------
// Owns the single inputs object, runs the engine on every change, and
// renders Inputs + Outputs side by side inside the .calc shell.
// The Tweaks panel lives in this same React tree so it shares state:
//   • Impact tiles — A inline / B track / C ledger
//   • Household    — populated bar / set-up prompt
//   • Outcome      — quick presets to demo neg / neutral / pos gearing
//   • (empty state is reachable by clearing price/rent)
// =====================================================================

(function () {
  const { useState, useEffect } = React;
  const F = window.MP;
  const LS = 'folio.mp.input';
  const LS_T = 'folio.mp.tweaks';

  // deep-ish clone of defaults so we never mutate the shared object
  function freshInput() {
    const d = F.DEFAULTS;
    return {
      ...d,
      equityDraws: { ...d.equityDraws },
      equityChecked: { ...d.equityChecked },
      purchaseCosts: { ...d.purchaseCosts },
      loan: { ...d.loan },
      runningCosts: { ...d.runningCosts }
    };
  }

  // set a value at a dot-path ('loan.ratePct', 'equityDraws.elm') immutably
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

  // ----- Outcome presets (demo helper in Tweaks) -------------------
  const PRESETS = {
    negative: { weeklyRent: 640, 'loan.type': 'io', depositPct: 20, note: 'High price, IO loan' },
    neutral: { weeklyRent: 880, 'loan.type': 'io', depositPct: 35, note: 'Strong rent, big deposit' },
    positive: { weeklyRent: 1040, 'loan.type': 'io', depositPct: 45, note: 'High yield, large deposit' }
  };

  function App() {
    const [input, setInput] = useState(() => {
      try {const s = localStorage.getItem(LS);if (s) return { ...freshInput(), ...JSON.parse(s) };} catch (e) {}
      return freshInput();
    });
    const [tweaks, setTweaks] = useState(() => {
      try {const s = localStorage.getItem(LS_T);if (s) return JSON.parse(s);} catch (e) {}
      return { household: 'populated', outcome: 'negative' };
    });

    useEffect(() => {try {localStorage.setItem(LS, JSON.stringify(input));} catch (e) {}}, [input]);
    useEffect(() => {try {localStorage.setItem(LS_T, JSON.stringify(tweaks));} catch (e) {}}, [tweaks]);

    const setField = (path, value) => setInput((prev) => setPath(prev, path, value));
    const setTweak = (k, v) => setTweaks((prev) => ({ ...prev, [k]: v }));

    function applyOutcome(name) {
      setTweak('outcome', name);
      const preset = PRESETS[name];
      setInput((prev) => {
        let next = prev;
        Object.entries(preset).forEach(([k, v]) => {if (k !== 'note') next = setPath(next, k, v);});
        return next;
      });
    }

    const d = F.calc(input);

    const Inputs = window.MPInputs;
    const Outputs = window.MPOutputs;
    const Tweaks = window.MPTweaks;

    return (
      <>
        <section className="calc" id="model-purchase">
          <div className="calc-head">
            <div className="title-block">
              <div className="title">Model a purchase</div>
              <div className="sub">Estimate the impact your next purchase on your portfolio.</div>
            </div>
          </div>
          <div className="calc-body">
            <Inputs input={input} setField={setField} derived={d} />
            <Outputs input={input} d={d} household={tweaks.household} />
          </div>
          <div className="calc-foot">
            <span>Cashflow assumes current rents · expenses · trailing 12-month average · tax  implications not considered</span>
            <span className="right">
              <a href="#" className="reset-link" onClick={(e) => {e.preventDefault();setInput(freshInput());}}>Reset</a>
            </span>
          </div>
        </section>

        <Tweaks tweaks={tweaks} setTweak={setTweak} applyOutcome={applyOutcome} presets={PRESETS} />
      </>);

  }

  window.MPApp = App;

  function mount() {
    const root = document.getElementById('mp-root');
    if (!root || !window.MPInputs || !window.MPOutputs || !window.MPTweaks) {
      return setTimeout(mount, 30);
    }
    ReactDOM.createRoot(root).render(<App />);
  }
  mount();
})();