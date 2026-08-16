// Development-only data scraping tool — not used in production DenialDefender
import { execSync } from 'child_process';
import fs from 'fs';
const RAW_DIR = '/home/z/my-project/data/corpus/raw';
const TODAY = '2026-08-16';
function webSearch(query, num = 5) {
  const r = execSync(`z-ai function -n web_search -a '${JSON.stringify({ query, num })}'`, { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'] });
  const m = r.match(/\[[\s\S]*\]/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null;
}
function pageReader(url) {
  try { const r = execSync(`z-ai function -n page_reader -a '${JSON.stringify({ url })}'`, { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'], maxBuffer: 10*1024*1024 }); const m = r.match(/\{[\s\S]*"data"[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]).data; } catch {} } return null; } catch { return null; }
}
function extractText(html) { if (!html) return ''; return html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<svg[\s\S]*?<\/svg>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().substring(0,40000); }
function saveDoc(doc, fn) { fs.writeFileSync(`${RAW_DIR}/${fn}`, JSON.stringify(doc, null, 2)); console.log(`  Saved: ${fn}`); }

const targets = [
  { source: 'CMS', document: 'Noridian Denial Code Resolution', query: 'Medicare denial code resolution guide Noridian MAC', filename: 'noridian_denial_resolution.json' },
  { source: 'CMS', document: 'Medicare Secondary Payer Denials', query: 'CMS Medicare secondary payer denial reason codes', filename: 'cms_msp_denials.json' },
  { source: 'CMS', document: 'Claim Adjustment Group Codes', query: 'CMS claim adjustment group codes CO OA PR PI medicare', filename: 'cms_cag_codes.json' },
  { source: 'CMS', document: 'RARC Remittance Advice Remark Codes', query: 'RARC remittance advice remark codes medicare list', filename: 'cms_rarc_codes.json' },
  { source: 'CMS', document: 'Medicare Advantage Prior Auth Denials', query: 'Medicare Advantage prior authorization denial rates statistics 2024', filename: 'cms_ma_prior_auth_denials.json' },
  { source: 'CMS', document: 'Comprehensive Error Rate Testing (CERT)', query: 'CMS CERT comprehensive error rate testing medicare improper payments', filename: 'cms_cert.json' },
];

for (const t of targets) {
  console.log(`\nSearching: ${t.document}`);
  const sr = webSearch(t.query, 5);
  if (!sr || sr.length === 0) { console.log('  No results'); continue; }
  let u = null, s = '';
  for (const r of sr) { if (!u && (r.url.includes('.gov') || r.url.includes('.org'))) { u = r.url; s = r.snippet||''; } }
  if (!u) { u = sr[0].url; s = sr[0].snippet||''; }
  console.log(`  URL: ${u}`);
  execSync('sleep 3');
  const pd = pageReader(u);
  saveDoc({ source: t.source, document: t.document, url: u, retrievedDate: TODAY, title: pd?.title||t.document, description: pd?.description||s, content: pd ? extractText(pd.html||'') : JSON.stringify(sr.slice(0,5).map(r=>({title:r.name,url:r.url,snippet:r.snippet})),null,2) }, t.filename);
  execSync('sleep 3');
}
