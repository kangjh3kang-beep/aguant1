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
import { generateCode, autoDetectProvider, AICodeResponse } from '../ai-provider';

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

    // 5. AI 코드 생성 (프로바이더가 있을 때)
    if (aiConfig) {
      const codeResult = this.generateCodeSync(aiConfig, task, projectPath, fileAnalysis);
      outputs.push(...codeResult.logs);
      issues.push(...codeResult.issues);
      artifacts.push(...codeResult.artifacts);
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
  ): { logs: string[]; issues: TaskResult['issues']; artifacts: string[] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];
    const artifacts: string[] = [];

    logs.push('[CODER] ═══ AI Code Generation ═══');

    // 프로젝트 컨텍스트 수집
    const context = this.gatherContext(projectPath);

    // 프롬프트 생성
    const prompt = this.buildCodePrompt(task, projectPath, context);
    logs.push(`[CODER] Prompt length: ${prompt.length} chars`);
    logs.push(`[CODER] Context: ${context.length} chars from ${fileAnalysis.sourceFiles} source files`);

    // AI API 호출 (async를 sync로 래핑)
    let response: AICodeResponse | null = null;
    try {
      // Node.js에서 async를 sync로 실행
      const { execSync: execSyncLocal } = require('child_process');
      const scriptPath = path.join(projectPath, '.ag-review', '_ai_gen.js');
      const scriptDir = path.dirname(scriptPath);

      if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
      }

      // AI 호출 스크립트 생성 및 실행
      const script = `
const { generateCode } = require('${path.resolve(__dirname, '..', 'ai-provider').replace(/\\/g, '\\\\')}');
const config = ${JSON.stringify(aiConfig)};
const request = {
  prompt: ${JSON.stringify(prompt)},
  language: 'typescript',
  maxTokens: ${aiConfig.maxTokens || 8192},
};
generateCode(config, request).then(r => {
  process.stdout.write(JSON.stringify(r));
}).catch(e => {
  process.stdout.write(JSON.stringify({ success: false, code: '', error: e.message, provider: config.provider, model: config.model || 'unknown' }));
});
`;

      fs.writeFileSync(scriptPath, script);

      const output = execSyncLocal(`node "${scriptPath}"`, {
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: projectPath,
      });

      // 임시 스크립트 제거
      try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }

      response = JSON.parse(output);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logs.push(`[CODER] AI call failed: ${errMsg.slice(0, 300)}`);
      issues.push(this.createIssue('warning', `AI generation failed: ${errMsg.slice(0, 200)}`, { autoFixable: false }));
      return { logs, issues, artifacts };
    }

    if (!response) {
      logs.push('[CODER] No response from AI');
      return { logs, issues, artifacts };
    }

    if (!response.success) {
      logs.push(`[CODER] AI error: ${response.error}`);
      issues.push(this.createIssue('warning', `AI error: ${response.error}`, { autoFixable: false }));
      return { logs, issues, artifacts };
    }

    // 성공
    logs.push(`[CODER] AI response received (${response.provider}/${response.model})`);
    if (response.tokensUsed) {
      logs.push(`[CODER] Tokens used: ${response.tokensUsed}`);
    }

    // 생성된 코드를 파일로 저장
    const savedFiles = this.saveGeneratedCode(projectPath, task, response.code);
    logs.push(`[CODER] Generated ${savedFiles.length} file(s):`);
    for (const file of savedFiles) {
      logs.push(`  → ${file}`);
      artifacts.push(file);
    }

    if (response.explanation) {
      logs.push(`[CODER] AI explanation: ${response.explanation.slice(0, 300)}`);
    }

    return { logs, issues, artifacts };
  }

  /**
   * 프로젝트 소스 코드를 컨텍스트로 수집합니다.
   */
  private gatherContext(projectPath: string): string {
    const contextParts: string[] = [];
    const maxContextLen = 15000;
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

    // 소스 파일 (주요 파일 우선)
    const sourceFiles = this.collectSourceFiles(projectPath);
    for (const file of sourceFiles) {
      if (currentLen > maxContextLen) break;
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.length > 3000) continue; // 너무 큰 파일 스킵
        const relPath = path.relative(projectPath, file);
        contextParts.push(`// ${relPath}\n${content}`);
        currentLen += content.length;
      } catch {
        // skip
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
      } catch { /* ignore */ }
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
   * 태스크에 맞는 코드 생성 프롬프트를 만듭니다.
   */
  private buildCodePrompt(task: Task, projectPath: string, context: string): string {
    return `
You are a 10x Senior Full-Stack Developer. Write production-grade code.

## Task
${task.title}

## Description
${task.description}

## Project Info
- Path: ${projectPath}
- Phase: ${task.phase}

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

## File Output Format
- 새 파일 생성 시: // FILE: src/path/to/file.ts
- 여러 파일 필요 시 위 패턴으로 구분
- 테스트 파일도 함께 생성 권장: // FILE: src/path/to/file.test.ts

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
  private saveGeneratedCode(projectPath: string, task: Task, code: string): string[] {
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
      } catch {
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
    } catch {
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
      } catch {
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
      } catch {
        // ignore
      }
    };

    scanDir(projectPath, 0);
    return { totalFiles, sourceFiles, testFiles };
  }
}
