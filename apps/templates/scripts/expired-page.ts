/**
 * The 410 Gone page served by the preview host after mockup.expiresAt (spec §9.5).
 * Self-contained HTML: no external requests, noindex, same disclosure language as
 * the live mockup.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function expiredPageHtml(agencyName: string, agencyUrl: string): string {
  const name = escapeHtml(agencyName);
  const url = escapeHtml(agencyUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>This mockup has expired</title>
<style>
:root{color-scheme:light}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f2;color:#1a1a1a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.6}
main{max-width:34rem;padding:2.5rem 1.5rem;text-align:center}
h1{font-size:1.75rem;margin:0 0 .75rem;line-height:1.2}
p{margin:0 0 1rem}
.note{font-size:.9rem;color:#4a4a4a}
a{color:#1b2f5b}
</style>
</head>
<body>
<main>
<h1>This mockup has expired</h1>
<p>The concept website preview you followed is no longer available. Previews are unofficial mockups prepared by <a href="${url}" rel="noopener">${name}</a> and are removed automatically after a short period.</p>
<p class="note">This page is not affiliated with or endorsed by the business it illustrated. If you were sent this link by ${name}, please contact them for an up-to-date preview.</p>
</main>
</body>
</html>
`;
}
