# Design-sync notes — Folio UI

Context for whoever (human or agent) re-runs this sync later.

## Non-standard config choices, and why

- **`pkg: ".."`** — Folio isn't a publishable package; `components/ui/` lives
  directly in the app. This value is a deliberate hack so `join(NODE_MODULES, PKG)`
  resolves to the repo root, which the converter's `cssEntry` containment check
  needs. Don't "clean this up" to a real package name without re-checking that
  containment logic.
- **`storyImports.bundle: [".."]`** — required side effect of the `pkg: ".."` hack
  above. Without it, the `dsShim` plugin's `pkgRx` (built from `cfg.pkg`) becomes a
  regex that matches ANY relative import starting with `..` — including Recharts'
  own internal `../component/Label` import — and wrongly shims it to Folio's own
  `Label` component (`ds_Label_exports.Label.renderCallByParent is not a function`).
  This override neutralizes that specific rule without restructuring `PKG_DIR`
  resolution. If `pkg` is ever changed away from `".."`, re-check whether this
  override is still needed.
- **`buildCmd: "node .design-sync/compile-css.mjs"` + `cssEntry`** — Folio's
  `app/globals.css` starts with `@import "tailwindcss"`, which is a Tailwind v4
  directive, not a real file — the converter can't resolve it directly. The build
  command runs the app's own `@tailwindcss/postcss` pipeline first to produce a
  real, self-contained stylesheet at `.design-sync/.cache/compiled-globals.css`,
  which `cssEntry` then points at. Re-run this whenever `app/globals.css` or any
  scanned component's className usage changes — the cache dir is gitignored.
- **`readmeHeader: ".design-sync/conventions.md"`** — repo-authored conventions
  doc, prepended verbatim to the generated README (and thus to the design agent's
  prompt). Resolved relative to the repo root (the dir containing `.design-sync/`).

## Re-sync risks to watch for

- **The shadcn color-bridge bug could recur.** `app/globals.css` has a `:root`
  block defining bare (unprefixed) shadcn variable names (`--primary`, `--popover`,
  `--muted`, etc.) and a separate `@theme inline` block that aliases them into
  `--color-*` names Tailwind v4 actually generates utilities from. If a new bare
  shadcn variable is ever added to the `:root` block without a matching
  `--color-X: var(--X)` line in the `@theme inline` block below it, the
  corresponding `bg-X`/`text-X`/`border-X` utility will silently not exist —
  same failure mode fixed in `fix/tailwind-v4-shadcn-token-bridge`. Worth a quick
  visual check of any new/re-added component that uses shadcn-bridge tokens.
- **Toaster preview has a minor cosmetic clip.** At `320x340` viewport the toast
  card's top border edge is very slightly clipped; title/content are fully
  legible. Accepted as good-enough — revisit only if someone wants pixel-perfect.

## Scope of authored previews

30 top-level components have hand-authored `.design-sync/previews/*.tsx` files
with realistic Folio content and are graded "good" in
`.design-sync/.cache/review/*.grade.json`. The remaining ~53 shadcn compound
sub-parts (e.g. `DialogTrigger`, `SelectItem`, `TabsList`) ship as functional
floor cards without hand-authored previews — this is expected, not a gap to
close; they're exercised through their parent's authored preview.
