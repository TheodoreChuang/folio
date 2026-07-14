#!/usr/bin/env node
// Compiles app/globals.css (Tailwind v4 CSS-first source) into a real,
// self-contained stylesheet the design-sync converter can copy verbatim.
// Tailwind v4's @import "tailwindcss" is a build-time directive, not a real
// file — the converter's cfg.cssEntry expects already-compiled CSS, so this
// runs the same @tailwindcss/postcss plugin the app's own postcss.config.mjs
// uses, scanning the repo for utility classes actually in use.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

const repoRoot = resolve(import.meta.dirname, '..')
const input = resolve(repoRoot, 'app/globals.css')
const outDir = resolve(repoRoot, '.design-sync/.cache')
const output = resolve(outDir, 'compiled-globals.css')

const css = readFileSync(input, 'utf8')
const result = await postcss([tailwindcss({ base: repoRoot })]).process(css, { from: input, to: output })

mkdirSync(outDir, { recursive: true })
writeFileSync(output, result.css)
console.error(`compiled ${input} -> ${output} (${(result.css.length / 1024).toFixed(0)} KB)`)
