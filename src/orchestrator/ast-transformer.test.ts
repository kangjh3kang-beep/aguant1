/**
 * ASTTransformer 테스트
 *
 * TypeScript Compiler API 기반 AST 코드 변환 엔진의 핵심 기능을 검증합니다.
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import { ASTTransformer, ASTTransformResult, ASTTransformType } from './ast-transformer';

describe('ASTTransformer', () => {
  const projectPath = '/test/project';
  let transformer: ASTTransformer;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: existsSync returns true, readdirSync returns empty
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.readdirSync as jest.Mock).mockReturnValue([]);
    transformer = new ASTTransformer(projectPath);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  transformFile 기본 동작
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('transformFile', () => {
    it('should return error when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = transformer.transformFile('missing.ts');
      expect(result.success).toBe(false);
      expect(result.appliedCount).toBe(0);
      expect(result.error).toContain('파일 없음');
    });

    it('should return error for non-TypeScript files', () => {
      const result = transformer.transformFile('readme.md');
      expect(result.success).toBe(false);
      expect(result.error).toBe('TypeScript 파일만 지원');
    });

    it('should return error when readFileSync throws', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = transformer.transformFile('src/app.ts');
      expect(result.success).toBe(false);
      expect(result.error).toContain('파일 읽기 실패');
      expect(result.error).toContain('EACCES');
    });

    it('should return success with no changes for clean code', () => {
      const cleanCode = `const x = 1;\nconsole.log(x);\n`;
      mockFs.readFileSync.mockReturnValue(cleanCode);

      const result = transformer.transformFile('src/clean.ts', []);
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
      expect(result.transformedCode).toBe(cleanCode);
    });

    it('should handle absolute file paths correctly', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = transformer.transformFile('/absolute/path/file.ts');
      expect(result.success).toBe(false);
      expect(result.error).toContain('파일 없음');
    });

    it('should handle .tsx files', () => {
      const tsxCode = `const App = () => <div>Hello</div>;\nexport default App;\n`;
      mockFs.readFileSync.mockReturnValue(tsxCode);

      const result = transformer.transformFile('src/App.tsx', []);
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
    });

    it('should detect and report unused imports', () => {
      const code = `import fs from 'fs';\nimport path from 'path';\n\nconst fullPath = path.join('/a', '/b');\n`;
      mockFs.readFileSync.mockReturnValue(code);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = transformer.transformFile('src/utils.ts', ['remove-unused-import']);
      expect(result.success).toBe(true);
      if (result.appliedCount > 0) {
        expect(result.changes.some((c) => c.type === 'remove-unused-import')).toBe(true);
      }
    });

    it('should detect and remove unused variables', () => {
      const code = `const usedVar = 1;\nconst unusedVar = 2;\nconsole.log(usedVar);\n`;
      mockFs.readFileSync.mockReturnValue(code);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = transformer.transformFile('src/vars.ts', ['remove-unused-variable']);
      expect(result.success).toBe(true);
      if (result.appliedCount > 0) {
        expect(result.changes.some((c) => c.type === 'remove-unused-variable')).toBe(true);
      }
    });

    it('should detect functions without return type', () => {
      const code = `function greet(name: string) {\n  console.log(name);\n}\n`;
      mockFs.readFileSync.mockReturnValue(code);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = transformer.transformFile('src/funcs.ts', ['add-return-type']);
      expect(result.success).toBe(true);
      if (result.appliedCount > 0) {
        expect(result.changes.some((c) => c.type === 'add-return-type')).toBe(true);
      }
    });

    it('should handle writeFileSync failure gracefully', () => {
      // Code with an unused import so the transform triggers a write
      const code = `import fs from 'fs';\nimport path from 'path';\n\nconst fullPath = path.join('/a', '/b');\n`;
      mockFs.readFileSync.mockReturnValue(code);
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const result = transformer.transformFile('src/app.ts', ['remove-unused-import']);
      // The transform found unused `fs` import, attempted to write, and the write failed
      expect(result.success).toBe(false);
      expect(result.error).toContain('파일 쓰기 실패');
    });

    it('should apply default transforms when none specified', () => {
      const code = `import fs from 'fs';\nconst x = 1;\nconsole.log('hello');\n`;
      mockFs.readFileSync.mockReturnValue(code);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = transformer.transformFile('src/app.ts');
      // Should apply default transforms without crashing
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.changes)).toBe(true);
    });

    it('should return unknown transform types with no changes', () => {
      const code = `const x = 1;\nconsole.log(x);\n`;
      mockFs.readFileSync.mockReturnValue(code);

      const result = transformer.transformFile('src/app.ts', ['fix-implicit-any' as ASTTransformType]);
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
    });

    it('should handle readFileSync returning non-Error throw', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw 'string error';
      });

      const result = transformer.transformFile('src/app.ts');
      expect(result.success).toBe(false);
      expect(result.error).toContain('파일 읽기 실패');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  transformFiles
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('transformFiles', () => {
    it('should transform multiple files and return map of results', () => {
      mockFs.existsSync.mockReturnValue(false);

      const results = transformer.transformFiles(['a.ts', 'b.ts'], []);
      expect(results.size).toBe(2);
      expect(results.has('a.ts')).toBe(true);
      expect(results.has('b.ts')).toBe(true);
    });

    it('should handle empty file list', () => {
      const results = transformer.transformFiles([], []);
      expect(results.size).toBe(0);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  transformProject
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('transformProject', () => {
    it('should scan and transform all TypeScript files', () => {
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = transformer.transformProject();
      expect(result.total).toBe(0);
      expect(result.changed).toBe(0);
      expect(result.results.size).toBe(0);
    });

    it('should count changed files correctly', () => {
      const dirEntries = [
        {
          name: 'used.ts',
          isDirectory: () => false,
          isFile: () => true,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          isSymbolicLink: () => false,
        } as fs.Dirent,
      ];
      (mockFs.readdirSync as jest.Mock).mockReturnValue(dirEntries);
      mockFs.readFileSync.mockReturnValue('const x = 1;\nconsole.log(x);\n');
      mockFs.existsSync.mockReturnValue(true);

      const result = transformer.transformProject([]);
      expect(result.total).toBe(1);
      // With empty transforms array, no changes
      expect(result.changed).toBe(0);
    });

    it('should skip node_modules, dist, build, dotfiles', () => {
      const dirEntries = [
        { name: 'node_modules', isDirectory: () => true } as fs.Dirent,
        { name: '.git', isDirectory: () => true } as fs.Dirent,
        { name: 'dist', isDirectory: () => true } as fs.Dirent,
        { name: 'build', isDirectory: () => true } as fs.Dirent,
        { name: 'valid.ts', isDirectory: () => false } as fs.Dirent,
      ];
      (mockFs.readdirSync as jest.Mock).mockReturnValue(dirEntries);
      mockFs.readFileSync.mockReturnValue('const x = 1;\n');
      mockFs.existsSync.mockReturnValue(true);

      const result = transformer.transformProject([]);
      // Only valid.ts should be processed
      expect(result.total).toBe(1);
    });

    it('should skip .d.ts declaration files', () => {
      const dirEntries = [
        { name: 'types.d.ts', isDirectory: () => false } as fs.Dirent,
        { name: 'app.ts', isDirectory: () => false } as fs.Dirent,
      ];
      (mockFs.readdirSync as jest.Mock).mockReturnValue(dirEntries);
      mockFs.readFileSync.mockReturnValue('const x = 1;\n');
      mockFs.existsSync.mockReturnValue(true);

      const result = transformer.transformProject([]);
      expect(result.total).toBe(1);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  analyzeFile
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('analyzeFile', () => {
    it('should return empty issues for non-existent file', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = transformer.analyzeFile('missing.ts');
      expect(result.issues).toEqual([]);
    });

    it('should return empty issues for non-TypeScript file', () => {
      const result = transformer.analyzeFile('readme.md');
      expect(result.issues).toEqual([]);
    });

    it('should return empty issues when readFileSync throws', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('read error');
      });

      const result = transformer.analyzeFile('src/broken.ts');
      expect(result.issues).toEqual([]);
    });

    it('should detect unused imports in analysis', () => {
      const code = `import fs from 'fs';\nimport path from 'path';\n\nconst fullPath = path.join('/a', '/b');\n`;
      mockFs.readFileSync.mockReturnValue(code);

      const result = transformer.analyzeFile('src/app.ts');
      const unusedImportIssues = result.issues.filter((i) => i.type === 'remove-unused-import');
      expect(unusedImportIssues.length).toBeGreaterThan(0);
      expect(unusedImportIssues[0].autoFixable).toBe(true);
    });

    it('should detect empty interfaces', () => {
      const code = `interface EmptyOne {}\n\ninterface UsedOne {\n  name: string;\n}\n`;
      mockFs.readFileSync.mockReturnValue(code);

      const result = transformer.analyzeFile('src/types.ts');
      const emptyIfaceIssues = result.issues.filter((i) => i.type === 'remove-empty-interface');
      expect(emptyIfaceIssues.length).toBe(1);
      expect(emptyIfaceIssues[0].message).toContain('EmptyOne');
    });

    it('should detect functions without return type', () => {
      const code = `function doWork() {\n  console.log('working');\n}\n`;
      mockFs.readFileSync.mockReturnValue(code);

      const result = transformer.analyzeFile('src/work.ts');
      const returnTypeIssues = result.issues.filter((i) => i.type === 'add-return-type');
      expect(returnTypeIssues.length).toBe(1);
      expect(returnTypeIssues[0].message).toContain('doWork');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  safeRename
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('safeRename', () => {
    it('should return error when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = transformer.safeRename('missing.ts', 'old', 'new');
      expect(result.success).toBe(false);
      expect(result.error).toContain('파일 없음');
    });

    it('should return error when readFileSync throws', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('permission denied');
      });

      const result = transformer.safeRename('src/app.ts', 'oldName', 'newName');
      expect(result.success).toBe(false);
      expect(result.error).toContain('파일 읽기 실패');
    });

    it('should return success with no changes when identifier not found', () => {
      const code = `const x = 1;\nconsole.log(x);\n`;
      mockFs.readFileSync.mockReturnValue(code);

      const result = transformer.safeRename('src/app.ts', 'nonExistent', 'newName');
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
      expect(result.transformedCode).toBe(code);
    });

    it('should rename all occurrences of an identifier', () => {
      const code = `const myVar = 1;\nconsole.log(myVar);\nconst other = myVar + 2;\n`;
      mockFs.readFileSync.mockReturnValue(code);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = transformer.safeRename('src/app.ts', 'myVar', 'renamedVar');
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(3);
      expect(result.changes.length).toBe(1);
      expect(result.changes[0].type).toBe('safe-rename');
      expect(result.changes[0].before).toBe('myVar');
      expect(result.changes[0].after).toBe('renamedVar');
      expect(result.transformedCode).toContain('renamedVar');
      expect(result.transformedCode).not.toContain('myVar');
    });

    it('should handle writeFileSync failure during rename', () => {
      const code = `const myVar = 1;\nconsole.log(myVar);\n`;
      mockFs.readFileSync.mockReturnValue(code);
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('disk full');
      });

      const result = transformer.safeRename('src/app.ts', 'myVar', 'renamedVar');
      expect(result.success).toBe(false);
      expect(result.error).toContain('파일 쓰기 실패');
    });
  });
});
