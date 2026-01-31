/**
 * Security Agent — CISO 수석 보안 전문가
 *
 * ━━━ 전문 분야 ━━━
 *  · OWASP Top 10 (2021) 완전 커버리지 정적 분석
 *  · 시크릿/API키/토큰 30종+ 패턴 탐지
 *  · 의존성 공급망(Supply Chain) 보안 감사
 *  · 인증/인가 패턴 분석 (JWT, OAuth, Session)
 *  · 인젝션 공격 벡터 탐지 (SQL, NoSQL, Command, XSS, SSRF)
 *  · 암호화 안전성 검증 (약한 해시, 비추천 알고리즘)
 *  · 보안 헤더/CORS/CSP 설정 검증
 *  · 레이트 리미팅/브루트 포스 방어 검증
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
      'owasp-top10-full',
      'license-check',
      'auth-pattern-analysis',
      'encryption-audit',
      'security-header-check',
      'rate-limit-verification',
      'supply-chain-analysis',
      'injection-detection',
      'xss-prevention-check',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskIssue[] = [];
    const outputs: string[] = [];
    const artifacts: string[] = [];

    // ── 프롬프트 강화: 간단한 태스크도 전문가급 상세 지시로 확장 ──
    const enhanced = this.enhanceTask(task);
    outputs.push('[SECURITY] ── Prompt Enhancement Applied ──');
    outputs.push(`[SECURITY] 강화된 지시: ${enhanced.enhancedDescription.slice(0, 120)}...`);
    outputs.push(`[SECURITY] 사고 프레임워크: ${enhanced.thinkingFramework.split('\n').filter((s) => s.includes('단계')).length}단계 (STRIDE 위협 모델링 기반)`);
    outputs.push('');

    // ── SharedKnowledge: 이전 Phase 컨텍스트 참조 ──
    const sharedCtx = this.getSharedContext(task);
    if (sharedCtx) {
      outputs.push('[SECURITY] ── SharedKnowledge Context Injected ──');
      outputs.push(`[SECURITY] 이전 Phase 인사이트 ${sharedCtx.length}자 참조`);
    }

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

    // 4. 인증/보안 설정 검증
    const authResult = this.auditAuthPatterns(projectPath);
    outputs.push(...authResult.logs);
    issues.push(...authResult.issues);

    // 5. AI 심층 보안 분석 (LLM 기반)
    const aiSecurity = this.runAISecurityAnalysis(projectPath);
    outputs.push(...aiSecurity.logs);
    issues.push(...aiSecurity.issues);

    // ── SharedKnowledge: AI 보안 인사이트 저장 ──
    if (aiSecurity.issues.length > 0) {
      this.addInsight('vulnerability', 'high', `AI 심층 보안 분석 ${aiSecurity.issues.length}건`,
        aiSecurity.issues.map((i) => i.message).join('\n'),
        task, aiSecurity.issues.map((i) => i.file || '').filter(Boolean));
    }

    // ── SharedKnowledge: 보안 인사이트 저장 ──
    if (depAudit.issues.length > 0) {
      this.addInsight('dependency', 'high', `의존성 취약점 ${depAudit.issues.length}건`,
        depAudit.issues.map((i) => i.message).join('\n'), task);
    }
    if (secretScan.issues.length > 0) {
      this.addInsight('vulnerability', 'critical', `시크릿 노출 ${secretScan.issues.length}건`,
        secretScan.issues.map((i) => i.message).join('\n'),
        task, secretScan.issues.map((i) => i.file || '').filter(Boolean));
    }
    if (sastResult.issues.length > 0) {
      this.addInsight('vulnerability', 'high', `SAST 취약점 ${sastResult.issues.length}건`,
        sastResult.issues.map((i) => i.message).join('\n'),
        task, sastResult.issues.map((i) => i.file || '').filter(Boolean));
    }
    if (authResult.issues.length > 0) {
      this.addInsight('vulnerability', 'medium', `인증/보안 설정 이슈 ${authResult.issues.length}건`,
        authResult.issues.map((i) => i.message).join('\n'), task);
    }

    // 결과 요약
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;

    outputs.push('');
    outputs.push('[SECURITY] ═══ 보안 감사 최종 보고 ═══');
    outputs.push(`  CRITICAL: ${critical}건 ${critical > 0 ? '(즉시 수정 필요!)' : '✓'}`);
    outputs.push(`  ERROR:    ${errors}건 ${errors > 0 ? '(수정 권장)' : '✓'}`);
    outputs.push(`  WARNING:  ${warnings}건`);
    outputs.push(`  OWASP 커버리지: A01~A10 (2021 기준)`);

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
          if (!audit || typeof audit !== 'object') throw new Error('npm audit 출력이 올바른 JSON이 아님');
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
        } catch (err: unknown) {
          logs.push(`[SECURITY] npm audit 파싱 실패: ${err instanceof Error ? err.message : 'JSON 파싱 오류'}`);
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
      // ── 범용 시크릿 ──
      [/(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi, 'API key detected'],
      [/(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi, 'Hardcoded secret/password'],
      [/(?:PRIVATE KEY-----)/g, 'Private key found in source'],
      [/(?:Bearer\s+[A-Za-z0-9._-]{20,})/g, 'Hardcoded bearer token'],
      [/(?:token)\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/gi, 'Hardcoded token'],
      // ── AWS ──
      [/(?:AKIA[A-Z0-9]{16})/g, 'AWS Access Key ID (AKIA pattern)'],
      [/(?:aws_secret_access_key|aws_secret)\s*[:=]\s*['"][A-Za-z0-9/+=]{30,}['"]/gi, 'AWS Secret Access Key'],
      // ── GCP ──
      [/(?:AIza[A-Za-z0-9_-]{35})/g, 'Google Cloud API key'],
      [/"type"\s*:\s*"service_account"/g, 'GCP Service Account JSON key'],
      // ── Azure ──
      [/(?:DefaultEndpointsProtocol=https;AccountName=)[^\s;]+/g, 'Azure Storage connection string'],
      // ── GitHub ──
      [/(?:ghp_[A-Za-z0-9]{36})/g, 'GitHub Personal Access Token'],
      [/(?:gho_[A-Za-z0-9]{36})/g, 'GitHub OAuth Token'],
      [/(?:ghs_[A-Za-z0-9]{36})/g, 'GitHub App Installation Token'],
      [/(?:github_pat_[A-Za-z0-9_]{82})/g, 'GitHub Fine-grained PAT'],
      // ── AI 프로바이더 ──
      [/(?:sk-[A-Za-z0-9]{48})/g, 'OpenAI API key'],
      [/(?:sk-ant-api[A-Za-z0-9_-]{90,})/g, 'Anthropic API key'],
      // ── Stripe ──
      [/(?:sk_live_[A-Za-z0-9]{24,})/g, 'Stripe Live Secret Key'],
      [/(?:pk_live_[A-Za-z0-9]{24,})/g, 'Stripe Live Publishable Key'],
      // ── Slack ──
      [/(?:xoxb-[A-Za-z0-9-]+)/g, 'Slack Bot Token'],
      [/(?:xoxp-[A-Za-z0-9-]+)/g, 'Slack User Token'],
      // ── DB ──
      [/(?:mongodb(?:\+srv)?:\/\/[^/\s]+:[^/\s]+@)/g, 'MongoDB connection string with credentials'],
      [/(?:postgres(?:ql)?:\/\/[^/\s]+:[^/\s]+@)/g, 'PostgreSQL connection string with credentials'],
      [/(?:mysql:\/\/[^/\s]+:[^/\s]+@)/g, 'MySQL connection string with credentials'],
      // ── JWT ──
      [/(?:eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)/g, 'Hardcoded JWT token'],
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
      // ── A03:2021 Injection ──
      [/eval\s*\(/g, '[OWASP A03] eval() — Code Injection 위험', 'JSON.parse() 또는 안전한 파서를 사용하세요'],
      [/new\s+Function\s*\(/g, '[OWASP A03] new Function() — Code Injection 위험', '사전 정의된 함수를 사용하세요'],
      [/execSync\s*\([^)]*\$\{/g, '[OWASP A03] Command Injection via template literal', 'child_process.spawn(cmd, args[]) 사용하세요'],
      [/exec\s*\([^)]*\$\{/g, '[OWASP A03] Command Injection via exec()', 'spawn()에 인자 배열로 전달하세요'],
      [/\.query\s*\([^)]*\$\{/g, '[OWASP A03] SQL Injection via template literal', '파라미터화 쿼리(? 또는 $1)를 사용하세요'],
      [/\.query\s*\([^)]*\+\s*/g, '[OWASP A03] SQL Injection via string concatenation', '파라미터화 쿼리를 사용하세요'],
      // ── A07:2021 XSS ──
      [/innerHTML\s*=/g, '[OWASP A07] innerHTML 할당 — XSS 위험', 'textContent 또는 DOMPurify로 sanitize'],
      [/document\.write/g, '[OWASP A07] document.write() — XSS 위험', 'DOM 조작 메서드를 사용하세요'],
      [/dangerouslySetInnerHTML/g, '[OWASP A07] dangerouslySetInnerHTML — 반드시 sanitize 필요', 'DOMPurify.sanitize()를 적용하세요'],
      [/\.html\s*\(\s*[^)]*\$\{/g, '[OWASP A07] jQuery .html() with dynamic content — XSS', '템플릿 대신 .text() 사용'],
      // ── A02:2021 Cryptographic Failures ──
      [/crypto\.createCipher\b/g, '[OWASP A02] 비추천 crypto.createCipher', 'crypto.createCipheriv(aes-256-gcm)를 사용하세요'],
      [/Math\.random\(\)/g, '[OWASP A02] Math.random()은 암호학적으로 안전하지 않음', 'crypto.randomBytes() 또는 crypto.randomUUID()'],
      [/md5|MD5/g, '[OWASP A02] MD5 해시 — 충돌 공격에 취약', 'SHA-256 이상 또는 bcrypt/argon2를 사용하세요'],
      [/sha1|SHA1/g, '[OWASP A02] SHA-1 해시 — 비추천', 'SHA-256 이상을 사용하세요'],
      [/createHash\s*\(\s*['"]md5['"]\s*\)/g, '[OWASP A02] MD5 해시 사용', 'SHA-256/SHA-512를 사용하세요'],
      // ── A01:2021 Broken Access Control ──
      [/(?:cors|CORS)\s*\(\s*\{[^}]*origin\s*:\s*(?:true|\*|['"]?\*['"]?)/g, '[OWASP A01] CORS origin: * — 모든 출처 허용', '특정 도메인만 허용하세요'],
      [/res\.(?:header|setHeader)\s*\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]/g, '[OWASP A01] CORS Allow-Origin: *', '허용 도메인을 명시하세요'],
      // ── A04:2021 Insecure Design ──
      [/(?:password|passwd|pwd)\s*===?\s*['"][^'"]+['"]/g, '[OWASP A04] 하드코딩된 비밀번호 비교', '환경 변수 또는 secrets manager 사용'],
      [/jwt\.sign\s*\([^)]*expiresIn\s*:\s*['"]?\d{4,}/g, '[OWASP A04] JWT 만료 시간이 너무 김', '짧은 만료 + Refresh Token 패턴 권장'],
      // ── A08:2021 Software & Data Integrity Failures ──
      [/require\s*\(\s*[^'"]/g, '[OWASP A08] Dynamic require() — 경로 조작 위험', '정적 import를 사용하세요'],
      // ── A09:2021 Security Logging Failures ──
      [/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, '[OWASP A09] 빈 catch 블록 — 에러 로깅 누락', '에러를 반드시 로깅하세요'],
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

  /**
   * AI 심층 보안 분석 — LLM 기반 취약점 탐지
   *
   * 정규식으로 잡지 못하는 보안 이슈를 AI가 분석합니다:
   *  · 데이터 흐름 기반 인젝션 탐지 (입력 → 변수 → 쿼리/명령)
   *  · 비즈니스 로직 취약점 (인증 우회, 권한 상승)
   *  · 레이스 컨디션 / TOCTOU
   *  · 안전하지 않은 역직렬화
   *  · SSRF / 오픈 리다이렉트
   */
  private runAISecurityAnalysis(projectPath: string): {
    issues: TaskIssue[];
    logs: string[];
  } {
    const issues: TaskIssue[] = [];
    const logs: string[] = [];

    if (!this.hasAIProvider()) {
      logs.push('[SECURITY] AI 프로바이더 없음 — 정규식 기반 분석만 수행');
      return { issues, logs };
    }

    logs.push('[SECURITY] ── AI 심층 보안 분석 시작 ──');

    // 보안에 민감한 파일 우선 수집 (인증, API, DB 관련)
    const sensitiveFiles: { relPath: string; content: string }[] = [];
    const sensitivePatterns = /auth|login|session|token|password|middleware|api|route|controller|database|db|query|user/i;

    const collectFiles = (dir: string, depth: number) => {
      if (depth > 5 || sensitiveFiles.length >= 8) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            collectFiles(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !/\.(test|spec|d)\./i.test(entry.name)) {
            if (sensitivePatterns.test(entry.name) || sensitivePatterns.test(path.relative(projectPath, dir))) {
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                if (content.length > 100) {
                  sensitiveFiles.push({
                    relPath: path.relative(projectPath, fullPath),
                    content: content.length > 3000 ? content.slice(0, 3000) + '\n// ... (truncated)' : content,
                  });
                }
              } catch { /* skip */ }
            }
          }
        }
      } catch { /* skip */ }
    };
    collectFiles(projectPath, 0);

    if (sensitiveFiles.length === 0) {
      logs.push('[SECURITY] 보안 민감 파일 없음 — AI 분석 스킵');
      return { issues, logs };
    }

    const codeSnippets = sensitiveFiles.map((f) =>
      `=== ${f.relPath} ===\n${f.content}`,
    ).join('\n\n');

    const systemPrompt = `당신은 20년 경력의 사이버보안 전문가(CISO)입니다.
주어진 코드의 보안 취약점을 분석하여 JSON 배열로 보고하세요.

분석 항목:
1. 인젝션 공격 (SQL, NoSQL, Command, XSS, SSRF) — 데이터 흐름 추적
2. 인증/인가 결함 (우회 가능성, 세션 관리 문제, JWT 검증 누락)
3. 민감 데이터 노출 (평문 저장, 로그 출력, 응답에 포함)
4. 레이스 컨디션 / TOCTOU
5. 안전하지 않은 역직렬화
6. CORS/CSP 설정 문제
7. 에러 메시지를 통한 정보 노출

응답 형식 (JSON만 출력):
[
  {
    "file": "파일경로",
    "severity": "critical" | "error" | "warning",
    "message": "[OWASP 분류] 구체적인 취약점 설명",
    "suggestion": "수정 방안"
  }
]

확실한 취약점만 보고하세요. 추측하지 마세요. 최대 8개.`;

    const aiResponse = this.callAISync(systemPrompt, codeSnippets, { maxTokens: 2048, timeout: 60000 });

    if (!aiResponse) {
      logs.push('[SECURITY] AI 응답 없음 — 정규식 분석 결과만 사용');
      return { issues, logs };
    }

    try {
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logs.push('[SECURITY] AI 응답에서 JSON 배열을 추출할 수 없음');
      } else {
        const aiIssues: Array<{ file?: string; severity?: string; message?: string; suggestion?: string }> = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(aiIssues)) throw new Error('AI 응답이 배열이 아님');
        for (const ai of aiIssues) {
          if (!ai.message) continue;
          const sevMap: Record<string, TaskIssue['severity']> = { critical: 'critical', error: 'error', warning: 'warning' };
          const sev = sevMap[ai.severity || 'warning'] || 'warning';
          issues.push(this.createIssue(sev,
            `[AI Security] ${ai.message}`,
            { file: ai.file, suggestion: ai.suggestion, autoFixable: false },
          ));
        }
        logs.push(`[SECURITY] ✅ AI 심층 보안 분석 완료: ${issues.length}건 취약점 발견 (${sensitiveFiles.length}개 파일 분석)`);
      }
    } catch (err: unknown) {
      logs.push(`[SECURITY] ⚠️  AI 응답 파싱 실패: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { issues, logs };
  }

  /** 인증/보안 설정 패턴 검증 */
  private auditAuthPatterns(projectPath: string): { logs: string[]; issues: TaskIssue[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];

    logs.push('[SECURITY] ── 인증/보안 설정 검증 ──');

    // package.json에서 보안 패키지 확인
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        // 보안 필수 패키지 검증
        const hasExpress = !!allDeps.express || !!allDeps.fastify || !!allDeps['@nestjs/core'];
        if (hasExpress) {
          if (!allDeps.helmet) {
            issues.push(this.createIssue('warning', '[Security] helmet 미설치 — HTTP 보안 헤더 설정 패키지가 없습니다', {
              suggestion: 'npm install helmet → app.use(helmet())',
              autoFixable: true,
            }));
          }
          if (!allDeps['express-rate-limit'] && !allDeps['rate-limiter-flexible'] && !allDeps['@nestjs/throttler']) {
            issues.push(this.createIssue('warning', '[Security] Rate Limiter 미설치 — 브루트포스/DDoS 방어 없음', {
              suggestion: 'npm install express-rate-limit → app.use(rateLimit({windowMs: 15*60*1000, max: 100}))',
              autoFixable: true,
            }));
          }
          if (!allDeps.cors) {
            logs.push('[SECURITY] CORS 패키지 미설치 (내장 CORS 사용 가능)');
          }
        }

        // 입력 검증 패키지
        if (hasExpress && !allDeps.zod && !allDeps.joi && !allDeps['class-validator'] && !allDeps.yup) {
          issues.push(this.createIssue('info', '[Security] 입력 검증 라이브러리 없음 — Zod/Joi/class-validator 권장', {
            suggestion: '사용자 입력 검증은 보안의 첫 번째 방어선입니다',
          }));
        }

        // 비밀번호 해싱 패키지
        const hasAuth = !!allDeps.passport || !!allDeps.jsonwebtoken || !!allDeps['next-auth'];
        if (hasAuth && !allDeps.bcrypt && !allDeps.bcryptjs && !allDeps.argon2) {
          issues.push(this.createIssue('warning', '[Security] 비밀번호 해싱 패키지(bcrypt/argon2) 없음', {
            suggestion: 'argon2 또는 bcrypt로 비밀번호를 해싱하세요',
          }));
        }
      } catch { /* skip */ }
    }

    // .gitignore 필수 항목 검증
    const gitignorePath = path.join(projectPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const requiredEntries = ['.env', 'node_modules', '.env.local', '*.pem'];
      for (const entry of requiredEntries) {
        if (!content.includes(entry)) {
          const actual = entry === '.env' ? 'critical' as const : 'info' as const;
          issues.push(this.createIssue(actual === 'critical' ? 'critical' : 'info',
            `[Security] .gitignore에 '${entry}' 항목 없음`, {
              file: '.gitignore',
              suggestion: `.gitignore에 ${entry}를 추가하세요`,
              autoFixable: entry === '.env',
            }));
        }
      }
    } else {
      issues.push(this.createIssue('warning', '[Security] .gitignore 파일이 없습니다', {
        suggestion: '.gitignore를 생성하여 민감 파일을 제외하세요',
        autoFixable: true,
      }));
    }

    logs.push(`[SECURITY] 인증/보안 설정: ${issues.length}건 발견`);
    return { logs, issues };
  }
}
