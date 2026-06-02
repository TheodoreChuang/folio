// =====================================================================
// Folio — Rate sensitivity · APP (state + tweaks + mount)
// ---------------------------------------------------------------------
// Owns the single input (the rate move δ), runs the engine on every
// change, and renders: slider (full-width) → outputs, inside the .calc
// shell. The Tweaks panel shares this tree so it recomputes in place.
// =====================================================================

(function () {
  const { useState, useEffect } = React;
  const F = window.RS;
  const LS = 'folio.rs.delta';
  const LS_T = 'folio.rs.tweaks';

  function App() {
    const [delta, setDelta] = useState(() => {
      try { const s = localStorage.getItem(LS); if (s != null) return F.num(s); } catch (e) {}
      return F.RANGE.default;
    });
    const [tweaks, setTweaks] = useState(() => {
      try { const s = localStorage.getItem(LS_T); if (s) return JSON.parse(s); } catch (e) {}
      return { household: 'populated' };
    });

    useEffect(() => { try { localStorage.setItem(LS, String(delta)); } catch (e) {} }, [delta]);
    useEffect(() => { try { localStorage.setItem(LS_T, JSON.stringify(tweaks)); } catch (e) {} }, [tweaks]);

    const setTweak = (k, v) => setTweaks((prev) => ({ ...prev, [k]: v }));
    const applyMove = (m) => setDelta(m);

    const d = F.calc(delta);

    const Slider = window.RSSlider;
    const Outputs = window.RSOutputs;
    const Tweaks = window.RSTweaks;

    return (
      <>
        <section className="calc" id="rate-sensitivity">
          <div className="calc-head">
            <div className="title-block">
              <div className="title">Rate sensitivity</div>
              <div className="sub">Move every variable loan rate by the same amount and watch the cashflow.</div>
            </div>
          </div>

          <div className="calc-body is-stacked rs-body">
            {/* ----- the one input ----- */}
            <div className="rs-control">
              <div className="calc-section-label">Move all variable rates by</div>
              <Slider value={delta} onChange={setDelta} />
            </div>

            {/* ----- the results ----- */}
            <Outputs d={d} household={tweaks.household} />
          </div>

          <div className="calc-foot">
            <span>Cashflow assumes current rents · expenses · trailing 12-month average · fixed loans excluded</span>
          </div>
        </section>

        <Tweaks tweaks={tweaks} setTweak={setTweak} applyMove={applyMove} delta={delta} />
      </>
    );
  }

  window.RSApp = App;

  function mount() {
    const root = document.getElementById('rs-root');
    if (!root || !window.RSSlider || !window.RSOutputs || !window.RSTweaks) {
      return setTimeout(mount, 30);
    }
    ReactDOM.createRoot(root).render(<App />);
  }
  mount();
})();
