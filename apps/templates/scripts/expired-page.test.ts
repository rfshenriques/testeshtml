import { describe, expect, it } from 'vitest';
import { expiredPageHtml } from './expired-page';

describe('expiredPageHtml', () => {
  it('is a self-contained noindex page naming the agency', () => {
    const html = expiredPageHtml('Northline Studio', 'https://northline.example');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow,noarchive">');
    expect(html).toContain('This mockup has expired');
    expect(html).toContain('<a href="https://northline.example" rel="noopener">Northline Studio</a>');
    expect(html).not.toMatch(/<(script|link)\b/);
  });
  it('escapes HTML in the agency name and URL', () => {
    const html = expiredPageHtml('<b>Evil</b> & Co', 'https://x.example/?a=1&b="2"');
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt; &amp; Co');
    expect(html).toContain('href="https://x.example/?a=1&amp;b=&quot;2&quot;"');
    expect(html).not.toContain('<b>Evil</b>');
  });
});
