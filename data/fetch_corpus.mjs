import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const RAW_DIR = '/home/z/my-project/data/corpus/raw';
const TODAY = '2026-08-16';

function webSearch(query, num = 10) {
  try {
    const result = execSync(
      `z-ai function -n web_search -a '${JSON.stringify({ query, num })}'`,
      { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'] }
    );
    // Parse the output - look for JSON after the initialization messages
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.data) return parsed.data;
        } catch {}
      }
    }
    // Try to find JSON in the whole output
    const jsonMatch = result.match(/\{[\s\S]*"data"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.data) return parsed.data;
      } catch {}
    }
    return null;
  } catch (e) {
    console.error(`Search failed for "${query}": ${e.message}`);
    return null;
  }
}

function pageReader(url) {
  try {
    const result = execSync(
      `z-ai function -n page_reader -a '${JSON.stringify({ url })}'`,
      { encoding: 'utf-8', timeout: 60000, stdio: ['pipe','pipe','pipe'], maxBuffer: 10 * 1024 * 1024 }
    );
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.data) return parsed.data;
        } catch {}
      }
    }
    const jsonMatch = result.match(/\{[\s\S]*"data"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.data) return parsed.data;
      } catch {}
    }
    return null;
  } catch (e) {
    console.error(`Page read failed for "${url}": ${e.message}`);
    return null;
  }
}

function extractTextFromHtml(html) {
  if (!html) return '';
  // Remove script/style tags
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  // Limit to first 50000 chars
  return text.substring(0, 50000);
}

function saveDocument(doc, filename) {
  const filepath = path.join(RAW_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(doc, null, 2));
  console.log(`  Saved: ${filename} (${(JSON.stringify(doc).length / 1024).toFixed(1)} KB)`);
  return filepath;
}

function fetchAndSave(source, document, url, filename) {
  console.log(`Fetching: ${document} from ${url}`);
  const data = pageReader(url);
  if (!data) {
    console.log(`  FAILED - will try search fallback`);
    return null;
  }
  
  const content = extractTextFromHtml(data.html || '');
  const doc = {
    source,
    document,
    url,
    retrievedDate: TODAY,
    title: data.title || document,
    description: data.description || '',
    content
  };
  
  return saveDocument(doc, filename);
}

const manifest = [];
let docCount = 0;

// ============================================================
// 1. Direct URL Fetches
// ============================================================
console.log('\n=== PHASE 1: Direct URL Fetches ===\n');

const directUrls = [
  {
    source: 'CMS',
    document: 'Reason Statements and eMDR Codes',
    url: 'https://www.cms.gov/data-research/computer-data-systems/esmd/reason-statements-and-document-emdr-codes',
    filename: 'cms_reason_statements_emdr.json'
  },
  {
    source: 'CMS',
    document: 'Medicare Claims Synthetic Public Use Files (SynPUFs)',
    url: 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-synthetic-public-use-files',
    filename: 'cms_synpufs.json'
  },
  {
    source: 'CMS',
    document: 'Medicare Claims Public-Use Files',
    url: 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-public-use-files',
    filename: 'cms_medicare_claims_puf.json'
  },
  {
    source: 'Medicare.gov',
    document: 'Appeals in Original Medicare (5 Levels)',
    url: 'https://www.medicare.gov/claims-appeals/appeals/original-medicare',
    filename: 'medicare_appeals_original.json'
  },
  {
    source: 'CMS',
    document: 'First Level of Appeal: Redetermination',
    url: 'https://www.cms.gov/medicare-claims-appeals/redetermination',
    filename: 'cms_redetermination.json'
  },
  {
    source: 'HHS',
    document: 'HIPAA De-identification Guidance',
    url: 'https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification/index.html',
    filename: 'hhs_hipaa_deidentification.json'
  },
  {
    source: 'CMS',
    document: 'Medicare Claims Appeals Overview',
    url: 'https://www.cms.gov/medicare-claims-appeals',
    filename: 'cms_claims_appeals_overview.json'
  },
  {
    source: 'CMS',
    document: 'Medicare Fee-for-Service Appeals Process',
    url: 'https://www.cms.gov/medicare-claims-appeals/rights-and-protections',
    filename: 'cms_appeals_rights_protections.json'
  }
];

for (const item of directUrls) {
  const filepath = fetchAndSave(item.source, item.document, item.url, item.filename);
  if (filepath) {
    manifest.push({ source: item.source, document: item.document, url: item.url, filename: item.filename, retrievedDate: TODAY });
    docCount++;
  }
}

// ============================================================
// 2. Web Search + Fetch for Additional Sources
// ============================================================
console.log('\n=== PHASE 2: Web Search + Fetch ===\n');

const searchTargets = [
  {
    source: 'CMS',
    document: 'CARC Claim Adjustment Reason Codes',
    query: 'CMS CARC claim adjustment reason codes list medicare denial',
    filename: 'cms_carc_codes.json'
  },
  {
    source: 'CMS',
    document: 'RARC Remittance Advice Remark Codes',
    query: 'CMS RARC remittance advice remark codes medicare',
    filename: 'cms_rarc_codes.json'
  },
  {
    source: 'KFF',
    document: 'Claims Denials and Appeals in Medicare Advantage',
    query: 'KFF Kaiser Family Foundation Medicare Advantage claims denials appeals data 2024',
    filename: 'kff_ma_denials_appeals.json'
  },
  {
    source: 'AHA',
    document: 'Hospital Denial Rate Data',
    query: 'AHA American Hospital Association denial rate data hospitals 2024',
    filename: 'aha_denial_rates.json'
  },
  {
    source: 'Health Affairs',
    document: 'Medicare Advantage Denial Rates Study',
    query: 'Health Affairs Medicare Advantage denial rates study research',
    filename: 'health_affairs_ma_denials.json'
  },
  {
    source: 'CMS',
    document: 'Medical Necessity Denial Criteria',
    query: 'CMS medical necessity denial criteria medicare coverage guidelines',
    filename: 'cms_medical_necessity.json'
  },
  {
    source: 'CMS',
    document: 'Prior Authorization Requirements Medicare',
    query: 'CMS prior authorization requirements Medicare fee-for-service 2024',
    filename: 'cms_prior_auth.json'
  },
  {
    source: 'CMS',
    document: 'Appeal Filing Deadlines by Level',
    query: 'Medicare appeals filing deadlines redetermination reconsideration ALJ levels time limits',
    filename: 'cms_appeal_deadlines.json'
  },
  {
    source: 'CMS',
    document: 'National Coverage Determinations (NCD)',
    query: 'CMS national coverage determinations NCD list medicare',
    filename: 'cms_ncd.json'
  },
  {
    source: 'CMS',
    document: 'Local Coverage Determinations (LCD)',
    query: 'CMS local coverage determinations LCD Medicare administrative contractors',
    filename: 'cms_lcd.json'
  },
  {
    source: 'CMS',
    document: 'Medicare Advantage Organization Determinations and Appeals',
    query: 'CMS Medicare Advantage organization determinations appeals process 42 CFR 422',
    filename: 'cms_ma_org_determinations.json'
  },
  {
    source: 'OIG',
    document: 'OIG Medicare Advantage Appeal Oversight',
    query: 'HHS OIG Medicare Advantage appeals oversight denials report',
    filename: 'oig_ma_appeals_oversight.json'
  },
  {
    source: 'CMS',
    document: 'eMDR Reason Statement Categories',
    query: 'CMS eMDR reason statement categories denial reason codes medical review',
    filename: 'cms_emdr_categories.json'
  },
  {
    source: 'CMS',
    document: 'Medicare Secondary Payer Denial Reasons',
    query: 'CMS Medicare secondary payer denial reasons codes',
    filename: 'cms_msp_denials.json'
  },
  {
    source: 'CMS',
    document: 'Claim Denial Reason Code Crosswalk',
    query: 'Medicare claim denial reason code crosswalk CARC RARC mapping',
    filename: 'cms_denial_code_crosswalk.json'
  }
];

for (const target of searchTargets) {
  console.log(`Searching: ${target.document}`);
  const searchResults = webSearch(target.query, 10);
  
  let bestUrl = null;
  let bestSnippet = '';
  
  if (searchResults && searchResults.results && searchResults.results.length > 0) {
    // Find the most relevant URL (prefer .gov, .org, .edu)
    const results = searchResults.results;
    for (const r of results) {
      if (!bestUrl && (r.url.includes('.gov') || r.url.includes('.org') || r.url.includes('.edu'))) {
        bestUrl = r.url;
        bestSnippet = r.snippet || r.description || '';
      }
    }
    if (!bestUrl && results[0]) {
      bestUrl = results[0].url;
      bestSnippet = results[0].snippet || results[0].description || '';
    }
    
    console.log(`  Best URL: ${bestUrl}`);
    
    // Try to fetch the page
    const pageData = pageReader(bestUrl);
    let content = '';
    let title = target.document;
    let description = bestSnippet;
    
    if (pageData) {
      content = extractTextFromHtml(pageData.html || '');
      title = pageData.title || target.document;
      description = pageData.description || bestSnippet;
    } else {
      // Use search results as content
      content = JSON.stringify(results.map(r => ({
        title: r.title || '',
        url: r.url,
        snippet: r.snippet || r.description || ''
      })), null, 2);
    }
    
    const doc = {
      source: target.source,
      document: target.document,
      url: bestUrl,
      retrievedDate: TODAY,
      title,
      description,
      content,
      searchResults: results.slice(0, 5).map(r => ({ title: r.title, url: r.url, snippet: r.snippet || r.description }))
    };
    
    const filepath = saveDocument(doc, target.filename);
    manifest.push({ source: target.source, document: target.document, url: bestUrl, filename: target.filename, retrievedDate: TODAY });
    docCount++;
  } else {
    console.log(`  No search results found for "${target.query}"`);
  }
}

// ============================================================
// 3. Additional deep-fetches from search result URLs
// ============================================================
console.log('\n=== PHASE 3: Deep Fetches from Key URLs ===\n');

const deepUrls = [
  {
    source: 'CMS',
    document: 'X12 835 Remittance Advice Codes',
    url: 'https://www.cms.gov/electronic-billing-ediac/edi-basics/remittance-advice-codes',
    filename: 'cms_835_remittance_codes.json'
  },
  {
    source: 'CMS',
    document: 'Medicare Coverage General Information',
    url: 'https://www.cms.gov/medicare-coverage-database/overview-and-general-information',
    filename: 'cms_coverage_general.json'
  },
  {
    source: 'CMS',
    document: 'MLN Matters Articles - Denials',
    url: 'https://www.cms.gov/medicare-coverage-database/search',
    filename: 'cms_mln_denials.json'
  },
  {
    source: 'GAO',
    document: 'GAO Medicare Advantage Appeals Report',
    url: 'https://www.gao.gov/products/gao-24-106714',
    filename: 'gao_ma_appeals.json'
  },
  {
    source: 'CMS',
    document: 'Reconsideration - Second Level Appeal',
    url: 'https://www.cms.gov/medicare-claims-appeals/reconsideration',
    filename: 'cms_reconsideration.json'
  },
  {
    source: 'CMS',
    document: 'ALJ Hearing - Third Level Appeal',
    url: 'https://www.cms.gov/medicare-claims-appeals/alj-hearing',
    filename: 'cms_alj_hearing.json'
  },
  {
    source: 'CMS',
    document: 'Council Review - Fourth Level Appeal',
    url: 'https://www.cms.gov/medicare-claims-appeals/council-review',
    filename: 'cms_council_review.json'
  },
  {
    source: 'CMS',
    document: 'Federal Court Review - Fifth Level Appeal',
    url: 'https://www.cms.gov/medicare-claims-appeals/federal-court-review',
    filename: 'cms_federal_court.json'
  }
];

for (const item of deepUrls) {
  const filepath = fetchAndSave(item.source, item.document, item.url, item.filename);
  if (filepath) {
    manifest.push({ source: item.source, document: item.document, url: item.url, filename: item.filename, retrievedDate: TODAY });
    docCount++;
  }
}

// ============================================================
// 4. Save Manifest
// ============================================================
console.log('\n=== Saving Manifest ===\n');

const manifestDoc = {
  generatedDate: TODAY,
  totalDocuments: docCount,
  documents: manifest
};

fs.writeFileSync(path.join(RAW_DIR, 'manifest.json'), JSON.stringify(manifestDoc, null, 2));
console.log(`Manifest saved: ${docCount} documents`);

console.log('\n=== DONE ===');
console.log(`Total documents fetched: ${docCount}`);
