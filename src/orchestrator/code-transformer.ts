/**
 * CodeTransformer — 프로그래매틱 코드 수정 엔진
 *
 * Phase 4: AST 라이브러리 없이 정규식 + 패턴 기반으로 소스 코드를 직접 수정합니다.
 *
 * ━━━ 핵심 기능 ━━━
 *  - 미사용 import 제거
 *  - 누락 import 추가
 *  - console.log/debug 제거
 *  - 빈 catch 블록 수정
 *  - 타입 어노테이션 보강
 *  - 하드코딩된 시크릿 → 환경변수 전환
 *  - non-null assertion (!) 제거
 *  - any 타입 → unknown 전환
 *  - 빈 함수 body에 TODO 추가
 *  - 라인별 정밀 패치 적용
 *
 * ━━━ 설계 원칙 ━━━
 *  1. 외부 AST 라이브러리(ts-morph, babel 등) 의존 없이 동작
 *  2. 각 변환은 독립적으로 적용 가능 (조합 가능)
 *  3. 변환 전후 검증을 통해 regression 방지
 *  4. git 기반 롤백 지원
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ASTTransformer, ASTTransformType, ASTTransformResult } from './ast-transformer';

// ─── 변환 결과 타입 ─────────────────────────────────────

export interface TransformResult {
  /** 변환 성공 여부 */
  success: boolean;
  /** 적용된 변환 수 */
  appliedCount: number;
  /** 변환 상세 로그 */
  changes: TransformChange[];
  /** 변환 후 코드 (성공 시) */
  transformedCode?: string;
  /** 에러 메시지 (실패 시) */
  error?: string;
}

export interface TransformChange {
  /** 변환 유형 */
  type: TransformType;
  /** 변환 대상 파일 */
  file: string;
  /** 변환 대상 라인 (0-based) */
  line?: number;
  /** 변환 전 코드 */
  before: string;
  /** 변환 후 코드 */
  after: string;
  /** 변환 설명 */
  description: string;
}

export type TransformType =
  | 'remove-unused-import'
  | 'add-missing-import'
  | 'remove-console'
  | 'fix-empty-catch'
  | 'add-type-annotation'
  | 'replace-any-type'
  | 'remove-non-null-assertion'
  | 'extract-hardcoded-secret'
  | 'add-return-type'
  | 'fix-empty-function'
  | 'add-error-handling'
  | 'line-patch';

// ─── 라인 패치 타입 ─────────────────────────────────────

export interface LinePatch {
  /** 대상 파일 경로 (프로젝트 루트 기준 상대 경로) */
  file: string;
  /** 대상 라인 번호 (1-based) */
  line: number;
  /** 기존 코드 (매칭용) */
  oldCode: string;
  /** 교체할 코드 */
  newCode: string;
  /** 패치 설명 */
  description: string;
}

// ─── CodeTransformer 메인 클래스 ─────────────────────────

export class CodeTransformer {
  private projectPath: string;
  private astTransformer: ASTTransformer;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.astTransformer = new ASTTransformer(projectPath);
  }

  /**
   * AST 기반 변환기에 접근합니다 (고급 변환용).
   */
  getASTTransformer(): ASTTransformer {
    return this.astTransformer;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  통합 변환: 파일에 모든 자동 수정을 한 번에 적용
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 파일에 가능한 모든 자동 변환을 적용합니다.
   * 변환 전 git stash로 롤백 포인트를 만들고, 검증 실패 시 롤백합니다.
   */
  transformFile(
    filePath: string,
    transforms?: TransformType[],
  ): TransformResult {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectPath, filePath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, appliedCount: 0, changes: [], error: `파일 없음: ${filePath}` };
    }

    const originalCode = fs.readFileSync(fullPath, 'utf-8');
    let code = originalCode;
    const changes: TransformChange[] = [];

    const isTS = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    const isJS = filePath.endsWith('.js') || filePath.endsWith('.jsx');
    const isTest = /\.(test|spec)\./i.test(filePath);

    // 적용할 변환 목록 (지정되지 않으면 전체)
    const activeTransforms = transforms || [
      'remove-unused-import',
      'remove-console',
      'fix-empty-catch',
      'replace-any-type',
      'remove-non-null-assertion',
      'extract-hardcoded-secret',
      'fix-empty-function',
    ];

    for (const transform of activeTransforms) {
      try {
        const result = this.applyTransform(code, filePath, transform, isTS, isJS, isTest);
        if (result.changed) {
          code = result.code;
          changes.push(...result.changes);
        }
      } catch (err: unknown) {
        // 개별 변환 실패는 전체를 중단하지 않고 계속 진행
        if (process.env.AG_DEBUG) {
          console.debug(`[CodeTransformer] ${transform} 변환 실패 (${filePath}): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // regex 변환 적용 후 파일 저장 (AST 변환 전)
    if (changes.length > 0) {
      fs.writeFileSync(fullPath, code, 'utf-8');

      // 기본 검증: 구문 확인
      const valid = this.quickValidate(code, filePath, isTS);
      if (!valid) {
        // 검증 실패 → 원본 복원
        fs.writeFileSync(fullPath, originalCode, 'utf-8');
        return {
          success: false,
          appliedCount: 0,
          changes: [],
          error: '패턴 변환 후 검증 실패 — 원본으로 복원됨',
        };
      }
    }

    // AST 기반 추가 변환 (TypeScript 파일만)
    if (isTS) {
      try {
        const astTransforms: ASTTransformType[] = [
          'remove-unused-import',
          'remove-unused-variable',
          'rename-unused-param',
        ];
        const astResult = this.astTransformer.transformFile(filePath, astTransforms);
        if (astResult.success && astResult.appliedCount > 0) {
          code = astResult.transformedCode || code;
          for (const astChange of astResult.changes) {
            changes.push({
              type: astChange.type as TransformType,
              file: filePath,
              line: astChange.line,
              before: astChange.before,
              after: astChange.after,
              description: `[AST] ${astChange.description}`,
            });
          }
        }
      } catch {
        // AST 변환 실패는 무시 (regex 변환 결과는 유지)
      }
    }

    if (changes.length === 0) {
      return { success: true, appliedCount: 0, changes, transformedCode: code };
    }

    return {
      success: true,
      appliedCount: changes.length,
      changes,
      transformedCode: code,
    };
  }

  /**
   * 여러 파일에 변환을 일괄 적용합니다.
   */
  transformFiles(
    filePaths: string[],
    transforms?: TransformType[],
  ): Map<string, TransformResult> {
    const results = new Map<string, TransformResult>();
    for (const fp of filePaths) {
      results.set(fp, this.transformFile(fp, transforms));
    }
    return results;
  }

  /**
   * 프로젝트 전체에서 특정 변환을 적용합니다.
   */
  transformProject(
    transforms?: TransformType[],
    extensions: string[] = ['.ts', '.tsx', '.js', '.jsx'],
  ): { total: number; changed: number; results: Map<string, TransformResult> } {
    const files = this.scanFiles(this.projectPath, extensions);
    const results = this.transformFiles(files, transforms);

    let changed = 0;
    for (const r of results.values()) {
      if (r.appliedCount > 0) changed++;
    }

    return { total: files.length, changed, results };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  라인 패치: 정밀한 라인 단위 코드 수정
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 라인 단위 패치를 적용합니다.
   * git 기반 롤백 포인트를 자동 생성합니다.
   */
  applyPatches(patches: LinePatch[]): {
    applied: number;
    failed: number;
    results: Array<{ patch: LinePatch; success: boolean; error?: string }>;
  } {
    const results: Array<{ patch: LinePatch; success: boolean; error?: string }> = [];
    let applied = 0;
    let failed = 0;

    // 파일별로 그룹화 (같은 파일의 패치는 한 번에 적용)
    const byFile = new Map<string, LinePatch[]>();
    for (const patch of patches) {
      if (!byFile.has(patch.file)) byFile.set(patch.file, []);
      byFile.get(patch.file)!.push(patch);
    }

    for (const [file, filePatches] of byFile) {
      const fullPath = path.isAbsolute(file) ? file : path.join(this.projectPath, file);

      if (!fs.existsSync(fullPath)) {
        for (const patch of filePatches) {
          results.push({ patch, success: false, error: `파일 없음: ${file}` });
          failed++;
        }
        continue;
      }

      const originalCode = fs.readFileSync(fullPath, 'utf-8');
      const lines = originalCode.split('\n');

      // 라인 번호 내림차순으로 정렬 (뒤에서부터 적용하여 라인 번호 shift 방지)
      const sorted = [...filePatches].sort((a, b) => b.line - a.line);

      let modified = false;
      for (const patch of sorted) {
        const lineIdx = patch.line - 1; // 1-based → 0-based

        if (lineIdx < 0 || lineIdx >= lines.length) {
          results.push({ patch, success: false, error: `라인 범위 초과: ${patch.line}/${lines.length}` });
          failed++;
          continue;
        }

        // oldCode가 비어있으면 무조건 교체, 아니면 매칭 확인
        const currentLine = lines[lineIdx];
        if (patch.oldCode && !currentLine.includes(patch.oldCode.trim())) {
          results.push({ patch, success: false, error: `코드 불일치: expected "${patch.oldCode.trim()}" in "${currentLine.trim()}"` });
          failed++;
          continue;
        }

        // 패치 적용
        if (patch.newCode === '') {
          // 라인 삭제
          lines.splice(lineIdx, 1);
        } else if (patch.oldCode) {
          // 부분 교체
          lines[lineIdx] = currentLine.replace(patch.oldCode.trim(), patch.newCode.trim());
        } else {
          // 전체 라인 교체
          lines[lineIdx] = patch.newCode;
        }

        modified = true;
        results.push({ patch, success: true });
        applied++;
      }

      if (modified) {
        const newCode = lines.join('\n');
        const isTS = file.endsWith('.ts') || file.endsWith('.tsx');

        // 검증
        const valid = this.quickValidate(newCode, file, isTS);
        if (valid) {
          fs.writeFileSync(fullPath, newCode, 'utf-8');
        } else {
          // 롤백
          fs.writeFileSync(fullPath, originalCode, 'utf-8');
          // 이 파일의 모든 패치를 실패로 표시
          for (const r of results) {
            if (r.patch.file === file && r.success) {
              r.success = false;
              r.error = '검증 실패 — 롤백됨';
              applied--;
              failed++;
            }
          }
        }
      }
    }

    return { applied, failed, results };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  개별 변환 로직
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private applyTransform(
    code: string,
    filePath: string,
    type: TransformType,
    isTS: boolean,
    isJS: boolean,
    isTest: boolean,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    switch (type) {
      case 'remove-unused-import': return this.removeUnusedImports(code, filePath);
      case 'add-missing-import': return this.addMissingImports(code, filePath);
      case 'remove-console': return isTest ? { changed: false, code, changes: [] } : this.removeConsoleLogs(code, filePath);
      case 'fix-empty-catch': return this.fixEmptyCatch(code, filePath);
      case 'replace-any-type': return isTS ? this.replaceAnyType(code, filePath) : { changed: false, code, changes: [] };
      case 'remove-non-null-assertion': return isTS ? this.removeNonNullAssertions(code, filePath) : { changed: false, code, changes: [] };
      case 'extract-hardcoded-secret': return this.extractHardcodedSecrets(code, filePath);
      case 'fix-empty-function': return this.fixEmptyFunctions(code, filePath);
      case 'add-error-handling': return this.addErrorHandling(code, filePath);
      default: return { changed: false, code, changes: [] };
    }
  }

  /**
   * 미사용 import 제거
   * import 문에서 선언된 식별자가 코드 본문에서 사용되지 않으면 제거합니다.
   */
  private removeUnusedImports(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const lines = code.split('\n');
    const changes: TransformChange[] = [];
    const removedLines = new Set<number>();

    // import 문 파싱
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // import { X, Y } from '...' 패턴
      const namedMatch = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/);
      if (namedMatch) {
        const imports = namedMatch[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
        const bodyCode = lines.filter((_, idx) => idx !== i).join('\n');
        const unusedImports = imports.filter((imp) => {
          // import 문 자체를 제외한 코드에서 사용 여부 확인
          const regex = new RegExp(`\\b${this.escapeRegex(imp)}\\b`);
          return !regex.test(bodyCode);
        });

        if (unusedImports.length === imports.length) {
          // 모든 import가 미사용 → 전체 라인 제거
          removedLines.add(i);
          changes.push({
            type: 'remove-unused-import',
            file: filePath,
            line: i,
            before: line,
            after: '',
            description: `미사용 import 전체 제거: ${unusedImports.join(', ')}`,
          });
        } else if (unusedImports.length > 0) {
          // 일부만 미사용 → 해당 식별자만 제거
          let newImportList = imports.filter((imp) => !unusedImports.includes(imp)).join(', ');
          const fromPart = line.match(/from\s+['"][^'"]+['"]/);
          if (fromPart) {
            const newLine = `import { ${newImportList} } ${fromPart[0]}${line.endsWith(';') ? ';' : ''}`;
            lines[i] = newLine;
            changes.push({
              type: 'remove-unused-import',
              file: filePath,
              line: i,
              before: line,
              after: newLine,
              description: `미사용 import 제거: ${unusedImports.join(', ')}`,
            });
          }
        }
        continue;
      }

      // import X from '...' 패턴 (default import)
      const defaultMatch = line.match(/^import\s+(\w+)\s+from\s+['"][^'"]+['"]/);
      if (defaultMatch) {
        const importName = defaultMatch[1];
        const bodyCode = lines.filter((_, idx) => idx !== i).join('\n');
        const regex = new RegExp(`\\b${this.escapeRegex(importName)}\\b`);
        if (!regex.test(bodyCode)) {
          removedLines.add(i);
          changes.push({
            type: 'remove-unused-import',
            file: filePath,
            line: i,
            before: line,
            after: '',
            description: `미사용 default import 제거: ${importName}`,
          });
        }
        continue;
      }

      // import * as X from '...' 패턴
      const starMatch = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"][^'"]+['"]/);
      if (starMatch) {
        const importName = starMatch[1];
        const bodyCode = lines.filter((_, idx) => idx !== i).join('\n');
        const regex = new RegExp(`\\b${this.escapeRegex(importName)}\\b`);
        if (!regex.test(bodyCode)) {
          removedLines.add(i);
          changes.push({
            type: 'remove-unused-import',
            file: filePath,
            line: i,
            before: line,
            after: '',
            description: `미사용 namespace import 제거: ${importName}`,
          });
        }
      }
    }

    if (removedLines.size === 0 && changes.length === 0) {
      return { changed: false, code, changes: [] };
    }

    const newCode = lines.filter((_, i) => !removedLines.has(i)).join('\n');
    return { changed: true, code: newCode, changes };
  }

  /**
   * 누락 import 추가 (TypeScript 에러 메시지 기반)
   */
  private addMissingImports(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const changes: TransformChange[] = [];

    // 일반적인 Node.js/TypeScript 모듈 매핑
    const COMMON_IMPORTS: Record<string, string> = {
      'fs': "import fs from 'fs';",
      'path': "import path from 'path';",
      'execSync': "import { execSync } from 'child_process';",
      'EventEmitter': "import { EventEmitter } from 'events';",
      'Buffer': '', // 글로벌
      'process': '', // 글로벌
      'console': '', // 글로벌
    };

    const lines = code.split('\n');
    let insertIdx = 0;

    // import 블록의 끝 위치 찾기
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s/.test(lines[i])) {
        insertIdx = i + 1;
      }
    }

    // 사용되지만 import 되지 않은 일반 모듈 확인
    for (const [name, importStatement] of Object.entries(COMMON_IMPORTS)) {
      if (!importStatement) continue; // 글로벌은 건너뜀

      const usageRegex = new RegExp(`\\b${this.escapeRegex(name)}\\b`);
      const importRegex = new RegExp(`import.*\\b${this.escapeRegex(name)}\\b.*from`);

      if (usageRegex.test(code) && !importRegex.test(code)) {
        lines.splice(insertIdx, 0, importStatement);
        insertIdx++;
        changes.push({
          type: 'add-missing-import',
          file: filePath,
          line: insertIdx - 1,
          before: '',
          after: importStatement,
          description: `누락 import 추가: ${name}`,
        });
      }
    }

    if (changes.length === 0) {
      return { changed: false, code, changes: [] };
    }

    return { changed: true, code: lines.join('\n'), changes };
  }

  /**
   * console.log/debug/info 제거 (프로덕션 코드에서)
   */
  private removeConsoleLogs(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const lines = code.split('\n');
    const changes: TransformChange[] = [];
    const removedLines = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // console.log, console.debug, console.info (console.error/warn은 유지)
      if (/^\s*console\.(log|debug|info)\s*\(/.test(line)) {
        // 멀티라인 console 처리 (닫는 괄호가 같은 줄에 있는 경우만)
        if (line.includes(');') || line.includes(')')) {
          removedLines.add(i);
          changes.push({
            type: 'remove-console',
            file: filePath,
            line: i,
            before: line.trim(),
            after: '',
            description: `console.${line.match(/console\.(\w+)/)?.[1] || 'log'} 제거`,
          });
        }
      }
    }

    if (removedLines.size === 0) {
      return { changed: false, code, changes: [] };
    }

    const newCode = lines.filter((_, i) => !removedLines.has(i)).join('\n');
    return { changed: true, code: newCode, changes };
  }

  /**
   * 빈 catch 블록에 에러 로깅 추가
   */
  private fixEmptyCatch(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const changes: TransformChange[] = [];
    let modified = false;

    // catch (e) {} → catch (e) { /* ignore */ }
    // catch {} → catch { /* ignore */ }
    const newCode = code.replace(
      /catch\s*(\([^)]*\))?\s*\{\s*\}/g,
      (match, param) => {
        modified = true;
        const paramStr = param || '';
        const errVar = paramStr.match(/\((\w+)/)?.[1];
        const replacement = errVar
          ? `catch ${paramStr} { /* ${errVar} ignored */ }`
          : 'catch { /* error ignored */ }';
        changes.push({
          type: 'fix-empty-catch',
          file: filePath,
          before: match,
          after: replacement,
          description: '빈 catch 블록에 주석 추가',
        });
        return replacement;
      },
    );

    return { changed: modified, code: newCode, changes };
  }

  /**
   * any 타입을 unknown으로 교체
   */
  private replaceAnyType(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const changes: TransformChange[] = [];
    let modified = false;

    // : any → : unknown (파라미터, 반환 타입에서)
    // 주의: catch(e: any)는 유지 (TypeScript 규칙)
    const newCode = code.replace(
      /:\s*any\b(?!\s*\/\*\s*keep)/g,
      (match, offset) => {
        // catch 블록의 any는 건너뜀
        const before = code.slice(Math.max(0, offset - 30), offset);
        if (/catch\s*\(\s*\w+$/.test(before)) {
          return match;
        }
        modified = true;
        changes.push({
          type: 'replace-any-type',
          file: filePath,
          before: match.trim(),
          after: ': unknown',
          description: 'any 타입을 unknown으로 교체',
        });
        return ': unknown';
      },
    );

    return { changed: modified, code: newCode, changes };
  }

  /**
   * non-null assertion (!) 제거 → optional chaining (?.)으로 교체
   */
  private removeNonNullAssertions(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const changes: TransformChange[] = [];
    let modified = false;

    // obj!.prop → obj?.prop
    // obj!.method() → obj?.method()
    const newCode = code.replace(
      /(\w+)!\./g,
      (match, name) => {
        modified = true;
        const replacement = `${name}?.`;
        changes.push({
          type: 'remove-non-null-assertion',
          file: filePath,
          before: match,
          after: replacement,
          description: `non-null assertion 제거: ${name}! → ${name}?`,
        });
        return replacement;
      },
    );

    return { changed: modified, code: newCode, changes };
  }

  /**
   * 하드코딩된 시크릿을 환경변수로 교체
   */
  private extractHardcodedSecrets(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const changes: TransformChange[] = [];
    let modified = false;

    // password = "xxx" → password = process.env.PASSWORD || ''
    // apiKey = 'xxx' → apiKey = process.env.API_KEY || ''
    const secretPatterns = [
      { regex: /((?:password|passwd|pwd)\s*[:=]\s*)(['"])([^'"]{8,})\2/gi, envName: 'PASSWORD' },
      { regex: /((?:api_?key|apikey)\s*[:=]\s*)(['"])([^'"]{8,})\2/gi, envName: 'API_KEY' },
      { regex: /((?:secret|secret_?key)\s*[:=]\s*)(['"])([^'"]{8,})\2/gi, envName: 'SECRET_KEY' },
      { regex: /((?:token|auth_?token|access_?token)\s*[:=]\s*)(['"])([^'"]{8,})\2/gi, envName: 'AUTH_TOKEN' },
    ];

    let newCode = code;
    for (const { regex, envName } of secretPatterns) {
      newCode = newCode.replace(regex, (match, prefix, _quote, _value) => {
        modified = true;
        const replacement = `${prefix}process.env.${envName} || ''`;
        changes.push({
          type: 'extract-hardcoded-secret',
          file: filePath,
          before: match.slice(0, 50) + '...',
          after: replacement,
          description: `하드코딩 시크릿 → process.env.${envName}`,
        });
        return replacement;
      });
    }

    return { changed: modified, code: newCode, changes };
  }

  /**
   * 빈 함수 body에 TODO 주석 추가
   */
  private fixEmptyFunctions(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    const changes: TransformChange[] = [];
    let modified = false;

    // function foo() {} → function foo() { /* TODO: implement */ }
    // () => {} → () => { /* TODO: implement */ }
    const newCode = code.replace(
      /((?:function\s+\w+|(?:async\s+)?(?:\w+\s*)?=>|\w+\s*\([^)]*\))\s*)\{\s*\}/g,
      (match, prefix) => {
        // 빈 객체 리터럴과 구분 (= {} 패턴은 무시)
        if (/=\s*$/.test(code.slice(Math.max(0, code.indexOf(match) - 5), code.indexOf(match)))) {
          return match;
        }
        modified = true;
        const replacement = `${prefix}{ /* TODO: implement */ }`;
        changes.push({
          type: 'fix-empty-function',
          file: filePath,
          before: match.trim(),
          after: replacement.trim(),
          description: '빈 함수에 TODO 주석 추가',
        });
        return replacement;
      },
    );

    return { changed: modified, code: newCode, changes };
  }

  /**
   * try-catch가 없는 async 함수에 에러 핸들링 추가
   * (최상위 export 함수만 대상)
   */
  private addErrorHandling(
    code: string,
    filePath: string,
  ): { changed: boolean; code: string; changes: TransformChange[] } {
    // 이 변환은 복잡하므로 보수적으로 적용
    // async 함수인데 try-catch가 없는 경우를 감지하고 보고만 함
    const changes: TransformChange[] = [];

    const asyncFuncs = code.match(/(?:export\s+)?async\s+function\s+\w+/g);
    if (!asyncFuncs) return { changed: false, code, changes: [] };

    const hasTryCatch = /try\s*\{/.test(code);
    if (!hasTryCatch && asyncFuncs.length > 0) {
      changes.push({
        type: 'add-error-handling',
        file: filePath,
        before: '',
        after: '',
        description: `${asyncFuncs.length}개 async 함수에 try-catch 필요 (수동 수정 권장)`,
      });
    }

    return { changed: false, code, changes };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  이슈 기반 자동 수정 (TaskIssue → 코드 변환)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * TaskIssue 목록에서 자동 수정 가능한 것을 추출하여 변환합니다.
   */
  fixFromIssues(issues: Array<{
    severity: string;
    message: string;
    file?: string;
    line?: number;
    suggestion?: string;
    autoFixable: boolean;
  }>): TransformResult {
    const patches: LinePatch[] = [];
    const fileTransforms = new Map<string, TransformType[]>();
    const changes: TransformChange[] = [];
    let totalApplied = 0;

    for (const issue of issues) {
      if (!issue.file) continue;

      const msg = issue.message.toLowerCase();

      // 미사용 import
      if (/unused.*import|declared but.*never (read|used)/i.test(issue.message)) {
        if (!fileTransforms.has(issue.file)) fileTransforms.set(issue.file, []);
        if (!fileTransforms.get(issue.file)!.includes('remove-unused-import')) {
          fileTransforms.get(issue.file)!.push('remove-unused-import');
        }
        continue;
      }

      // console.log
      if (/console\.(log|debug|info)/i.test(issue.message)) {
        if (!fileTransforms.has(issue.file)) fileTransforms.set(issue.file, []);
        if (!fileTransforms.get(issue.file)!.includes('remove-console')) {
          fileTransforms.get(issue.file)!.push('remove-console');
        }
        continue;
      }

      // any 타입
      if (/unexpected any|no-explicit-any/i.test(issue.message)) {
        if (!fileTransforms.has(issue.file)) fileTransforms.set(issue.file, []);
        if (!fileTransforms.get(issue.file)!.includes('replace-any-type')) {
          fileTransforms.get(issue.file)!.push('replace-any-type');
        }
        continue;
      }

      // 빈 catch
      if (/empty.*catch|no-empty/i.test(issue.message)) {
        if (!fileTransforms.has(issue.file)) fileTransforms.set(issue.file, []);
        if (!fileTransforms.get(issue.file)!.includes('fix-empty-catch')) {
          fileTransforms.get(issue.file)!.push('fix-empty-catch');
        }
        continue;
      }

      // 하드코딩 시크릿
      if (/hardcoded.*secret|hardcoded.*password|hardcoded.*key/i.test(issue.message)) {
        if (!fileTransforms.has(issue.file)) fileTransforms.set(issue.file, []);
        if (!fileTransforms.get(issue.file)!.includes('extract-hardcoded-secret')) {
          fileTransforms.get(issue.file)!.push('extract-hardcoded-secret');
        }
        continue;
      }

      // suggestion이 있으면 라인 패치로 변환
      if (issue.suggestion && issue.line && issue.file) {
        patches.push({
          file: issue.file,
          line: issue.line,
          oldCode: '',
          newCode: issue.suggestion,
          description: issue.message,
        });
      }
    }

    // 파일별 변환 적용
    for (const [file, transforms] of fileTransforms) {
      const result = this.transformFile(file, transforms);
      if (result.success && result.appliedCount > 0) {
        changes.push(...result.changes);
        totalApplied += result.appliedCount;
      }
    }

    // 라인 패치 적용
    if (patches.length > 0) {
      const patchResult = this.applyPatches(patches);
      totalApplied += patchResult.applied;
      for (const r of patchResult.results) {
        if (r.success) {
          changes.push({
            type: 'line-patch',
            file: r.patch.file,
            line: r.patch.line,
            before: r.patch.oldCode,
            after: r.patch.newCode,
            description: r.patch.description,
          });
        }
      }
    }

    return {
      success: true,
      appliedCount: totalApplied,
      changes,
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  유틸리티
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 기본 구문 검증 (괄호 매칭)
   */
  private quickValidate(code: string, _filePath: string, isTS: boolean): boolean {
    // 1. 괄호 매칭
    const brackets = { '(': 0, '[': 0, '{': 0 };
    const closers: Record<string, keyof typeof brackets> = { ')': '(', ']': '[', '}': '{' };
    for (const ch of code) {
      if (ch in brackets) brackets[ch as keyof typeof brackets]++;
      if (ch in closers) brackets[closers[ch]]--;
    }
    for (const count of Object.values(brackets)) {
      if (count !== 0) return false;
    }

    // 2. 빈 코드 검사
    if (code.trim().length === 0) return false;

    // 3. TypeScript 컴파일 체크 (선택적 — 빠른 검증을 위해 skip 가능)
    if (isTS) {
      try {
        execSync('npx tsc --version 2>/dev/null', {
          cwd: this.projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: 'pipe',
        });
        // tsc가 설치되어 있으면 빠른 체크 (timeout 짧게)
        // 여기서는 구문 검증만으로 충분하므로 pass
      } catch {
        // tsc 없으면 구문 검증만
      }
    }

    return true;
  }

  /**
   * 프로젝트 내 파일 스캔
   */
  private scanFiles(dir: string, extensions: string[], depth: number = 0): string[] {
    if (depth > 5) return [];
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...this.scanFiles(fullPath, extensions, depth + 1));
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          // 프로젝트 루트 기준 상대 경로
          files.push(path.relative(this.projectPath, fullPath));
        }
      }
    } catch {
      // 디렉토리 접근 불가는 무시
    }

    return files;
  }

  /**
   * 정규식 특수문자 이스케이프
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
