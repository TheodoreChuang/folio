// =====================================================================
// Folio — Rate sensitivity · TWEAKS
// ---------------------------------------------------------------------
// Lives inside the app's React tree (state passed in) so toggles
// recompute the live calculator in place. Built on tweaks-panel.jsx.
// =====================================================================

(function () {
  function RSTweaks({ tweaks, setTweak, applyMove, delta }) {
    return (
      <TweaksPanel title="Tweaks">
        <TweakSection label="Household surplus" />
        <TweakRadio
          label="State"
          value={tweaks.household}
          options={[
            { value: 'populated', label: 'Has data' },
            { value: 'empty', label: 'Not set up' }
          ]}
          onChange={(v) => setTweak('household', v)}
        />

        <TweakSection label="Quick move" />
        <TweakRadio
          label="Jump slider to"
          value={[-1, 0.5, 1, 2].some((m) => Math.abs(m - delta) < 0.001) ? String(delta) : 'custom'}
          options={[
            { value: '-1', label: '−1%' },
            { value: '0.5', label: '+0.5%' },
            { value: '1', label: '+1%' },
            { value: '2', label: '+2%' }
          ]}
          onChange={(v) => applyMove(parseFloat(v))}
        />
        <p style={{ fontSize: '11px', lineHeight: 1.45, color: 'rgba(41,38,27,.55)', margin: '2px 0 0' }}>
          Sets the rate move across all variable loans. You can still drag the slider freely.
        </p>
      </TweaksPanel>
    );
  }

  window.RSTweaks = RSTweaks;
})();
