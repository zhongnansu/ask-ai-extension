import { detectContentType } from '../detection.js';

describe('detectContentType', () => {
  describe('code detection', () => {
    it('detects JavaScript code with braces and semicolons', () => {
      const text = `function hello() {
  const x = 1;
  return x;
}`;
      expect(detectContentType(text, null)).toBe('code');
    });

    it('detects JavaScript code with braces and multiple keywords', () => {
      const text = `if (x > 0) {
  const result = transform(x)
  return result
}`;
      expect(detectContentType(text, null)).toBe('code');
    });

    it('detects Python code with indentation, semicolons, and keywords', () => {
      const text = `  def process(data):
    import json;
    return json.loads(data)`;
      expect(detectContentType(text, null)).toBe('code');
    });

    it('detects code with class definition and braces', () => {
      const text = `class MyComponent {
  constructor() {
    this.state = {};
  }
}`;
      expect(detectContentType(text, null)).toBe('code');
    });

    it('detects code when anchorNode is inside <pre> tag', () => {
      const anchorNode = {
        nodeName: 'SPAN',
        parentElement: {
          nodeName: 'PRE',
          parentElement: null
        }
      };
      expect(detectContentType('any text here', anchorNode)).toBe('code');
    });

    it('detects code when anchorNode is inside <code> tag', () => {
      const anchorNode = {
        nodeName: 'CODE',
        parentElement: null
      };
      expect(detectContentType('plain text', anchorNode)).toBe('code');
    });

    it('detects code when anchorNode is nested inside <code> within other elements', () => {
      const anchorNode = {
        nodeName: '#text',
        parentElement: {
          nodeName: 'SPAN',
          parentElement: {
            nodeName: 'CODE',
            parentElement: null
          }
        }
      };
      expect(detectContentType('hello world', anchorNode)).toBe('code');
    });

    it('detects braceless JavaScript code with semicolons and keywords', () => {
      const text = 'const x = [1,4]; console.log(x);';
      expect(detectContentType(text, null)).toBe('code');
    });

    it('detects braceless multi-statement code', () => {
      const text = 'let a = 10; let b = 20; return a + b;';
      expect(detectContentType(text, null)).toBe('code');
    });

    it('detects braceless code with var and import keywords', () => {
      const text = 'import fs from "fs"; var data = fs.readFileSync("file.txt");';
      expect(detectContentType(text, null)).toBe('code');
    });

    it('does NOT falsely detect prose that mentions programming terms', () => {
      const text = 'The function of this committee is to review import regulations and export policies.';
      expect(detectContentType(text, null)).not.toBe('code');
    });

    it('does NOT detect text with a single code keyword as code', () => {
      const text = 'We should let the team know about the function schedule.';
      expect(detectContentType(text, null)).not.toBe('code');
    });
  });

  describe('foreign language detection', () => {
    it('detects Chinese text as foreign', () => {
      const text = '这是一段中文文本，用于测试外语检测功能。';
      expect(detectContentType(text, null)).toBe('foreign');
    });

    it('detects Japanese text as foreign', () => {
      const text = 'これは日本語のテストテキストです。外国語の検出をテストします。';
      expect(detectContentType(text, null)).toBe('foreign');
    });

    it('detects Arabic text as foreign', () => {
      const text = 'هذا نص عربي لاختبار كشف اللغة الأجنبية في النظام';
      expect(detectContentType(text, null)).toBe('foreign');
    });

    it('detects Korean text as foreign', () => {
      const text = '이것은 한국어 테스트 텍스트입니다. 외국어 감지를 테스트합니다.';
      expect(detectContentType(text, null)).toBe('foreign');
    });

    it('does NOT detect accented Latin text (French) as foreign', () => {
      const text = "L'apprentissage automatique est une branche de l'intelligence artificielle qui permet aux systemes d'apprendre.";
      expect(detectContentType(text, null)).not.toBe('foreign');
    });

    it('does NOT detect emoji-heavy text as foreign', () => {
      const text = 'Hello world! This is a great day! Feeling happy and excited about the new project launch!';
      expect(detectContentType(text, null)).not.toBe('foreign');
    });

    it('does NOT detect mixed English with a few non-Latin characters as foreign', () => {
      const text = 'The word for hello in Japanese is konnichiwa (こんにちは), which is a common greeting used during the day.';
      expect(detectContentType(text, null)).not.toBe('foreign');
    });
  });

  describe('long text detection', () => {
    it('detects text with more than 200 words as long', () => {
      const words = Array(201).fill('word').join(' ');
      expect(detectContentType(words, null)).toBe('long');
    });

    it('does NOT detect text with exactly 200 words as long', () => {
      const words = Array(200).fill('word').join(' ');
      expect(detectContentType(words, null)).not.toBe('long');
    });

    it('detects a realistic long paragraph as long', () => {
      const sentences = Array(30).fill('This is a sentence with several words in it to test length detection.').join(' ');
      expect(detectContentType(sentences, null)).toBe('long');
    });
  });

  describe('default detection', () => {
    it('returns default for short English text', () => {
      const text = 'This is a simple sentence.';
      expect(detectContentType(text, null)).toBe('default');
    });

    it('returns default for a moderate English paragraph', () => {
      const text = 'The quick brown fox jumps over the lazy dog. This is a well-known English pangram that contains every letter of the alphabet.';
      expect(detectContentType(text, null)).toBe('default');
    });

    it('returns default for empty text', () => {
      expect(detectContentType('', null)).toBe('default');
    });

    it('returns default for a single word', () => {
      expect(detectContentType('hello', null)).toBe('default');
    });
  });

  describe('priority ordering', () => {
    it('prioritizes code detection over foreign for code with non-Latin comments', () => {
      const text = `function greet() {
  // 你好世界
  console.log("hello");
}`;
      expect(detectContentType(text, null)).toBe('code');
    });

    it('prioritizes anchorNode code detection over everything', () => {
      const anchorNode = {
        nodeName: 'CODE',
        parentElement: null
      };
      expect(detectContentType('这是中文文本', anchorNode)).toBe('code');
    });
  });
});
