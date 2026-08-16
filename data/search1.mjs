import { execSync } from 'child_process';
import fs from 'fs';

const RAW_DIR = '/home/z/my-project/data/corpus/raw';
const TODAY = '2026-08-16';

function webSearch(query, num = 5) {
  const result = execSync(
    `z-ai function -n web_search -a '${JSON.stringify({ query, num })}'`,
    { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'] }
  );
  const match = result.match(/\[[\s\S]*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

function pageReader(url) {
  try {
    const result = execSync(
      `z-ai function -n page_reader -a '${JSON.stringify({ url })}'`,
      { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'], maxBuffer: 10*1024*1024 }
    );
    const jsonMatch = result.match(/\{[\s\S]*"data"[\s\S]*\}/);
    if (jsonMatch) { try { return JSON.parse(jsonMatch[0]).data; } catch {} }
    return null;
  } catch (e) { return null; }
}

function extractText(html) {
  if (!html) return '';
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t.substring(0, 40000);
}

function saveDoc(doc, filename) {
  const fp = `${RAW_DIR}/${filename}`;
  fs.writeFileSync(fp, JSON.stringify(doc, null, 2));
  console.log(`  Saved: ${filename} (${(JSON.stringify(doc).length/1024).toFixed(1)}KB)`);
}

const targets = [
  { source: 'X12', document: 'CARC Claim Adjustment Reason Codes', query: 'Medicare denial codes CARC claim adjustment reason codes', filename: 'x12_carc_codes.json' },
  { source: 'CMS', document: 'Review Reason Codes and Statements', query: 'CMS review reason codes statements medicare fee service', filename: 'cms_review_reason_codes.json' },
  { source: 'KFF', document: 'KFF Medicare Advantage Denials and Appeals', query: 'KFF Medicare Advantage claims denials appeals data', filename: 'kff_ma_denials_appeals.json' },
];

for (const t of targets) {
  console.log(`\nSearching: ${t.document}`);
  const sr = webSearch(t.query, 5);
  if (!sr || sr.length === 0) { console.log(`  No results`); continue; }
  
  let bestUrl = null, bestSnippet = '';
  for (const r of sr) {
    if (!bestUrl && (r.url.includes('.gov') || r.url.includes('.org'))) {
      bestUrl = r.url; bestSnippet = r.snippet || '';
    }
  }
  if (!bestUrl) { bestUrl = sr[0].url; bestSnippet = sr[0].snippet || ''; }
  console.log(`  Best URL: ${bestUrl}`);
  
  execSync('sleep 3');
  const pageData = pageReader(bestUrl);
  let content, title = t.document, description = bestSnippet;
  if (pageData) {
    content = extractText(pageData.html || '');
    title = pageData.title || t.document;
    description = pageData.description || bestSnippet;
    console.log(`  Page fetched (${content.length} chars)`);
  } else {
    content = JSON.stringify(sr.slice(0,5).map(r => ({ title: r.name, url: r.url, snippet: r.snippet })), null, 2);
    console.log(`  Page failed, using search snippets`);
  }
  
  saveDoc({ source: t.source, document: t.document, url: bestUrl, retrievedDate: TODAY, title, description, content }, t.filename);
  execSync('sleep 3');
}
