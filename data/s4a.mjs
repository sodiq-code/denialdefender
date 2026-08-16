import { execSync } from 'child_process';
import fs from 'fs';
const RAW_DIR = '/home/z/my-project/data/corpus/raw';
const TODAY = '2026-08-16';

function webSearch(query, num = 5) {
  const result = execSync(`z-ai function -n web_search -a '${JSON.stringify({ query, num })}'`, { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'] });
  const match = result.match(/\[[\s\S]*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}
function pageReader(url) {
  try {
    const result = execSync(`z-ai function -n page_reader -a '${JSON.stringify({ url })}'`, { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'], maxBuffer: 10*1024*1024 });
    const jsonMatch = result.match(/\{[\s\S]*"data"[\s\S]*\}/);
    if (jsonMatch) { try { return JSON.parse(jsonMatch[0]).data; } catch {} }
    return null;
  } catch (e) { return null; }
}
function extractText(html) {
  if (!html) return '';
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.substring(0, 40000);
}
function saveDoc(doc, filename) {
  fs.writeFileSync(`${RAW_DIR}/${filename}`, JSON.stringify(doc, null, 2));
  console.log(`  Saved: ${filename}`);
}

// Just one search at a time
console.log('Searching OIG report');
const sr = webSearch('HHS OIG Medicare Advantage denials oversight report', 5);
if (sr && sr.length > 0) {
  let bestUrl = null, bestSnippet = '';
  for (const r of sr) { if (!bestUrl && (r.url.includes('.gov') || r.url.includes('.org'))) { bestUrl = r.url; bestSnippet = r.snippet || ''; } }
  if (!bestUrl) { bestUrl = sr[0].url; bestSnippet = sr[0].snippet || ''; }
  console.log(`  URL: ${bestUrl}`);
  execSync('sleep 3');
  const pd = pageReader(bestUrl);
  let content, title = 'OIG Medicare Advantage Denial Report', description = bestSnippet;
  if (pd) { content = extractText(pd.html || ''); title = pd.title || title; description = pd.description || bestSnippet; }
  else { content = JSON.stringify(sr.slice(0,5).map(r => ({ title: r.name, url: r.url, snippet: r.snippet })), null, 2); }
  saveDoc({ source: 'OIG', document: 'OIG Medicare Advantage Denial Report', url: bestUrl, retrievedDate: TODAY, title, description, content }, 'oig_ma_denials.json');
}
