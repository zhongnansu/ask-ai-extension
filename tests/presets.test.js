import {
  PRESETS,
  COMMON_PRESETS,
  CODE_SUBTYPE_PRESETS,
  FOREIGN_SUBTYPE_PRESETS,
  getAllPresetsForType,
  getSuggestedPresetsForType,
} from '../presets.js';

describe('PRESETS structure', () => {
  const expectedTypes = ['code', 'foreign', 'error', 'email', 'data', 'math', 'long', 'default'];

  it('has all eight content types', () => {
    for (const type of expectedTypes) {
      expect(PRESETS[type]).toBeDefined();
    }
  });

  it('each type has a suggested array with at least one preset', () => {
    for (const type of expectedTypes) {
      expect(Array.isArray(PRESETS[type].suggested)).toBe(true);
      expect(PRESETS[type].suggested.length).toBeGreaterThan(0);
    }
  });

  it('each type has an all array', () => {
    for (const type of expectedTypes) {
      expect(Array.isArray(PRESETS[type].all)).toBe(true);
    }
  });

  it('every preset has label and instruction strings', () => {
    for (const type of expectedTypes) {
      for (const preset of [...PRESETS[type].suggested, ...PRESETS[type].all]) {
        expect(typeof preset.label).toBe('string');
        expect(preset.label.length).toBeGreaterThan(0);
        expect(typeof preset.instruction).toBe('string');
        expect(preset.instruction.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('COMMON_PRESETS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(COMMON_PRESETS)).toBe(true);
    expect(COMMON_PRESETS.length).toBeGreaterThan(0);
  });

  it('every entry has label and instruction strings', () => {
    for (const preset of COMMON_PRESETS) {
      expect(typeof preset.label).toBe('string');
      expect(preset.label.length).toBeGreaterThan(0);
      expect(typeof preset.instruction).toBe('string');
      expect(preset.instruction.length).toBeGreaterThan(0);
    }
  });
});

describe('CODE_SUBTYPE_PRESETS', () => {
  const languages = ['javascript', 'python', 'rust', 'go', 'sql', 'java', 'c/c++', 'ruby', 'php'];

  it('has presets for all supported programming languages', () => {
    for (const lang of languages) {
      expect(CODE_SUBTYPE_PRESETS[lang]).toBeDefined();
      expect(CODE_SUBTYPE_PRESETS[lang].suggested.length).toBeGreaterThan(0);
    }
  });

  it('every sub-type preset has label and instruction strings', () => {
    for (const lang of languages) {
      const presets = [
        ...CODE_SUBTYPE_PRESETS[lang].suggested,
        ...(CODE_SUBTYPE_PRESETS[lang].all || []),
      ];
      for (const preset of presets) {
        expect(typeof preset.label).toBe('string');
        expect(typeof preset.instruction).toBe('string');
      }
    }
  });

  it('JavaScript presets reference JavaScript in instructions', () => {
    const jsPresets = CODE_SUBTYPE_PRESETS.javascript.suggested;
    expect(jsPresets.some(p => p.instruction.includes('JavaScript'))).toBe(true);
  });

  it('Python presets reference Python in instructions', () => {
    const pyPresets = CODE_SUBTYPE_PRESETS.python.suggested;
    expect(pyPresets.some(p => p.instruction.includes('Python'))).toBe(true);
  });
});

describe('FOREIGN_SUBTYPE_PRESETS', () => {
  const languages = ['japanese', 'chinese', 'korean', 'arabic', 'russian', 'hindi', 'thai'];

  it('has presets for all supported natural languages', () => {
    for (const lang of languages) {
      expect(FOREIGN_SUBTYPE_PRESETS[lang]).toBeDefined();
      expect(FOREIGN_SUBTYPE_PRESETS[lang].suggested.length).toBeGreaterThan(0);
    }
  });

  it('each language has a translate preset mentioning the language name', () => {
    for (const lang of languages) {
      const suggested = FOREIGN_SUBTYPE_PRESETS[lang].suggested;
      const capitalize = lang.charAt(0).toUpperCase() + lang.slice(1);
      const hasTranslate = suggested.some(p => p.instruction.includes(capitalize));
      expect(hasTranslate).toBe(true);
    }
  });
});

describe('getSuggestedPresetsForType', () => {
  it('returns generic code presets when subType is null', () => {
    const result = getSuggestedPresetsForType('code', null);
    expect(result).toEqual(PRESETS.code.suggested);
  });

  it('returns JavaScript-specific presets for code/javascript', () => {
    const result = getSuggestedPresetsForType('code', 'javascript');
    expect(result).toEqual(CODE_SUBTYPE_PRESETS.javascript.suggested);
  });

  it('returns Python-specific presets for code/python', () => {
    const result = getSuggestedPresetsForType('code', 'python');
    expect(result).toEqual(CODE_SUBTYPE_PRESETS.python.suggested);
  });

  it('returns Japanese-specific presets for foreign/japanese', () => {
    const result = getSuggestedPresetsForType('foreign', 'japanese');
    expect(result).toEqual(FOREIGN_SUBTYPE_PRESETS.japanese.suggested);
  });

  it('returns generic foreign presets for unknown foreign subType', () => {
    const result = getSuggestedPresetsForType('foreign', 'swahili');
    expect(result).toEqual(PRESETS.foreign.suggested);
  });

  it('returns generic presets for non-code/foreign types regardless of subType', () => {
    const result = getSuggestedPresetsForType('error', 'something');
    expect(result).toEqual(PRESETS.error.suggested);
  });
});

describe('getAllPresetsForType', () => {
  it('returns type-specific all presets plus deduplicated common presets for code', () => {
    const result = getAllPresetsForType('code');
    const labels = result.map(p => p.label);
    expect(labels).toContain('Add types');
    expect(labels).toContain('Write tests');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
    expect(labels).not.toContain('Explain code');
    expect(labels).not.toContain('Debug this');
    expect(labels).not.toContain('Optimize');
  });

  it('returns JavaScript-specific all presets when subType is javascript', () => {
    const result = getAllPresetsForType('code', 'javascript');
    const labels = result.map(p => p.label);
    // JavaScript sub-type all presets
    expect(labels).toContain('Optimize');
    // Should NOT contain generic code "all" labels that JS overrides
    // Common presets still present if not in suggested
    expect(labels).toContain('Rewrite');
  });

  it('deduplicates common presets against suggested for foreign type', () => {
    const result = getAllPresetsForType('foreign');
    const labels = result.map(p => p.label);
    expect(labels).not.toContain('Translate');
    expect(labels).toContain('Summarize');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
    expect(labels).toContain('Key points');
  });

  it('deduplicates common presets against suggested for long type', () => {
    const result = getAllPresetsForType('long');
    const labels = result.map(p => p.label);
    expect(labels).not.toContain('Summarize');
    expect(labels).not.toContain('Key points');
    expect(labels).toContain('Explain');
    expect(labels).toContain('Translate');
    expect(labels).toContain('Rewrite');
    expect(labels).toContain('Expand');
  });

  it('deduplicates common presets against suggested for default type', () => {
    const result = getAllPresetsForType('default');
    const labels = result.map(p => p.label);
    expect(labels).not.toContain('Summarize');
    expect(labels).toContain('Explain');
    expect(labels).toContain('Translate');
    expect(labels).toContain('Rewrite');
  });

  it('returns presets for new error type', () => {
    const result = getAllPresetsForType('error');
    const labels = result.map(p => p.label);
    expect(labels).toContain('Simplify message');
    expect(labels).toContain('Rewrite');
  });

  it('returns presets for new email type', () => {
    const result = getAllPresetsForType('email');
    const labels = result.map(p => p.label);
    expect(labels).toContain('Extract action items');
  });

  it('returns presets for new data type', () => {
    const result = getAllPresetsForType('data');
    const labels = result.map(p => p.label);
    expect(labels).toContain('Find patterns');
  });

  it('returns presets for new math type', () => {
    const result = getAllPresetsForType('math');
    const labels = result.map(p => p.label);
    expect(labels).toContain('Step by step');
  });

  it('has no duplicate labels in the returned array', () => {
    const types = ['code', 'foreign', 'error', 'email', 'data', 'math', 'long', 'default'];
    for (const type of types) {
      const result = getAllPresetsForType(type);
      const labels = result.map(p => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('throws when given an invalid content type', () => {
    expect(() => getAllPresetsForType('invalid')).toThrow();
  });
});
