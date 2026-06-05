// =====================================================================
// Folio — page behaviour
// ---------------------------------------------------------------------
// This is the small JS layer for the static design mockups. Each
// screen lives in its own HTML file (dashboard.html, upload.html, …)
// and shares this script.
//
// Cross-page navigation:
//   Any element with [data-goto="X"] navigates to X.html on click.
//   The sidebar uses this; so do table rows, breadcrumb-backs, and
//   prompt CTAs. In the Next.js port these become <Link href="/X">.
//
// In-page behaviour:
//   - Tabs (Property detail / Loan detail)
//   - Upload idle ↔ review state toggle
//   - Collapsible sidebar nav sections + collapsible household groups
//   - Plan: jump-to-calculator from the lede
// =====================================================================

(function () {

  // --- Cross-page navigation ----------------------------------------
  // sidebar.js injects the sidebar after DOMContentLoaded, so we
  // delegate from the document instead of binding per-element.
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-goto]');
    if (!el) return;
    // Ignore [data-goto] inside the upload state toggle etc.
    e.preventDefault();
    const target = el.dataset.goto;
    if (!target) return;
    window.location.href = target + '.html';
  });

  // --- Collapsible nav sections (sidebar) ---------------------------
  // Delegate, because sidebar is injected after this script runs in
  // older browsers — and it's just cleaner.
  document.addEventListener('click', e => {
    const toggle = e.target.closest('[data-collapse]');
    if (!toggle) return;
    e.stopPropagation();
    const section = toggle.closest('.nav-section') || toggle;
    section.classList.toggle('collapsed');
  });

  // --- Collapsible household sections -------------------------------
  document.querySelectorAll('.collapsible-section .head').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('is-open'));
  });

  // --- Tab switching (Property Detail, Loan Detail) -----------------
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

  // --- Upload state toggle (idle ↔ review) --------------------------
  // Lives only on upload.html. Two buttons in the page-head controls
  // strip, plus inline [data-state-goto] anchors inside the page.
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

  // --- Table rows that navigate -------------------------------------
  // Both the properties and loans tables use [data-goto] on each <tr>,
  // handled by the global delegated click handler above. No per-table
  // wiring needed.

  // --- Entity filter dropdown (properties page) ---------------------
  // Click the chip to toggle the menu; click outside or Esc to close.
  // Selecting an option updates the chip label and closes.
  document.querySelectorAll('.entity-filter').forEach(wrap => {
    const chip = wrap.querySelector('.chip-select');
    const clearBtn = wrap.querySelector('.chip-clear');
    const labelEl = chip && chip.querySelector('.label');
    const defaultOpt = wrap.querySelector('.entity-opt[data-default]');

    // Returns the text node inside the chip that holds the current value
    // (the sibling after .label / before .chevron / .chip-clear). Stays
    // robust if the chip is rewritten by an edit.
    const getValueNode = () => {
      if (!chip) return null;
      for (const n of chip.childNodes) {
        if (n.nodeType === 3 && n.nodeValue.trim()) return n;
      }
      return null;
    };

    const setChipValue = (text) => {
      const node = getValueNode();
      if (node) node.nodeValue = ' ' + text + ' ';
    };

    const applySelection = (opt) => {
      wrap.querySelectorAll('.entity-opt').forEach(o => o.classList.remove('is-selected'));
      opt.classList.add('is-selected');
      const name = opt.querySelector('.opt-name');
      const clone = name.cloneNode(true);
      clone.querySelectorAll('.opt-kind').forEach(k => k.remove());
      setChipValue(clone.textContent.trim());
      // Active accent state when a non-default option is selected
      const isDefault = opt.hasAttribute('data-default');
      chip.classList.toggle('is-active', !isDefault);
    };

    chip && chip.addEventListener('click', e => {
      // Don't open when the user clicked the inline clear button
      if (clearBtn && clearBtn.contains(e.target)) return;
      e.stopPropagation();
      wrap.classList.toggle('is-open');
      chip.classList.toggle('is-open', wrap.classList.contains('is-open'));
    });

    clearBtn && clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (defaultOpt) applySelection(defaultOpt);
    });

    wrap.querySelectorAll('.entity-opt:not(.is-action)').forEach(opt => {
      opt.addEventListener('click', e => {
        e.stopPropagation();
        applySelection(opt);
        wrap.classList.remove('is-open');
        chip.classList.remove('is-open');
      });
    });
  });
  document.addEventListener('click', e => {
    document.querySelectorAll('.entity-filter.is-open').forEach(wrap => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('is-open');
        const chip = wrap.querySelector('.chip-select');
        chip && chip.classList.remove('is-open');
      }
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.entity-filter.is-open').forEach(wrap => {
      wrap.classList.remove('is-open');
      const chip = wrap.querySelector('.chip-select');
      chip && chip.classList.remove('is-open');
    });
  });

  // --- Lender radio group (Add loan) --------------------------------
  // Single-select group of lender pills. "Other" toggles a free-text
  // input directly below the group so the user can name a lender that
  // isn't in the curated list.
  document.querySelectorAll('[data-lender-group]').forEach(group => {
    const opts = group.querySelectorAll('.lender-opt');
    const otherWrap = group.parentElement.querySelector('[data-lender-other]');
    const otherInput = otherWrap && otherWrap.querySelector('[data-lender-other-input]');

    const select = (btn) => {
      opts.forEach(o => o.classList.toggle('is-selected', o === btn));
      const isOther = btn.dataset.lenderValue === 'Other';
      if (otherWrap) {
        otherWrap.hidden = !isOther;
        if (isOther && otherInput) {
          // Defer focus so the layout settles before scrolling/caret.
          requestAnimationFrame(() => otherInput.focus());
        }
      }
    };

    opts.forEach(btn => {
      btn.addEventListener('click', () => select(btn));
    });
  });

  // --- Security toggle (Add loan) -----------------------------------
  // Secured / Unsecured segmented control. Hides the property picker
  // when "Unsecured" is selected, swaps the entity helper text, and
  // updates the commit-bar summary so it doesn't claim "secured by ..."
  // when no property is attached.
  document.querySelectorAll('[data-security-toggle]').forEach(group => {
    const buttons = group.querySelectorAll('button[data-security]');
    const section = group.closest('.form-section');
    const securedPanel = section && section.querySelector('[data-security-panel="secured"]');
    const helpSecured = section && section.querySelector('[data-entity-help-secured]');
    const helpUnsecured = section && section.querySelector('[data-entity-help-unsecured]');
    const summary = document.querySelector('.commit-bar .summary');
    const summarySecured = summary ? summary.innerHTML : null;
    const summaryUnsecured = '<span>Will add <strong>CBA Inv Loan · Elm St</strong> as an <strong>unsecured</strong> loan · <span class="muted">$615k balance · interest only @ 6.35%</span></span>';

    const setSecurity = (mode) => {
      buttons.forEach(b => b.classList.toggle('is-on', b.dataset.security === mode));
      const secured = mode === 'secured';
      if (securedPanel) securedPanel.hidden = !secured;
      if (helpSecured) helpSecured.hidden = !secured;
      if (helpUnsecured) helpUnsecured.hidden = secured;
      if (summary && summarySecured) {
        summary.innerHTML = secured ? summarySecured : summaryUnsecured;
      }
    };

    buttons.forEach(b => b.addEventListener('click', () => setSecurity(b.dataset.security)));
  });

  // --- Repayment-type toggle (Add loan) -----------------------------
  // Interest only / Principal & interest / Line of credit. Each option
  // hides the fields that don't apply (IO end date only matters for IO;
  // LOC drops start date + loan term and reframes "Original loan amount"
  // as "Credit limit").
  document.querySelectorAll('[data-repayment-toggle]').forEach(group => {
    const buttons = group.querySelectorAll('button[data-repayment]');
    const body = group.closest('.form-section-body');
    if (!body) return;
    const fields = body.querySelectorAll('[data-show-for]');
    const amountLabel = body.querySelector('[data-amount-label]');
    const amountOptional = body.querySelector('[data-amount-optional]');
    const amountInput = body.querySelector('[data-amount-input]');
    const amountHelp = body.querySelector('[data-amount-help]');

    const setRepayment = (mode) => {
      buttons.forEach(b => b.classList.toggle('is-on', b.dataset.repayment === mode));
      fields.forEach(f => {
        const allow = f.dataset.showFor.split(/\s+/);
        f.hidden = !allow.includes(mode);
      });
      // Reframe the "Original loan amount" field for LOC.
      if (amountLabel && amountOptional && amountInput && amountHelp) {
        if (mode === 'loc') {
          amountLabel.textContent = 'Credit limit';
          amountOptional.hidden = true;
          amountInput.placeholder = '100,000';
          amountHelp.textContent = 'Total facility limit on the line of credit.';
        } else {
          amountLabel.textContent = 'Original loan amount';
          amountOptional.hidden = false;
          amountInput.placeholder = '650,000';
          amountHelp.textContent = "For tracking how much you've paid down.";
        }
      }
    };

    buttons.forEach(b => b.addEventListener('click', () => setRepayment(b.dataset.repayment)));
  });

  // --- Transaction row actions popover ------------------------------
  // The ⋯ button in each .tx-list row opens a small Edit / Delete menu.
  // Build a single floating popover and reposition on each click.
  (function () {
    const txList = document.querySelector('.tx-list');
    if (!txList) return;

    const pop = document.createElement('div');
    pop.className = 'row-actions-pop';
    pop.setAttribute('role', 'menu');
    pop.hidden = true;
    pop.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8.5 2.5l1 1L4 9 2.5 9.5 3 8z"/></svg>
        Edit entry
      </button>
      <button type="button" role="menuitem" data-act="delete" class="is-danger">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h6M5 4V3h2v1M4 4l.5 6h3L8 4"/></svg>
        Delete entry
      </button>
    `;
    document.body.appendChild(pop);

    let anchorRow = null;

    function close() {
      pop.hidden = true;
      if (anchorRow) anchorRow.classList.remove('is-menu-open');
      anchorRow = null;
    }

    txList.addEventListener('click', e => {
      const trigger = e.target.closest('.row-t .more');
      if (!trigger) return;
      e.stopPropagation();
      const row = trigger.closest('.row-t');
      if (anchorRow === row) { close(); return; }
      if (anchorRow) anchorRow.classList.remove('is-menu-open');
      anchorRow = row;
      anchorRow.classList.add('is-menu-open');

      const r = trigger.getBoundingClientRect();
      pop.hidden = false;
      // Position so right edge aligns with trigger's right edge, below it.
      const top = r.bottom + window.scrollY + 4;
      const right = window.innerWidth - r.right;
      pop.style.top = top + 'px';
      pop.style.right = right + 'px';
      pop.style.left = 'auto';
    });

    pop.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn || !anchorRow) return;
      if (btn.dataset.act === 'delete') {
        anchorRow.style.transition = 'opacity 140ms ease';
        anchorRow.style.opacity = '0';
        const row = anchorRow;
        setTimeout(() => row.remove(), 160);
      } else if (btn.dataset.act === 'edit') {
        editRow(anchorRow);
      }
      close();
    });

    // --- In-place edit -----------------------------------------------
    // Mirrors the Add row markup so the two interactions feel identical.
    const CAT_LABEL = { rent: 'Rent', repairs: 'Repairs', fee: 'Mgmt fee', other: 'Other' };
    const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function fmtDate(iso) {
      if (!iso) return '—';
      const [y, m, d] = iso.split('-').map(Number);
      return `${String(d).padStart(2, '0')} ${MONTHS_SHORT[m - 1]} ${y}`;
    }
    function parseDate(text) {
      // "28 May 2026" → "2026-05-28"
      const m = text.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
      if (!m) return '';
      const mi = MONTHS_SHORT.indexOf(m[2]);
      if (mi < 0) return '';
      return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }

    function editRow(row) {
      if (row.classList.contains('is-editing')) return;
      // Snapshot the row's original HTML + class so Cancel can restore it.
      const originalHTML = row.innerHTML;
      const originalClass = row.className;

      // Read current values.
      const when = row.querySelector('.when')?.textContent || '';
      const catSpan = row.querySelector('.cat');
      const catClass = (catSpan?.className.match(/cat--(\w+)/) || [])[1] || 'other';
      const desc = row.querySelector('.desc')?.textContent.trim() || '';
      const amountText = row.querySelector('.amount')?.textContent.trim() || '';
      const isIncome = /^\+/.test(amountText);
      const amountInput = amountText.replace(/[$,\s]/g, '').replace('−', '-');

      row.classList.add('row-t--add', 'is-editing');
      row.innerHTML = `
        <div class="when">
          <input type="date" class="add-tx-input add-tx-date" data-edit-field="date" value="${parseDate(when)}" />
        </div>
        <div>
          <select class="add-tx-input add-tx-select" data-edit-field="category">
            <option value="rent">Rent</option>
            <option value="repairs">Repairs</option>
            <option value="fee">Mgmt fee</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="desc">
          <input type="text" class="add-tx-input" data-edit-field="desc" value="${desc.replace(/"/g, '&quot;')}" />
        </div>
        <div class="amount">
          <input type="text" class="add-tx-input add-tx-amount" data-edit-field="amount" inputmode="decimal" value="${(isIncome ? '+' : '') + amountInput}" />
        </div>
        <div></div>
      `;
      row.querySelector('[data-edit-field="category"]').value = catClass;

      // Actions strip directly under the row.
      const actions = document.createElement('div');
      actions.className = 'row-t--add-actions';
      actions.dataset.editActions = '';
      actions.innerHTML = `
        <span class="hint">Editing entry · prefix amount with <kbd>+</kbd> for income · <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel</span>
        <div class="row-t--add-actions__buttons">
          <button type="button" class="btn btn--ghost btn--sm" data-edit-cancel>Cancel</button>
          <button type="button" class="btn btn--primary btn--sm" data-edit-save>Save changes</button>
        </div>
      `;
      row.after(actions);

      const descInput = row.querySelector('[data-edit-field="desc"]');
      descInput.focus();
      descInput.setSelectionRange(descInput.value.length, descInput.value.length);

      function cleanup() {
        row.className = originalClass;
        row.innerHTML = originalHTML;
        actions.remove();
      }

      function commit() {
        const newDesc = row.querySelector('[data-edit-field="desc"]').value.trim();
        const newAmt  = row.querySelector('[data-edit-field="amount"]').value.trim();
        if (!newDesc || !newAmt) {
          (!newDesc
            ? row.querySelector('[data-edit-field="desc"]')
            : row.querySelector('[data-edit-field="amount"]')
          ).focus();
          return;
        }
        const newDate = row.querySelector('[data-edit-field="date"]').value;
        const newCat  = row.querySelector('[data-edit-field="category"]').value;
        const income  = /^\+/.test(newAmt);
        let amtText = newAmt.replace(/^\+/, '');
        if (!/^[−-]/.test(amtText) && !income) amtText = '−' + amtText;
        if (income) amtText = '+' + amtText;
        if (!/\$/.test(amtText)) amtText = amtText.replace(/^([+−-])/, '$1$$');

        row.className = originalClass;
        row.innerHTML = `
          <div class="when">${fmtDate(newDate)}</div>
          <div><span class="cat cat--${newCat}"><span class="dot"></span>${CAT_LABEL[newCat]}</span></div>
          <div class="desc">${newDesc.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>
          <div class="amount${income ? ' is-income' : ''}">${amtText}</div>
          <button type="button" class="more" aria-label="Row actions" title="Edit or delete">⋯</button>
        `;
        actions.remove();
      }

      actions.querySelector('[data-edit-cancel]').addEventListener('click', cleanup);
      actions.querySelector('[data-edit-save]').addEventListener('click', commit);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
      });
    }

    document.addEventListener('click', e => {
      if (pop.hidden) return;
      if (e.target.closest('.row-actions-pop')) return;
      if (e.target.closest('.row-t .more')) return;
      close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
  })();

  // --- Plan: scroll to a calculator from the lede CTA ---------------
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
