/**
 * A11yAuditor — Runtime Accessibility Audit
 *
 * Inspects the rendered DOM for accessibility violations using
 * pure DOM API (no external dependencies like axe-core).
 * If axe-core is installed, it will be used automatically.
 */

import { PuppeteerPage, A11yViolation, TaskIssue } from './types';

// Browser context type declarations for page.evaluate() callbacks.
// `any` is intentional: DOM types (Element, HTMLElement, etc.) are not
// available in this project's tsconfig (lib: ES2020, no "dom").
// These callbacks execute in the browser, not Node.js.
/* eslint-disable no-var, @typescript-eslint/no-explicit-any */
declare var document: Record<string, any>;
declare var window: Record<string, any>;
/* eslint-enable no-var, @typescript-eslint/no-explicit-any */

export class A11yAuditor {
  /**
   * Audit the rendered DOM for accessibility violations.
   * Performed via pure DOM API without external libraries.
   */
  async audit(page: PuppeteerPage): Promise<A11yViolation[]> {
    const violations = await page.evaluate(() => {
      const results: Array<{
        rule: string;
        impact: 'critical' | 'serious' | 'moderate' | 'minor';
        description: string;
        selector: string;
        html: string;
        suggestion: string;
      }> = [];

      // 1. img without alt
      document.querySelectorAll('img').forEach((img: any) => {
        if (!img.hasAttribute('alt')) {
          results.push({
            rule: 'WCAG 1.1.1',
            impact: 'critical',
            description: '<img> 요소에 alt 속성이 없습니다',
            selector: getSelector(img),
            html: img.outerHTML.slice(0, 200),
            suggestion: '모든 <img>에 alt 속성을 추가하세요 (장식 이미지: alt="")',
          });
        }
      });

      // 2. buttons/links without accessible name
      document.querySelectorAll('button, a[href], [role="button"], [role="link"]').forEach((el: any) => {
        const text = el.textContent?.trim() || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const ariaLabelledBy = el.getAttribute('aria-labelledby') || '';
        const title = el.getAttribute('title') || '';

        if (!text && !ariaLabel && !ariaLabelledBy && !title) {
          const imgAlt = el.querySelector('img')?.getAttribute('alt') || '';
          const svgTitle = el.querySelector('svg title')?.textContent || '';
          if (!imgAlt && !svgTitle) {
            results.push({
              rule: 'WCAG 4.1.2',
              impact: 'serious',
              description: `인터랙티브 요소 <${el.tagName.toLowerCase()}>에 접근 가능한 이름이 없습니다`,
              selector: getSelector(el),
              html: el.outerHTML.slice(0, 200),
              suggestion: 'aria-label, 텍스트 콘텐츠, 또는 title 속성을 추가하세요',
            });
          }
        }
      });

      // 3. form inputs without labels
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select').forEach((input: any) => {
        const id = input.getAttribute('id');
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        const placeholder = input.getAttribute('placeholder');
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
        const wrappedLabel = input.closest('label');

        if (!ariaLabel && !ariaLabelledBy && !hasLabel && !wrappedLabel) {
          results.push({
            rule: 'WCAG 1.3.1',
            impact: placeholder ? 'moderate' : 'serious',
            description: `<${input.tagName.toLowerCase()}> 입력 필드에 연결된 <label>이 없습니다`,
            selector: getSelector(input),
            html: input.outerHTML.slice(0, 200),
            suggestion: '<label for="id"> 또는 aria-label 속성을 추가하세요',
          });
        }
      });

      // 4. heading hierarchy
      const headings: any[] = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      let prevLevel = 0;
      for (const h of headings) {
        const level = parseInt((h as any).tagName.charAt(1));
        if (prevLevel > 0 && level > prevLevel + 1) {
          results.push({
            rule: 'WCAG 1.3.1',
            impact: 'moderate',
            description: `제목 계층 구조 불연속: <h${prevLevel}> 다음에 <h${level}> (건너뜀)`,
            selector: getSelector(h),
            html: (h as any).outerHTML.slice(0, 200),
            suggestion: `<h${prevLevel + 1}>을 사용하거나 중간 제목을 추가하세요`,
          });
        }
        prevLevel = level;
      }

      // 5. html lang attribute
      const htmlEl = document.documentElement;
      if (!htmlEl.hasAttribute('lang') || !htmlEl.getAttribute('lang')) {
        results.push({
          rule: 'WCAG 3.1.1',
          impact: 'serious',
          description: '<html> 요소에 lang 속성이 없습니다',
          selector: 'html',
          html: `<html ${Array.from(htmlEl.attributes).map((a: any) => `${a.name}="${a.value}"`).join(' ')}>`,
          suggestion: '<html lang="ko"> 또는 <html lang="en"> 추가',
        });
      }

      // 6. color contrast (heuristic)
      document.querySelectorAll('p, span, a, li, td, th, label, div').forEach((el: any) => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bg = style.backgroundColor;

        // Skip transparent backgrounds
        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return;

        const colorRGB = parseRGB(color);
        const bgRGB = parseRGB(bg);

        if (colorRGB && bgRGB) {
          const ratio = contrastRatio(colorRGB, bgRGB);
          const fontSize = parseFloat(style.fontSize);
          const isBold = parseInt(style.fontWeight) >= 700;
          const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
          const threshold = isLargeText ? 3 : 4.5;

          if (ratio < threshold && el.textContent && el.textContent.trim().length > 0) {
            results.push({
              rule: 'WCAG 1.4.3',
              impact: ratio < 2 ? 'critical' : 'serious',
              description: `색상 대비 비율 ${ratio.toFixed(2)}:1 < ${threshold}:1 (${isLargeText ? '큰 텍스트' : '일반 텍스트'})`,
              selector: getSelector(el),
              html: el.outerHTML.slice(0, 150),
              suggestion: `텍스트 색상 대비를 ${threshold}:1 이상으로 조정하세요`,
            });
          }
        }
      });

      // 7. focus indicator
      const focusableElements = document.querySelectorAll(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      let noOutlineCount = 0;
      focusableElements.forEach((el: any) => {
        const style = window.getComputedStyle(el);
        if (style.outlineStyle === 'none' && style.outlineWidth === '0px') {
          noOutlineCount++;
        }
      });
      if (noOutlineCount > 5) {
        results.push({
          rule: 'WCAG 2.4.7',
          impact: 'serious',
          description: `${noOutlineCount}개의 포커스 가능 요소에 outline: none — 키보드 포커스 표시기 확인 필요`,
          selector: ':focus',
          html: '',
          suggestion: ':focus-visible에 명확한 포커스 스타일을 설정하세요',
        });
      }

      // 8. tabindex > 0 (disrupts natural order)
      document.querySelectorAll('[tabindex]').forEach((el: any) => {
        const tabIndex = parseInt(el.getAttribute('tabindex') || '0');
        if (tabIndex > 0) {
          results.push({
            rule: 'WCAG 2.4.3',
            impact: 'moderate',
            description: `tabindex="${tabIndex}" 사용 — 자연스러운 탭 순서를 파괴합니다`,
            selector: getSelector(el),
            html: el.outerHTML.slice(0, 200),
            suggestion: 'tabindex="0" 또는 DOM 순서를 변경하세요',
          });
        }
      });

      return results;

      // -- Utility functions --

      function getSelector(el: any): string {
        if (el.id) return `#${el.id}`;
        const classes = Array.from(el.classList).slice(0, 3).join('.');
        const tag = el.tagName.toLowerCase();
        return classes ? `${tag}.${classes}` : tag;
      }

      function parseRGB(color: string): [number, number, number] | null {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        return null;
      }

      function luminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
        const l1 = luminance(fg[0], fg[1], fg[2]);
        const l2 = luminance(bg[0], bg[1], bg[2]);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }
    });

    return violations;
  }

  /** Convert A11y violations to TaskIssues */
  toIssues(violations: A11yViolation[]): TaskIssue[] {
    return violations.map((v) => ({
      severity: v.impact === 'critical' || v.impact === 'serious' ? 'error' as const : 'warning' as const,
      message: `[${v.rule}] ${v.description} — ${v.selector}`,
      suggestion: v.suggestion,
      autoFixable: false,
    }));
  }
}
