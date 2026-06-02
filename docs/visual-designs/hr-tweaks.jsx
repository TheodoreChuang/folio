// =====================================================================
// Folio — Hold vs Sell and Reinvest · TWEAKS
// ---------------------------------------------------------------------
// Lives inside the app's React tree (state passed in), so toggles
// recompute the live comparison in place. Built on tweaks-panel.jsx.
// =====================================================================

(function () {
  function HRTweaks({ tweaks, setTweak, applyScenario, applyCgt, scenarios }) {
    return (
      <TweaksPanel title="Tweaks">
        <TweakSection label="Growth scenario" />
        <TweakRadio
          label="Markets"
          value={tweaks.scenario}
          options={[
            { value: 'strong', label: 'Strong' },
            { value: 'marginal', label: 'Marginal' },
            { value: 'none', label: 'No edge' }
          ]}
          onChange={(v) => applyScenario(v)}
        />
        <p style={{ fontSize: '11px', lineHeight: 1.45, color: 'rgba(41,38,27,.55)', margin: '2px 0 0' }}>{scenarios[tweaks.scenario].note}</p>

        <TweakSection label="Capital gains tax" />
        <TweakRadio
          label="CGT"
          value={tweaks.cgt}
          options={[
            { value: 'excluded', label: 'Excluded' },
            { value: 'estimate', label: 'Estimate' }
          ]}
          onChange={(v) => applyCgt(v)}
        />
        <p style={{ fontSize: '11px', lineHeight: 1.45, color: 'rgba(41,38,27,.55)', margin: '2px 0 0' }}>
          {tweaks.cgt === 'estimate'
            ? 'Seeds a sample $45k CGT to show the cash-after-tax path. Edit it in Step 1.'
            : 'No CGT applied — surfaces the “CGT excluded” note. Folio never computes CGT.'}
        </p>
      </TweaksPanel>
    );
  }

  window.HRTweaks = HRTweaks;
})();
