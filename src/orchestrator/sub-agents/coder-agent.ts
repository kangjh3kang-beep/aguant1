/**
 * Coder Agent - AI 자율 코드 생성 및 파일 관리
 *
 * AI 프로바이더(Claude/OpenAI/Google)를 통해 자율적으로 코드를 생성하고,
 * 프로젝트에 파일을 작성합니다. 환경변수에서 API 키를 로드합니다.
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
## Task
${task.title}

## Description
${task.description}

## Project Info
- Path: ${projectPath}
- Type: ${task.phase}

## Requirements
- Write complete, working TypeScript/JavaScript code
- Include proper error handling
- Follow existing project conventions
- If creating new files, specify the file path as a comment at the top: // FILE: src/path/to/file.ts

## Existing Project Code (for context)
${context.slice(0, 15000)}

## Instructions
Generate the code needed to implement this task. Output the code only.
If multiple files are needed, separate them with: // FILE: path/to/file.ts
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
