// =====================================================================
// Folio — Interest-only rollover · APP (state + tweaks + mount)
// ---------------------------------------------------------------------
// Owns the assumptions (per-loan P&I rates, preview portfolio size),
// runs the engine, and renders the three sections inside the page.
// The Tweaks panel shares this tree.
// =====================================================================

(function () {
  const { useState, useEffect } = React;
  const F = window.IO;
  const LS = 'folio.io.state';

  function loadState() {
    try { const s = localStorage.getItem(LS); if (s) return JSON.parse(s); } catch (e) {}
    return {};
  }

  function App() {
    const saved = loadState();
    const [piRates, setPiRates] = useState(saved.piRates || {}); // { id: ratePct }
    const [tweaks, setTweaks] = useState(saved.tweaks || { preview: 'current' });

    useEffect(() => {
      try { localStorage.setItem(LS, JSON.stringify({ piRates, tweaks })); } catch (e) {}
    }, [piRates, tweaks]);

    const setTweak = (k, v) => setTweaks((prev) => ({ ...prev, [k]: v }));

    const loans = tweaks.preview === 'many' ? F.MANY
      : tweaks.preview === 'single' ? F.LOANS.slice(0, 1)
      : F.LOANS;

    const d = F.compute({ loans, piRates });

    const onLoanRate = (id, v) => setPiRates((prev) => ({ ...prev, [id]: v }));

    const Verdict = window.IOVerdict;
    const Schedule = window.IOSchedule;
    const Cashflow = window.IOCashflow;
    const Tweaks = window.IOTweaks;

    return (
      <>
        <div className="io-stack">
          <Verdict d={d} />
          <Schedule d={d} onLoanRate={onLoanRate} />
          <Cashflow d={d} />
        </div>
        <Tweaks tweaks={tweaks} setTweak={setTweak} />
      </>
    );
  }

  window.IOApp = App;

  function mount() {
    const root = document.getElementById('io-root');
    if (!root || !window.IOVerdict || !window.IOSchedule || !window.IOCashflow || !window.IOTweaks) {
      return setTimeout(mount, 30);
    }
    ReactDOM.createRoot(root).render(<App />);
  }
  mount();
})();
