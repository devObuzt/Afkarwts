import { existsSync } from "node:fs";

/**
 * Turning a page of this app into a PDF.
 *
 * The report is a wide Arabic table, and Arabic needs shaping and
 * right-to-left ordering that a PDF drawing library does not do: a font
 * handed glyphs one at a time produces disconnected letters in the wrong
 * order. A browser already does all of it, and the print stylesheet for
 * this table is written — so the browser renders it and we take the PDF.
 *
 * The fonts come from the app itself: next/font self-hosts IBM Plex Sans
 * Arabic and Cairo at build time, so Chromium fetches them over localhost
 * and never depends on what the container has installed.
 */

const CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/root/.nix-profile/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean) as string[];

export function findBrowser() {
  return CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

export async function renderPdf(input: { url: string; cookies: string; landscape?: boolean }) {
  const executablePath = findBrowser();

  if (!executablePath) {
    throw new Error("لا يوجد متصفّح على الخادم لتوليد PDF.");
  }

  const { default: puppeteer } = await import("puppeteer-core");

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"]
  });

  try {
    const page = await browser.newPage();

    // The report is behind the login, so the caller's own session goes with
    // the request — the PDF can never contain more than they could open.
    const { hostname } = new URL(input.url);
    const jar = input.cookies
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: hostname, path: "/" };
      })
      .filter((cookie) => cookie.name);

    if (jar.length) {
      await page.setCookie(...jar);
    }

    await page.goto(input.url, { waitUntil: "networkidle0", timeout: 60_000 });
    // The self-hosted faces must be in before the layout is measured, or
    // the table is paginated against fallback metrics.
    await page.evaluateHandle("document.fonts.ready");

    return await page.pdf({
      format: "a4",
      landscape: input.landscape !== false,
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" }
    });
  } finally {
    await browser.close();
  }
}
