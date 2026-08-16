import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export const RAW_DIR = '/home/z/my-project/data/corpus/raw';
export const TODAY = '2026-08-16';

export function webSearch(query, num = 8) {
  try {
    const result = execSync(
      `z-ai function -n web_search -a '${JSON.stringify({ query, num })}'`,
      { encoding: 'utf-8', timeout: 45000, stdio: ['pipe','pipe','pipe'] }
    );
    const jsonMatch = result.match(/\{[\s\S]*"data"[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]).data; } catch {}
    }
    return null;
  } catch (e) { return null; }
}

export function pageReader(url) {
  try {
    const result = execSync(
      `z-ai function -n page_reader -a '${JSON.stringify({ url })}'`,
      { encoding: 'utf-8', timeout: 45000, stdio: ['pipe','pipe','pipe'], maxBuffer: 10*1024*1024 }
    );
    const jsonMatch = result.match(/\{[\s\S]*"data"[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]).data; } catch {}
    }
    return null;
  } catch (e) { return null; }
}

export function extractText(html) {
  if (!html) return '';
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t.substring(0, 40000);
}

export function saveDoc(doc, filename) {
  const fp = path.join(RAW_DIR, filename);
  fs.writeFileSync(fp, JSON.stringify(doc, null, 2));
  console.log(`  Saved: ${filename} (${(JSON.stringify(doc).length/1024).toFixed(1)}KB)`);
  return fp;
}
