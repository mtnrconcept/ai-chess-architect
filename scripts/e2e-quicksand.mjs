/**
 * Browser regression test for an actual GPT-5.6 Sol Rule Architect V2 fixture.
 *
 * Chrome drives the real React UI and RuleEngine. It is NOT a mocked engine.
 * Runs against local Vite by default, or AICHESS_E2E_URL for deployed builds.
 * Playwright is installed into RUNNER_TEMP so the app lockfile is unchanged.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const packageRoot = path.join(process.env.RUNNER_TEMP || "/tmp", "aichess-playwright", "package.json");
const { chromium } = createRequire(packageRoot)("playwright");

const target = process.env.AICHESS_E2E_URL || "http://127.0.0.1:4173/play?demo=quicksand";
const reportDir = path.resolve("test-results", "quicksand");
fs.mkdirSync(reportDir, { recursive: true });

const report = { target, steps: [], pageErrors: [], consoleErrors: [], domViolations: [], final: null };
let browser, page;
function record(title, extra = {}) {
  report.steps.push({ title, ...extra, timestamp: new Date().toISOString() });
  console.log("[e2e]", title, JSON.stringify(extra));
}
async function assertHealthy() {
  const error = await page.getByText("Cette page a rencontré un problème").count();
  assert.equal(error, 0, "React error boundary appeared");
  assert.equal(report.pageErrors.length, 0, "Unexpected browser JS exception:\n" + report.pageErrors.join("\n"));
}
const cell = (square) => page.locator('[data-chess-cell="' + square + '"]');
async function move(from, to) {
  const piece = await cell(from).getAttribute("aria-label");
  assert.ok(piece && !piece.includes("vide"), "Expected a piece at " + from);
  await cell(from).click();
  await cell(to).click();
  await page.waitForTimeout(150);
  await assertHealthy();
  record("move " + from + "->" + to, {
    fromAfter: await cell(from).getAttribute("aria-label"),
    toAfter: await cell(to).getAttribute("aria-label"),
  });
}
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader"] });
  page = await browser.newPage({ viewport: { width: 1320, height: 960 }, locale: "fr-CH", reducedMotion: "reduce" });
  page.on("pageerror", (e) => { report.pageErrors.push(e.stack ?? String(e)); console.error("[pageerror]", e.stack ?? String(e)); });
  page.on("console", (message) => {
    if (message.type() === "error") {
      report.consoleErrors.push(message.text());
      console.error("[browser console]", message.text().slice(0, 2200));
    }
  });
  page.on("crash", () => {
    report.pageErrors.push("CHROMIUM_RENDERER_CRASH");
    console.error("[browser] renderer crashed");
  });
  await page.addInitScript(() => {
    window.__aichessDomViolations = [];
    const original = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (node, before) {
      if (before !== null && before.parentNode !== this) {
        const violation = {
          parent: this.nodeName,
          inserted: node?.nodeName,
          reference: before?.nodeName,
          referenceParent: before?.parentNode?.nodeName,
          stack: new Error("DOM_INSERT_PARENT_MISMATCH").stack,
        };
        window.__aichessDomViolations.push(violation);
        console.error("AICHESS_DOM_INSERT_PARENT_MISMATCH", JSON.stringify(violation));
      }
      return original.call(this, node, before);
    };
  });

  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 35_000 });
  await cell("d2").waitFor({ state: "visible", timeout: 35_000 });
  await assertHealthy();
  assert.match((await page.locator("h1").innerText()), /Pièges de sables mouvants des pions/);
  assert.equal(await page.getByText("Aucune aptitude disponible.").count(), 1, "Legacy ability should be disabled");
  record("custom rule loaded");

  await cell("d2").click();
  assert.equal(await cell("d2").getAttribute("aria-pressed"), "true", "White pawn was not selected");
  const action = page.getByRole("button", { name: /^Poser des sables mouvants$/ });
  await action.first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  record("target dialog displayed");
  await dialog.getByRole("button", { name: "Case e3" }).click();
  await page.locator('[data-testid="quicksand-e3"]').waitFor({ state: "attached", timeout: 5000 });
  await assertHealthy();
  assert.equal(await cell("e3").getAttribute("data-rule-trap"), "quicksand");
  record("visible trap placed", { label: await cell("e3").getAttribute("aria-label") });

  await move("g8", "f6");
  assert.match(await cell("f6").getAttribute("aria-label"), /knight noir/);
  await move("e2", "e3");
  assert.equal(await cell("e3").getAttribute("data-rule-trap"), "quicksand", "Ally must not consume trap");
  await move("f6", "d5");
  await move("a2", "a3");
  await move("d5", "e3");
  const final = {
    occupant: await cell("e3").getAttribute("aria-label"),
    trap: await cell("e3").getAttribute("data-rule-trap"),
  };
  assert.match(final.occupant, /vide/, "Enemy knight must be swallowed immediately");
  assert.equal(final.trap, null, "Trap must disappear after first enemy enters");
  await assertHealthy();
  report.final = { success: true, ...final };
  record("FULL_CUSTOM_GAMEPLAY_PASS", final);
} catch (error) {
  report.final = { success: false, error: error?.stack ?? String(error) };
  console.error("FULL_CUSTOM_GAMEPLAY_FAILED", report.final.error);
  if (page && !page.isClosed()) {
    try {
      report.domViolations = await page.evaluate(() => window.__aichessDomViolations ?? []);
      await page.screenshot({ path: path.join(reportDir, "failure.png"), fullPage: true });
    } catch (snapshotError) { console.warn("Unable to capture failed page:", String(snapshotError)); }
  }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(reportDir, "result.json"), JSON.stringify(report, null, 2));
  await browser?.close();
}
