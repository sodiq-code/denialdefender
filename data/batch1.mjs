import { pageReader, extractText, saveDoc, RAW_DIR, TODAY } from './helpers.mjs';

const docs = [
  { source: 'CMS', document: 'Reason Statements and eMDR Codes', url: 'https://www.cms.gov/data-research/computer-data-systems/esmd/reason-statements-and-document-emdr-codes', filename: 'cms_reason_statements_emdr.json' },
  { source: 'CMS', document: 'Medicare Claims Synthetic PUFs (SynPUFs)', url: 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-synthetic-public-use-files', filename: 'cms_synpufs.json' },
  { source: 'HHS', document: 'HIPAA De-identification Guidance', url: 'https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification/index.html', filename: 'hhs_hipaa_deidentification.json' },
  { source: 'CMS', document: 'Medicare Claims Appeals Overview', url: 'https://www.cms.gov/medicare-claims-appeals', filename: 'cms_claims_appeals_overview.json' },
  { source: 'CMS', document: 'Redetermination - First Level Appeal', url: 'https://www.cms.gov/medicare-claims-appeals/redetermination', filename: 'cms_redetermination.json' },
];

const results = [];
for (const d of docs) {
  console.log(`Fetching: ${d.document}`);
  const data = pageReader(d.url);
  if (data) {
    const content = extractText(data.html || '');
    const doc = { source: d.source, document: d.document, url: d.url, retrievedDate: TODAY, title: data.title || d.document, description: data.description || '', content };
    saveDoc(doc, d.filename);
    results.push({ ...d, retrievedDate: TODAY, status: 'fetched' });
  } else {
    console.log(`  FAILED: ${d.document}`);
    results.push({ ...d, retrievedDate: TODAY, status: 'failed' });
  }
}
console.log(JSON.stringify(results, null, 2));
