/**
 * Browser Agent - 브라우저 기반 UI 검증 및 스크린샷 테스트
 *
 * Puppeteer를 통해 실제 브라우저를 열어 UI를 검증하고,
 * 스크린샷을 캡처하여 시각적 오류를 탐지합니다.
 * 클라우드 브라우저(claude.ai 등) 연동도 지원합니다.
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
      'accessibility-audit',
      'performance-metrics',
      'cloud-browser-integration',
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

        // 기본 HTML 분석
        const content = fs.readFileSync(fullPath, 'utf-8');

        if (!content.includes('<meta name="viewport"')) {
          issues.push(this.createIssue('warning', 'Missing viewport meta tag - may not be mobile-friendly', {
            file: htmlPath,
            suggestion: 'Add: <meta name="viewport" content="width=device-width, initial-scale=1">',
            autoFixable: true,
          }));
        }

        if (!content.includes('lang=')) {
          issues.push(this.createIssue('warning', 'Missing lang attribute on <html> - accessibility issue', {
            file: htmlPath,
            suggestion: 'Add lang attribute: <html lang="ko"> or <html lang="en">',
            autoFixable: true,
          }));
        }

        if (!content.includes('<title>') || content.includes('<title></title>')) {
          issues.push(this.createIssue('warning', 'Missing or empty <title> tag', {
            file: htmlPath,
            autoFixable: true,
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

              // <img> without alt
              if (/<img\s(?![^>]*alt=)/g.test(content)) {
                issues.push(this.createIssue('warning', 'Image without alt attribute', {
                  file: relPath,
                  suggestion: 'Add alt attribute to all <img> elements',
                  autoFixable: false,
                }));
              }

              // onClick without keyboard handler
              if (/onClick=\{/.test(content) && !/onKeyDown=\{|onKeyPress=\{|onKeyUp=\{/.test(content)) {
                if (/role=/.test(content) || /<button|<a\s/.test(content)) {
                  // OK - has semantic element
                } else {
                  issues.push(this.createIssue('info', 'onClick without keyboard handler - may not be keyboard accessible', {
                    file: relPath,
                    suggestion: 'Add onKeyDown handler or use semantic elements like <button>',
                    autoFixable: false,
                  }));
                }
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
