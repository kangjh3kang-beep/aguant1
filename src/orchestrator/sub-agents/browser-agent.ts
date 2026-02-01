/**
 * Browser Agent — UX/접근성 수석 전문가 (Phase 7 업그레이드)
 *
 * ━━━ 전문 분야 ━━━
 *  · WCAG 2.1 AA 접근성 30종+ 패턴 검증
 *  · Core Web Vitals 관점 성능 분석 (LCP, FID, CLS 영향 요소)
 *  · SEO 필수 요소 검증 (meta, OG, 구조화 데이터)
 *  · 반응형 디자인 검증 (viewport, 미디어 쿼리)
 *  · 스크린샷 기반 시각적 회귀 테스트
 *  · 콘솔 에러/경고 탐지, 브라우저 호환성 분석
 *  · Puppeteer/Playwright 자동 UI 테스트 실행
 *
 * ━━━ Phase 7: 실제 브라우저 자동화 ━━━
 *  · DevServerManager: 개발 서버 자동 시작/종료
 *  · BrowserSession: Puppeteer 기반 헤드리스 Chrome
 *  · PageInteractor: 클릭, 타이핑, 스크롤, 내비게이션
 *  · ScreenshotEngine: 캡처 + 비교 (시각적 회귀)
 *  · ConsoleMonitor: 실시간 콘솔 에러/경고
 *  · PerformanceAnalyzer: Core Web Vitals 측정
 *  · A11yAuditor: 렌더된 DOM 접근성 검사
 *  · FlowRunner: 다단계 사용자 시나리오
 *
 * ━━━ Graceful Degradation ━━━
 *  Puppeteer 미설치 시 → 정적 분석 모드 (HTML/JSX 파일 기반)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult, TaskIssue, BrowserConfig, SubAgentConfig, DEFAULT_BROWSER_CONFIG } from '../types';
import { BaseSubAgent } from './base-agent';
import {
  BrowserAutomation,
  BrowserAutomationConfig,
  BrowserAutomationResult,
  UserFlow,
} from '../browser-automation';

export class BrowserAgent extends BaseSubAgent {
  private browserConfig: BrowserConfig;
  private automationEngine: BrowserAutomation | null = null;

  constructor(config: SubAgentConfig) {
    super(config);
    this.browserConfig = config.browserConfig || DEFAULT_BROWSER_CONFIG;
  }

  protected getAgentName(): string {
    return 'Browser Agent';
  }

  protected getCapabilities(): string[] {
    return [
      // 기존 정적 분석 능력
      'html-semantic-check',
      'color-contrast-estimation',
      'focus-management-check',
      // Phase 7: 실제 브라우저 자동화 능력
      'real-browser-automation',
      'dev-server-management',
      'screenshot-capture',
      'visual-regression',
      'console-error-detection',
      'responsive-testing',
      'wcag-2.1-aa-audit',
      'core-web-vitals-measurement',
      'seo-validation',
      'performance-metrics',
      'user-flow-execution',
      'page-interaction',
      'auto-link-discovery',
      'dom-a11y-audit',
      'cloud-browser-integration',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskIssue[] = [];
    const outputs: string[] = [];
    const artifacts: string[] = [];

    // ── 프롬프트 강화: 간단한 태스크도 전문가급 상세 지시로 확장 ──
    const enhanced = this.enhanceTask(task);
    outputs.push('[BROWSER] ── Prompt Enhancement Applied ──');
    outputs.push(`[BROWSER] 강화된 지시: ${enhanced.enhancedDescription.slice(0, 120)}...`);
    outputs.push(`[BROWSER] 사고 프레임워크: ${enhanced.thinkingFramework.split('\n').filter((s) => s.includes('단계')).length}단계 (WCAG 2.1 기반)`);
    outputs.push('');

    // ── SharedKnowledge: 이전 Phase 컨텍스트 참조 ──
    const sharedCtx = this.getSharedContext(task);
    if (sharedCtx) {
      outputs.push('[BROWSER] ── SharedKnowledge Context Injected ──');
      outputs.push(`[BROWSER] 이전 Phase 인사이트 ${sharedCtx.length}자 참조`);
    }

    outputs.push('[BROWSER] Starting browser-based UI verification...');
    outputs.push(`[BROWSER] Viewport: ${this.browserConfig.viewport.width}x${this.browserConfig.viewport.height}`);
    outputs.push(`[BROWSER] Headless: ${this.browserConfig.headless}`);

    // 스크린샷 디렉토리 준비
    const screenshotDir = path.resolve(projectPath, this.browserConfig.screenshotDir);
    this.ensureDir(screenshotDir);
    outputs.push(`[BROWSER] Screenshots: ${screenshotDir}`);

    // ═══ Phase 7: 실제 브라우저 자동화 시도 ═══
    const puppeteerAvailable = this.checkPuppeteerRuntime();

    if (puppeteerAvailable) {
      outputs.push('');
      outputs.push('[BROWSER] ═══ Phase 7: Real Browser Automation Engine ═══');

      // BrowserAutomation 설정 구성
      const automationConfig = this.buildAutomationConfig(task, projectPath);
      this.automationEngine = new BrowserAutomation(projectPath, automationConfig);

      // 비동기 실행을 동기적으로 래핑 (executeTask는 동기 인터페이스)
      const automationResult = this.runAutomationSync(projectPath, automationConfig);

      if (automationResult) {
        outputs.push(...automationResult.logs);
        issues.push(...automationResult.issues);

        // 스크린샷 아티팩트 수집
        for (const page of automationResult.pages) {
          if (page.screenshot) artifacts.push(page.screenshot);
        }
        for (const flow of automationResult.flows) {
          artifacts.push(...flow.screenshots);
        }

        outputs.push('');
        outputs.push(`[BROWSER] Automation mode: ${automationResult.mode}`);
        outputs.push(`[BROWSER] Pages tested: ${automationResult.pages.length}`);
        outputs.push(`[BROWSER] Flows executed: ${automationResult.flows.length}`);
      } else {
        outputs.push('[BROWSER] Automation engine returned no result — falling back to static analysis');
        this.runStaticAnalysis(projectPath, outputs, issues, artifacts, screenshotDir);
      }
    } else {
      // Puppeteer 런타임 미사용 → 정적 분석
      this.runStaticAnalysis(projectPath, outputs, issues, artifacts, screenshotDir);
    }

    // 클라우드 브라우저 연동 확인
    if (this.browserConfig.cloudBrowser?.enabled) {
      outputs.push(`[BROWSER] Cloud browser: ${this.browserConfig.cloudBrowser.provider}`);
      outputs.push(`[BROWSER] Endpoint: ${this.browserConfig.cloudBrowser.endpoint}`);
      outputs.push('[BROWSER] Cloud browser integration ready for visual verification');
    }

    // ── SharedKnowledge: 브라우저 인사이트 저장 ──
    const a11yIssues = issues.filter((i) => i.message.includes('WCAG') || i.message.includes('A11Y') || i.message.includes('접근성'));
    if (a11yIssues.length > 0) {
      this.addInsight('accessibility', 'medium', `접근성 이슈 ${a11yIssues.length}건`,
        a11yIssues.map((i) => i.message).join('\n'),
        task, a11yIssues.map((i) => i.file || '').filter(Boolean));
    }

    const perfIssues = issues.filter((i) => i.message.includes('Performance') || i.message.includes('LCP') || i.message.includes('CLS'));
    if (perfIssues.length > 0) {
      this.addInsight('recommendation', 'medium', `성능 이슈 ${perfIssues.length}건`,
        perfIssues.map((i) => i.message).join('\n'), task);
    }

    const browserErrors = issues.filter((i) => i.severity === 'critical' || i.severity === 'error');
    if (browserErrors.length > 0) {
      this.addInsight('accessibility', 'high', `브라우저 에러 ${browserErrors.length}건`,
        browserErrors.map((i) => i.message).join('\n'), task);
    }

    const consoleIssues = issues.filter((i) => i.message.includes('Console'));
    if (consoleIssues.length > 0) {
      this.addInsight('recommendation', 'high', `콘솔 에러 ${consoleIssues.length}건`,
        consoleIssues.map((i) => i.message).join('\n'), task);
    }

    const errorCount = browserErrors.length;
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

  // ─── Phase 7: 자동화 설정 구성 ─────────────────────────

  private buildAutomationConfig(task: Task, projectPath: string): Partial<BrowserAutomationConfig> {
    const config: Partial<BrowserAutomationConfig> = {
      headless: this.browserConfig.headless,
      viewport: this.browserConfig.viewport,
      screenshotDir: this.browserConfig.screenshotDir,
      baseUrl: this.browserConfig.baseUrl,
      waitTimeout: this.browserConfig.waitTimeout,
      cloudBrowser: this.browserConfig.cloudBrowser,
      performanceEnabled: true,
      a11yEnabled: true,
      visualRegressionEnabled: false,
      maxPages: 5,
    };

    // 태스크 설명에서 테스트 URL 추출
    const urlMatch = task.description.match(/https?:\/\/[^\s"']+/);
    if (urlMatch && !config.baseUrl) {
      config.baseUrl = urlMatch[0];
    }

    // 태스크 설명에서 사용자 플로우 힌트 추출
    const flows = this.extractFlowsFromTask(task, projectPath);
    if (flows.length > 0) {
      config.flows = flows;
    }

    return config;
  }

  /**
   * 태스크에서 사용자 플로우를 추출합니다.
   * 프로젝트에 .ag-review/flows.json이 있으면 그것을 사용합니다.
   */
  private extractFlowsFromTask(task: Task, projectPath: string): UserFlow[] {
    const flows: UserFlow[] = [];

    // 프로젝트 설정에서 플로우 로드
    const flowConfigPath = path.join(projectPath, '.ag-review', 'flows.json');
    if (fs.existsSync(flowConfigPath)) {
      try {
        const flowConfig = JSON.parse(fs.readFileSync(flowConfigPath, 'utf-8'));
        if (Array.isArray(flowConfig.flows)) {
          flows.push(...flowConfig.flows);
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[BrowserAgent] invalid flow config:', err instanceof Error ? err.message : String(err)); }
      }
    }

    // 기본 탐색 플로우 (항상 포함)
    if (flows.length === 0) {
      const baseUrl = this.browserConfig.baseUrl || 'http://localhost:3000';
      flows.push({
        name: 'basic-navigation',
        description: '기본 페이지 내비게이션 및 검증',
        steps: [
          { action: 'navigate', value: baseUrl },
          { action: 'screenshot', screenshotName: 'home-page' },
          { action: 'scroll', scrollY: 500 },
          { action: 'screenshot', screenshotName: 'home-scrolled' },
        ],
      });
    }

    return flows;
  }

  // ─── 자동화 실행 (sync 래퍼) ────────────────────────────

  /**
   * BrowserAutomation.run()은 async이므로 동기 인터페이스에 맞게 래핑합니다.
   * Node.js의 execSync + child_process를 통해 async를 sync로 변환합니다.
   */
  private runAutomationSync(projectPath: string, config: Partial<BrowserAutomationConfig>): BrowserAutomationResult | null {
    try {
      // 임시 스크립트를 생성하여 async 실행
      const tmpScript = path.join(projectPath, '.ag-review', '_browser-automation-runner.js');
      const tmpResult = path.join(projectPath, '.ag-review', '_browser-automation-result.json');

      this.ensureDir(path.dirname(tmpScript));

      // 보안: 경로를 JSON.stringify로 이스케이프하여 인젝션 방지
      const safeProjectPath = JSON.stringify(projectPath.replace(/\\/g, '/'));
      const safeTmpResult = JSON.stringify(tmpResult.replace(/\\/g, '/'));

      const scriptContent = `
const { BrowserAutomation } = require('${path.resolve(__dirname, '..').replace(/\\/g, '/')}/../dist/orchestrator/browser-automation');

async function main() {
  const config = ${JSON.stringify(config)};
  const automation = new BrowserAutomation(${safeProjectPath}, config);
  const result = await automation.run();
  require('fs').writeFileSync(${safeTmpResult}, JSON.stringify(result, null, 2));
}

main().catch(err => {
  require('fs').writeFileSync(${safeTmpResult}, JSON.stringify({
    success: false,
    mode: 'full-browser',
    devServer: { started: false },
    pages: [],
    flows: [],
    issues: [{ severity: 'error', message: 'Automation runner error: ' + err.message, autoFixable: false }],
    logs: ['[BROWSER] Automation runner failed: ' + err.message],
    duration: 0,
  }));
});
`;

      fs.writeFileSync(tmpScript, scriptContent, 'utf-8');

      try {
        execSync(`node "${tmpScript}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: (this.browserConfig.waitTimeout || 30000) * 5,
          maxBuffer: 50 * 1024 * 1024,
          stdio: 'pipe',
        });

        if (fs.existsSync(tmpResult)) {
          const result = JSON.parse(fs.readFileSync(tmpResult, 'utf-8'));
          // 정리
          this.safeUnlink(tmpScript);
          this.safeUnlink(tmpResult);
          return result as BrowserAutomationResult;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // 스크립트 실행 실패 — Puppeteer 미설치 또는 Chrome 없음일 가능성
        this.safeUnlink(tmpScript);
        this.safeUnlink(tmpResult);

        // 빌드 안 된 상태에서는 dist가 없을 수 있으므로 null 반환
        if (errMsg.includes('Cannot find module') || errMsg.includes('MODULE_NOT_FOUND')) {
          return null;
        }

        return {
          success: false,
          mode: 'full-browser',
          devServer: { started: false },
          pages: [],
          flows: [],
          issues: [{ severity: 'warning', message: `Browser automation failed: ${errMsg.slice(0, 200)}`, autoFixable: false }],
          logs: [`[BROWSER] Automation execution error: ${errMsg.slice(0, 300)}`],
          duration: 0,
        };
      }
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) { console.debug('[BrowserAgent] automation sync setup:', err instanceof Error ? err.message : String(err)); }
    }

    return null;
  }

  // ─── 정적 분석 모드 (Puppeteer 없을 때 fallback) ────────

  private runStaticAnalysis(
    projectPath: string,
    outputs: string[],
    issues: TaskIssue[],
    artifacts: string[],
    screenshotDir: string,
  ): void {
    // Puppeteer package.json 확인 (설치 힌트)
    const hasPuppeteerInPkg = this.checkPuppeteerPackage(projectPath);

    if (hasPuppeteerInPkg) {
      // Puppeteer 기반 테스트 스크립트
      const result = this.runPuppeteerTests(projectPath, screenshotDir);
      outputs.push(...result.logs);
      issues.push(...result.issues);
      artifacts.push(...result.artifacts);
    } else {
      // Puppeteer 없이 기본 검증
      outputs.push('[BROWSER] Puppeteer not installed — running static analysis mode');
      outputs.push('[BROWSER] To enable real browser testing:');
      outputs.push('  npm install puppeteer --save-dev');
      outputs.push('');
    }

    // 기본 HTML 검증
    const basicResult = this.runBasicVerification(projectPath);
    outputs.push(...basicResult.logs);
    issues.push(...basicResult.issues);

    // 접근성 기본 검사 (JSX/TSX 파일 분석)
    const a11yResult = this.checkAccessibility(projectPath);
    outputs.push(...a11yResult.logs);
    issues.push(...a11yResult.issues);
  }

  // ─── Puppeteer 런타임 확인 ──────────────────────────────

  /** Puppeteer가 실제로 require 가능한지 확인 */
  private checkPuppeteerRuntime(): boolean {
    try {
      require.resolve('puppeteer');
      return true;
    } catch (_err: unknown) {
      try {
        require.resolve('puppeteer-core');
        return true;
      } catch (_err2: unknown) {
        return false;
      }
    }
  }

  /** package.json에 puppeteer가 있는지 확인 (설치 여부와 다름) */
  private checkPuppeteerPackage(projectPath: string): boolean {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        return !!(allDeps.puppeteer || allDeps['puppeteer-core']);
      }
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) { console.debug('[BrowserAgent] puppeteer package check:', err instanceof Error ? err.message : String(err)); }
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
        const output = execSync(`node "${testScript}"`, {
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
      logs.push('[BROWSER] No browser-test.js found — using auto-detection');
      logs.push('[BROWSER] Create browser-test.js for custom browser tests');
    }

    // 기존 스크린샷 확인
    try {
      const screenshots = fs.readdirSync(screenshotDir).filter((f) => /\.(png|jpg|jpeg)$/.test(f));
      logs.push(`[BROWSER] Found ${screenshots.length} existing screenshot(s)`);
      artifacts.push(...screenshots.map((s) => path.join(screenshotDir, s)));
    } catch (_err: unknown) {
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

    logs.push('[BROWSER] Running basic accessibility checks (static analysis)...');

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
            } catch (err: unknown) {
              if (process.env.AG_DEBUG) { console.debug('[BrowserAgent] a11y file read:', err instanceof Error ? err.message : String(err)); }
            }
          }
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[BrowserAgent] a11y scan dir:', err instanceof Error ? err.message : String(err)); }
      }
    };

    scanDir(projectPath, 0);
    logs.push(`[BROWSER] Accessibility: ${issues.length} issue(s) found`);

    return { logs, issues };
  }

  // ─── 유틸 ──────────────────────────────────────────────

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private safeUnlink(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) { console.debug('[BrowserAgent] safe unlink:', err instanceof Error ? err.message : String(err)); }
    }
  }
}
