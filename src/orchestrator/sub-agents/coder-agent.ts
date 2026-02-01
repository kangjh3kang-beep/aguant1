/**
 * Coder Agent — 10x 시니어 풀스택 개발자
 *
 * ━━━ 전문 분야 ━━━
 *  · AI 기반 자율 코드 생성 (Claude / OpenAI / Google Gemini)
 *  · Clean Code, SOLID 원칙, Design Patterns 마스터
 *  · TypeScript/JavaScript 고급 타입 시스템 전문가
 *  · 성능 최적화 (메모리, CPU, 번들 크기, 알고리즘 복잡도)
 *  · 에러 핸들링 패턴 (Railway Oriented, Result<T,E>, Either)
 *  · 코드 아키텍처: 3계층, Hexagonal, Clean Architecture
 *  · 테스트 가능한 코드 설계 (DI, IoC, 순수 함수 우선)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';
import { autoDetectProvider } from '../ai-provider';
import { CodeGenV2, ValidationResult } from '../code-gen-v2';
import { callAISyncUtil } from '../../utils/ai-sync-caller';

export class CoderAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Coder Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'ai-code-generation',
      'file-creation',
      'file-modification',
      'dependency-installation',
      'boilerplate-scaffolding',
      'git-operations',
      'context-aware-coding',
      'clean-code-patterns',
      'solid-principles',
      'performance-optimization',
      'type-safe-design',
      'error-handling-patterns',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskResult['issues'] = [];
    const artifacts: string[] = [];
    const outputs: string[] = [];

    // ── 프롬프트 강화: 간단한 태스크도 전문가급 상세 지시로 확장 ──
    const enhanced = this.enhanceTask(task);
    outputs.push('[CODER] ── Prompt Enhancement Applied ──');
    outputs.push(`[CODER] 원본 설명: ${task.description.slice(0, 80)}${task.description.length > 80 ? '...' : ''}`);
    outputs.push(`[CODER] 강화된 설명 길이: ${enhanced.enhancedDescription.length}자 (${Math.round(enhanced.enhancedDescription.length / Math.max(task.description.length, 1) * 100)}% 확장)`);

    // ── CodeGenV2: 자동 검증 + TDD + 폴백 체인 ──
    const codeGenV2 = new CodeGenV2(projectPath);
    outputs.push('[CODER] ── CodeGenV2 Pipeline Active ──');
    const providers = codeGenV2.getAvailableProviders();
    const availableCount = providers.filter((p) => p.available).length;
    outputs.push(`[CODER] FallbackChain: ${availableCount}/${providers.length} AI 프로바이더 사용 가능`);
    for (const p of providers) {
      outputs.push(`[CODER]   ${p.provider}: ${p.available ? '✓' : '✗'} (${p.envKey})`);
    }

    // ── SharedKnowledge 컨텍스트 주입 ──
    const sharedCtx = this.getSharedContext(task);
    if (sharedCtx) {
      outputs.push(`[CODER] SharedKnowledge 컨텍스트 ${sharedCtx.length}자 주입됨`);
    }

    // AI 프로바이더 설정 (config에서 or 환경변수 자동 감지)
    const aiConfig = this.config.aiProvider || autoDetectProvider();

    if (aiConfig) {
      outputs.push(`[CODER] AI Provider: ${aiConfig.provider} (${aiConfig.model || 'default'})`);
    } else {
      outputs.push('[CODER] No AI provider configured - running in analysis-only mode');
      outputs.push('[CODER] Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY for AI coding');
    }

    outputs.push(`[CODER] Working on: ${task.title}`);
    outputs.push(`[CODER] Project: ${projectPath}`);

    // 1. 프로젝트 환경 확인
    const envCheck = this.checkEnvironment(projectPath);
    outputs.push(...envCheck.logs);
    issues.push(...envCheck.issues);

    // 2. Git 브랜치 확인
    const branchResult = this.ensureFeatureBranch(projectPath);
    outputs.push(...branchResult.logs);

    // 3. 의존성 설치 확인
    const depResult = this.ensureDependencies(projectPath);
    outputs.push(...depResult.logs);
    issues.push(...depResult.issues);

    // 4. 기존 파일 분석 (AI 컨텍스트용)
    const fileAnalysis = this.analyzeExistingFiles(projectPath);
    outputs.push(`[CODER] Analyzed ${fileAnalysis.totalFiles} existing files`);
    outputs.push(`[CODER] Source files: ${fileAnalysis.sourceFiles}`);
    outputs.push(`[CODER] Test files: ${fileAnalysis.testFiles}`);

    // 5. AI 코드 생성 + 검증 + 재생성 루프 (프로바이더가 있을 때)
    if (aiConfig) {
      const maxAttempts = codeGenV2.getConfig().maxAttempts;
      let currentPrompt: string | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
          outputs.push(`[CODER] ── 재생성 시도 ${attempt}/${maxAttempts} (검증 실패 피드백 반영) ──`);
        }

        const codeResult = this.generateCodeSync(aiConfig, task, projectPath, fileAnalysis, currentPrompt || undefined);
        outputs.push(...codeResult.logs);

        // 6. CodeGenV2 자동 검증 (생성된 코드 품질 검사)
        if (codeResult.artifacts.length > 0) {
          outputs.push('[CODER] ── CodeGenV2 Auto-Validation ──');
          let allValid = true;
          const allValidations: ValidationResult[] = [];

          for (const artifact of codeResult.artifacts) {
            const validFilePath = path.resolve(projectPath, artifact);
            if (fs.existsSync(validFilePath)) {
              try {
                const code = fs.readFileSync(validFilePath, 'utf-8');
                const result = codeGenV2.validateAndScore(code, artifact);

                outputs.push(`[CODER] 검증: ${artifact}`);
                outputs.push(`[CODER]   품질 점수: ${result.metrics.qualityScore}/100`);
                outputs.push(`[CODER]   복잡도: ${result.metrics.complexityScore}/100`);
                outputs.push(`[CODER]   최대 함수 길이: ${result.metrics.maxFunctionLength}줄`);
                outputs.push(`[CODER]   타입 어노테이션: ${result.metrics.hasTypeAnnotations ? '✓' : '✗'}`);
                outputs.push(`[CODER]   에러 핸들링: ${result.metrics.hasErrorHandling ? '✓' : '✗'}`);
                outputs.push(`[CODER]   품질 게이트: ${result.gateResult.passed ? '✓ PASS' : '✗ FAIL'}`);

                if (!result.overallValid) allValid = false;
                allValidations.push(...result.validations);

                if (!result.gateResult.passed) {
                  for (const reason of result.gateResult.reasons) {
                    codeResult.issues.push(this.createIssue('warning', `[CodeGenV2] ${artifact}: ${reason}`, { file: artifact }));
                  }
                }

                for (const v of result.validations) {
                  for (const e of v.errors) {
                    codeResult.issues.push(this.createIssue('error', `[${v.stage}] ${artifact}: ${e}`, { file: artifact }));
                  }
                }

                // KB에 코드 생성 결과 인사이트 저장
                this.addInsight(
                  'code-pattern',
                  result.overallValid ? 'info' : 'medium',
                  `코드 생성 검증 (시도 ${attempt}): ${artifact}`,
                  `품질 ${result.metrics.qualityScore}/100, 복잡도 ${result.metrics.complexityScore}/100, 게이트 ${result.gateResult.passed ? 'PASS' : 'FAIL'}`,
                  task,
                  [artifact],
                  { qualityScore: result.metrics.qualityScore, complexityScore: result.metrics.complexityScore, attempt },
                );
              } catch (_err: unknown) {
                outputs.push(`[CODER]   ${artifact}: 검증 스킵 (파일 읽기 실패)`);
              }
            }
          }

          // 모든 검증 통과 → 루프 종료
          if (allValid) {
            outputs.push(`[CODER] ✓ 모든 검증 통과 (시도 ${attempt}/${maxAttempts})`);
            issues.push(...codeResult.issues);
            artifacts.push(...codeResult.artifacts);
            break;
          }

          // 마지막 시도 → 실패한 채 종료
          if (attempt >= maxAttempts) {
            outputs.push(`[CODER] ✗ 최대 재생성 횟수 도달 (${maxAttempts}회) — 마지막 결과 사용`);
            issues.push(...codeResult.issues);
            artifacts.push(...codeResult.artifacts);
            break;
          }

          // 검증 실패 → 에러 피드백 프롬프트 생성하여 다음 시도에 사용
          const basePrompt = currentPrompt || this.buildCodePrompt(task, projectPath, this.gatherContext(projectPath));
          currentPrompt = codeGenV2.buildErrorFeedbackPrompt(basePrompt, allValidations, attempt);
          outputs.push(`[CODER] 검증 실패 → 에러 피드백 반영하여 재생성 예정`);

          // 로컬 자동 수정 시도 (AI 재호출 없이 수정 가능한 경우)
          for (const artifact of codeResult.artifacts) {
            for (const v of allValidations) {
              for (const e of v.errors) {
                const localFix = codeGenV2.tryLocalFix(e, artifact, projectPath);
                if (localFix) {
                  try {
                    const fixPath = path.resolve(projectPath, artifact);
                    fs.writeFileSync(fixPath, localFix, 'utf-8');
                    outputs.push(`[CODER] 로컬 수정 적용: ${artifact} (${v.stage} 에러)`);
                  } catch (writeErr: unknown) {
                    outputs.push(`[CODER] 로컬 수정 쓰기 실패: ${artifact} — ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
                  }
                }
              }
            }
          }
        } else {
          // 코드 생성 실패 (artifact 없음)
          issues.push(...codeResult.issues);
          break;
        }
      }
    }

    // 7. TDD 테스트 스켈레톤 생성 (TDD 모드)
    if (codeGenV2.getConfig().tddMode) {
      outputs.push('[CODER] ── TDD: Test-First Pipeline ──');
      const lang = fs.existsSync(path.join(projectPath, 'tsconfig.json')) ? 'typescript'
        : fs.existsSync(path.join(projectPath, 'requirements.txt')) ? 'python'
        : 'typescript';
      const testCode = codeGenV2.generateTestFirst(task.title, task.description, lang);
      if (testCode) {
        const testDir = path.join(projectPath, '.ag-review', 'generated');
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        const ext = lang === 'python' ? '.py' : '.test.ts';
        const testFile = path.join(testDir, `${task.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 30)}${ext}`);
        fs.writeFileSync(testFile, testCode, 'utf-8');
        const relPath = path.relative(projectPath, testFile);
        artifacts.push(relPath);
        outputs.push(`[CODER] TDD 테스트 생성: ${relPath}`);
      }
    }

    return {
      success: issues.filter((i) => i.severity === 'critical').length === 0,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  /**
   * AI를 통해 코드를 생성하고 파일에 씁니다.
   */
  private generateCodeSync(
    aiConfig: NonNullable<ReturnType<typeof autoDetectProvider>>,
    task: Task,
    projectPath: string,
    fileAnalysis: { totalFiles: number; sourceFiles: number; testFiles: number },
    promptOverride?: string,
  ): { logs: string[]; issues: TaskResult['issues']; artifacts: string[] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];
    const artifacts: string[] = [];

    logs.push('[CODER] ═══ AI Code Generation ═══');

    // 프로젝트 컨텍스트 수집
    const context = this.gatherContext(projectPath);

    // 프롬프트 생성 (재생성 시 오버라이드 프롬프트 사용)
    const prompt = promptOverride || this.buildCodePrompt(task, projectPath, context);
    logs.push(`[CODER] Prompt length: ${prompt.length} chars${promptOverride ? ' (에러 피드백 포함)' : ''}`);
    logs.push(`[CODER] Context: ${context.length} chars from ${fileAnalysis.sourceFiles} source files`);

    // AI API 호출 (shared utility 사용)
    const codeText = callAISyncUtil({
      aiConfig,
      systemPrompt: '',
      userPrompt: prompt,
      maxTokens: aiConfig.maxTokens || 8192,
    });

    if (!codeText) {
      logs.push('[CODER] No response from AI');
      issues.push(this.createIssue('warning', 'AI generation returned no response', { autoFixable: false }));
      return { logs, issues, artifacts };
    }

    // 성공
    logs.push(`[CODER] AI response received (${aiConfig.provider}/${aiConfig.model || 'default'})`);

    // 생성된 코드를 파일로 저장
    const savedFiles = this.saveGeneratedCode(projectPath, task, codeText, logs);
    logs.push(`[CODER] Generated ${savedFiles.length} file(s):`);
    for (const file of savedFiles) {
      logs.push(`  → ${file}`);
      artifacts.push(file);
    }

    return { logs, issues, artifacts };
  }

  /**
   * 프로젝트 소스 코드를 컨텍스트로 수집합니다.
   */
  private gatherContext(projectPath: string): string {
    const contextParts: string[] = [];
    const maxContextLen = 30000;
    let currentLen = 0;

    // package.json
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      contextParts.push(`// package.json\n${content}`);
      currentLen += content.length;
    }

    // tsconfig.json
    const tsConfigPath = path.join(projectPath, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      const content = fs.readFileSync(tsConfigPath, 'utf-8');
      contextParts.push(`// tsconfig.json\n${content}`);
      currentLen += content.length;
    }

    // 소스 파일 (주요 파일 우선 — types/interfaces 파일은 크기 제한 완화)
    const sourceFiles = this.collectSourceFiles(projectPath);
    for (const file of sourceFiles) {
      if (currentLen > maxContextLen) break;
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const basename = path.basename(file, path.extname(file));
        const isKeyFile = ['types', 'interfaces', 'index', 'constants', 'config'].includes(basename);
        const sizeLimit = isKeyFile ? 8000 : 3000;
        if (content.length > sizeLimit) continue;
        const relPath = path.relative(projectPath, file);
        contextParts.push(`// ${relPath}\n${content}`);
        currentLen += content.length;
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[CoderAgent] context file read:', err instanceof Error ? err.message : String(err)); }
      }
    }

    return contextParts.join('\n\n');
  }

  private collectSourceFiles(projectPath: string): string[] {
    const files: string[] = [];
    const scanDir = (dir: string, depth: number) => {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !/\.(test|spec)\./i.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[CoderAgent] source file scan dir:', err instanceof Error ? err.message : String(err)); }
      }
    };
    scanDir(projectPath, 0);
    // index/types/main 파일 우선
    files.sort((a, b) => {
      const priorityNames = ['index', 'types', 'main', 'app', 'server'];
      const aName = path.basename(a, path.extname(a));
      const bName = path.basename(b, path.extname(b));
      const aPriority = priorityNames.indexOf(aName);
      const bPriority = priorityNames.indexOf(bName);
      if (aPriority >= 0 && bPriority < 0) return -1;
      if (bPriority >= 0 && aPriority < 0) return 1;
      return 0;
    });
    return files;
  }

  /**
   * 프로젝트 기술 스택을 감지합니다.
   */
  private detectProjectStack(projectPath: string): { language: string; framework: string; linter: string; testRunner: string } {
    const exists = (f: string) => fs.existsSync(path.join(projectPath, f));
    let language = 'typescript';
    let framework = 'Node.js';
    let linter = 'ESLint';
    let testRunner = 'Jest';

    if (exists('tsconfig.json')) language = 'TypeScript';
    else if (exists('requirements.txt') || exists('setup.py') || exists('pyproject.toml')) language = 'Python';
    else if (exists('go.mod')) language = 'Go';
    else if (exists('Cargo.toml')) language = 'Rust';
    else if (exists('package.json')) language = 'JavaScript';

    if (exists('package.json')) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        if (deps.express) framework = 'Express';
        else if (deps.next) framework = 'Next.js';
        else if (deps.react) framework = 'React';
        else if (deps.fastify) framework = 'Fastify';
        if (deps.vitest) testRunner = 'Vitest';
        if (deps.mocha) testRunner = 'Mocha';
      } catch { /* ignore */ }
    }

    if (language === 'Python') { linter = 'Ruff/Flake8'; testRunner = 'pytest'; }
    if (language === 'Go') { linter = 'golangci-lint'; testRunner = 'go test'; }
    if (language === 'Rust') { linter = 'clippy'; testRunner = 'cargo test'; }

    return { language, framework, linter, testRunner };
  }

  /**
   * 태스크에 맞는 코드 생성 프롬프트를 만듭니다.
   * PromptEnhancer를 활용하여 간단한 명령도 전문가급으로 확장합니다.
   */
  private buildCodePrompt(task: Task, projectPath: string, context: string): string {
    // ── PromptEnhancer로 시스템 프롬프트 + 사고 프레임워크 생성 ──
    const enhanced = this.enhanceTask(task);
    const stack = this.detectProjectStack(projectPath);

    return `
${enhanced.systemPrompt}

═══════════════════════════════════════

## ⚠️ CRITICAL: PROJECT TECHNOLOGY STACK (반드시 준수)
- **Language**: ${stack.language}
- **Framework**: ${stack.framework}
- **Linter**: ${stack.linter}
- **Test Runner**: ${stack.testRunner}

**절대 금지 사항:**
- ${stack.language} 이외의 언어 도구(${stack.language === 'TypeScript' ? 'Ruff, Black, pylint, flake8 등 Python 도구' : stack.language === 'Python' ? 'ESLint, tsc 등 JavaScript/TypeScript 도구' : '다른 언어 도구'}) 사용 금지
- 프로젝트에 없는 모듈/패키지를 import하지 마세요
- 기존 프로젝트 구조와 네이밍 컨벤션을 따르세요
- 기존 파일의 export/import 패턴을 유지하세요

## Task
${task.title}

## Enhanced Description (Prompt Enhancer 적용)
${enhanced.enhancedDescription}

## Project Info
- Path: ${projectPath}
- Phase: ${task.phase}
- Language: ${stack.language}
- Framework: ${stack.framework}

## 사고 프레임워크 (Chain-of-Thought)
${enhanced.thinkingFramework}

## EXPERT CODING STANDARDS (반드시 준수)

### Clean Code
- 함수는 20줄 이내, 한 가지 역할만 수행
- 변수명은 의도를 명확히 드러냄 (isLoading, hasPermission, fetchUserById)
- 매직 넘버 금지 → 상수(CONSTANT_CASE)로 추출
- 중첩 깊이 최대 3단계 (Early Return 패턴 사용)
- 주석 대신 자기 문서화 코드 (코드 자체가 설명이 되도록)

### SOLID 원칙
- SRP: 한 모듈 = 한 책임
- OCP: 확장에 열림, 수정에 닫힘 (Strategy/Plugin 패턴)
- LSP: 하위 타입은 상위 타입을 완전히 대체 가능
- ISP: 필요한 인터페이스만 의존 (작은 인터페이스)
- DIP: 구현이 아닌 추상화에 의존 (DI 패턴)

### TypeScript 전문가 패턴
- strict: true 기준으로 작성
- Discriminated Union으로 상태 모델링
- Generic constraints로 타입 안전성 확보
- Readonly<T>, ReadonlyArray<T> 적극 사용
- Optional chaining(?.) 활용, 불필요한 null assertion(!) 금지
- as 타입 단언 최소화 → 타입 가드(is) 사용

### 에러 핸들링
- try-catch는 복구 가능한 곳에서만 사용
- 에러 타입 구분 (ValidationError, NotFoundError, InternalError)
- 에러 메시지에 컨텍스트 포함 (무엇이 실패했는지, 왜 실패했는지)
- 비동기 에러 반드시 처리 (.catch() 또는 try-await-catch)

### 성능
- O(n²) 이상 루프 회피 → Map/Set 활용
- 불필요한 객체 복사 최소화
- 대용량 처리: Stream/Generator 고려
- 메모이제이션은 측정 후 적용

### 보안
- 사용자 입력 검증 필수 (Zod/Joi 또는 직접 검증)
- SQL/NoSQL 인젝션 방지 (파라미터화 쿼리)
- XSS 방지 (HTML escape, CSP)
- 하드코딩된 시크릿 금지

${enhanced.outputFormat}

## File Output Format
- 새 파일 생성 시: // FILE: src/path/to/file.ts
- 여러 파일 필요 시 위 패턴으로 구분
- 테스트 파일도 함께 생성 권장: // FILE: src/path/to/file.test.ts

## 품질 검증 체크리스트
${enhanced.qualityChecklist.map((c) => `- [ ] ${c}`).join('\n')}

## Existing Project Code (for context)
${context.slice(0, 15000)}

## Instructions
Generate complete, production-ready code for this task.
Follow ALL expert coding standards above. Output code only.
`.trim();
  }

  /**
   * 생성된 코드를 파일로 저장합니다.
   */
  private saveGeneratedCode(projectPath: string, task: Task, code: string, logs: string[] = []): string[] {
    const savedFiles: string[] = [];

    // "// FILE: path/to/file.ts" 패턴으로 분리
    const filePattern = /\/\/\s*FILE:\s*(.+)/g;
    const matches = [...code.matchAll(filePattern)];

    if (matches.length > 0) {
      // 여러 파일
      for (let i = 0; i < matches.length; i++) {
        const filePath = matches[i][1].trim();
        const start = matches[i].index! + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index! : code.length;
        const fileContent = code.slice(start, end).trim();

        const fullPath = path.resolve(projectPath, filePath);
        // 보안: AI 생성 경로가 프로젝트 디렉토리 내부인지 검증
        const resolvedProject = path.resolve(projectPath);
        if (!fullPath.startsWith(resolvedProject + path.sep) && fullPath !== resolvedProject) {
          logs.push(`[CODER] 보안 차단: 프로젝트 외부 경로 쓰기 시도 — ${filePath}`);
          continue;
        }
        this.writeCodeFile(fullPath, fileContent);
        savedFiles.push(filePath);
      }
    } else {
      // 단일 파일 - 태스크 이름으로 저장
      const safeName = task.title
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .toLowerCase()
        .slice(0, 50);
      const outputDir = path.join(projectPath, '.ag-review', 'generated');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outputPath = path.join(outputDir, `${safeName}.ts`);
      this.writeCodeFile(outputPath, code);
      savedFiles.push(path.relative(projectPath, outputPath));
    }

    return savedFiles;
  }

  private writeCodeFile(fullPath: string, content: string): void {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  private checkEnvironment(projectPath: string): { logs: string[]; issues: TaskResult['issues'] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];

    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      logs.push('[CODER] Node.js project detected');
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        logs.push(`[CODER] Project: ${pkg.name || 'unnamed'} v${pkg.version || '0.0.0'}`);
      } catch (_err: unknown) {
        issues.push(this.createIssue('warning', 'Could not parse package.json'));
      }
    }

    if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
      logs.push('[CODER] TypeScript configuration found');
    }

    return { logs, issues };
  }

  private ensureFeatureBranch(projectPath: string): { logs: string[] } {
    const logs: string[] = [];
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
      logs.push(`[CODER] Current branch: ${branch}`);
    } catch (_err: unknown) {
      logs.push('[CODER] Not a git repository or git not available');
    }
    return { logs };
  }

  private ensureDependencies(projectPath: string): { logs: string[]; issues: TaskResult['issues'] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];

    const nodeModules = path.join(projectPath, 'node_modules');
    if (fs.existsSync(path.join(projectPath, 'package.json')) && !fs.existsSync(nodeModules)) {
      logs.push('[CODER] node_modules not found, installing dependencies...');
      try {
        execSync('npm install', { cwd: projectPath, timeout: 120000, stdio: 'pipe' });
        logs.push('[CODER] Dependencies installed successfully');
      } catch (_err: unknown) {
        issues.push(this.createIssue('error', 'Failed to install dependencies'));
      }
    } else {
      logs.push('[CODER] Dependencies already installed');
    }

    return { logs, issues };
  }

  private analyzeExistingFiles(projectPath: string): { totalFiles: number; sourceFiles: number; testFiles: number } {
    let totalFiles = 0;
    let sourceFiles = 0;
    let testFiles = 0;

    const scanDir = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), depth + 1);
          } else {
            totalFiles++;
            if (/\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(entry.name)) {
              if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
                testFiles++;
              } else {
                sourceFiles++;
              }
            }
          }
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[CoderAgent] analyze files scan dir:', err instanceof Error ? err.message : String(err)); }
      }
    };

    scanDir(projectPath, 0);
    return { totalFiles, sourceFiles, testFiles };
  }
}
