import { describe, it, expect } from 'vitest';
import { sanitizeRequestBody } from '../../middleware/inputSanitization.js';

describe('Input Sanitization Middleware', () => {
  it('should preserve normal text', () => {
    const input = 'This is a normal content draft with punctuation! No dangerous tags here.';
    const result = sanitizeRequestBody(input);
    expect(result).toBe(input);
  });

  it('should safely remove <script> tags and their contents', () => {
    const input = 'Hello <script>alert("xss")</script> World!';
    const result = sanitizeRequestBody(input);
    expect(result).toBe('Hello  World!');
  });

  it('should sanitize javascript: URLs', () => {
    const input = 'Click <a href="javascript:alert(1)">here</a>';
    const result = sanitizeRequestBody(input);
    expect(result).toBe('Click <a href="javascript_:alert(1)">here</a>');
  });

  it('should sanitize inline event handlers (e.g. onclick, onerror)', () => {
    const input = '<img src="invalid" onerror=alert(1) />';
    const result = sanitizeRequestBody(input);
    expect(result).toBe('<img src="invalid" on_evt=alert(1) />');
  });

  it('should handle nested arrays and objects safely', () => {
    const input = {
      title: 'My Draft <script>attack</script>',
      tags: ['normal tag', '<script>bad tag</script>', 'good tag'],
      meta: {
        description: 'A description with onclick=malicious',
      },
      count: 42,
    };

    const expected = {
      title: 'My Draft ',
      tags: ['normal tag', '', 'good tag'],
      meta: {
        description: 'A description with on_evt=malicious',
      },
      count: 42,
    };

    const result = sanitizeRequestBody(input);
    expect(result).toEqual(expected);
  });

  it('should preserve non-string values', () => {
    const input = {
      isActive: true,
      count: 100,
      metadata: null,
    };
    const result = sanitizeRequestBody(input);
    expect(result).toEqual(input);
  });

  it('should not modify password or token fields even if they look like HTML', () => {
    const input = {
      email: 'user@example.com',
      password: '<script>mypassword</script>', // A weird but valid password
      newPassword: 'onclick=something',
      token: 'javascript:mytoken',
    };

    // The sensitive fields should be exactly preserved
    const result = sanitizeRequestBody(input);
    expect(result).toEqual(input);
  });
});
