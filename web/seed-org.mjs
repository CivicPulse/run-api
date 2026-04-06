import { chromium } from 'playwright';

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;
const PREFIX = process.env.PREFIX; // e.g., "TestA" / "TestB"
const SKIP_VOTERS = process.env.SKIP_VOTERS === '1';
const SKIP_VOLUNTEERS = process.env.SKIP_VOLUNTEERS === '1';
const SKIP_CALL_LIST = process.env.SKIP_CALL_LIST === '1';

async function getToken() {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  const tokenPromise = new Promise((resolve) => {
    p.on('request', (req) => {
      const h = req.headers();
      if (h.authorization?.startsWith('Bearer ')) resolve(h.authorization.slice(7));
    });
  });
  await p.goto('https://run.civpulse.org');
  await p.waitForSelector('input');
  await p.locator('input').first().fill(EMAIL);
  await p.getByRole('button', { name: /continue|next|log ?in|sign ?in/i }).click();
  await p.waitForSelector('input[type=password]');
  await p.locator('input[type=password]').fill(PASSWORD);
  await p.getByRole('button', { name: /continue|next|log ?in|sign ?in/i }).click();
  await p.waitForURL(/run\.civpulse\.org\/($|campaigns|field|org)/);
  const tok = await Promise.race([tokenPromise, new Promise((_, r) => setTimeout(() => r(new Error('token timeout')), 15000))]);
  await b.close();
  return tok;
}

async function api(method, path, body, token) {
  const res = await fetch(`https://run.civpulse.org${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const token = await getToken();
console.log('Got token');

const result = {};

// Fetch existing voters
const listR = await api('GET', `/api/v1/campaigns/${CAMPAIGN_ID}/voters?page_size=50`, null, token);
const existingVoters = (listR.data.items || []).filter(v => v.first_name?.startsWith(PREFIX));
console.log(`Existing ${PREFIX} voters: ${existingVoters.length}`);

// Create voters if needed
const voters = [...existingVoters];
if (!SKIP_VOTERS) {
  for (let i = voters.length + 1; i <= 10; i++) {
    const party = i % 3 === 0 ? 'Democrat' : i % 3 === 1 ? 'Republican' : 'Independent';
    const day = String((i % 9) + 1).padStart(2, '0');
    const r = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/voters`, {
      first_name: `${PREFIX}${i}`, last_name: 'Voter', birth_date: `1980-01-${day}`, party,
      address_line_1: `${100 + i} Test St`, city: 'Macon', state: 'GA', zip_code: '31201',
    }, token);
    if (r.status >= 300) { console.error(`voter ${i} FAIL:`, r.status, JSON.stringify(r.data).slice(0,200)); }
    else { voters.push(r.data); }
  }
}
result.voters = voters.length;
console.log(`voters total: ${voters.length}`);

// Tag — schema: {name}
const tagR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/tags`, { name: 'HighPropensity' }, token);
result.tag = { status: tagR.status, id: tagR.data?.id, detail: tagR.status>=300 ? tagR.data : undefined };
console.log(`tag: ${tagR.status}${tagR.data?.id ? ' id='+tagR.data.id : ''}`);

// List (static) — schema: {name, list_type}
const listCreateR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/lists`, { name: 'QA Seed List', description: 'Phase 00', list_type: 'static' }, token);
result.list = { status: listCreateR.status, id: listCreateR.data?.id, detail: listCreateR.status>=300 ? listCreateR.data : undefined };
console.log(`list: ${listCreateR.status}${listCreateR.data?.id ? ' id='+listCreateR.data.id : ''}`);

if (listCreateR.status < 300 && listCreateR.data?.id && voters.length >= 5) {
  const voterIds = voters.slice(0, 5).map(v => v.id);
  const mR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/lists/${listCreateR.data.id}/members`, { voter_ids: voterIds }, token);
  result.listMembers = { status: mR.status, detail: mR.status>=300 ? mR.data : undefined };
  console.log(`list members: ${mR.status}`);
}

// Turf — schema: {name, boundary}
const boundary = { type: 'Polygon', coordinates: [[[-83.640,32.840],[-83.630,32.840],[-83.635,32.850],[-83.640,32.840]]] };
const turfR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/turfs`, { name: `QA Turf ${PREFIX}`, boundary, description: 'Phase 00' }, token);
result.turf = { status: turfR.status, id: turfR.data?.id, detail: turfR.status>=300 ? turfR.data : undefined };
console.log(`turf: ${turfR.status}${turfR.data?.id ? ' id='+turfR.data.id : ''}`);

// Walk list
if (turfR.data?.id) {
  const walkR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/walk-lists`, { name: `QA Walk ${PREFIX}`, turf_id: turfR.data.id }, token);
  result.walkList = { status: walkR.status, id: walkR.data?.id, detail: walkR.status>=300 ? walkR.data : undefined };
  console.log(`walk list: ${walkR.status}${walkR.data?.id ? ' id='+walkR.data.id : ''}`);
}

// Call list
if (!SKIP_CALL_LIST) {
  const callR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/call-lists`, { name: `QA Call ${PREFIX}`, voter_list_id: listCreateR.data?.id }, token);
  result.callList = { status: callR.status, id: callR.data?.id, detail: callR.status>=300 ? callR.data : undefined };
  console.log(`call list: ${callR.status}${callR.data?.id ? ' id='+callR.data.id : ''}`);
}

// Survey — schema: {title}
const surveyR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/surveys`, { title: `QA Survey ${PREFIX}`, description: 'Phase 00' }, token);
result.survey = { status: surveyR.status, id: surveyR.data?.id, detail: surveyR.status>=300 ? surveyR.data : undefined };
console.log(`survey: ${surveyR.status}${surveyR.data?.id ? ' id='+surveyR.data.id : ''}`);

// Volunteers
if (!SKIP_VOLUNTEERS) {
  const vols = [];
  const suffix = PREFIX.slice(-1).toLowerCase();
  for (let i = 1; i <= 3; i++) {
    const r = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/volunteers`, {
      first_name: `Vol${i}`, last_name: 'Test', email: `vol${i}.${suffix}@civpulse.test`,
    }, token);
    vols.push({ status: r.status, id: r.data?.id });
    if (r.status >= 300) console.error(`volunteer ${i} FAIL:`, JSON.stringify(r.data).slice(0,200));
  }
  result.volunteers = vols;
}

console.log('\n=== RESULT ===');
console.log(JSON.stringify(result, null, 2));
