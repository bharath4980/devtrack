import type { FullConfig } from '@playwright/test';

export default async function setup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).status === 'UP') return;
    } catch { /* The disposable application may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Test application did not become healthy. Start compose.test.yaml first.');
}
