import { test, expect } from '@playwright/test'

test.describe('Entities', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/entities')
    if (!res.ok()) return
    const { entities } = await res.json()
    for (const entity of entities) {
      if (entity.name === 'Smith Family Trust') {
        await request.delete(`/api/entities/${entity.id}`)
      }
    }
  })

  test('adds an entity', async ({ page }) => {
    await page.goto('/entities')

    await page.getByRole('button', { name: '+ Add entity' }).click()
    await expect(page.locator('#new-entity-name')).toBeVisible({ timeout: 10000 })

    await page.locator('#new-entity-name').fill('Smith Family Trust')
    await page.locator('#new-entity-type').selectOption('Discretionary trust')
    await page.getByRole('button', { name: 'Add entity', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Smith Family Trust' })).toBeVisible({ timeout: 10000 })
  })
})
