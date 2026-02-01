/**
 * PerformanceAnalyzer — Core Web Vitals Measurement
 *
 * Measures LCP, CLS, FID/INP, TTFB, FCP using Performance API
 * and PerformanceObserver within Puppeteer pages.
 */

import { PuppeteerPage, PerformanceMetrics, TaskIssue } from './types';

export class PerformanceAnalyzer {
  /**
   * Measure Core Web Vitals and performance metrics from a Puppeteer page.
   * Uses Performance API + PerformanceObserver.
   */
  async measure(page: PuppeteerPage): Promise<PerformanceMetrics> {
    const metrics = await page.evaluate(() => {
      // `any` is intentional: Performance API types require "dom" lib,
      // which is excluded in this Node.js project's tsconfig.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const perf = performance as any;
      const nav = perf.getEntriesByType('navigation')[0];
      const paint = perf.getEntriesByType('paint') as any[];
      const resources = perf.getEntriesByType('resource') as any[];

      // FCP
      const fcpEntry = paint.find((p: any) => p.name === 'first-contentful-paint');
      const fcp = fcpEntry ? (fcpEntry as any).startTime : null;

      // LCP - PerformanceObserver results (already recorded)
      let lcp: number | null = null;
      try {
        const lcpEntries = (performance as any).getEntriesByType?.('largest-contentful-paint');
        if (lcpEntries && lcpEntries.length > 0) {
          lcp = lcpEntries[lcpEntries.length - 1].startTime;
        }
      } catch (err: unknown) {
        if (typeof process !== 'undefined' && process.env?.AG_DEBUG) { console.debug('[BrowserAutomation] LCP API not supported:', err instanceof Error ? err.message : String(err)); }
      }

      // CLS
      let cls: number | null = null;
      try {
        const layoutShiftEntries = (performance as any).getEntriesByType?.('layout-shift');
        if (layoutShiftEntries && layoutShiftEntries.length > 0) {
          cls = layoutShiftEntries
            .filter((e: any) => !e.hadRecentInput)
            .reduce((sum: number, e: any) => sum + e.value, 0);
        }
      } catch (err: unknown) {
        if (typeof process !== 'undefined' && process.env?.AG_DEBUG) { console.debug('[BrowserAutomation] Layout Shift API not supported:', err instanceof Error ? err.message : String(err)); }
      }

      // Navigation Timing
      const ttfb = nav ? nav.responseStart - nav.requestStart : null;
      const domContentLoaded = nav ? nav.domContentLoadedEventEnd - nav.startTime : null;
      const loadEvent = nav ? nav.loadEventEnd - nav.startTime : null;

      // Resources
      const resourceCount = resources.length;
      const totalTransferSize = resources.reduce((sum: number, r: any) => sum + (r.transferSize || 0), 0);

      return {
        lcp,
        fid: null, // FID requires actual user input (synthetic test)
        cls,
        ttfb,
        fcp,
        domContentLoaded,
        loadEvent,
        resourceCount,
        totalTransferSize,
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    return metrics;
  }

  /** Convert performance metrics to TaskIssues (threshold-based) */
  toIssues(metrics: PerformanceMetrics, url: string): TaskIssue[] {
    const issues: TaskIssue[] = [];

    // LCP: Good < 2.5s, Poor > 4s
    if (metrics.lcp !== null && metrics.lcp > 4000) {
      issues.push({
        severity: 'error',
        message: `[Performance] LCP ${Math.round(metrics.lcp)}ms > 4000ms (Poor) — ${url}`,
        suggestion: 'LCP 개선: 이미지 최적화, preload, 서버 응답 속도 개선, 렌더 블로킹 제거',
        autoFixable: false,
      });
    } else if (metrics.lcp !== null && metrics.lcp > 2500) {
      issues.push({
        severity: 'warning',
        message: `[Performance] LCP ${Math.round(metrics.lcp)}ms > 2500ms (Needs Improvement) — ${url}`,
        suggestion: 'LCP 개선: lazy loading, 이미지 포맷 최적화 (WebP/AVIF)',
        autoFixable: false,
      });
    }

    // CLS: Good < 0.1, Poor > 0.25
    if (metrics.cls !== null && metrics.cls > 0.25) {
      issues.push({
        severity: 'error',
        message: `[Performance] CLS ${metrics.cls.toFixed(3)} > 0.25 (Poor) — ${url}`,
        suggestion: 'CLS 개선: 이미지/광고에 크기 지정, 동적 콘텐츠 영역 예약, font-display: swap',
        autoFixable: false,
      });
    } else if (metrics.cls !== null && metrics.cls > 0.1) {
      issues.push({
        severity: 'warning',
        message: `[Performance] CLS ${metrics.cls.toFixed(3)} > 0.1 (Needs Improvement) — ${url}`,
        suggestion: 'CLS 개선: 동적 요소에 min-height 지정',
        autoFixable: false,
      });
    }

    // TTFB: Good < 800ms
    if (metrics.ttfb !== null && metrics.ttfb > 1800) {
      issues.push({
        severity: 'error',
        message: `[Performance] TTFB ${Math.round(metrics.ttfb)}ms > 1800ms — ${url}`,
        suggestion: 'TTFB 개선: CDN 사용, 서버 캐싱, DB 쿼리 최적화',
        autoFixable: false,
      });
    } else if (metrics.ttfb !== null && metrics.ttfb > 800) {
      issues.push({
        severity: 'warning',
        message: `[Performance] TTFB ${Math.round(metrics.ttfb)}ms > 800ms — ${url}`,
        autoFixable: false,
      });
    }

    // Resource size
    if (metrics.totalTransferSize > 5 * 1024 * 1024) {
      issues.push({
        severity: 'warning',
        message: `[Performance] Total transfer size ${(metrics.totalTransferSize / 1024 / 1024).toFixed(1)}MB > 5MB — ${url}`,
        suggestion: '번들 크기 최적화: 코드 스플리팅, 트리 셰이킹, 압축 확인',
        autoFixable: false,
      });
    }

    // DOM Content Loaded
    if (metrics.domContentLoaded !== null && metrics.domContentLoaded > 5000) {
      issues.push({
        severity: 'warning',
        message: `[Performance] DOMContentLoaded ${Math.round(metrics.domContentLoaded)}ms > 5000ms — ${url}`,
        suggestion: 'HTML 파싱 최적화: 인라인 CSS 최소화, defer/async 스크립트',
        autoFixable: false,
      });
    }

    return issues;
  }
}
