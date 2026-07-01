'use strict';

const {
  resolveReasoningEffort,
  VALID_REASONING_EFFORTS,
  stripProviderPrefix,
} = require('../services/zenClient');
const { config } = require('../config/constants');

describe('Reasoning Effort', () => {
  describe('VALID_REASONING_EFFORTS', () => {
    it('should list the gateway-accepted efforts', () => {
      expect(VALID_REASONING_EFFORTS).toEqual(
        expect.arrayContaining(['low', 'medium', 'high', 'max', 'xhigh'])
      );
    });

    it('should not include the rejected values none/minimal', () => {
      expect(VALID_REASONING_EFFORTS).not.toContain('none');
      expect(VALID_REASONING_EFFORTS).not.toContain('minimal');
    });
  });

  describe('resolveReasoningEffort()', () => {
    it('should return a valid client value unchanged (lowercased)', () => {
      expect(resolveReasoningEffort('low')).toBe('low');
      expect(resolveReasoningEffort('HIGH')).toBe('high');
      expect(resolveReasoningEffort('Xhigh')).toBe('xhigh');
    });

    it('should fall back to the configured default when value is invalid', () => {
      expect(resolveReasoningEffort('bogus')).toBe(config.defaultReasoningEffort);
      expect(resolveReasoningEffort('none')).toBe(config.defaultReasoningEffort);
    });

    it('should fall back to the default when value is missing', () => {
      expect(resolveReasoningEffort(undefined)).toBe(config.defaultReasoningEffort);
      expect(resolveReasoningEffort(null)).toBe(config.defaultReasoningEffort);
    });

    it('should default to xhigh (maximum) by configuration', () => {
      expect(config.defaultReasoningEffort).toBe('xhigh');
    });
  });
});

describe('stripProviderPrefix()', () => {
  it('should remove the opencode/ prefix', () => {
    expect(stripProviderPrefix('opencode/deepseek-v4-flash-free')).toBe(
      'deepseek-v4-flash-free'
    );
  });

  it('should leave bare ids unchanged', () => {
    expect(stripProviderPrefix('deepseek-v4-flash-free')).toBe('deepseek-v4-flash-free');
  });

  it('should handle non-string input', () => {
    expect(stripProviderPrefix(undefined)).toBeUndefined();
  });
});
