// =====================================================================
// Folio — Rate sensitivity · SLIDER (the one input)
// ---------------------------------------------------------------------
// Custom pointer-drag slider over the rate-move domain. Snaps to the
// step, supports click-to-set, drag, and keyboard. Renders the moving
// value tag + integer ticks. Exposes window.RSSlider.
// =====================================================================

(function () {
  const { useRef, useCallback } = React;
  const F = window.RS;

  function RSSlider({ value, onChange }) {
    const { min, max, step } = F.RANGE;
    const trackRef = useRef(null);
    const draggingRef = useRef(false);

    const pct = ((value - min) / (max - min)) * 100;

    const snap = (raw) => {
      const clamped = Math.min(max, Math.max(min, raw));
      return Math.round(clamped / step) * step;
    };

    const fromClientX = useCallback((clientX) => {
      const el = trackRef.current;
      if (!el) return value;
      const r = el.getBoundingClientRect();
      const frac = (clientX - r.left) / r.width;
      return snap(min + frac * (max - min));
    }, [value]);

    const onPointerDown = (e) => {
      e.preventDefault();
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      onChange(fromClientX(e.clientX));
    };
    const onPointerMove = (e) => {
      if (!draggingRef.current) return;
      onChange(fromClientX(e.clientX));
    };
    const onPointerUp = (e) => {
      draggingRef.current = false;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
    };

    const onKeyDown = (e) => {
      let next = value;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = snap(value - step);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = snap(value + step);
      else if (e.key === 'Home') next = min;
      else if (e.key === 'End') next = max;
      else if (e.key === 'PageDown') next = snap(value - step * 4);
      else if (e.key === 'PageUp') next = snap(value + step * 4);
      else return;
      e.preventDefault();
      onChange(next);
    };

    // integer ticks across the domain
    const ticks = [];
    for (let t = Math.ceil(min); t <= Math.floor(max); t++) ticks.push(t);

    return (
      <div className="rs-slider">
        <div
          className="rs-track-hit"
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="rs-rail">
            <div className="rs-center-mark" />
            {/* coloured fill from centre (today) to the thumb */}
            <div
              className={'rs-fill ' + (value >= 0 ? 'up' : 'down')}
              style={{
                left: (value >= 0 ? 50 : pct) + '%',
                width: Math.abs(pct - 50) + '%'
              }}
            />
          </div>
          <div
            className="rs-thumb"
            style={{ left: pct + '%' }}
            role="slider"
            tabIndex={0}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={F.fmtMove(value)}
            aria-label="Move all variable rates by"
            onKeyDown={onKeyDown}
          >
            <span className={'rs-value-tag ' + (Math.abs(value) < 0.001 ? 'is-today' : value > 0 ? 'up' : 'down')}>
              {F.fmtMove(value)}
            </span>
          </div>
        </div>

        <div className="rs-ticks">
          {ticks.map((t) => {
            const tp = ((t - min) / (max - min)) * 100;
            const isZero = t === 0;
            return (
              <button
                key={t}
                type="button"
                className={'rs-tick' + (isZero ? ' is-today' : t > 0 ? ' is-up' : ' is-down') + (Math.abs(value - t) < 0.001 ? ' is-active' : '')}
                style={{ left: tp + '%' }}
                onClick={() => onChange(t)}
              >
                <span className="dot" />
                <span className="lab">{isZero ? 'Today' : (t > 0 ? '+' : '−') + Math.abs(t) + '%'}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  window.RSSlider = RSSlider;
})();
