import { test, expect, type Page } from '@playwright/test';

async function registerAndLogin(page: Page) {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const password = 'test-password-for-devtrack';
  await page.goto('/');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Account created');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your applications' })).toBeVisible();
  return { email, password };
}

async function seed(page: Page, company: string) {
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const result = await page.request.post('/api/applications', {
    headers: { [csrf.headerName]: csrf.token },
    data: { company, title: 'Software Engineer', applicationDate: '2026-09-28', postingUrl: '', notes: '' },
  });
  expect(result.status()).toBe(201);
  return result.json();
}

test('register, create, edit, interview, filter, persist, delete and logout', async ({ page }) => {
  const account = await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Acme');
  await form.getByLabel('Job title').fill('Software Engineer');
  await form.getByLabel('Location').fill('Houston');
  await form.getByLabel('Notes').fill('Ask about the backend team.');
  await form.getByRole('button', { name: 'Save application' }).click();
  const card = page.getByRole('article', { name: 'Acme — Software Engineer' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await card.getByLabel('Company', { exact: true }).fill('Acme Labs');
  const interviewDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await card.getByLabel('Interview date').fill(interviewDate);
  await card.getByRole('button', { name: 'Save changes' }).click();
  const edited = page.getByRole('article', { name: 'Acme Labs — Software Engineer' });
  await edited.getByLabel('Status', { exact: true }).selectOption('INTERVIEW');
  await expect(page.locator('.upcoming-interview')).toContainText('Acme Labs');
  await page.getByLabel('Search', { exact: true }).fill('Houston');
  await page.getByLabel('Status filter').selectOption('INTERVIEW');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(edited).toBeVisible();
  await page.getByLabel('Search', { exact: true }).fill('missing company');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No matches. Try another search or clear your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.reload();
  await expect(edited).toContainText('Ask about the backend team.');
  await page.locator('main').screenshot({ path: test.info().outputPath('dashboard.png') });
  page.once('dialog', dialog => dialog.dismiss());
  await edited.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(edited).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await edited.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(edited).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect((await page.request.get('/api/applications')).status()).toBe(401);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your list is empty.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('pagination and sorting recover after deleting the last page', async ({ page }) => {
  await registerAndLogin(page);
  for (let i = 0; i < 11; i++) await seed(page, `Company ${String(i).padStart(2, '0')}`);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.getByLabel('Sort by').selectOption('COMPANY');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('article').first()).toContainText('Company 00');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Company 10');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(10);
  await expect(page.getByRole('navigation', { name: 'Application pages' })).toHaveCount(0);
});

test('validation details survive API failures and expired sessions clear private data', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  await page.getByLabel('Company', { exact: true }).fill('   ');
  await page.getByLabel('Job title').fill('Engineer');
  await page.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('alert')).toContainText('Validation failed');
  await expect(page.getByLabel('Company', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Company', { exact: true }).fill('Private Company');
  await page.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('article')).toContainText('Private Company');
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  await page.request.post('/api/auth/logout', { headers: { [csrf.headerName]: csrf.token } });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByText('Private Company', { exact: true })).toHaveCount(0);
});

test('signing into another account never shows the previous account data', async ({ page }) => {
  const first = await registerAndLogin(page);
  const record = await seed(page, 'First account only');
  await page.reload();
  await expect(page.getByRole('article')).toContainText('First account only');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await registerAndLogin(page);
  await expect(page.getByText('Your list is empty.', { exact: false })).toBeVisible();
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const forbidden = await page.request.delete(`/api/applications/${record.id}`, { headers: { [csrf.headerName]: csrf.token } });
  expect(forbidden.status()).toBe(404);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(first.email);
  await page.getByLabel('Password', { exact: true }).fill(first.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('article')).toContainText('First account only');
});

test('a superseded search is cancelled while the newer filter wins', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Current result');
  let release!: () => void;
  let seen!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { seen = resolve; });
  await page.route('**/api/applications?**', async route => {
    if (new URL(route.request().url()).searchParams.get('search') !== 'slow') return route.continue();
    seen();
    await gate;
    await route.fulfill({ json: { items: [], page: 0, size: 10, totalElements: 0, totalPages: 0 } }).catch(() => {});
  });
  await page.getByLabel('Search', { exact: true }).fill('slow');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await started;
  const cancelled = page.waitForEvent('requestfailed', { predicate: request => new URL(request.url()).searchParams.get('search') === 'slow' });
  await page.getByLabel('Search', { exact: true }).fill('Current');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await cancelled;
  release();
  await expect(page.getByRole('article')).toContainText('Current result');
});
