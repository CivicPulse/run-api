import { chromium } from 'playwright';

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;
const PREFIX = process.env.PREFIX; // e.g., "TestA" or "TestB"

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
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const token = await getToken();
console.log('Got token');

const results = { voters: [], tag: null, list: null, turf: null, walkList: null, callList: null, survey: null, volunteers: [] };

// 1. 10 voters
for (let i = 1; i <= 10; i++) {
  const party = i % 3 === 0 ? 'Democrat' : i % 3 === 1 ? 'Republican' : 'Independent';
  const day = String((i % 9) + 1).padStart(2, '0');
  const r = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/voters`, {
    first_name: `${PREFIX}${i}`,
    last_name: 'Voter',
    birth_date: `1980-01-${day}`,
    party,
    address_line_1: `${100 + i} Test St`,
    city: 'Macon',
    state: 'GA',
    zip_code: '31201',
  }, token);
  results.voters.push({ i, status: r.status, id: r.data.id, name: r.data.first_name });
  if (r.status >= 300) console.error(`voter ${i} FAIL:`, r.status, JSON.stringify(r.data).slice(0, 200));
}
console.log(`voters created: ${results.voters.filter(v => v.status < 300).length}/10`);

// 2. tag
const tagR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/voter-tags`, { name: 'HighPropensity', color: 'blue' }, token);
results.tag = { status: tagR.status, id: tagR.data.id };
console.log('tag:', tagR.status, tagR.data.id);
if (tagR.status >= 300) console.error('tag FAIL:', JSON.stringify(tagR.data).slice(0, 300));

// 3. list + members
const listR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/voter-lists`, { name: 'QA Seed List', description: 'Phase 00 baseline', is_dynamic: false }, token);
results.list = { status: listR.status, id: listR.data.id };
console.log('list:', listR.status, listR.data.id);
if (listR.status < 300 && listR.data.id) {
  const voterIds = results.voters.filter(v => v.status < 300).slice(0, 5).map(v => v.id);
  const mR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/voter-lists/${listR.data.id}/members`, { voter_ids: voterIds }, token);
  console.log('list members:', mR.status);
  if (mR.status >= 300) console.error('list members FAIL:', JSON.stringify(mR.data).slice(0, 300));
}

// 4. turf
const geojson = { type: 'Polygon', coordinates: [[[-83.640,32.840],[-83.630,32.840],[-83.635,32.850],[-83.640,32.840]]] };
const turfR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/turfs`, { name: `QA Turf ${PREFIX}`, geometry: geojson }, token);
results.turf = { status: turfR.status, id: turfR.data.id };
console.log('turf:', turfR.status, turfR.data.id);
if (turfR.status >= 300) console.error('turf FAIL:', JSON.stringify(turfR.data).slice(0, 300));

// 5. walk list, call list, survey
const walkR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/walk-lists`, { name: `QA Walk ${PREFIX}`, turf_id: turfR.data.id }, token);
results.walkList = { status: walkR.status, id: walkR.data.id };
console.log('walk list:', walkR.status, walkR.data.id);
if (walkR.status >= 300) console.error('walk list FAIL:', JSON.stringify(walkR.data).slice(0, 300));

const callR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/call-lists`, { name: `QA Call ${PREFIX}`, voter_list_id: listR.data.id }, token);
results.callList = { status: callR.status, id: callR.data.id };
console.log('call list:', callR.status, callR.data.id);
if (callR.status >= 300) console.error('call list FAIL:', JSON.stringify(callR.data).slice(0, 300));

const surveyR = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/surveys`, { name: `QA Survey ${PREFIX}`, description: 'Phase 00', is_active: true }, token);
results.survey = { status: surveyR.status, id: surveyR.data.id };
console.log('survey:', surveyR.status, surveyR.data.id);
if (surveyR.status >= 300) console.error('survey FAIL:', JSON.stringify(surveyR.data).slice(0, 300));

// 6. 3 volunteers
for (let i = 1; i <= 3; i++) {
  const suffix = PREFIX.slice(-1).toLowerCase();
  const r = await api('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/volunteers`, {
    first_name: `Vol${i}`,
    last_name: 'Test',
    email: `vol${i}.${suffix}@civpulse.test`,
  }, token);
  results.volunteers.push({ i, status: r.status, id: r.data.id });
  if (r.status >= 300) console.error(`volunteer ${i} FAIL:`, JSON.stringify(r.data).slice(0, 200));
}
console.log(`volunteers created: ${results.volunteers.filter(v => v.status < 300).length}/3`);

console.log('\n=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));
