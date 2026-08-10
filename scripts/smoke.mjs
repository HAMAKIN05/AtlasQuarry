const baseUrl = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

async function check(path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  if (response.status !== expectedStatus) {
    throw new Error(`${path}: expected ${expectedStatus}, got ${response.status}`);
  }
  return response;
}

const health = await check('/api/health', 200);
const body = await health.json();
if (body.status !== 'ok') throw new Error(`/api/health: unexpected status ${body.status}`);

const login = await check('/login', 200);
const html = await login.text();
if (!html.includes('<title>')) throw new Error('/login: title is missing');

console.log(`smoke: ok (${baseUrl})`);
