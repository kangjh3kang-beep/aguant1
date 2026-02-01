/**
 * ScreenshotEngine — Screenshot Capture and Pixel Comparison
 *
 * Captures full-page and viewport screenshots,
 * and performs binary-level comparison for visual regression detection.
 */

import fs from 'fs';
import path from 'path';
import { PuppeteerPage } from './types';

export class ScreenshotEngine {
  private screenshotDir: string;

  constructor(screenshotDir: string) {
    this.screenshotDir = screenshotDir;
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  }

  /** Full-page screenshot capture */
  async capture(page: PuppeteerPage, name: string): Promise<string> {
    const filePath = path.join(this.screenshotDir, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  /** Viewport screenshot capture */
  async captureViewport(page: PuppeteerPage, name: string): Promise<string> {
    const filePath = path.join(this.screenshotDir, `${name}-viewport.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  /**
   * Compare pixel differences between two screenshots (quick comparison).
   * File-size based + binary diff based quick check.
   * Precise pixel-diff requires the pixelmatch package,
   * but here we perform binary comparison without external dependencies.
   */
  compare(baselinePath: string, currentPath: string): { identical: boolean; diffPercent: number; diffDetails: string } {
    if (!fs.existsSync(baselinePath)) {
      return { identical: false, diffPercent: -1, diffDetails: `Baseline not found: ${baselinePath}` };
    }
    if (!fs.existsSync(currentPath)) {
      return { identical: false, diffPercent: -1, diffDetails: `Current not found: ${currentPath}` };
    }

    const baselineBuffer = fs.readFileSync(baselinePath);
    const currentBuffer = fs.readFileSync(currentPath);

    // Size comparison
    const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
    const maxSize = Math.max(baselineBuffer.length, currentBuffer.length);

    if (baselineBuffer.equals(currentBuffer)) {
      return { identical: true, diffPercent: 0, diffDetails: 'Screenshots are identical' };
    }

    // Byte-level comparison
    const minLen = Math.min(baselineBuffer.length, currentBuffer.length);
    let diffBytes = 0;
    for (let i = 0; i < minLen; i++) {
      if (baselineBuffer[i] !== currentBuffer[i]) diffBytes++;
    }
    diffBytes += Math.abs(baselineBuffer.length - currentBuffer.length);

    const diffPercent = Math.round((diffBytes / maxSize) * 100 * 100) / 100;

    return {
      identical: false,
      diffPercent,
      diffDetails: `Size diff: ${sizeDiff} bytes, Byte diff: ${diffPercent}% (${diffBytes}/${maxSize} bytes)`,
    };
  }

  /** List existing baselines */
  listBaselines(): string[] {
    try {
      return fs.readdirSync(this.screenshotDir)
        .filter((f) => /\.(png|jpg|jpeg)$/.test(f))
        .map((f) => path.join(this.screenshotDir, f));
    } catch (_err: unknown) {
      return [];
    }
  }
}
