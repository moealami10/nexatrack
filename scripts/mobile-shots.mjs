/**
 * Mobile visual QA: screenshot every page at 360/390/768px against the
 * production build (vite preview) with the demo dataset pre-seeded, and
 * report any horizontal overflow found. Run:
 *   npm run build && node scripts/mobile-shots.mjs
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const BASE = 'http://localhost:4173/nexatrack'
const WIDTHS = [360, 390, 768]
const PAGES = ['dashboard', 'products', 'inventory', 'orders', 'drivers', 'routes']

const seed = JSON.parse(
  await readFile(new URL('../e2e/seed.json', import.meta.url), 'utf8'),
)
/** Seeds the store before the app boots, so pages render real content. */
function seedScript(seed) {
  for (const [key, value] of Object.entries(seed)) {
    localStorage.setItem(`nexatrack:v3:${key}`, JSON.stringify(value))
  }
}

const SPIN = async (proc, url) => {
  for (let i = 0; i < 100; i += 1) {
    try {
      await fetch(url)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw new Error('vite preview never became reachable')
}

const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'ignore',
})

try {
  await SPIN(preview, BASE)
  const browser = await chromium.launch()

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: width === 768 ? 2 : 2,
      isMobile: width < 768,
      hasTouch: width < 768,
    })
    const page = await context.newPage()

    for (const route of PAGES) {
      await page.addInitScript(seedScript, seed)
      await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(700)
      const overflow = await page.evaluate(() => {
        const doc = document.scrollingElement
        const wide = []
        if (doc.scrollWidth > window.innerWidth + 1) {
          document.querySelectorAll('body *').forEach((el) => {
            if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
              wide.push(`${el.tagName}.${el.className.split(' ')[0]}`)
            }
          })
        }
        return {
          scrollWidth: doc.scrollWidth,
          innerWidth: window.innerWidth,
          wide: wide.slice(0, 8),
        }
      })
      const flag =
        overflow.scrollWidth > overflow.innerWidth + 1
          ? ` ⚠ OVERFLOW (+${overflow.scrollWidth - overflow.innerWidth}px: ${overflow.wide.join(', ')})`
          : ' ✓'
      console.log(`${width}px ${route}${flag}`)
      await page.screenshot({
        path: `screenshots/${route}-${width}.png`,
        fullPage: true,
      })
    }

    // Interactive states at 360px only (sheets, drawer, menus).
    if (width === 360) {
      const shot = async (name, actions) => {
        await page.goto(`${BASE}/products`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(400)
        await actions()
        await page.waitForTimeout(450)
        await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
      }

      // "⋯" action sheet on the first product card.
      await shot('x-products-actionsheet', async () => {
        const menu = page.getByLabel('Actions').first()
        await menu.click()
      })

      // Product form as a bottom sheet.
      await shot('x-product-form-sheet', async () => {
        await page
          .getByRole('button', { name: /Add product|Ajouter/ })
          .first()
          .click()
      })

      // New order modal.
      await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(400)
      await page
        .getByRole('button', { name: /New order|Nouvelle/ })
        .first()
        .click()
      await page.waitForTimeout(450)
      await page.screenshot({ path: 'screenshots/x-order-form-sheet.png', fullPage: true })

      // Order detail drawer.
      await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(400)
      const firstCard = page.locator('li[class*="cursor-pointer"]').first()
      if (await firstCard.count()) {
        await firstCard.click()
        await page.waitForTimeout(500)
        await page.screenshot({ path: 'screenshots/x-order-detail-sheet.png', fullPage: true })
      } else {
        console.log('detail drawer skipped (no order cards)')
      }

      // "More" tab sheet.
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(400)
      await page
        .getByRole('button', { name: /More|Plus/ })
        .first()
        .click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: 'screenshots/x-more-sheet.png', fullPage: true })
    }

    await context.close()
  }

  await browser.close()
} finally {
  preview.kill()
}
