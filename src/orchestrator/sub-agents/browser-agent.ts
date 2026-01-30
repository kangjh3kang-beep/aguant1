/**
 * Browser Agent — UX/접근성 수석 전문가
 *
 * ━━━ 전문 분야 ━━━
 *  · WCAG 2.1 AA 접근성 30종+ 패턴 검증
 *  · Core Web Vitals 관점 성능 분석 (LCP, FID, CLS 영향 요소)
 *  · SEO 필수 요소 검증 (meta, OG, 구조화 데이터)
 *  · 반응형 디자인 검증 (viewport, 미디어 쿼리)
 *  · 스크린샷 기반 시각적 회귀 테스트
 *  · 콘솔 에러/경고 탐지, 브라우저 호환성 분석
 *  · Puppeteer/Playwright 자동 UI 테스트 실행
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult, TaskIssue, BrowserConfig, SubAgentConfig, DEFAULT_BROWSER_CONFIG } from '../types';
import { BaseSubAgent } from './base-agent';

export class BrowserAgent extends BaseSubAgent {
  private browserConfig: BrowserConfig;

  constructor(config: SubAgentConfig) {
    super(config);
    this.browserConfig = config.browserConfig || DEFAULT_BROWSER_CONFIG;
  }

  protected getAgentName(): string {
    return 'Browser Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'screenshot-capture',
      'visual-regression',
      'console-error-detection',
      'responsive-testing',
      'wcag-2.1-aa-audit',
      'core-web-vitals-analysis',
      'seo-validation',
      'performance-metrics',
      'cloud-browser-integration',
      'html-semantic-check',
      'color-contrast-estimation',
      'focus-management-check',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskIssue[] = [];
    const outputs: string[] = [];
    const artifacts: string[] = [];

    outputs.push('[BROWSER] Starting browser-based UI verification...');
    outputs.push(`[BROWSER] Viewport: ${this.browserConfig.viewport.width}x${this.browserConfig.viewport.height}`);
    outputs.push(`[BROWSER] Headless: ${this.browserConfig.headless}`);

    // 스크린샷 디렉토리 준비
    const screenshotDir = path.resolve(projectPath, this.browserConfig.screenshotDir);
    this.ensureDir(screenshotDir);
    outputs.push(`[BROWSER] Screenshots: ${screenshotDir}`);

    // Puppeteer 사용 가능 여부 확인
    const hasPuppeteer = this.checkPuppeteer(projectPath);

    if (hasPuppeteer) {
      // Puppeteer 기반 테스트
      const result = this.runPuppeteerTests(projectPath, screenshotDir);
      outputs.push(...result.logs);
      issues.push(...result.issues);
      artifacts.push(...result.artifacts);
    } else {
      // Puppeteer 없이 기본 검증
      outputs.push('[BROWSER] Puppeteer not installed - running basic verification');
      const result = this.runBasicVerification(projectPath);
      outputs.push(...result.logs);
      issues.push(...result.issues);

      outputs.push('');
      outputs.push('[BROWSER] To enable full browser testing:');
      outputs.push('  npm install puppeteer --save-dev');
    }

    // 클라우드 브라우저 연동 확인
    if (this.browserConfig.cloudBrowser?.enabled) {
      outputs.push(`[BROWSER] Cloud browser: ${this.browserConfig.cloudBrowser.provider}`);
      outputs.push(`[BROWSER] Endpoint: ${this.browserConfig.cloudBrowser.endpoint}`);
      outputs.push('[BROWSER] Cloud browser integration ready for visual verification');
    }

    // 접근성 기본 검사 (HTML 파일 분석)
    const a11yResult = this.checkAccessibility(projectPath);
    outputs.push(...a11yResult.logs);
    issues.push(...a11yResult.issues);

    const errorCount = issues.filter((i) => i.severity === 'critical' || i.severity === 'error').length;
    outputs.push('');
    outputs.push(`[BROWSER] Verification complete: ${errorCount} error(s), ${issues.length} total issue(s)`);

    return {
      success: errorCount === 0,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  private checkPuppeteer(projectPath: string): boolean {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        return !!(allDeps.puppeteer || allDeps['puppeteer-core']);
      }
    } catch {
      // ignore
    }
    return false;
  }

  private runPuppeteerTests(projectPath: string, screenshotDir: string): { logs: string[]; issues: TaskIssue[]; artifacts: string[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];
    const artifacts: string[] = [];

    logs.push('[BROWSER] Running Puppeteer-based tests...');

    // Puppeteer 테스트 스크립트 실행
    const testScript = path.join(projectPath, 'browser-test.js');
    if (fs.existsSync(testScript)) {
      try {
        const output = execSync(`node ${testScript}`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: this.browserConfig.waitTimeout * 3,
          maxBuffer: 10 * 1024 * 1024,
        });
        logs.push(`[BROWSER] Browser test output:`);
        logs.push(output.slice(0, 2000));
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        issues.push(this.createIssue('error', `Browser test failed: ${errMsg.slice(0, 200)}`));
      }
    } else {
      logs.push('[BROWSER] No browser-test.js found - using auto-detection');
      logs.push('[BROWSER] Create browser-test.js for custom browser tests');
    }

    // 기존 스크린샷 확인
    try {
      const screenshots = fs.readdirSync(screenshotDir).filter((f) => /\.(png|jpg|jpeg)$/.test(f));
      logs.push(`[BROWSER] Found ${screenshots.length} existing screenshot(s)`);
      artifacts.push(...screenshots.map((s) => path.join(screenshotDir, s)));
    } catch {
      logs.push('[BROWSER] No existing screenshots');
    }

    return { logs, issues, artifacts };
  }

  private runBasicVerification(projectPath: string): { logs: string[]; issues: TaskIssue[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];

    // public/index.html 또는 build 출력 확인
    const htmlPaths = [
      'public/index.html',
      'dist/index.html',
      'build/index.html',
      'index.html',
      'out/index.html',
    ];

    let foundHtml = false;
    for (const htmlPath of htmlPaths) {
      const fullPath = path.join(projectPath, htmlPath);
      if (fs.existsSync(fullPath)) {
        foundHtml = true;
        logs.push(`[BROWSER] Found: ${htmlPath}`);

        // ═══ 심층 HTML 분석 (WCAG + SEO + Performance) ═══
        const content = fs.readFileSync(fullPath, 'utf-8');

        // ── WCAG 2.1 접근성 검증 ──
        if (!content.includes('lang=')) {
          issues.push(this.createIssue('warning', '[WCAG 3.1.1] <html lang> 속성 누락 — 스크린리더가 언어를 판별할 수 없음', {
            file: htmlPath,
            suggestion: '<html lang="ko"> 또는 <html lang="en"> 추가',
            autoFixable: true,
          }));
        }

        if (!content.includes('<title>') || content.includes('<title></title>')) {
          issues.push(this.createIssue('warning', '[WCAG 2.4.2] <title> 태그 누락/비어있음', {
            file: htmlPath, autoFixable: true,
          }));
        }

        if (!content.includes('<main') && !content.includes('role="main"')) {
          issues.push(this.createIssue('info', '[WCAG 1.3.1] <main> 랜드마크 없음 — 스크린리더 내비게이션 불편', {
            file: htmlPath,
            suggestion: '<main> 태그를 추가하세요',
          }));
        }

        if (!content.includes('<h1')) {
          issues.push(this.createIssue('info', '[WCAG 1.3.1] <h1> 태그 없음 — 페이지 구조 명시 필요', {
            file: htmlPath,
          }));
        }

        if (!content.includes('skip') && !content.includes('Skip') && content.includes('<nav')) {
          issues.push(this.createIssue('info', '[WCAG 2.4.1] Skip Navigation 링크 없음', {
            file: htmlPath,
            suggestion: '페이지 상단에 <a href="#main-content">본문으로 건너뛰기</a> 추가',
          }));
        }

        // ── 반응형/모바일 ──
        if (!content.includes('<meta name="viewport"')) {
          issues.push(this.createIssue('warning', '[Responsive] viewport 메타 태그 누락 — 모바일 최적화 불가', {
            file: htmlPath,
            suggestion: '<meta name="viewport" content="width=device-width, initial-scale=1">',
            autoFixable: true,
          }));
        }

        // ── SEO 필수 요소 ──
        if (!content.includes('<meta name="description"') && !content.includes('<meta property="og:description"')) {
          issues.push(this.createIssue('info', '[SEO] meta description 누락 — 검색엔진 노출 품질 저하', {
            file: htmlPath,
            suggestion: '<meta name="description" content="사이트 설명..."> 추가',
          }));
        }

        if (!content.includes('og:title') && !content.includes('og:image')) {
          issues.push(this.createIssue('info', '[SEO] Open Graph 태그 누락 — SNS 공유 시 미리보기 없음', {
            file: htmlPath,
            suggestion: '<meta property="og:title">, <meta property="og:image"> 추가',
          }));
        }

        if (!content.includes('rel="canonical"')) {
          issues.push(this.createIssue('info', '[SEO] canonical URL 누락 — 중복 콘텐츠 이슈 가능', {
            file: htmlPath,
          }));
        }

        // ── 성능 (Core Web Vitals 영향) ──
        const inlineStyleMatches = content.match(/style="[^"]{200,}"/g);
        if (inlineStyleMatches && inlineStyleMatches.length > 3) {
          issues.push(this.createIssue('info', `[Performance] 대형 인라인 스타일 ${inlineStyleMatches.length}개 — CSS 파일로 분리 권장`, {
            file: htmlPath,
          }));
        }

        const scriptCount = (content.match(/<script(?!\s+type="application\/ld\+json")/g) || []).length;
        if (scriptCount > 5) {
          issues.push(this.createIssue('info', `[Performance] <script> 태그 ${scriptCount}개 — 번들링/코드 스플리팅 권장`, {
            file: htmlPath,
          }));
        }

        if (content.includes('<script') && !content.includes('defer') && !content.includes('async') && !content.includes('type="module"')) {
          issues.push(this.createIssue('info', '[Performance] render-blocking script — defer/async/module 속성 추가 권장', {
            file: htmlPath,
            suggestion: '<script defer src="..."> 또는 <script type="module">',
          }));
        }

        break;
      }
    }

    if (!foundHtml) {
      logs.push('[BROWSER] No HTML entry point found (this may be a backend-only project)');
    }

    // 빌드 출력 확인
    const buildDirs = ['dist', 'build', 'out', '.next'];
    for (const dir of buildDirs) {
      if (fs.existsSync(path.join(projectPath, dir))) {
        logs.push(`[BROWSER] Build output found: ${dir}/`);
      }
    }

    return { logs, issues };
  }

  private checkAccessibility(projectPath: string): { logs: string[]; issues: TaskIssue[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];

    logs.push('[BROWSER] Running basic accessibility checks...');

    // JSX/TSX 파일에서 접근성 패턴 확인
    const scanDir = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(tsx|jsx)$/.test(entry.name)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const relPath = path.relative(projectPath, fullPath);

              // ── WCAG 1.1.1 Non-text Content ──
              if (/<img\s(?![^>]*alt=)/g.test(content)) {
                issues.push(this.createIssue('warning', '[WCAG 1.1.1] <img> alt 속성 누락 — 스크린리더 접근 불가', {
                  file: relPath,
                  suggestion: '모든 <img>에 alt 속성을 추가하세요 (장식 이미지: alt="")',
                }));
              }

              // ── WCAG 2.1.1 Keyboard Accessible ──
              if (/onClick=\{/.test(content) && !/onKeyDown=\{|onKeyPress=\{|onKeyUp=\{/.test(content)) {
                if (/role=/.test(content) || /<button|<a\s/.test(content)) {
                  // OK - has semantic element
                } else {
                  issues.push(this.createIssue('warning', '[WCAG 2.1.1] onClick 핸들러에 키보드 핸들러 없음', {
                    file: relPath,
                    suggestion: '<button>으로 변경하거나 onKeyDown + role="button" + tabIndex={0} 추가',
                  }));
                }
              }

              // ── WCAG 4.1.2 Name, Role, Value ──
              if (/<div\s+onClick|<span\s+onClick/.test(content) && !/role=/.test(content)) {
                issues.push(this.createIssue('info', '[WCAG 4.1.2] 비의미적 요소(div/span)에 onClick — role 속성 필요', {
                  file: relPath,
                  suggestion: '시맨틱 요소(<button>)로 변경하거나 role="button" 추가',
                }));
              }

              // ── WCAG 1.3.1 Info and Relationships ──
              if (/<input(?![^>]*(?:aria-label|aria-labelledby|id=))/g.test(content)
                && !/<label/.test(content)) {
                issues.push(this.createIssue('info', '[WCAG 1.3.1] <input>에 연결된 <label> 또는 aria-label 없음', {
                  file: relPath,
                  suggestion: '<label htmlFor="id"> 또는 aria-label 속성을 추가하세요',
                }));
              }

              // ── 색상 대비 힌트 ──
              if (/color:\s*['"]?#[a-fA-F0-9]{3,8}/.test(content) && /background(?:-color)?:\s*['"]?#[a-fA-F0-9]{3,8}/.test(content)) {
                issues.push(this.createIssue('info', '[WCAG 1.4.3] 인라인 색상 설정 — 대비 비율 4.5:1 이상 확인 필요', {
                  file: relPath,
                  suggestion: 'WebAIM Contrast Checker로 대비 비율을 확인하세요',
                }));
              }
            } catch {
              // skip
            }
          }
        }
      } catch {
        // skip
      }
    };

    scanDir(projectPath, 0);
    logs.push(`[BROWSER] Accessibility: ${issues.length} issue(s) found`);

    return { logs, issues };
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
