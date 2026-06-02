// =====================================================================
// Folio — Plan (command deck)
// ---------------------------------------------------------------------
// A grid of scenario question cards. Clicking a card drills into the
// matching calculator (cloned from a <template>) as a takeover, with a
// back button to return to the grid. The open scenario is remembered in
// localStorage so a refresh during review keeps your place.
//
// Disabled states (driven by the Tweaks panel):
//   When the portfolio is "empty", every card except Model a purchase is
//   disabled — the prerequisite data isn't there yet. The reason is shown
//   either in the card footer or as a hover tooltip (Tweak: Disabled hint).
//
//   All four scenario cards now navigate to their own polished pages
//   (see PAGES). No inline calculator templates remain.
// =====================================================================

(function () {
  // No scenarios drill into an inline template any more — every card
  // navigates to its own page (see PAGES). Kept empty so the restore /
  // render machinery below stays inert.
  const SCENARIOS = [];
  const CRUMB = {};
  // Scenarios that need existing data — disabled when the portfolio is empty.
  // Model a purchase works from scratch, so it is never disabled.
  const NEEDS_DATA = ['rate', 'io', 'sale'];

  // Scenarios that have graduated to their own polished page — clicking
  // the card navigates there instead of drilling into the inline template.
  const PAGES = {
    rate: 'rate-sensitivity.html',
    io: 'interest-only.html',
    purchase: 'model-purchase.html',
    sale: 'hold-reinvest.html'
  };

  const LS_OPEN = 'folio.plan.open';

  let openScenario = null; // null = grid, otherwise a scenario key

  function cloneCalc(key) {
    const tpl = document.getElementById('tpl-' + key);
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.removeAttribute('id');
    return node;
  }

  function isDisabled(card) { return card.classList.contains('is-disabled'); }

  function render() {
    const grid = document.getElementById('deck-grid');
    const takeover = document.getElementById('deck-takeover');
    if (!grid || !takeover) return;

    if (!openScenario) {
      grid.hidden = false;
      takeover.hidden = true;
      takeover.replaceChildren();
      return;
    }

    grid.hidden = true;
    takeover.hidden = false;
    const c = CRUMB[openScenario];
    takeover.replaceChildren();

    const bar = document.createElement('div');
    bar.className = 'takeover-bar';
    bar.innerHTML =
      '<button type="button" class="back-btn" id="deck-back">' +
      '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 2.5 3.5 6 7 9.5"/></svg>' +
      'All scenarios</button>' +
      '<span class="takeover-crumb">' + c.eyebrow +
      ' · <span class="cur">' + c.title + '</span></span>';
    takeover.appendChild(bar);
    takeover.appendChild(cloneCalc(openScenario));

    bar.querySelector('#deck-back').addEventListener('click', () => {
      openScenario = null;
      localStorage.removeItem(LS_OPEN);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ----- Tweak-driven state ----------------------------------------
  // Toggle each card's disabled state for the "empty portfolio" preview.
  window.applyPlanState = function (portfolio) {
    const empty = portfolio === 'empty';
    document.querySelectorAll('.scenario-card').forEach(card => {
      const disabled = empty && NEEDS_DATA.includes(card.dataset.scenario);
      card.classList.toggle('is-disabled', disabled);
      card.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    });
    // If the open calculator just became unavailable, return to the grid.
    if (openScenario && empty && NEEDS_DATA.includes(openScenario)) {
      openScenario = null;
      localStorage.removeItem(LS_OPEN);
      render();
    }
  };

  // Footer note for the disabled reason lives in the markup — no JS needed.

  document.addEventListener('DOMContentLoaded', () => {
    // Card click → drill in (ignored when disabled)
    document.querySelectorAll('.scenario-card').forEach(card => {
      card.addEventListener('click', () => {
        if (isDisabled(card)) return;
        const page = PAGES[card.dataset.scenario];
        if (page) { window.location.href = page; return; }
        openScenario = card.dataset.scenario;
        localStorage.setItem(LS_OPEN, openScenario);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Restore the open calculator (if any) from a previous visit.
    const saved = localStorage.getItem(LS_OPEN);
    if (SCENARIOS.includes(saved)) openScenario = saved;
    render();
  });
})();
