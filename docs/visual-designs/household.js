// =====================================================================
// Folio — Household screen behaviour
// ---------------------------------------------------------------------
// One unified table is the source of truth. Each line item stores its
// NATIVE amount + frequency in data-* attributes; this script derives
// the Monthly / Annual columns, the section subtotals, and the personal
// surplus, and keeps them in sync through inline edit / add / delete.
//
//   View toggle   →  which derived column(s) to show (the native
//                    "as entered" amount is always shown).
//   State toggle  →  preview the populated vs. empty (first-run) state.
//   Edit a row    →  expands in place into an inline form.
//   + Add …       →  a blank inline form at the foot of that group.
//   Delete        →  lives only inside the expanded form (deliberate;
//                    keeps rows quiet and guards against mis-taps).
// =====================================================================

(function () {
  const table = document.querySelector('[data-hh-table]');
  if (!table) return;

  // --- Frequency model ---------------------------------------------
  const FREQ = {
    wk: { perYear: 52, short: 'wk', long: 'Weekly' },
    fn: { perYear: 26, short: 'fn', long: 'Fortnightly' },
    mo: { perYear: 12, short: 'mo', long: 'Monthly' },
    yr: { perYear: 1,  short: 'yr', long: 'Annual' },
  };
  const ORDER = ['wk', 'fn', 'mo', 'yr'];
  const NOUN = {
    income:   { one: 'source',   many: 'sources' },
    expenses: { one: 'category', many: 'categories' },
  };
  const EDIT_SVG =
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 8.5L8 2.5l1.5 1.5L3.5 10H2v-1.5z"/></svg>';

  const annualOf  = (amt, freq) => (parseFloat(amt) || 0) * (FREQ[freq] || FREQ.mo).perYear;
  const monthlyOf = (amt, freq) => annualOf(amt, freq) / 12;

  function money(n) {
    const neg = n < -0.5;
    const v = '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
    return neg ? '\u2212' + v : v;
  }
  function nativeMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  }

  // --- Paint a row from its data-* attributes ----------------------
  function paintRow(row) {
    const name = row.dataset.name || '';
    const sub  = row.dataset.sub || '';
    const amt  = row.dataset.amount || 0;
    const freq = row.dataset.freq || 'mo';
    row.classList.add('item-row');
    row.classList.remove('is-editing');
    row.style.display = '';
    row.innerHTML =
      '<div class="label-cell">' +
        '<div class="name">' + esc(name) + '</div>' +
        (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
      '</div>' +
      '<div class="native">' + nativeMoney(amt) + '<span class="freq"> / ' + FREQ[freq].short + '</span></div>' +
      '<div class="num col-monthly">' + money(monthlyOf(amt, freq)) + '</div>' +
      '<div class="num col-annual">' + money(annualOf(amt, freq)) + '</div>' +
      '<div class="edit-glyph" aria-label="Edit">' + EDIT_SVG + '</div>';
  }

  // --- Recompute subtotals, counts, and the personal surplus -------
  function recompute() {
    const totals = { income: 0, expenses: 0 };
    const counts = { income: 0, expenses: 0 };
    ['income', 'expenses'].forEach(group => {
      table.querySelectorAll('.item-row[data-group="' + group + '"]').forEach(r => {
        totals[group] += annualOf(r.dataset.amount, r.dataset.freq);
        counts[group] += 1;
      });
      const sub = table.querySelector('[data-subtotal="' + group + '"]');
      if (sub) {
        sub.querySelector('[data-sum-monthly]').textContent = money(totals[group] / 12);
        sub.querySelector('[data-sum-annual]').textContent  = money(totals[group]);
      }
      const head = table.querySelector('[data-group-head="' + group + '"] [data-group-count]');
      if (head) {
        const n = counts[group];
        head.textContent = '\u00b7 ' + n + ' ' + (n === 1 ? NOUN[group].one : NOUN[group].many);
      }
    });

    const surplusAnnual = totals.income - totals.expenses;
    const grand = table.querySelector('[data-grand]');
    if (grand) {
      const m = grand.querySelector('[data-grand-monthly]');
      const a = grand.querySelector('[data-grand-annual]');
      m.textContent = money(surplusAnnual / 12);
      a.textContent = money(surplusAnnual);
      const pos = surplusAnnual >= 0;
      [m, a].forEach(el => {
        el.classList.toggle('positive', pos);
        el.classList.toggle('negative', !pos);
      });
    }
  }

  // --- Inline form -------------------------------------------------
  function closeAnyForm() {
    const open = table.querySelector('.hh-edit');
    if (!open) return;
    const editing = open._editingRow;
    if (editing) {
      editing.style.display = '';
    } else if (open._addRow) {
      open._addRow.style.display = '';
    }
    open.remove();
  }

  function formHTML(data, isEdit) {
    const freqBtns = ORDER.map(f =>
      '<button type="button" data-freq="' + f + '"' + (f === data.freq ? ' class="is-on"' : '') + '>' +
        FREQ[f].long + '</button>'
    ).join('');
    return '' +
      '<div class="fields">' +
        '<div class="field">' +
          '<label>Name</label>' +
          '<input type="text" class="input" data-f="name" value="' + esc(data.name) + '" placeholder="e.g. Employment income" />' +
        '</div>' +
        '<div class="field">' +
          '<label>Amount <span style="color:hsl(var(--foreground-subtle));font-weight:400;">— your estimate</span></label>' +
          '<div class="input-prefix"><span class="glyph">$</span>' +
            '<input type="text" class="input" data-f="amount" inputmode="decimal" value="' + esc(data.amount) + '" placeholder="0" />' +
          '</div>' +
        '</div>' +
        '<div class="field full">' +
          '<label>Detail <span style="color:hsl(var(--foreground-subtle));font-weight:400;">— optional</span></label>' +
          '<input type="text" class="input" data-f="sub" value="' + esc(data.sub) + '" placeholder="e.g. Theo · base + super" />' +
        '</div>' +
        '<div class="field full">' +
          '<label>Frequency</label>' +
          '<div class="freq-seg" data-freq-seg>' + freqBtns + '</div>' +
        '</div>' +
        '<div class="field full"><div class="preview" data-preview></div></div>' +
        '<div class="form-actions">' +
          (isEdit
            ? '<button type="button" class="btn btn--delete" data-f-delete><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h6M5 4V3h2v1M4 4l.5 6h3L8 4"/></svg>Delete</button>'
            : '<span></span>') +
          '<div class="right">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-f-cancel>Cancel</button>' +
            '<button type="button" class="btn btn--primary btn--sm" data-f-save>' + (isEdit ? 'Save changes' : 'Add') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function openForm(group, existingRow) {
    closeAnyForm();
    const isEdit = !!existingRow;
    const data = isEdit
      ? { name: existingRow.dataset.name, sub: existingRow.dataset.sub || '', amount: existingRow.dataset.amount, freq: existingRow.dataset.freq || 'mo' }
      : { name: '', sub: '', amount: '', freq: 'mo' };

    const form = document.createElement('div');
    form.className = 'hh-edit';
    form.innerHTML = formHTML(data, isEdit);

    if (isEdit) {
      existingRow.style.display = 'none';
      existingRow.after(form);
      form._editingRow = existingRow;
    } else {
      const addRow = table.querySelector('[data-add-row="' + group + '"]');
      addRow.style.display = 'none';
      addRow.before(form);
      form._addRow = addRow;
    }

    // --- live preview + frequency selection ---
    let freq = data.freq;
    const seg = form.querySelector('[data-freq-seg]');
    const amountInput = form.querySelector('[data-f="amount"]');
    const preview = form.querySelector('[data-preview]');
    const updatePreview = () => {
      const amt = parseFloat(amountInput.value) || 0;
      if (!amt) { preview.innerHTML = 'Enter an amount to see the monthly and annual equivalents.'; return; }
      preview.innerHTML =
        '\u2248 <strong>' + money(monthlyOf(amt, freq)) + '</strong> / mo' +
        ' \u00b7 <strong>' + money(annualOf(amt, freq)) + '</strong> / yr';
    };
    seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-freq]');
      if (!b) return;
      freq = b.dataset.freq;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
      updatePreview();
    });
    amountInput.addEventListener('input', updatePreview);
    updatePreview();

    // --- save / cancel / delete ---
    const save = () => {
      const name = form.querySelector('[data-f="name"]').value.trim();
      const amt  = form.querySelector('[data-f="amount"]').value.trim();
      if (!name) { form.querySelector('[data-f="name"]').focus(); return; }
      if (!amt || isNaN(parseFloat(amt))) { amountInput.focus(); return; }
      const sub = form.querySelector('[data-f="sub"]').value.trim();

      let row = existingRow;
      if (!row) {
        row = document.createElement('div');
        row.className = 'row-h item-row';
        row.dataset.group = group;
        form.before(row);
      }
      row.dataset.name = name;
      row.dataset.sub = sub;
      row.dataset.amount = String(parseFloat(amt));
      row.dataset.freq = freq;
      paintRow(row);
      closeAnyForm();
      recompute();
    };

    form.querySelector('[data-f-save]').addEventListener('click', save);
    form.querySelector('[data-f-cancel]').addEventListener('click', closeAnyForm);
    const del = form.querySelector('[data-f-delete]');
    if (del) {
      del.addEventListener('click', () => {
        if (existingRow) existingRow.remove();
        form.remove();
        recompute();
      });
    }
    form.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeAnyForm(); }
    });

    form.querySelector('[data-f="name"]').focus();
  }

  // --- Wiring ------------------------------------------------------
  // Edit: click anywhere on an item row (or its pencil)
  table.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) { openForm(addBtn.dataset.add, null); return; }
    if (e.target.closest('.hh-edit')) return;
    const row = e.target.closest('.item-row');
    if (row) openForm(row.dataset.group, row);
  });

  // View toggle (Monthly · Annual · Both)
  const viewToggle = document.querySelector('[data-view-toggle]');
  if (viewToggle) {
    viewToggle.addEventListener('click', e => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      table.dataset.view = b.dataset.view;
      viewToggle.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
    });
  }

  // State (Populated · Empty) — driven by the Tweaks panel, not by an
  // in-page control. The panel dispatches 'hh-set-state' with the value.
  function setState(name) {
    document.querySelectorAll('.hh-state').forEach(s =>
      s.classList.toggle('is-active', s.dataset.hhstate === name));
  }
  window.addEventListener('hh-set-state', e => setState(e.detail));

  // Empty-state CTAs: jump to populated view and open a fresh form
  document.querySelectorAll('[data-empty-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      setState('populated');
      openForm(btn.dataset.emptyAdd, null);
    });
  });

  // Initial paint keeps HTML + derived values consistent.
  table.querySelectorAll('.item-row').forEach(paintRow);
  recompute();
})();
