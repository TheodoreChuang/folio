# Folio UI — conventions for designs built with this system

## Setup

Components come from `components/ui/` in the Folio Next.js app (shadcn/ui primitives,
customized). They are plain React + Tailwind — no CSS-in-JS, no styled-components.

## Styling idiom

Every component composes styles with the `cn()` helper (`clsx` + `tailwind-merge`),
so a caller-supplied `className` always overrides the component's defaults instead of
fighting them:

```tsx
import { cn } from "@/lib/utils"

<div className={cn("rounded-md border bg-card p-4", className)} />
```

Class names always use Folio's real design tokens, never raw Tailwind defaults or
arbitrary hex values — e.g. `bg-primary`, `text-foreground-muted`, `border-input`,
`bg-warning-soft`, `text-negative`. When composing new designs with these components,
reuse these token names rather than inventing new colors.

## Where the truth lives

- `app/globals.css` is the single source of truth for every design token (`@theme`
  block: surfaces, ink, lines, accent, semantic colors, radius scale) and the shadcn
  variable bridge (`:root` block + the `@theme inline` alias block that maps it into
  Tailwind v4's utility generation).
- `.design-sync/.cache/compiled-globals.css` is the compiled, self-contained output of
  that file (via `.design-sync/compile-css.mjs`, which runs the app's own
  `@tailwindcss/postcss` pipeline) — this is what `_ds_bundle.css` / `styles.css` in
  this bundle were built from. It's gitignored and regenerated on every sync.

## Example: an idiomatic composition

```tsx
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <span className="font-medium">42 Wattle Street</span>
      <Badge variant="outline">Active</Badge>
    </div>
  </CardHeader>
  <CardContent className="text-sm text-foreground-muted">
    Net cashflow: $1,240/mo
  </CardContent>
</Card>
```
