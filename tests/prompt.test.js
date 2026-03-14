// tests/prompt.test.js
import { buildChatMessages, buildFollowUp, MAX_TEXT_LENGTH } from '../prompt.js';

const SYSTEM_MSG = {
  role: 'system',
  content: 'You are Dobby AI, a helpful assistant. The user has selected text on a webpage and the full selected text is provided below. Do NOT attempt to access, fetch, or visit any URLs — the text content is already included in the message. A source URL may be provided as metadata only. Be concise and clear. Always respond in the same language as the selected text.',
};

describe('MAX_TEXT_LENGTH', () => {
  it('is 6000', () => {
    expect(MAX_TEXT_LENGTH).toBe(6000);
  });
});

describe('buildChatMessages', () => {
  it('always includes system message', () => {
    const result = buildChatMessages('hello world', '', false);
    expect(result[0]).toEqual(SYSTEM_MSG);
  });

  it('puts raw text in user message when no instruction', () => {
    const result = buildChatMessages('hello world', '', false);
    expect(result.length).toBe(2);
    expect(result[1]).toEqual({ role: 'user', content: 'hello world' });
  });

  it('combines instruction and text in user message', () => {
    const result = buildChatMessages('code here', 'Explain this code', false);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(SYSTEM_MSG);
    expect(result[1]).toEqual({ role: 'user', content: 'Explain this code:\n\ncode here' });
  });

  it('handles null instruction like empty', () => {
    const result = buildChatMessages('text', null, false);
    expect(result.length).toBe(2);
    expect(result[1].content).toBe('text');
  });

  it('truncates text longer than MAX_TEXT_LENGTH', () => {
    const longText = 'a'.repeat(MAX_TEXT_LENGTH + 500);
    const result = buildChatMessages(longText, '', false);
    const userContent = result[1].content;
    expect(userContent.length).toBe(MAX_TEXT_LENGTH + '...[truncated]'.length);
    expect(userContent).toContain('...[truncated]');
  });

  it('does not truncate text at MAX_TEXT_LENGTH exactly', () => {
    const text = 'a'.repeat(MAX_TEXT_LENGTH);
    const result = buildChatMessages(text, '', false);
    expect(result[1].content).toBe(text);
  });

  it('appends page context when includePageContext is true', () => {
    const result = buildChatMessages('hello', '', true);
    expect(result[1].content).toContain('(Source:');
  });

  it('does not append page context when false', () => {
    const result = buildChatMessages('hello', '', false);
    expect(result[1].content).not.toContain('(Source:');
  });

  it('preserves whitespace and newlines in text', () => {
    const text = '  line one\n  line two';
    const result = buildChatMessages(text, '', false);
    expect(result[1].content).toBe(text);
  });

  it('instruction + text + page context are combined correctly', () => {
    const result = buildChatMessages('some text', 'Summarize the following', true);
    const content = result[1].content;
    expect(content).toMatch(/^Summarize the following:\n\nsome text\n\n\(Source:/);
  });
});

describe('buildFollowUp', () => {
  it('appends user message to existing conversation', () => {
    const existing = [
      { role: 'system', content: 'Explain' },
      { role: 'user', content: 'code here' },
      { role: 'assistant', content: 'This code does...' },
    ];
    const result = buildFollowUp(existing, 'Can you simplify it?');
    expect(result.length).toBe(4);
    expect(result[3]).toEqual({ role: 'user', content: 'Can you simplify it?' });
  });

  it('does not mutate the original array', () => {
    const existing = [{ role: 'user', content: 'hi' }];
    const result = buildFollowUp(existing, 'follow up');
    expect(existing.length).toBe(1);
    expect(result.length).toBe(2);
  });

  it('works with empty conversation', () => {
    const result = buildFollowUp([], 'hello');
    expect(result).toEqual([{ role: 'user', content: 'hello' }]);
  });
});
