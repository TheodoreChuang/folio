// =====================================================================
// Folio — Interest-only rollover · TWEAKS
// ---------------------------------------------------------------------
// Lives inside the app's React tree so toggles recompute in place.
//   • Preview portfolio — stress-test the timeline + chart at 1 / 2 / 8 loans
// Built on tweaks-panel.jsx.
// =====================================================================

(function () {
  function IOTweaks({ tweaks, setTweak }) {
    return (
      <TweaksPanel title="Tweaks">
        <TweakSection label="Preview portfolio" />
        <TweakRadio
          label="Loans"
          value={tweaks.preview}
          options={[
            { value: 'single', label: '1' },
            { value: 'current', label: '2' },
            { value: 'many', label: '8' }
          ]}
          onChange={(v) => setTweak('preview', v)}
        />
        <p style={{ fontSize: '11px', lineHeight: 1.45, color: 'rgba(41,38,27,.55)', margin: '2px 0 0' }}>
          Swaps in synthetic books so you can see how the timeline and cashflow chart hold up as the portfolio grows.
        </p>
      </TweaksPanel>
    );
  }

  window.IOTweaks = IOTweaks;
})();
