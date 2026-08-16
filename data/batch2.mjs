import { pageReader, extractText, saveDoc, RAW_DIR, TODAY } from './helpers.mjs';

const docs = [
  { source: 'CMS', document: 'Medicare Claims Public-Use Files', url: 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-public-use-files', filename: 'cms_medicare_claims_puf.json' },
  { source: 'CMS', document: 'Reconsideration - Second Level Appeal', url: 'https://www.cms.gov/medicare-claims-appeals/reconsideration', filename: 'cms_reconsideration.json' },
  { source: 'CMS', document: 'ALJ Hearing - Third Level Appeal', url: 'https://www.cms.gov/medicare-claims-appeals/alj-hearing', filename: 'cms_alj_hearing.json' },
  { source: 'CMS', document: 'Council Review - Fourth Level Appeal', url: 'https://www.cms.gov/medicare-claims-appeals/council-review', filename: 'cms_council_review.json' },
  { source: 'CMS', document: 'Federal Court Review - Fifth Level Appeal', url: 'https://www.cms.gov/medicare-claims-appeals/federal-court-review', filename: 'cms_federal_court.json' },
  { source: 'GAO', document: 'GAO Medicare Advantage Appeals Report', url: 'https://www.gao.gov/products/gao-24-106714', filename: 'gao_ma_appeals.json' },
  { source: 'CMS', document: 'X12 835 Remittance Advice', url: 'https://www.cms.gov/electronic-billing-ediac/edi-basics/remittance-advice-codes', filename: 'cms_835_remittance_codes.json' },
  { source: 'CMS', document: 'National Coverage Determinations', url: 'https://www.cms.gov/medicare-coverage-database/overview-and-general-information', filename: 'cms_ncd.json' },
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
