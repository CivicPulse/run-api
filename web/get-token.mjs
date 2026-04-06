import { chromium } from 'playwright';

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

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
  const tok = await Promise.race([tokenPromise, new Promise((_, r) => setTimeout(() => r(new Error('token timeout')), 20000))]);
  await b.close();
  return tok;
}

const token = await getToken();
process.stdout.write(token);
