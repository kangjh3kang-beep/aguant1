/**
 * BrowserSession — Puppeteer/puppeteer-core Based Headless Chrome Control
 *
 * Manages browser lifecycle: launch, create pages, and close.
 */

import { BrowserAutomationConfig, PuppeteerBrowser, PuppeteerPage, PuppeteerModule, loadPuppeteer, findChromePath } from './types';

export class BrowserSession {
  private browser: PuppeteerBrowser | null = null;
  private puppeteer: PuppeteerModule | null = null;
  private config: BrowserAutomationConfig;

  constructor(config: BrowserAutomationConfig) {
    this.config = config;
  }

  /** Launch browser session */
  async launch(): Promise<boolean> {
    this.puppeteer = loadPuppeteer();
    if (!this.puppeteer) return false;

    try {
      const launchOptions: Record<string, unknown> = {
        headless: this.config.headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          `--window-size=${this.config.viewport.width},${this.config.viewport.height}`,
        ],
      };

      // puppeteer-core requires Chrome path
      const chromePath = findChromePath();
      if (chromePath) {
        launchOptions.executablePath = chromePath;
      }

      this.browser = await this.puppeteer.launch(launchOptions) as PuppeteerBrowser;
      return true;
    } catch (_err: unknown) {
      return false;
    }
  }

  /** Create a new page */
  async newPage(): Promise<PuppeteerPage | null> {
    if (!this.browser) return null;

    const page = await this.browser.newPage();
    await page.setViewport({
      width: this.config.viewport.width,
      height: this.config.viewport.height,
    });

    // Set User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Antigravity-Agent/1.0',
    );

    return page;
  }

  /** Close browser session */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] browser close:', err instanceof Error ? err.message : String(err)); }
      }
      this.browser = null;
    }
  }

  isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}
