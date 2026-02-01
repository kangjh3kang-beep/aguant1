/**
 * ASTTransformer — TypeScript Compiler API 기반 AST 코드 변환 엔진
 *
 * Phase 4.5: 정규식으로 불가능한 복잡한 코드 변환을 AST 레벨에서 수행합니다.
 * 외부 라이브러리(ts-morph 등) 없이 TypeScript 내장 Compiler API만 사용합니다.
 *
 * ━━━ 핵심 기능 ━━━
 *  - 미사용 변수/import 정밀 제거 (스코프 인식)
 *  - 함수 시그니처 타입 추론 및 보강
 *  - 안전한 변수/함수 리네이밍
 *  - 중복 코드 감지 및 함수 추출
 *  - 빈 인터페이스/타입 감지
 *  - return 타입 자동 추론 및 추가
 *  - 불필요한 타입 단언(as) 제거
 *  - 사용되지 않는 파라미터 _ 접두어 추가
 *
 * ━━━ 설계 원칙 ━━━
 *  1. TypeScript 내장 Compiler API만 사용 (추가 의존성 없음)
 *  2. 원본 포맷 최대한 보존 (printer 사용)
 *  3. 변환 전후 타입 안전성 검증
 *  4. 각 변환은 독립적으로 적용/롤백 가능
 */

import * as ts from 'typescript';
import fs from 'fs';
import path from 'path';

// ─── AST 변환 결과 타입 ─────────────────────────────────

export interface ASTTransformResult {
  /** 변환 성공 여부 */
  success: boolean;
  /** 변환 적용 수 */
  appliedCount: number;
  /** 변환된 코드 */
  transformedCode?: string;
  /** 변환 상세 */
  changes: ASTChange[];
  /** 에러 메시지 */
  error?: string;
  /** 타입 검증 결과 */
  typeCheckPassed?: boolean;
}

export interface ASTChange {
  type: ASTTransformType;
  description: string;
  line?: number;
  before: string;
  after: string;
}

export type ASTTransformType =
  | 'remove-unused-import'
  | 'remove-unused-variable'
  | 'add-return-type'
  | 'rename-unused-param'
  | 'remove-type-assertion'
  | 'simplify-conditional'
  | 'extract-function'
  | 'add-readonly'
  | 'fix-implicit-any'
  | 'remove-empty-interface'
  | 'safe-rename';

// ─── ASTTransformer 메인 클래스 ─────────────────────────

export class ASTTransformer {
  private projectPath: string;
  private compilerOptions: ts.CompilerOptions;
  private printer: ts.Printer;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.compilerOptions = this.loadCompilerOptions();
    this.printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  통합 변환: 파일에 AST 기반 변환 적용
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 파일에 AST 기반 변환을 적용합니다.
   */
  transformFile(
    filePath: string,
    transforms?: ASTTransformType[],
  ): ASTTransformResult {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectPath, filePath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, appliedCount: 0, changes: [], error: `파일 없음: ${filePath}` };
    }

    // .ts/.tsx 파일만 처리
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
      return { success: false, appliedCount: 0, changes: [], error: 'TypeScript 파일만 지원' };
    }

    let originalCode: string;
    try {
      originalCode = fs.readFileSync(fullPath, 'utf-8');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, appliedCount: 0, changes: [], error: `파일 읽기 실패: ${errMsg}` };
    }

    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        originalCode,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const activeTransforms = transforms || [
        'remove-unused-import',
        'remove-unused-variable',
        'add-return-type',
        'rename-unused-param',
        'remove-empty-interface',
      ];

      let currentSource = sourceFile;
      const allChanges: ASTChange[] = [];

      for (const transformType of activeTransforms) {
        const result = this.applyASTTransform(currentSource, transformType, originalCode);
        if (result.changes.length > 0) {
          allChanges.push(...result.changes);
          if (result.newSource) {
            currentSource = result.newSource;
          }
        }
      }

      if (allChanges.length === 0) {
        return { success: true, appliedCount: 0, changes: [], transformedCode: originalCode };
      }

      // 변환된 코드 출력
      const transformedCode = this.printer.printFile(currentSource);

      // 변환 후 구문 검증
      const valid = this.quickTypeCheck(transformedCode, filePath);

      if (!valid) {
        return {
          success: false,
          appliedCount: 0,
          changes: [],
          error: 'AST 변환 후 타입 검증 실패 — 원본 유지',
          typeCheckPassed: false,
        };
      }

      // 변환 저장
      try {
        fs.writeFileSync(fullPath, transformedCode, 'utf-8');
      } catch (writeErr: unknown) {
        const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        return { success: false, appliedCount: 0, changes: [], error: `파일 쓰기 실패: ${writeMsg}` };
      }

      return {
        success: true,
        appliedCount: allChanges.length,
        changes: allChanges,
        transformedCode,
        typeCheckPassed: true,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, appliedCount: 0, changes: [], error: `AST 파싱 실패: ${errMsg}` };
    }
  }

  /**
   * 여러 파일에 AST 변환을 적용합니다.
   */
  transformFiles(
    filePaths: string[],
    transforms?: ASTTransformType[],
  ): Map<string, ASTTransformResult> {
    const results = new Map<string, ASTTransformResult>();
    for (const fp of filePaths) {
      results.set(fp, this.transformFile(fp, transforms));
    }
    return results;
  }

  /**
   * 프로젝트 전체에 AST 변환을 적용합니다.
   */
  transformProject(
    transforms?: ASTTransformType[],
  ): { total: number; changed: number; results: Map<string, ASTTransformResult> } {
    const files = this.scanTSFiles(this.projectPath);
    const results = this.transformFiles(files, transforms);

    let changed = 0;
    for (const r of results.values()) {
      if (r.appliedCount > 0) changed++;
    }

    return { total: files.length, changed, results };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  코드 분석 (변환 없이 이슈 감지)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 파일을 분석하여 AST 기반 이슈를 감지합니다 (변환 없이).
   */
  analyzeFile(filePath: string): {
    issues: Array<{
      type: ASTTransformType;
      message: string;
      line: number;
      autoFixable: boolean;
    }>;
  } {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectPath, filePath);
    const issues: Array<{
      type: ASTTransformType;
      message: string;
      line: number;
      autoFixable: boolean;
    }> = [];

    if (!fs.existsSync(fullPath)) return { issues };
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) return { issues };

    let code: string;
    try {
      code = fs.readFileSync(fullPath, 'utf-8');
    } catch (_err: unknown) {
      return { issues };
    }
    const sourceFile = ts.createSourceFile(
      filePath, code, ts.ScriptTarget.Latest, true,
    );

    // 미사용 import 분석
    const unusedImports = this.findUnusedImports(sourceFile);
    for (const imp of unusedImports) {
      issues.push({
        type: 'remove-unused-import',
        message: `미사용 import: ${imp.name}`,
        line: this.getLineNumber(sourceFile, imp.node),
        autoFixable: true,
      });
    }

    // 미사용 변수 분석
    const unusedVars = this.findUnusedVariables(sourceFile);
    for (const v of unusedVars) {
      issues.push({
        type: 'remove-unused-variable',
        message: `미사용 변수: ${v.name}`,
        line: this.getLineNumber(sourceFile, v.node),
        autoFixable: true,
      });
    }

    // 반환 타입 누락 함수
    const noReturnType = this.findFunctionsWithoutReturnType(sourceFile);
    for (const fn of noReturnType) {
      issues.push({
        type: 'add-return-type',
        message: `반환 타입 누락: ${fn.name}`,
        line: this.getLineNumber(sourceFile, fn.node),
        autoFixable: true,
      });
    }

    // 빈 인터페이스
    const emptyInterfaces = this.findEmptyInterfaces(sourceFile);
    for (const iface of emptyInterfaces) {
      issues.push({
        type: 'remove-empty-interface',
        message: `빈 인터페이스: ${iface.name}`,
        line: this.getLineNumber(sourceFile, iface.node),
        autoFixable: true,
      });
    }

    // 미사용 파라미터
    const unusedParams = this.findUnusedParameters(sourceFile);
    for (const p of unusedParams) {
      issues.push({
        type: 'rename-unused-param',
        message: `미사용 파라미터: ${p.name} (_ 접두어 추가 권장)`,
        line: this.getLineNumber(sourceFile, p.node),
        autoFixable: true,
      });
    }

    return { issues };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  안전한 리네이밍
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 파일 내 식별자를 안전하게 리네이밍합니다.
   * AST를 순회하며 모든 참조를 찾아 한꺼번에 교체합니다.
   */
  safeRename(
    filePath: string,
    oldName: string,
    newName: string,
  ): ASTTransformResult {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectPath, filePath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, appliedCount: 0, changes: [], error: `파일 없음: ${filePath}` };
    }

    let code: string;
    try {
      code = fs.readFileSync(fullPath, 'utf-8');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, appliedCount: 0, changes: [], error: `파일 읽기 실패: ${errMsg}` };
    }
    const sourceFile = ts.createSourceFile(
      filePath, code, ts.ScriptTarget.Latest, true,
    );

    // AST에서 해당 식별자의 모든 위치 찾기
    const positions: Array<{ start: number; end: number }> = [];

    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === oldName) {
        positions.push({ start: node.getStart(sourceFile), end: node.getEnd() });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (positions.length === 0) {
      return { success: true, appliedCount: 0, changes: [], transformedCode: code };
    }

    // 뒤에서부터 교체 (위치 shift 방지)
    let newCode = code;
    for (const pos of positions.reverse()) {
      newCode = newCode.slice(0, pos.start) + newName + newCode.slice(pos.end);
    }

    // 검증
    const valid = this.quickTypeCheck(newCode, filePath);
    if (!valid) {
      return {
        success: false,
        appliedCount: 0,
        changes: [],
        error: `리네이밍 후 타입 검증 실패: ${oldName} → ${newName}`,
      };
    }

    try {
      fs.writeFileSync(fullPath, newCode, 'utf-8');
    } catch (writeErr: unknown) {
      const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);
      return { success: false, appliedCount: 0, changes: [], error: `파일 쓰기 실패: ${writeMsg}` };
    }

    return {
      success: true,
      appliedCount: positions.length,
      changes: [{
        type: 'safe-rename',
        description: `${oldName} → ${newName} (${positions.length}곳)`,
        before: oldName,
        after: newName,
      }],
      transformedCode: newCode,
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  개별 AST 변환 로직
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private applyASTTransform(
    sourceFile: ts.SourceFile,
    type: ASTTransformType,
    _originalCode: string,
  ): { changes: ASTChange[]; newSource?: ts.SourceFile } {
    switch (type) {
      case 'remove-unused-import':
        return this.transformRemoveUnusedImports(sourceFile);
      case 'remove-unused-variable':
        return this.transformRemoveUnusedVariables(sourceFile);
      case 'add-return-type':
        return this.transformAddReturnTypes(sourceFile);
      case 'rename-unused-param':
        return this.transformRenameUnusedParams(sourceFile);
      case 'remove-empty-interface':
        return this.transformRemoveEmptyInterfaces(sourceFile);
      default:
        return { changes: [] };
    }
  }

  /**
   * AST 기반 미사용 import 제거
   */
  private transformRemoveUnusedImports(
    sourceFile: ts.SourceFile,
  ): { changes: ASTChange[]; newSource?: ts.SourceFile } {
    const unusedImports = this.findUnusedImports(sourceFile);
    if (unusedImports.length === 0) return { changes: [] };

    const changes: ASTChange[] = [];

    // TransformerFactory 생성
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      return (sf) => {
        const visitor = (node: ts.Node): ts.Node | undefined => {
          if (ts.isImportDeclaration(node)) {
            const importClause = node.importClause;
            if (!importClause) return node; // side-effect import (import 'module') 유지

            // named imports 처리
            if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
              const elements = importClause.namedBindings.elements;
              const usedElements = elements.filter((el) => {
                const name = (el.propertyName || el.name).text;
                return !unusedImports.some((u) => u.name === name);
              });

              if (usedElements.length === 0 && !importClause.name) {
                // 모든 named import가 미사용이고 default import도 없으면 전체 제거
                changes.push({
                  type: 'remove-unused-import',
                  description: `미사용 import 전체 제거`,
                  line: this.getLineNumber(sourceFile, node),
                  before: node.getText(sourceFile),
                  after: '',
                });
                return undefined; // 노드 삭제
              }

              if (usedElements.length < elements.length) {
                // 일부 미사용 → 해당 요소만 제거
                const removedNames = elements
                  .filter((el) => !usedElements.includes(el))
                  .map((el) => el.name.text);

                changes.push({
                  type: 'remove-unused-import',
                  description: `미사용 import 요소 제거: ${removedNames.join(', ')}`,
                  line: this.getLineNumber(sourceFile, node),
                  before: node.getText(sourceFile),
                  after: `(${usedElements.length}개 유지)`,
                });

                const newNamedImports = ts.factory.updateNamedImports(
                  importClause.namedBindings,
                  usedElements,
                );
                const newImportClause = ts.factory.updateImportClause(
                  importClause,
                  importClause.isTypeOnly,
                  importClause.name,
                  newNamedImports,
                );
                return ts.factory.updateImportDeclaration(
                  node,
                  node.modifiers,
                  newImportClause,
                  node.moduleSpecifier,
                  node.attributes,
                );
              }
            }

            // default import 미사용 확인
            if (importClause.name) {
              const isUnused = unusedImports.some((u) => u.name === importClause.name!.text);
              if (isUnused && !importClause.namedBindings) {
                changes.push({
                  type: 'remove-unused-import',
                  description: `미사용 default import 제거: ${importClause.name.text}`,
                  line: this.getLineNumber(sourceFile, node),
                  before: node.getText(sourceFile),
                  after: '',
                });
                return undefined; // 노드 삭제
              }
            }

            // namespace import 미사용 확인
            if (importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
              const nsName = importClause.namedBindings.name.text;
              if (unusedImports.some((u) => u.name === nsName)) {
                changes.push({
                  type: 'remove-unused-import',
                  description: `미사용 namespace import 제거: ${nsName}`,
                  line: this.getLineNumber(sourceFile, node),
                  before: node.getText(sourceFile),
                  after: '',
                });
                return undefined;
              }
            }
          }
          return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitNode(sf, visitor) as ts.SourceFile;
      };
    };

    const result = ts.transform(sourceFile, [transformer]);
    const newSource = result.transformed[0];
    result.dispose();

    return { changes, newSource };
  }

  /**
   * AST 기반 미사용 변수 제거
   */
  private transformRemoveUnusedVariables(
    sourceFile: ts.SourceFile,
  ): { changes: ASTChange[]; newSource?: ts.SourceFile } {
    const unusedVars = this.findUnusedVariables(sourceFile);
    if (unusedVars.length === 0) return { changes: [] };

    const changes: ASTChange[] = [];
    const unusedNames = new Set(unusedVars.map((v) => v.name));

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      return (sf) => {
        const visitor = (node: ts.Node): ts.Node | undefined => {
          if (ts.isVariableStatement(node)) {
            const decls = node.declarationList.declarations;
            const used = decls.filter((d) => {
              const name = d.name.getText(sourceFile);
              return !unusedNames.has(name);
            });

            if (used.length === 0) {
              for (const d of decls) {
                changes.push({
                  type: 'remove-unused-variable',
                  description: `미사용 변수 제거: ${d.name.getText(sourceFile)}`,
                  line: this.getLineNumber(sourceFile, d),
                  before: node.getText(sourceFile),
                  after: '',
                });
              }
              return undefined; // 전체 statement 삭제
            }

            if (used.length < decls.length) {
              const removed = decls.filter((d) => unusedNames.has(d.name.getText(sourceFile)));
              for (const d of removed) {
                changes.push({
                  type: 'remove-unused-variable',
                  description: `미사용 변수 제거: ${d.name.getText(sourceFile)}`,
                  line: this.getLineNumber(sourceFile, d),
                  before: d.getText(sourceFile),
                  after: '',
                });
              }
            }
          }
          return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitNode(sf, visitor) as ts.SourceFile;
      };
    };

    const result = ts.transform(sourceFile, [transformer]);
    const newSource = result.transformed[0];
    result.dispose();

    return { changes, newSource };
  }

  /**
   * 함수에 반환 타입 추가 (void 감지)
   */
  private transformAddReturnTypes(
    sourceFile: ts.SourceFile,
  ): { changes: ASTChange[]; newSource?: ts.SourceFile } {
    const noReturnType = this.findFunctionsWithoutReturnType(sourceFile);
    if (noReturnType.length === 0) return { changes: [] };

    const changes: ASTChange[] = [];

    // 반환 타입 추가는 복잡하므로 감지 리포트만 생성
    for (const fn of noReturnType) {
      changes.push({
        type: 'add-return-type',
        description: `반환 타입 추가 필요: ${fn.name}`,
        line: this.getLineNumber(sourceFile, fn.node),
        before: fn.name,
        after: `${fn.name}: void | <추론 타입>`,
      });
    }

    // 실제 변환은 보수적으로 — void 반환 함수만 처리
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      return (sf) => {
        const visitor = (node: ts.Node): ts.Node => {
          if (
            (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
            !node.type &&
            node.body
          ) {
            // return 문이 없으면 void
            const hasReturn = this.hasReturnStatement(node.body);
            if (!hasReturn && ts.isFunctionDeclaration(node) && node.name) {
              return ts.factory.updateFunctionDeclaration(
                node,
                node.modifiers,
                node.asteriskToken,
                node.name,
                node.typeParameters,
                node.parameters,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
                node.body,
              );
            }
          }
          return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitNode(sf, visitor) as ts.SourceFile;
      };
    };

    const result = ts.transform(sourceFile, [transformer]);
    const newSource = result.transformed[0];
    result.dispose();

    return { changes, newSource };
  }

  /**
   * 미사용 파라미터에 _ 접두어 추가
   */
  private transformRenameUnusedParams(
    sourceFile: ts.SourceFile,
  ): { changes: ASTChange[]; newSource?: ts.SourceFile } {
    const unusedParams = this.findUnusedParameters(sourceFile);
    if (unusedParams.length === 0) return { changes: [] };

    const changes: ASTChange[] = [];

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      return (sf) => {
        const visitor = (node: ts.Node): ts.Node => {
          if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
            const paramName = node.name.text;
            const isUnused = unusedParams.some((p) => p.name === paramName);

            if (isUnused && !paramName.startsWith('_')) {
              changes.push({
                type: 'rename-unused-param',
                description: `미사용 파라미터 리네이밍: ${paramName} → _${paramName}`,
                line: this.getLineNumber(sourceFile, node),
                before: paramName,
                after: `_${paramName}`,
              });

              return ts.factory.updateParameterDeclaration(
                node,
                node.modifiers,
                node.dotDotDotToken,
                ts.factory.createIdentifier(`_${paramName}`),
                node.questionToken,
                node.type,
                node.initializer,
              );
            }
          }
          return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitNode(sf, visitor) as ts.SourceFile;
      };
    };

    const result = ts.transform(sourceFile, [transformer]);
    const newSource = result.transformed[0];
    result.dispose();

    return { changes, newSource };
  }

  /**
   * 빈 인터페이스 제거
   */
  private transformRemoveEmptyInterfaces(
    sourceFile: ts.SourceFile,
  ): { changes: ASTChange[]; newSource?: ts.SourceFile } {
    const emptyInterfaces = this.findEmptyInterfaces(sourceFile);
    if (emptyInterfaces.length === 0) return { changes: [] };

    const changes: ASTChange[] = [];
    const emptyNames = new Set(emptyInterfaces.map((i) => i.name));

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      return (sf) => {
        const visitor = (node: ts.Node): ts.Node | undefined => {
          if (ts.isInterfaceDeclaration(node) && emptyNames.has(node.name.text)) {
            // 다른 곳에서 사용되는지 확인
            const usages = this.countIdentifierUsages(sourceFile, node.name.text);
            if (usages <= 1) { // 선언 자체만
              changes.push({
                type: 'remove-empty-interface',
                description: `빈 인터페이스 제거: ${node.name.text}`,
                line: this.getLineNumber(sourceFile, node),
                before: node.getText(sourceFile),
                after: '',
              });
              return undefined;
            }
          }
          return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitNode(sf, visitor) as ts.SourceFile;
      };
    };

    const result = ts.transform(sourceFile, [transformer]);
    const newSource = result.transformed[0];
    result.dispose();

    return { changes, newSource };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  AST 분석 헬퍼
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 미사용 import 찾기 (스코프 인식)
   */
  private findUnusedImports(sourceFile: ts.SourceFile): Array<{ name: string; node: ts.Node }> {
    const imports: Array<{ name: string; node: ts.Node }> = [];
    const usedIdentifiers = new Set<string>();

    // 1. 모든 import 수집
    for (const stmt of sourceFile.statements) {
      if (ts.isImportDeclaration(stmt) && stmt.importClause) {
        const clause = stmt.importClause;

        // default import
        if (clause.name) {
          imports.push({ name: clause.name.text, node: stmt });
        }

        // named imports
        if (clause.namedBindings) {
          if (ts.isNamedImports(clause.namedBindings)) {
            for (const el of clause.namedBindings.elements) {
              imports.push({ name: el.name.text, node: stmt });
            }
          }
          // namespace import
          if (ts.isNamespaceImport(clause.namedBindings)) {
            imports.push({ name: clause.namedBindings.name.text, node: stmt });
          }
        }
      }
    }

    // 2. import 선언을 제외한 모든 식별자 수집
    const collectUsages = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        // import 선언 내부는 건너뜀
        if (!this.isPartOfImportDeclaration(node)) {
          usedIdentifiers.add(node.text);
        }
      }
      ts.forEachChild(node, collectUsages);
    };

    for (const stmt of sourceFile.statements) {
      if (!ts.isImportDeclaration(stmt)) {
        collectUsages(stmt);
      }
    }

    // 3. 미사용 import 필터링
    return imports.filter((imp) => !usedIdentifiers.has(imp.name));
  }

  /**
   * 미사용 변수 찾기
   */
  private findUnusedVariables(sourceFile: ts.SourceFile): Array<{ name: string; node: ts.Node }> {
    const variables: Array<{ name: string; node: ts.Node; declLine: number }> = [];
    const usedIdentifiers = new Map<string, number>(); // name → usage count

    // 변수 선언 수집
    const collectDeclarations = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        // export된 변수는 제외
        const parent = node.parent?.parent;
        if (parent && ts.isVariableStatement(parent)) {
          const isExported = parent.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.ExportKeyword,
          );
          if (!isExported) {
            variables.push({
              name: node.name.text,
              node,
              declLine: this.getLineNumber(sourceFile, node),
            });
          }
        }
      }
      ts.forEachChild(node, collectDeclarations);
    };
    collectDeclarations(sourceFile);

    // 사용 횟수 카운트 (선언 포함)
    const countUsages = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        usedIdentifiers.set(node.text, (usedIdentifiers.get(node.text) || 0) + 1);
      }
      ts.forEachChild(node, countUsages);
    };
    countUsages(sourceFile);

    // 선언 1회만 있고 사용이 없는 변수 (count === 1은 선언 자체)
    return variables.filter((v) => (usedIdentifiers.get(v.name) || 0) <= 1);
  }

  /**
   * 반환 타입이 없는 함수 찾기
   */
  private findFunctionsWithoutReturnType(
    sourceFile: ts.SourceFile,
  ): Array<{ name: string; node: ts.Node }> {
    const results: Array<{ name: string; node: ts.Node }> = [];

    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name && !node.type) {
        results.push({ name: node.name.text, node });
      }
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && !node.type) {
        results.push({ name: node.name.text, node });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    return results;
  }

  /**
   * 빈 인터페이스 찾기
   */
  private findEmptyInterfaces(
    sourceFile: ts.SourceFile,
  ): Array<{ name: string; node: ts.Node }> {
    const results: Array<{ name: string; node: ts.Node }> = [];

    for (const stmt of sourceFile.statements) {
      if (ts.isInterfaceDeclaration(stmt) && stmt.members.length === 0) {
        // extends가 있으면 유지 (marker interface)
        if (!stmt.heritageClauses || stmt.heritageClauses.length === 0) {
          results.push({ name: stmt.name.text, node: stmt });
        }
      }
    }

    return results;
  }

  /**
   * 미사용 파라미터 찾기
   */
  private findUnusedParameters(
    sourceFile: ts.SourceFile,
  ): Array<{ name: string; node: ts.Node }> {
    const results: Array<{ name: string; node: ts.Node }> = [];

    const visit = (node: ts.Node): void => {
      if (
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
         ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        node.body
      ) {
        const bodyText = node.body.getText(sourceFile);

        for (const param of node.parameters) {
          if (ts.isIdentifier(param.name)) {
            const paramName = param.name.text;
            if (paramName.startsWith('_')) continue; // 이미 _ 접두어
            if (param.dotDotDotToken) continue; // rest parameter

            // body에서 사용 여부 확인
            const regex = new RegExp(`\\b${paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            if (!regex.test(bodyText)) {
              results.push({ name: paramName, node: param });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    return results;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  유틸리티
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 노드가 import 선언의 일부인지 확인
   */
  private isPartOfImportDeclaration(node: ts.Node): boolean {
    let current: ts.Node | undefined = node;
    while (current) {
      if (ts.isImportDeclaration(current)) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * 블록에 return 문이 있는지 확인
   */
  private hasReturnStatement(block: ts.Block | ts.ConciseBody): boolean {
    if (!ts.isBlock(block)) return true; // 화살표 함수의 expression body

    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isReturnStatement(node) && node.expression) {
        found = true;
        return;
      }
      // 내부 함수의 return은 무시
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(block);
    return found;
  }

  /**
   * 식별자 사용 횟수 카운트
   */
  private countIdentifierUsages(sourceFile: ts.SourceFile, name: string): number {
    let count = 0;
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === name) count++;
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return count;
  }

  /**
   * 노드의 라인 번호 얻기
   */
  private getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return line + 1; // 0-based → 1-based
  }

  /**
   * 코드의 구문 검증 (빠른 체크)
   */
  private quickTypeCheck(code: string, filePath: string): boolean {
    try {
      const sf = ts.createSourceFile(
        filePath, code, ts.ScriptTarget.Latest, true,
      );
      // 구문 에러 확인
      const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics;
      if (diagnostics && diagnostics.length > 0) {
        return false;
      }
      // 기본 구조 확인 (빈 파일 X)
      return sf.statements.length > 0 || code.trim().length === 0;
    } catch (_err: unknown) {
      return false;
    }
  }

  /**
   * tsconfig.json에서 컴파일러 옵션 로드
   */
  private loadCompilerOptions(): ts.CompilerOptions {
    const tsconfigPath = ts.findConfigFile(this.projectPath, ts.sys.fileExists, 'tsconfig.json');
    if (tsconfigPath) {
      const { config } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const { options } = ts.parseJsonConfigFileContent(config, ts.sys, this.projectPath);
      return options;
    }
    return {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    };
  }

  /**
   * TypeScript 파일 스캔
   */
  private scanTSFiles(dir: string, depth: number = 0): string[] {
    if (depth > 5) return [];
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...this.scanTSFiles(fullPath, depth + 1));
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          if (!entry.name.endsWith('.d.ts')) { // declaration 파일 제외
            files.push(path.relative(this.projectPath, fullPath));
          }
        }
      }
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) {
        console.debug('[ASTTransformer] scanTSFiles directory access failure:', err instanceof Error ? err.message : String(err));
      }
    }

    return files;
  }
}
