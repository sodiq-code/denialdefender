import { webSearch, pageReader, extractText, saveDoc, RAW_DIR, TODAY } from './helpers.mjs';

const searchTargets = [
  { source: 'CMS', document: 'CARC Claim Adjustment Reason Codes', query: 'CMS CARC claim adjustment reason codes list medicare denial', filename: 'cms_carc_codes.json' },
  { source: 'CMS', document: 'RARC Remittance Advice Remark Codes', query: 'CMS RARC remittance advice remark codes medicare', filename: 'cms_rarc_codes.json' },
  { source: 'KFF', document: 'Claims Denials and Appeals in Medicare Advantage', query: 'KFF Kaiser Family Foundation Medicare Advantage claims denials appeals data 2024', filename: 'kff_ma_denials_appeals.json' },
  { source: 'AHA', document: 'Hospital Denial Rate Data', query: 'AHA American Hospital Association denial rate data hospitals 2024', filename: 'aha_denial_rates.json' },
  { source: 'Health Affairs', document: 'Medicare Advantage Denial Rates Study', query: 'Health Affairs Medicare Advantage denial rates study research', filename: 'health_affairs_ma_denials.json' },
];

const results = [];
for (const t of searchTargets) {
  console.log(`\nSearching: ${t.document}`);
  const sr = webSearch(t.query, 8);
  if (!sr || !sr.results || sr.results.length === 0) {
    console.log(`  No results`);
    results.push({ ...t, status: 'no_results', url: '' });
    continue;
  }
  
  // Pick best URL (prefer .gov, .org)
  let bestUrl = null, bestSnippet = '';
  for (const r of sr.results) {
    if (!bestUrl && (r.url.includes('.gov') || r.url.includes('.org') || r.url.includes('.edu'))) {
      bestUrl = r.url; bestSnippet = r.snippet || r.description || '';
    }
  }
  if (!bestUrl) { bestUrl = sr.results[0].url; bestSnippet = sr.results[0].snippet || sr.results[0].description || ''; }
  
  console.log(`  Best URL: ${bestUrl}`);
  const pageData = pageReader(bestUrl);
  
  let content, title = t.document, description = bestSnippet;
  if (pageData) {
    content = extractText(pageData.html || '');
    title = pageData.title || t.document;
    description = pageData.description || bestSnippet;
    console.log(`  Page fetched (${content.length} chars)`);
  } else {
    content = JSON.stringify(sr.results.slice(0,5).map(r => ({ title: r.title, url: r.url, snippet: r.snippet || r.description })), null, 2);
    console.log(`  Page failed, using search snippets`);
  }
  
  const doc = { source: t.source, document: t.document, url: bestUrl, retrievedDate: TODAY, title, description, content };
  saveDoc(doc, t.filename);
  results.push({ ...t, url: bestUrl, status: 'fetched' });
}
console.log(JSON.stringify(results, null, 2));
