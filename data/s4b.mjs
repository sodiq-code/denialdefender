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

console.log('Searching MA org determinations');
const sr = webSearch('Medicare Advantage organization determinations appeals 42 CFR 422', 5);
if (sr && sr.length > 0) {
  let u = null, s = '';
  for (const r of sr) { if (!u && r.url.includes('.gov')) { u = r.url; s = r.snippet||''; } }
  if (!u) { u = sr[0].url; s = sr[0].snippet||''; }
  console.log(`  URL: ${u}`);
  execSync('sleep 3');
  const pd = pageReader(u);
  saveDoc({ source:'CMS', document:'Medicare Advantage Organization Determinations', url:u, retrievedDate:TODAY, title:pd?.title||'Medicare Advantage Organization Determinations', description:pd?.description||s, content:pd?extractText(pd.html||''):JSON.stringify(sr.slice(0,5).map(r=>({title:r.name,url:r.url,snippet:r.snippet})),null,2) }, 'cms_ma_org_determinations.json');
}
