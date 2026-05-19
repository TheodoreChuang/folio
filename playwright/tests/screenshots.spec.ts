import { test } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const OUT = path.join(process.cwd(), 'screenshots')

const PAGES = [
  { name: 'dashboard', url: '/dashboard' },
  { name: 'properties', url: '/properties' },
  { name: 'loans', url: '/loans' },
  { name: 'upload', url: '/upload' },
  { name: 'entities', url: '/entities' },
]

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true })
})

for (const { name, url } of PAGES) {
  test(`screenshot ${name}`, { tag: ['@screenshot'] }, async ({ page }) => {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(OUT, `${name}.png`),
      fullPage: true,
    })
  })
}
