import type { Page } from '@playwright/test'

export class NavigationHelper {
  constructor(private page: Page) {}

  /** Click a sidebar nav item by label text */
  async navigateTo(label: string) {
    await this.page.locator('aside button', { hasText: label }).click()
    await this.waitForDataLoad()
  }

  /** Wait for any loading spinners to disappear */
  async waitForDataLoad(timeout = 10_000) {
    // Wait a tick for spinners to appear, then wait for them to go away
    await this.page.waitForTimeout(200)
    await this.page.locator('.animate-spin').first().waitFor({ state: 'hidden', timeout }).catch(() => {
      // No spinner found, that's fine - data loaded instantly
    })
  }

  /** Set up a dialog handler before triggering a confirm() dialog */
  handleConfirmDialog(accept: boolean) {
    this.page.once('dialog', async (dialog) => {
      if (accept) {
        await dialog.accept()
      } else {
        await dialog.dismiss()
      }
    })
  }

  /** Get the page heading text */
  async getHeading(): Promise<string> {
    return this.page.locator('h1').first().innerText()
  }
}
