// =====================================================================
// Folio — Model a purchase · TWEAKS
// ---------------------------------------------------------------------
// Lives inside the app's React tree (state is passed in), so toggles
// recompute the live calculator in place. Built on tweaks-panel.jsx.
// =====================================================================

(function () {
  function MPTweaks({ tweaks, setTweak, applyOutcome, presets }) {
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

        <TweakSection label="Demo outcome" />
        <TweakRadio
          label="Gearing"
          value={tweaks.outcome}
          options={[
            { value: 'negative', label: 'Negative' },
            { value: 'neutral', label: 'Neutral' },
            { value: 'positive', label: 'Positive' }
          ]}
          onChange={(v) => applyOutcome(v)}
        />
        <p style={{ fontSize: '11px', lineHeight: 1.45, color: 'rgba(41,38,27,.55)', margin: '2px 0 0' }}>{presets[tweaks.outcome].note} — adjusts rent &amp; deposit to demo the gearing band. Keep editing inputs freely.</p>
      </TweaksPanel>
    );
  }

  window.MPTweaks = MPTweaks;
})();
