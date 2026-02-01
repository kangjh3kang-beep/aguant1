/**
 * PageInteractor — Page Navigation, Click, Type, Scroll, Wait
 *
 * Provides high-level interaction methods for Puppeteer pages.
 */

import { PuppeteerPage } from './types';

// Browser context type declarations — `any` required (no DOM lib in tsconfig)
/* eslint-disable no-var, @typescript-eslint/no-explicit-any */
declare var window: Record<string, any>;
/* eslint-enable no-var, @typescript-eslint/no-explicit-any */

export class PageInteractor {
  private defaultTimeout: number;

  constructor(timeout: number = 30000) {
    this.defaultTimeout = timeout;
  }

  /** Navigate to URL */
  async navigate(page: PuppeteerPage, url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: this.defaultTimeout });
  }

  /** Click element by CSS selector */
  async click(page: PuppeteerPage, selector: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.click(selector);
  }

  /** Type text into input field */
  async type(page: PuppeteerPage, selector: string, text: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.click(selector, { count: 3 }); // select all
    await page.type(selector, text);
  }

  /** Scroll page */
  async scroll(page: PuppeteerPage, y: number): Promise<void> {
    await page.evaluate((scrollY: number) => window.scrollBy(0, scrollY), y);
  }

  /** Wait for element to exist */
  async waitFor(page: PuppeteerPage, selector: string, timeout?: number): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout: timeout || this.defaultTimeout });
      return true;
    } catch (_err: unknown) {
      return false;
    }
  }

  /** Hover over element */
  async hover(page: PuppeteerPage, selector: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.hover(selector);
  }

  /** Select a value from a select box */
  async select(page: PuppeteerPage, selector: string, value: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.select(selector, value);
  }

  /** Press a keyboard key */
  async pressKey(page: PuppeteerPage, key: string): Promise<void> {
    await page.keyboard.press(key);
  }

  /** Assert text exists on page */
  async assertText(page: PuppeteerPage, expectedText: string): Promise<boolean> {
    const content = await page.content();
    return content.includes(expectedText);
  }

  /** Assert element is visible */
  async assertVisible(page: PuppeteerPage, selector: string): Promise<boolean> {
    try {
      const el = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      return el !== null;
    } catch (_err: unknown) {
      return false;
    }
  }

  /** Assert current URL */
  async assertUrl(page: PuppeteerPage, expectedUrl: string): Promise<boolean> {
    const currentUrl = page.url();
    return currentUrl.includes(expectedUrl);
  }
}
