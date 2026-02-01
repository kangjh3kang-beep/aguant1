import {
  reviewBodySchema,
  orchestrateBodySchema,
  historyQuerySchema,
  pathQuerySchema,
  validateBody,
} from './validators';

describe('validators', () => {
  describe('reviewBodySchema', () => {
    it('accepts valid body with defaults', () => {
      const result = validateBody(reviewBodySchema, {});
      expect(result).toEqual({
        data: { stages: ['compile', 'lint', 'test'], autoFix: false },
      });
    });

    it('accepts explicit values', () => {
      const result = validateBody(reviewBodySchema, {
        path: '/home/user/project',
        stages: ['lint'],
        autoFix: true,
      });
      expect(result).toEqual({
        data: { path: '/home/user/project', stages: ['lint'], autoFix: true },
      });
    });

    it('rejects invalid stage name', () => {
      const result = validateBody(reviewBodySchema, { stages: ['invalid'] });
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Validation failed');
    });

    it('rejects path with ..', () => {
      const result = validateBody(reviewBodySchema, { path: '/home/../etc/passwd' });
      expect(result).toHaveProperty('error');
    });

    it('rejects unknown fields', () => {
      const result = validateBody(reviewBodySchema, { malicious: true });
      expect(result).toHaveProperty('error');
    });
  });

  describe('orchestrateBodySchema', () => {
    it('accepts valid body with defaults', () => {
      const result = validateBody(orchestrateBodySchema, {});
      expect(result).toEqual({
        data: {
          phases: ['plan', 'code', 'review', 'test', 'security', 'browser', 'deploy'],
          failFast: false,
        },
      });
    });

    it('accepts subset of phases', () => {
      const result = validateBody(orchestrateBodySchema, { phases: ['review', 'test'] });
      expect('data' in result && result.data.phases).toEqual(['review', 'test']);
    });

    it('rejects invalid phase', () => {
      const result = validateBody(orchestrateBodySchema, { phases: ['hack'] });
      expect(result).toHaveProperty('error');
    });
  });

  describe('historyQuerySchema', () => {
    it('applies default count', () => {
      const result = validateBody(historyQuerySchema, {});
      expect('data' in result && result.data.count).toBe(20);
    });

    it('coerces string count to number', () => {
      const result = validateBody(historyQuerySchema, { count: '10' });
      expect('data' in result && result.data.count).toBe(10);
    });

    it('rejects count > 100', () => {
      const result = validateBody(historyQuerySchema, { count: '200' });
      expect(result).toHaveProperty('error');
    });
  });

  describe('pathQuerySchema', () => {
    it('accepts empty query (optional path)', () => {
      const result = validateBody(pathQuerySchema, {});
      expect(result).toEqual({ data: {} });
    });

    it('accepts valid path', () => {
      const result = validateBody(pathQuerySchema, { path: '/home/user/project' });
      expect(result).toEqual({ data: { path: '/home/user/project' } });
    });
  });
});
