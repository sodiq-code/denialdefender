import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const RAW_DIR = '/home/z/my-project/data/corpus/raw';
const TODAY = '2026-08-16';

function webSearch(query, num = 5) {
  const result = execSync(
    `z-ai function -n web_search -a '${JSON.stringify({ query, num })}'`,
    { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'] }
  );
  // Parse JSON array from output
  const match = result.match(/\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

function pageReader(url) {
  try {
    const result = execSync(
      `z-ai function -n page_reader -a '${JSON.stringify({ url })}'`,
      { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'], maxBuffer: 10*1024*1024 }
    );
    const jsonMatch = result.match(/\{[\s\S]*"data"[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]).data; } catch {}
    }
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
  const fp = path.join(RAW_DIR, filename);
  fs.writeFileSync(fp, JSON.stringify(doc, null, 2));
  console.log(`  Saved: ${filename} (${(JSON.stringify(doc).length/1024).toFixed(1)}KB)`);
}

function sleep(ms) {
  execSync(`sleep ${ms/1000}`);
}

const searchTargets = [
  { source: 'X12', document: 'CARC Claim Adjustment Reason Codes', query: 'Medicare denial codes CARC claim adjustment reason codes', filename: 'x12_carc_codes.json' },
  { source: 'CMS', document: 'Review Reason Codes and Statements', query: 'CMS review reason codes statements medicare fee service compliance', filename: 'cms_review_reason_codes.json' },
  { source: 'KFF', document: 'KFF Medicare Advantage Claims Denials and Appeals', query: 'KFF Medicare Advantage claims denials appeals data', filename: 'kff_ma_denials_appeals.json' },
  { source: 'AHA', document: 'AHA Hospital Denial Rate Data', query: 'American Hospital Association denial rate hospitals 2024', filename: 'aha_denial_rates.json' },
  { source: 'Health Affairs', document: 'Medicare Advantage Denial Rates', query: 'Health Affairs Medicare Advantage denial rates study', filename: 'health_affairs_ma_denials.json' },
  { source: 'CMS', document: 'Medical Necessity Denial Criteria', query: 'CMS medical necessity denial criteria medicare coverage', filename: 'cms_medical_necessity.json' },
  { source: 'CMS', document: 'Prior Authorization Requirements', query: 'CMS prior authorization Medicare requirements 2024 2025', filename: 'cms_prior_auth.json' },
  { source: 'CMS', document: 'Appeal Filing Deadlines by Level', query: 'Medicare appeal deadlines redetermination reconsideration ALJ days time limit', filename: 'cms_appeal_deadlines.json' },
  { source: 'CMS', document: 'Local Coverage Determinations LCD', query: 'CMS local coverage determinations LCD Medicare administrative contractors', filename: 'cms_lcd.json' },
  { source: 'OIG', document: 'OIG Medicare Advantage Denial Report', query: 'HHS OIG Medicare Advantage denials oversight report', filename: 'oig_ma_denials.json' },
  { source: 'CMS', document: 'Medicare Advantage Organization Determinations', query: 'Medicare Advantage organization determinations appeals 42 CFR 422', filename: 'cms_ma_org_determinations.json' },
  { source: 'CMS', document: 'eMDR Denial Reason Categories', query: 'CMS eMDR denial reason categories codes medical review', filename: 'cms_emdr_categories.json' },
  { source: 'Noridian', document: 'Denial Code Resolution Guide', query: 'Medicare denial code resolution guide Noridian MAC', filename: 'noridian_denial_resolution.json' },
  { source: 'CMS', document: 'Medicare Secondary Payer Denials', query: 'CMS Medicare secondary payer denial reason codes', filename: 'cms_msp_denials.json' },
  { source: 'CMS', document: 'Claim Adjustment Group Codes', query: 'CMS claim adjustment group codes CO OA PR PI medicare', filename: 'cms_cag_codes.json' },
];

const results = [];
for (const t of searchTargets) {
  console.log(`\nSearching: ${t.document}`);
  const sr = webSearch(t.query, 5);
  if (!sr || sr.length === 0) {
    console.log(`  No results`);
    results.push({ ...t, status: 'no_results', url: '' });
    sleep(3000);
    continue;
  }
  
  // Pick best URL (prefer .gov, .org)
  let bestUrl = null, bestSnippet = '';
  for (const r of sr) {
    if (!bestUrl && (r.url.includes('.gov') || r.url.includes('.org') || r.url.includes('.edu'))) {
      bestUrl = r.url; bestSnippet = r.snippet || '';
    }
  }
  if (!bestUrl) { bestUrl = sr[0].url; bestSnippet = sr[0].snippet || ''; }
  
  console.log(`  Best URL: ${bestUrl}`);
  
  sleep(2000); // Rate limit spacing
  
  const pageData = pageReader(bestUrl);
  let content, title = t.document, description = bestSnippet;
  if (pageData) {
    content = extractText(pageData.html || '');
    title = pageData.title || t.document;
    description = pageData.description || bestSnippet;
    console.log(`  Page fetched (${content.length} chars)`);
  } else {
    content = JSON.stringify(sr.slice(0,5).map(r => ({ title: r.name || r.title, url: r.url, snippet: r.snippet })), null, 2);
    console.log(`  Page failed, using search snippets`);
  }
  
  const doc = { source: t.source, document: t.document, url: bestUrl, retrievedDate: TODAY, title, description, content };
  saveDoc(doc, t.filename);
  results.push({ ...t, url: bestUrl, status: 'fetched' });
  
  sleep(3000); // Rate limit spacing
}
console.log(JSON.stringify(results, null, 2));
