/**
 * Security Agent - 보안 감사 및 취약점 분석
 *
 * 의존성 감사, 시크릿 스캔, SAST(정적 보안 분석),
 * OWASP Top 10 패턴 검출을 수행합니다.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult, TaskIssue } from '../types';
import { BaseSubAgent } from './base-agent';

export class SecurityAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Security Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'dependency-audit',
      'secret-scanning',
      'sast-analysis',
      'owasp-detection',
      'license-check',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskIssue[] = [];
    const outputs: string[] = [];
    const artifacts: string[] = [];

    outputs.push('[SECURITY] Starting security audit...');

    // 1. 의존성 취약점 감사
    const depAudit = this.auditDependencies(projectPath);
    outputs.push(...depAudit.logs);
    issues.push(...depAudit.issues);

    // 2. 시크릿/민감정보 스캔
    const secretScan = this.scanSecrets(projectPath);
    outputs.push(...secretScan.logs);
    issues.push(...secretScan.issues);

    // 3. 코드 내 보안 패턴 분석 (SAST)
    const sastResult = this.runSAST(projectPath);
    outputs.push(...sastResult.logs);
    issues.push(...sastResult.issues);

    // 결과 요약
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;

    outputs.push('');
    outputs.push('[SECURITY] Audit Summary:');
    outputs.push(`  Critical: ${critical}`);
    outputs.push(`  Errors:   ${errors}`);
    outputs.push(`  Warnings: ${warnings}`);

    return {
      success: critical === 0,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  private auditDependencies(projectPath: string): { logs: string[]; issues: TaskIssue[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];

    logs.push('[SECURITY] Running dependency audit...');

    // npm audit
    if (fs.existsSync(path.join(projectPath, 'package-lock.json')) ||
        fs.existsSync(path.join(projectPath, 'package.json'))) {
      try {
        const output = execSync('npm audit --json 2>/dev/null || true', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        });

        try {
          const audit = JSON.parse(output);
          const vulns = audit.metadata?.vulnerabilities || {};
          const total = (vulns.critical || 0) + (vulns.high || 0) + (vulns.moderate || 0) + (vulns.low || 0);

          logs.push(`[SECURITY] npm audit: ${total} vulnerabilities found`);
          if (vulns.critical > 0) {
            issues.push(this.createIssue('critical', `${vulns.critical} critical vulnerabilities in dependencies`, { autoFixable: true, suggestion: 'Run: npm audit fix' }));
          }
          if (vulns.high > 0) {
            issues.push(this.createIssue('error', `${vulns.high} high-severity vulnerabilities in dependencies`, { autoFixable: true, suggestion: 'Run: npm audit fix' }));
          }
          if (vulns.moderate > 0) {
            issues.push(this.createIssue('warning', `${vulns.moderate} moderate vulnerabilities in dependencies`));
          }
        } catch {
          logs.push('[SECURITY] npm audit completed (no JSON output)');
        }
      } catch {
        logs.push('[SECURITY] npm audit not available');
      }
    }

    return { logs, issues };
  }

  private scanSecrets(projectPath: string): { logs: string[]; issues: TaskIssue[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];

    logs.push('[SECURITY] Scanning for secrets and sensitive data...');

    const secretPatterns: [RegExp, string][] = [
      [/(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi, 'API key detected'],
      [/(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi, 'Hardcoded secret/password'],
      [/(?:aws_access_key_id|aws_secret)\s*[:=]\s*['"][A-Za-z0-9/+=]{20,}['"]/gi, 'AWS credential detected'],
      [/(?:PRIVATE KEY-----)/g, 'Private key found in source'],
      [/(?:ghp_[A-Za-z0-9]{36})/g, 'GitHub personal access token'],
      [/(?:sk-[A-Za-z0-9]{48})/g, 'OpenAI API key pattern'],
      [/(?:Bearer\s+[A-Za-z0-9._-]{20,})/g, 'Hardcoded bearer token'],
    ];

    const scanDir = (dir: string, depth: number) => {
      if (depth > 8) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' ||
              entry.name === '.git' || entry.name === 'coverage') continue;

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx|py|go|rs|java|json|yml|yaml|env|cfg|conf|ini)$/.test(entry.name)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              for (const [pattern, msg] of secretPatterns) {
                pattern.lastIndex = 0;
                if (pattern.test(content)) {
                  const relPath = path.relative(projectPath, fullPath);
                  issues.push(this.createIssue('critical', msg, {
                    file: relPath,
                    suggestion: 'Move to environment variable or secrets manager',
                    autoFixable: false,
                  }));
                }
              }
            } catch {
              // skip unreadable files
            }
          }
        }
      } catch {
        // skip unreadable dirs
      }
    };

    // .env 파일이 git에 포함되어 있는지 확인
    const envFile = path.join(projectPath, '.env');
    if (fs.existsSync(envFile)) {
      const gitignore = path.join(projectPath, '.gitignore');
      const gitignoreContent = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf-8') : '';
      if (!gitignoreContent.includes('.env')) {
        issues.push(this.createIssue('critical', '.env file exists but not in .gitignore', {
          file: '.env',
          suggestion: 'Add .env to .gitignore immediately',
          autoFixable: true,
        }));
      }
    }

    scanDir(projectPath, 0);
    logs.push(`[SECURITY] Secret scan: ${issues.length} issue(s) found`);

    return { logs, issues };
  }

  private runSAST(projectPath: string): { logs: string[]; issues: TaskIssue[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];

    logs.push('[SECURITY] Running static application security testing...');

    const dangerousPatterns: [RegExp, string, string][] = [
      [/eval\s*\(/g, 'eval() usage detected - potential code injection', 'Use safer alternatives like JSON.parse()'],
      [/new\s+Function\s*\(/g, 'new Function() usage - potential code injection', 'Use predefined functions instead'],
      [/innerHTML\s*=/g, 'innerHTML assignment - potential XSS', 'Use textContent or sanitize input'],
      [/document\.write/g, 'document.write() usage - potential XSS', 'Use DOM manipulation methods'],
      [/execSync\s*\([^)]*\$\{/g, 'Command injection via template literal in execSync', 'Sanitize input or use spawn with args array'],
      [/\.query\s*\([^)]*\$\{/g, 'Potential SQL injection via template literal', 'Use parameterized queries'],
      [/dangerouslySetInnerHTML/g, 'React dangerouslySetInnerHTML - ensure input is sanitized', 'Sanitize with DOMPurify or similar'],
      [/crypto\.createCipher\b/g, 'Deprecated crypto.createCipher', 'Use crypto.createCipheriv instead'],
      [/Math\.random\(\)/g, 'Math.random() for security-sensitive operation', 'Use crypto.randomBytes() for security'],
    ];

    const scanDir = (dir: string, depth: number) => {
      if (depth > 8) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !/\.(test|spec)\./i.test(entry.name)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const relPath = path.relative(projectPath, fullPath);
              for (const [pattern, msg, suggestion] of dangerousPatterns) {
                pattern.lastIndex = 0;
                if (pattern.test(content)) {
                  issues.push(this.createIssue('warning', msg, { file: relPath, suggestion, autoFixable: false }));
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
    logs.push(`[SECURITY] SAST: ${issues.length} pattern(s) detected`);

    return { logs, issues };
  }
}
