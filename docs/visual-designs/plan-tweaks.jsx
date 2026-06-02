// =====================================================================
// Folio — Plan tweaks
// ---------------------------------------------------------------------
// Renders the Tweaks panel (from tweaks-panel.jsx) and drives the
// vanilla Plan page via window.applyPlanState / window.applyPlanHint.
//
//   Portfolio      Full   — every card active (default)
//                  Empty  — only "Model a purchase" works; the rest are
//                           disabled because their data isn't there yet
//   Disabled hint  In footer  — reason shown in the card footer
//                  On hover   — reason shown as a tooltip on hover
// =====================================================================

const PLAN_TWEAKS = /*EDITMODE-BEGIN*/{
  "portfolio": "full"
}/*EDITMODE-END*/;

function PlanTweaks() {
  const [t, setTweak] = useTweaks(PLAN_TWEAKS);

  React.useEffect(() => {
    if (window.applyPlanState) window.applyPlanState(t.portfolio);
  }, [t.portfolio]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Preview" />
      <TweakRadio
        label="Portfolio"
        value={t.portfolio}
        options={[{ value: 'full', label: 'Full' }, { value: 'empty', label: 'Empty' }]}
        onChange={(v) => setTweak('portfolio', v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<PlanTweaks />);
