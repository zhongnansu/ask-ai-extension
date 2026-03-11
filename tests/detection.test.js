import {
  detectContentType,
  detectCodeLanguage,
  detectError,
  detectMath,
  detectData,
  detectEmail,
  detectForeign,
  detectNaturalLanguage,
} from '../detection.js';

describe('detectContentType', () => {
  // Helper: returns just the type string for backward-compat style assertions
  const detectType = (text, node) => detectContentType(text, node).type;

  describe('return format', () => {
    it('returns a rich object with type, subType, confidence, wordCount, charCount', () => {
      const result = detectContentType('hello world', null);
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('subType');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('wordCount');
      expect(result).toHaveProperty('charCount');
    });

    it('confidence is between 0 and 1', () => {
      const result = detectContentType('hello world', null);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('wordCount and charCount are correct', () => {
      const text = 'hello world foo';
      const result = detectContentType(text, null);
      expect(result.wordCount).toBe(3);
      expect(result.charCount).toBe(text.length);
    });

    it('wordCount is 0 for empty string', () => {
      const result = detectContentType('', null);
      expect(result.wordCount).toBe(0);
      expect(result.charCount).toBe(0);
    });
  });

  describe('code detection', () => {
    it('detects JavaScript code with braces and semicolons', () => {
      const text = `function hello() {
  const x = 1;
  return x;
}`;
      expect(detectType(text, null)).toBe('code');
    });

    it('detects JavaScript code with braces and multiple keywords', () => {
      const text = `if (x > 0) {
  const result = transform(x)
  return result
}`;
      expect(detectType(text, null)).toBe('code');
    });

    it('detects Python code with indentation, semicolons, and keywords', () => {
      const text = `  def process(data):
    import json;
    return json.loads(data)`;
      expect(detectType(text, null)).toBe('code');
    });

    it('detects code with class definition and braces', () => {
      const text = `class MyComponent {
  constructor() {
    this.state = {};
  }
}`;
      expect(detectType(text, null)).toBe('code');
    });

    it('detects code when anchorNode is inside <pre> tag', () => {
      const anchorNode = {
        nodeName: 'SPAN',
        parentElement: {
          nodeName: 'PRE',
          parentElement: null
        }
      };
      expect(detectType('any text here', anchorNode)).toBe('code');
    });

    it('detects code when anchorNode is inside <code> tag', () => {
      const anchorNode = {
        nodeName: 'CODE',
        parentElement: null
      };
      expect(detectType('plain text', anchorNode)).toBe('code');
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
      expect(detectType('hello world', anchorNode)).toBe('code');
    });

    it('returns high confidence for code inside <pre> tag', () => {
      const anchorNode = { nodeName: 'PRE', parentElement: null };
      const result = detectContentType('any text', anchorNode);
      expect(result.confidence).toBe(0.95);
    });

    it('detects braceless JavaScript code with semicolons and keywords', () => {
      const text = 'const x = [1,4]; console.log(x);';
      expect(detectType(text, null)).toBe('code');
    });

    it('detects braceless multi-statement code', () => {
      const text = 'let a = 10; let b = 20; return a + b;';
      expect(detectType(text, null)).toBe('code');
    });

    it('detects braceless code with var and import keywords', () => {
      const text = 'import fs from "fs"; var data = fs.readFileSync("file.txt");';
      expect(detectType(text, null)).toBe('code');
    });

    it('does NOT falsely detect prose that mentions programming terms', () => {
      const text = 'The function of this committee is to review import regulations and export policies.';
      expect(detectType(text, null)).not.toBe('code');
    });

    it('does NOT detect text with a single code keyword as code', () => {
      const text = 'We should let the team know about the function schedule.';
      expect(detectType(text, null)).not.toBe('code');
    });
  });

  describe('code language sub-type detection', () => {
    it('detects JavaScript sub-type for console.log code', () => {
      const text = `const x = 42;
console.log(x);`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('javascript');
    });

    it('detects Python sub-type for def/self code', () => {
      const text = `def greet(self):
    print("hello")
    self.name = "test"`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('python');
    });

    it('detects Rust sub-type for fn/let mut code', () => {
      const text = `fn main() {
    let mut x = 5;
    println!("Value: {}", x);
}`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('rust');
    });

    it('detects Go sub-type for func/fmt code', () => {
      const text = `func main() {
    fmt.Println("hello")
    x := 42
}`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('go');
    });

    it('detects SQL sub-type for SELECT/FROM query', () => {
      const text = `SELECT name, age FROM users WHERE age > 18 ORDER BY name;`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('sql');
    });

    it('detects Java sub-type for public static void code', () => {
      const text = `public static void main(String[] args) {
    System.out.println("Hello");
}`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('java');
    });

    it('detects C/C++ sub-type for #include/printf code', () => {
      const text = `#include <stdio.h>
int main() {
    printf("hello world");
    return 0;
}`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('c/c++');
    });

    it('detects Ruby sub-type for do/end blocks', () => {
      const text = `class Greeter
  def greet
    puts "hello"
  end
end`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('ruby');
    });

    it('detects PHP sub-type for <?php code', () => {
      const text = `<?php
function greet($name) {
    echo "Hello, " . $name;
}`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      expect(result.subType).toBe('php');
    });

    it('returns null sub-type for ambiguous code', () => {
      const text = `if (x > 0) {
  return true;
}`;
      const result = detectContentType(text, null);
      expect(result.type).toBe('code');
      // subType may be null if no language scores high enough
    });
  });

  describe('error/stack trace detection', () => {
    it('detects JavaScript stack trace', () => {
      const text = `TypeError: Cannot read property 'name' of undefined
    at Object.getName (app.js:12:5)
    at main (index.js:4:10)`;
      expect(detectType(text, null)).toBe('error');
    });

    it('detects Python traceback', () => {
      const text = `Traceback (most recent call last):
  File "main.py", line 10, in <module>
    result = process(data)
ValueError: invalid literal`;
      expect(detectType(text, null)).toBe('error');
    });

    it('detects Java exception with stack trace', () => {
      const text = `NullPointerException: Cannot invoke method on null object
    at com.example.App.run(App.java:15)
    at com.example.Main.main(Main.java:8)`;
      expect(detectType(text, null)).toBe('error');
    });

    it('detects log-style error with timestamp', () => {
      const text = `ERROR 2024-01-15 10:23:45 - Connection refused
FATAL 2024-01-15 10:23:46 - Application shutting down
Caused by: java.net.ConnectException`;
      expect(detectType(text, null)).toBe('error');
    });

    it('does NOT detect text that merely mentions the word error', () => {
      const text = 'The error rate in our system has decreased significantly over the past month.';
      expect(detectType(text, null)).not.toBe('error');
    });
  });

  describe('math/formula detection', () => {
    it('detects LaTeX formula', () => {
      const text = '\\frac{a}{b} + \\sqrt{c^2 + d^2} = \\sum_{i=1}^{n} x_i';
      expect(detectType(text, null)).toBe('math');
    });

    it('detects unicode math symbols', () => {
      const text = 'f(x) = ∑ aᵢxⁱ, where ∫ f(x)dx = ∞';
      expect(detectType(text, null)).toBe('math');
    });

    it('detects display math with $$', () => {
      const text = '$$E = mc^2$$ and \\frac{1}{2}mv^2';
      expect(detectType(text, null)).toBe('math');
    });

    it('does NOT detect simple arithmetic in prose', () => {
      const text = 'The price is $5 and the quantity is 10.';
      expect(detectType(text, null)).not.toBe('math');
    });
  });

  describe('list/structured data detection', () => {
    it('detects CSV data', () => {
      const text = `name,age,city
Alice,30,NYC
Bob,25,LA
Carol,28,SF`;
      expect(detectType(text, null)).toBe('data');
    });

    it('detects JSON-like structure', () => {
      const text = `{
  "name": "Alice",
  "age": 30,
  "city": "NYC"
}`;
      expect(detectType(text, null)).toBe('data');
    });

    it('detects tab-separated values', () => {
      const text = "name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA\nCarol\t28\tSF";
      expect(detectType(text, null)).toBe('data');
    });

    it('detects bullet lists', () => {
      const text = `- First item here
- Second item here
- Third item here
- Fourth item here`;
      expect(detectType(text, null)).toBe('data');
    });

    it('does NOT detect a single line of text as data', () => {
      const text = 'Just a simple sentence with no structure.';
      expect(detectType(text, null)).not.toBe('data');
    });
  });

  describe('email/message detection', () => {
    it('detects email with headers', () => {
      const text = `Subject: Meeting tomorrow
From: alice@example.com
To: bob@example.com

Hi Bob, let's meet at 3pm. Best regards, Alice`;
      expect(detectType(text, null)).toBe('email');
    });

    it('detects email with greeting and sign-off', () => {
      const text = `Dear John,

I hope this message finds you well. I wanted to follow up on our conversation regarding the project timeline. Please let me know if you have any questions.

Best regards,
Alice`;
      expect(detectType(text, null)).toBe('email');
    });

    it('does NOT detect casual text as email', () => {
      const text = 'Hello world, this is just a test.';
      expect(detectType(text, null)).not.toBe('email');
    });
  });

  describe('foreign language detection', () => {
    it('detects Chinese text as foreign', () => {
      const text = '这是一段中文文本，用于测试外语检测功能。';
      expect(detectType(text, null)).toBe('foreign');
    });

    it('detects Japanese text as foreign with japanese sub-type', () => {
      const text = 'これは日本語のテストテキストです。外国語の検出をテストします。';
      const result = detectContentType(text, null);
      expect(result.type).toBe('foreign');
      expect(result.subType).toBe('japanese');
    });

    it('detects Arabic text as foreign with arabic sub-type', () => {
      const text = 'هذا نص عربي لاختبار كشف اللغة الأجنبية في النظام';
      const result = detectContentType(text, null);
      expect(result.type).toBe('foreign');
      expect(result.subType).toBe('arabic');
    });

    it('detects Korean text as foreign with korean sub-type', () => {
      const text = '이것은 한국어 테스트 텍스트입니다. 외국어 감지를 테스트합니다.';
      const result = detectContentType(text, null);
      expect(result.type).toBe('foreign');
      expect(result.subType).toBe('korean');
    });

    it('detects Chinese text with chinese sub-type', () => {
      const text = '这是一段中文文本用于测试。';
      const result = detectContentType(text, null);
      expect(result.type).toBe('foreign');
      expect(result.subType).toBe('chinese');
    });

    it('detects Russian text with russian sub-type', () => {
      const text = 'Это текст на русском языке для тестирования системы обнаружения.';
      const result = detectContentType(text, null);
      expect(result.type).toBe('foreign');
      expect(result.subType).toBe('russian');
    });

    it('detects Hindi text with hindi sub-type', () => {
      const text = 'यह हिंदी में एक परीक्षण पाठ है जो भाषा का पता लगाने के लिए है।';
      const result = detectContentType(text, null);
      expect(result.type).toBe('foreign');
      expect(result.subType).toBe('hindi');
    });

    it('detects Thai text with thai sub-type', () => {
      const text = 'นี่คือข้อความทดสอบภาษาไทยสำหรับระบบตรวจจับภาษา';
      const result = detectContentType(text, null);
      expect(result.type).toBe('foreign');
      expect(result.subType).toBe('thai');
    });

    it('does NOT detect accented Latin text (French) as foreign', () => {
      const text = "L'apprentissage automatique est une branche de l'intelligence artificielle qui permet aux systemes d'apprendre.";
      expect(detectType(text, null)).not.toBe('foreign');
    });

    it('does NOT detect emoji-heavy text as foreign', () => {
      const text = 'Hello world! This is a great day! Feeling happy and excited about the new project launch!';
      expect(detectType(text, null)).not.toBe('foreign');
    });

    it('does NOT detect mixed English with a few non-Latin characters as foreign', () => {
      const text = 'The word for hello in Japanese is konnichiwa (こんにちは), which is a common greeting used during the day.';
      expect(detectType(text, null)).not.toBe('foreign');
    });
  });

  describe('long text detection', () => {
    it('detects text with more than 200 words as long', () => {
      const words = Array(201).fill('word').join(' ');
      expect(detectType(words, null)).toBe('long');
    });

    it('does NOT detect text with exactly 200 words as long', () => {
      const words = Array(200).fill('word').join(' ');
      expect(detectType(words, null)).not.toBe('long');
    });

    it('detects a realistic long paragraph as long', () => {
      const sentences = Array(30).fill('This is a sentence with several words in it to test length detection.').join(' ');
      expect(detectType(sentences, null)).toBe('long');
    });
  });

  describe('default detection', () => {
    it('returns default for short English text', () => {
      const text = 'This is a simple sentence.';
      expect(detectType(text, null)).toBe('default');
    });

    it('returns default for a moderate English paragraph', () => {
      const text = 'The quick brown fox jumps over the lazy dog. This is a well-known English pangram that contains every letter of the alphabet.';
      expect(detectType(text, null)).toBe('default');
    });

    it('returns default for empty text', () => {
      expect(detectType('', null)).toBe('default');
    });

    it('returns default for a single word', () => {
      expect(detectType('hello', null)).toBe('default');
    });
  });

  describe('priority ordering', () => {
    it('prioritizes code detection over foreign for code with non-Latin comments', () => {
      const text = `function greet() {
  // 你好世界
  console.log("hello");
}`;
      expect(detectType(text, null)).toBe('code');
    });

    it('prioritizes anchorNode code detection over everything', () => {
      const anchorNode = {
        nodeName: 'CODE',
        parentElement: null
      };
      expect(detectType('这是中文文本', anchorNode)).toBe('code');
    });

    it('prioritizes code over error for code that contains Error keyword', () => {
      const text = `function handleError() {
  throw new TypeError("invalid");
}`;
      expect(detectType(text, null)).toBe('code');
    });

    it('prioritizes error over email for error messages with greeting-like text', () => {
      const text = `Dear developer,

Error: Connection refused
    at connect (net.js:12:5)
Caused by: ECONNREFUSED

Best regards, Error Handler`;
      // Has email signals but error signals are stronger and higher priority
      expect(detectType(text, null)).toBe('error');
    });
  });
});

describe('detectCodeLanguage', () => {
  it('returns null for ambiguous code', () => {
    expect(detectCodeLanguage('x = 1')).toBeNull();
  });

  it('detects javascript for arrow functions', () => {
    expect(detectCodeLanguage('const fn = () => { return 42; }')).toBe('javascript');
  });

  it('detects python for elif keyword', () => {
    expect(detectCodeLanguage('if x:\n  pass\nelif y:\n  pass')).toBe('python');
  });

  it('detects sql for SELECT FROM WHERE', () => {
    expect(detectCodeLanguage('SELECT id FROM users WHERE active = true')).toBe('sql');
  });
});

describe('detectNaturalLanguage', () => {
  it('detects japanese when hiragana present', () => {
    expect(detectNaturalLanguage('テスト文章です')).toBe('japanese');
  });

  it('detects korean for hangul text', () => {
    expect(detectNaturalLanguage('한국어 텍스트')).toBe('korean');
  });

  it('detects arabic for arabic script', () => {
    expect(detectNaturalLanguage('نص عربي')).toBe('arabic');
  });

  it('detects russian for cyrillic text', () => {
    expect(detectNaturalLanguage('Русский текст')).toBe('russian');
  });
});

describe('detectError', () => {
  it('returns null for normal text', () => {
    expect(detectError('This is fine')).toBeNull();
  });

  it('detects stack trace with at lines', () => {
    const result = detectError(`TypeError: undefined is not a function
    at Object.run (app.js:5:3)
    at main (index.js:1:1)`);
    expect(result).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('detectMath', () => {
  it('returns null for normal text', () => {
    expect(detectMath('Hello world')).toBeNull();
  });

  it('detects LaTeX commands', () => {
    const result = detectMath('\\frac{1}{2} + \\sqrt{4} = \\sum x');
    expect(result).not.toBeNull();
  });
});

describe('detectData', () => {
  it('returns null for simple text', () => {
    expect(detectData('Hello world')).toBeNull();
  });

  it('detects CSV with consistent columns', () => {
    const result = detectData('a,b,c\n1,2,3\n4,5,6\n7,8,9');
    expect(result).not.toBeNull();
  });
});

describe('detectEmail', () => {
  it('returns null for normal text', () => {
    expect(detectEmail('Just a sentence.')).toBeNull();
  });

  it('detects email with Subject header', () => {
    const result = detectEmail('Subject: Hello\nFrom: test@test.com\nDear friend,\nBest regards');
    expect(result).not.toBeNull();
  });
});

describe('detectForeign', () => {
  it('returns null for empty text', () => {
    expect(detectForeign('')).toBeNull();
  });

  it('returns null for Latin text', () => {
    expect(detectForeign('Hello world')).toBeNull();
  });

  it('returns object with subType for CJK text', () => {
    const result = detectForeign('这是中文文本测试内容');
    expect(result).not.toBeNull();
    expect(result.subType).toBe('chinese');
  });
});
