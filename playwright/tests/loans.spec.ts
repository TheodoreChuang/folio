import { test, expect } from '@playwright/test'

test.describe('Loans', () => {
  test('adds a loan', async ({ page }) => {
    await page.goto('/loans')

    await page.getByRole('main').getByRole('link', { name: '+ Add loan' }).click()
    await expect(page).toHaveURL(/\/loans\/new/, { timeout: 10000 })

    // Select lender from bank picker
    await page.getByRole('button', { name: /Commonwealth Bank/ }).click()
    await page.locator('#nickname').fill('Investment loan')

    // Wait for the async property list to load, then select the seeded property.
    // When only one property exists the page auto-selects it; clicking again would
    // deselect it, so only click if not already in the selected state.
    const propButton = page.getByRole('button', { name: /123 Smith St/ })
    await expect(propButton).toBeVisible({ timeout: 10000 })
    const isAutoSelected = (await propButton.getAttribute('class') ?? '').includes('bg-accent-soft')
    if (!isAutoSelected) {
      await propButton.click()
    }

    await page.locator('#start-date').fill('2022-06-01')
    await page.locator('#loan-term-years').fill('30')

    await page.getByRole('button', { name: 'Add loan' }).click()

    await expect(page).toHaveURL(/\/loans\/.+/, { timeout: 10000 })
  })
})
