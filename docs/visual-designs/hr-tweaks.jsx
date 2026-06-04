// =====================================================================
// Folio — Hold vs Sell and Reinvest · TWEAKS
// ---------------------------------------------------------------------
// Lives inside the app's React tree (state passed in), so toggles
// recompute the live comparison in place. Built on tweaks-panel.jsx.
// =====================================================================

(function () {
  function HRTweaks({ tweaks, cgtMode, setTweak, applyScenario, applyCgt, scenarios }) {
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
          value={cgtMode || 'estimate'}
          options={[
            { value: 'estimate', label: 'Estimate' },
            { value: 'manual', label: 'Manual' }
          ]}
          onChange={(v) => applyCgt(v)}
        />
        <p style={{ fontSize: '11px', lineHeight: 1.45, color: 'rgba(41,38,27,.55)', margin: '2px 0 0' }}>
          {cgtMode === 'manual'
            ? 'Type your own CGT in Step 1 (leave it blank to exclude CGT entirely).'
            : 'Folio estimates CGT from the cost base, discount and marginal rate. Refine the inputs in Step 1.'}
        </p>
      </TweaksPanel>
    );
  }

  window.HRTweaks = HRTweaks;
})();
