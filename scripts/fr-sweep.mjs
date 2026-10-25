/**
 * French label stress test at 360px: seeds demo data + fr locale, walks
 * every page and reports horizontal overflow. Also captures previews.
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const BASE = 'http://localhost:4173/nexatrack'
const PAGES = ['dashboard', 'products', 'inventory', 'orders', 'drivers', 'routes']
const seed = JSON.parse(await readFile(new URL('../e2e/seed.json', import.meta.url), 'utf8'))

function seedScript(data) {
  for (const [key, value] of Object.entries(data)) {
    localStorage.setItem(`nexatrack:v3:${key}`, JSON.stringify(value))
  }
  localStorage.setItem('nexatrack:v3:lang', 'fr')
}

const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'ignore',
})

for (let i = 0; i < 100; i += 1) {
  try {
    await fetch(BASE)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 200))
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
await page.addInitScript(seedScript, seed)

for (const route of PAGES) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const overflow = await page.evaluate(() => {
    const doc = document.scrollingElement
    const wide = []
    if (doc.scrollWidth > window.innerWidth + 1) {
      document.querySelectorAll('body *').forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          wide.push(`${el.tagName}.${String(el.className).split(' ')[0]} "${(el.textContent ?? '').slice(0, 30)}"`)
        }
      })
    }
    return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, wide: wide.slice(0, 10) }
  })
  const flag =
    overflow.scrollWidth > overflow.innerWidth + 1
      ? ` ⚠ OVERFLOW +${overflow.scrollWidth - overflow.innerWidth}px → ${overflow.wide.join(' | ')}`
      : ' ✓'
  console.log(`360px FR ${route}${flag}`)
  await page.screenshot({ path: `screenshots/fr-${route}-360.png`, fullPage: true })
}

// A driver-selected routes view (sticky strip + stop panel open).
await page.goto(`${BASE}/routes`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.locator('select').first().selectOption({ index: 1 })
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Afficher les arrêts/ }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/fr-routes-stops-360.png' })

await browser.close()
preview.kill()
