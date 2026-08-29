import { test, type BrowserContext } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4321';

async function setProxyOriginOffline(offline: boolean) {
  const control = new URL(`/__rr5-network/${offline ? 'offline' : 'online'}`, baseURL);
  const response = await fetch(control, { method: 'POST' });
  if (!response.ok) throw new Error(`RR5 offline proxy control failed with ${response.status}.`);
}

export async function setRr5Offline(context: BrowserContext, offline: boolean) {
  if (test.info().project.name === 'webkit-offline') {
    await setProxyOriginOffline(offline);
    return;
  }
  await context.setOffline(offline);
}
