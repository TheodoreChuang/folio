// =====================================================================
// FOLIO — minimal app behaviour
// Screen switching via sidebar; collapsible nav sections.
// =====================================================================

(function () {
  const root = document.documentElement;

  // --- Screen switching ----------------------------------------------
  const screens = document.querySelectorAll('.screen');
  const navItems = document.querySelectorAll('[data-goto]');

  function goTo(screen, sourceEl) {
    screens.forEach(s => s.classList.toggle('is-active', s.dataset.screen === screen));
    // Find which sidebar nav item to highlight. If multiple share the same
    // data-goto (e.g. several loan rows all going to "loan"), prefer the
    // one the user actually clicked; otherwise fall back to the first match.
    const sidebarMatches = document.querySelectorAll(`.sidebar .nav-item[data-goto="${screen}"]`);
    let activeNav = null;
    if (sourceEl && sourceEl.closest && sourceEl.closest('.sidebar')) {
      activeNav = sourceEl.closest('.nav-item');
    } else if (sidebarMatches.length === 1) {
      activeNav = sidebarMatches[0];
    }
    document.querySelectorAll('.sidebar .nav-item').forEach(n => {
      n.classList.toggle('is-active', n === activeNav);
    });
    if (location.hash !== '#' + screen) {
      history.replaceState(null, '', '#' + screen);
    }
    window.scrollTo(0, 0);
  }

  navItems.forEach(n => {
    n.addEventListener('click', e => {
      e.preventDefault();
      goTo(n.dataset.goto, n);
    });
  });

  // Hash routing — boot
  const initial = (location.hash || '#dashboard').slice(1);
  const validScreens = Array.from(screens).map(s => s.dataset.screen);
  goTo(validScreens.includes(initial) ? initial : 'dashboard');

  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (validScreens.includes(h)) goTo(h);
  });

  // --- Collapsible nav sections --------------------------------------
  document.querySelectorAll('[data-collapse]').forEach(sec => {
    sec.addEventListener('click', () => sec.classList.toggle('collapsed'));
  });

  // --- Collapsible household sections --------------------------------
  document.querySelectorAll('.collapsible-section .head').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('is-open'));
  });

  // --- Tab switching (Property Detail) ------------------------------
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const tabs = group.querySelectorAll('.tab');
    tabs.forEach(t => {
      t.addEventListener('click', () => {
        const screen = group.closest('.screen');
        tabs.forEach(x => x.classList.toggle('is-active', x === t));
        screen.querySelectorAll('.tab-panel').forEach(p => {
          p.classList.toggle('is-active', p.dataset.tab === t.dataset.tab);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  });

  // Links that jump to a specific tab within the current screen
  document.querySelectorAll('[data-tab-goto]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = a.dataset.tabGoto;
      const screen = a.closest('.screen');
      if (!screen) return;
      const tab = screen.querySelector(`.tab[data-tab="${target}"]`);
      if (tab) tab.click();
    });
  });

  // --- Upload state toggle (idle ↔ review) ---------------------------
  function setUploadState(state) {
    const screen = document.querySelector('[data-screen="upload"]');
    if (!screen) return;
    screen.querySelectorAll('.upload-state').forEach(s =>
      s.classList.toggle('is-active', s.dataset.state === state)
    );
    screen.querySelectorAll('.upload-state-toggle button').forEach(b =>
      b.classList.toggle('is-on', b.dataset.state === state)
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('.upload-state-toggle button').forEach(b => {
    b.addEventListener('click', () => setUploadState(b.dataset.state));
  });
  document.querySelectorAll('[data-state-goto]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      setUploadState(a.dataset.stateGoto);
    });
  });

  // --- Property table row → property detail -------------------------
  document.querySelectorAll('.table.properties tbody tr').forEach(tr => {
    tr.addEventListener('click', () => goTo('property'));
  });

  // --- Loan row expand toggle ----------------------------------------
  // (No-op for the initial state — first row already expanded for the mockup.)
  document.querySelectorAll('.loan-row:not(.header)').forEach(r => {
    r.addEventListener('click', () => {
      const next = r.nextElementSibling;
      if (next && next.classList.contains('loan-expand')) {
        r.classList.toggle('expanded');
        next.style.display = r.classList.contains('expanded') ? '' : 'none';
      }
    });
  });
  // --- Plan: scroll to a calculator from the lede CTA -------------
  document.querySelectorAll('[data-jump]').forEach(b => {
    b.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(b.dataset.jump);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();
