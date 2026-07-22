// Browser-truth smoke for the dashboard (ops-6): serve .kb/site over HTTP
// (Quarto's OJS runtime refuses file:// by design), load it in headless
// Chromium, and fail on any console/page error or an unpopulated page.
// Run: bun run dashboard:smoke  (after bun run dashboard)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const html = readFileSync(".kb/site/index.html");
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html);
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

await page.goto(`http://localhost:${server.address().port}/`, {
  waitUntil: "load",
  timeout: 30000,
});
await page.waitForTimeout(5000);

const expectations = {
  state: /Entities\s*\d+/,
  "since-last-visit": /What changed/,
  coverage: /Measured/,
  bench: /Latest committed run/,
};
const failures = [];
for (const [id, want] of Object.entries(expectations)) {
  const tab = page.locator(`a[href="#${id}"]`).first();
  if (await tab.count()) await tab.click().catch(() => {});
  await page.waitForTimeout(700);
  const el = page.locator(`#${id}`);
  const text =
    (await el.count()) > 0 ? (await el.innerText()).replace(/\s+/g, " ") : "";
  if (!want.test(text)) failures.push(`[${id}] missing ${want} — got: ${text.slice(0, 120)}`);
}

await browser.close();
server.close();

for (const e of [...new Set(errors)]) console.error("ERROR", e);
for (const f of failures) console.error("FAIL ", f);
if (errors.length || failures.length) {
  console.error(`dashboard smoke: ${errors.length} error(s), ${failures.length} page failure(s)`);
  process.exit(1);
}
console.log("dashboard smoke: clean — 0 errors, all 4 pages populated");
process.exit(0);
