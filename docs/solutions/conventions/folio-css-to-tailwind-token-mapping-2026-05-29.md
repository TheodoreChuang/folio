---
title: Implementing Components from Folio Design Files
date: 2026-05-29
category: docs/solutions/conventions/
module: ui
problem_type: convention
component: frontend_stimulus
severity: medium
applies_when:
  - Implementing new UI components from docs/visual-designs/
  - Verifying existing implementations against the design spec
  - Debugging visual discrepancies between implementation and design
tags:
  - design-tokens
  - tailwind
  - folio-css
  - buttons
---

# Implementing Components from Folio Design Files

## Context

`docs/visual-designs/` uses its own CSS design system (`folio.css`). The Next.js
implementation uses Tailwind v4 with tokens defined in `app/globals.css`. The token
names are intentionally kept in sync, so `var(--accent-soft)` in the design maps
directly to `bg-accent-soft` in Tailwind.

The one remaining non-obvious mapping is the button system, where design CSS class
names don't correspond to React prop values.

## Guidance

### Button variants

The design uses CSS classes; the implementation uses a `variant` prop on `<Button>`.
They don't share names, and the default `<Button>` renders black — which looks plausible
but is wrong whenever the design shows a coloured primary CTA.

| Design class | Implementation |
|---|---|
| `.btn--primary` | `<Button variant="accent">` |
| `.btn--secondary` | `<Button variant="outline">` |
| `.btn--ghost` | `<Button variant="ghost">` |

See `components/ui/button.tsx` for all variants.

### Where to look when something looks wrong

- **`docs/visual-designs/folio.css`** — design token definitions and component classes
- **`app/globals.css`** — Tailwind `@theme inline` block (token names match folio.css)
- **`components/ui/button.tsx`** — button variant definitions

### Verification workflow

Take a screenshot of the live implementation and compare against the design HTML.
`agent-browser screenshot` is useful for this. The most common divergences are button
colour, font family on headings, and card/border presence.

## Related

- `docs/visual-designs/folio.css` — source of truth for design tokens
- `app/globals.css` — Tailwind token bridge
- `components/ui/button.tsx` — button variant definitions
