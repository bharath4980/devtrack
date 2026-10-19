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

test('CSV export downloads every owned application independent of list pagination', async ({ page }) => {
  await registerAndLogin(page);
  for (let i = 0; i < 12; i++) await seed(page, 'Export Company ' + i);
  await page.reload();

  await expect(page.getByRole('status').filter({ hasText: '12 applications' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^devtrack-applications-\d{4}-\d{2}-\d{2}\.csv$/);

  const response = await page.request.get('/api/applications/export.csv');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/csv');
  const content = await response.text();
  expect(content).toContain('Export Company 0');
  expect(content).toContain('Export Company 11');
  expect(content.split('\r\n')).toHaveLength(13);
  await expect(page.getByRole('heading', { name: 'Your applications' })).toBeVisible();
});

test('follow-up dates show due work and can be rescheduled', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Follow Up Corp');
  await form.getByLabel('Job title').fill('Platform Engineer');
  await form.getByLabel('Follow-up date').fill('2020-01-01');
  await form.getByRole('button', { name: 'Save application' }).click();

  await expect(page.locator('.due-follow-up')).toContainText('Follow Up Corp');
  await expect(page.locator('.due-follow-up .due-label')).toContainText(/\d+ days overdue/);
  const priority = page.getByRole('group', { name: 'Follow-up priorities' });
  await expect(priority).toContainText('1 overdue');
  await expect(priority).toContainText('0 due today');

  const card = page.getByRole('article', { name: 'Follow Up Corp — Platform Engineer' });
  await expect(card).toContainText('2020-01-01');
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Follow-up date').fill('2099-01-01');
  await card.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.locator('.due-follow-up')).toHaveCount(0);
  await expect(priority).toContainText('0 overdue');
  await page.reload();
  await expect(card).toContainText('2099-01-01');
  await expect(priority).toContainText('0 overdue');
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const dueForm = page.getByRole('form', { name: 'New application' });
  await dueForm.getByLabel('Company', { exact: true }).fill('Today Priority');
  await dueForm.getByLabel('Job title').fill('Engineer');
  await dueForm.getByLabel('Follow-up date').fill(new Date().toISOString().slice(0, 10));
  await dueForm.getByRole('button', { name: 'Save application' }).click();
  await expect(priority).toContainText('1 due today');
  await expect(page.locator('.due-follow-up').filter({ hasText: 'Today Priority' }))
    .toContainText('Due today');
});

test('job posting link fills editable details before saving', async ({ page }) => {
  await registerAndLogin(page);
  await page.route('**/api/job-postings/preview?**', async route => {
    const request = new URL(route.request().url());
    expect(request.searchParams.get('url')).toBe('https://boards.greenhouse.io/example/jobs/123456');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ company: 'Example', title: 'Backend Engineer', location: 'Remote' }),
    });
  });
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Job posting URL').fill('https://boards.greenhouse.io/example/jobs/123456');
  await form.getByRole('button', { name: 'Fill from job link' }).click();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('Example');
  await expect(form.getByLabel('Job title')).toHaveValue('Backend Engineer');
  await expect(form.getByLabel('Location')).toHaveValue('Remote');
  await form.getByLabel('Company', { exact: true }).fill('Example Labs');
  await form.getByRole('button', { name: 'Save application' }).click();
  const card = page.getByRole('article', { name: 'Example Labs — Backend Engineer' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Remote');
  await expect(card.getByRole('link', { name: 'View job posting' }))
    .toHaveAttribute('href', 'https://boards.greenhouse.io/example/jobs/123456');
});

test('Ashby job posting link fills editable details before saving', async ({ page }) => {
  await registerAndLogin(page);
  await page.route('**/api/job-postings/preview?**', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('url')).toBe(
      'https://jobs.ashbyhq.com/sampleco/22222222-2222-2222-2222-222222222222');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ company: 'Sampleco', title: 'Platform Engineer', location: 'Remote' }),
    });
  });
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Job posting URL').fill(
    'https://jobs.ashbyhq.com/sampleco/22222222-2222-2222-2222-222222222222');
  await form.getByRole('button', { name: 'Fill from job link' }).click();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('Sampleco');
  await expect(form.getByLabel('Job title')).toHaveValue('Platform Engineer');
  await expect(form.getByLabel('Location')).toHaveValue('Remote');
  await form.getByLabel('Company', { exact: true }).fill('Sample Company');
  await form.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('article', {
    name: 'Sample Company — Platform Engineer',
  })).toContainText('Remote');
});

test('SmartRecruiters job posting link fills editable details before saving', async ({ page }) => {
  await registerAndLogin(page);
  await page.route('**/api/job-postings/preview?**', async route => {
    const request = new URL(route.request().url());
    expect(request.searchParams.get('url')).toBe(
      'https://jobs.smartrecruiters.com/SampleCo/884352026-platform-engineer');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ company: 'Sample Company', title: 'Platform Engineer', location: 'Remote - US' }),
    });
  });
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Job posting URL').fill(
    'https://jobs.smartrecruiters.com/SampleCo/884352026-platform-engineer');
  await form.getByRole('button', { name: 'Fill from job link' }).click();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('Sample Company');
  await expect(form.getByLabel('Job title')).toHaveValue('Platform Engineer');
  await expect(form.getByLabel('Location')).toHaveValue('Remote - US');
  await form.getByLabel('Company', { exact: true }).fill('Example Systems');
  await form.getByRole('button', { name: 'Save application' }).click();
  const card = page.getByRole('article', { name: 'Example Systems — Platform Engineer' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: 'View job posting' }))
    .toHaveAttribute('href', 'https://jobs.smartrecruiters.com/SampleCo/884352026-platform-engineer');
});

test('dashboard metrics, distribution and navigation reflect saved applications', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Alpha Company');
  await seed(page, 'Beta Company');
  await page.reload();

  const overview = page.getByRole('region', { name: 'Dashboard' });
  await expect(overview.getByRole('heading', { name: 'Your search, at a glance' })).toBeVisible();
  await expect(overview.locator('.kpi-card').filter({ hasText: 'Total applications' })).toContainText('2');
  await expect(overview.getByRole('img', { name: /Pipeline: 2 saved/ })).toBeVisible();
  await expect(overview.locator('.legend-item')).toHaveCount(5);
  await expect(overview.getByRole('region', { name: 'Recorded activity by week' })
    .getByRole('img')).toHaveAttribute('aria-label', /2 created, 0 status changes/);
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: 'Applications' }).click();
  await expect(page).toHaveURL(/#applications$/);
  await expect(page.getByRole('heading', { name: 'Your applications' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('heading', { name: 'Make every application count.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('existing applications without history show a truthful status snapshot', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Legacy Company');
  await page.reload();

  // Existing records from before history tracking have no recorded events.
  await page.route('**/api/applications/*/activity', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));

  const card = page.getByRole('article', { name: 'Legacy Company — Software Engineer' });
  await card.getByRole('button', { name: 'View history' }).click();

  const snapshot = card.getByLabel('Current status snapshot');
  await expect(snapshot).toContainText('Current status: Saved');
  await expect(snapshot).toContainText('Snapshot only · not a recorded event');
  await expect(snapshot).toContainText('Earlier changes were not recorded.');
  await expect(card.locator('.timeline-list li')).toHaveCount(0);
  await expect(snapshot.locator('time')).toHaveCount(0);
});

test('application history and analytics reflect status transitions', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Metrics Company');
  await form.getByLabel('Job title').fill('Site Reliability Engineer');
  await form.getByRole('button', { name: 'Save application' }).click();

  const card = page.getByRole('article', { name: 'Metrics Company — Site Reliability Engineer' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'View history' }).click();
  await expect(card.getByLabel('Application activity')).toContainText('Application saved');

  await card.getByLabel('Status', { exact: true }).selectOption('INTERVIEW');
  // The application list refreshes after a mutation, remounting the collapsed history panel.
  await card.getByRole('button', { name: 'View history' }).click();
  await expect(card.getByLabel('Application activity')).toContainText('Status changed: Saved → Interview');
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  await expect(page.locator('.recent-list')).toContainText('Metrics Company');
  await expect(page.getByRole('heading', { name: 'Application outcomes' })).toBeVisible();
  await expect(page.locator('.insights-grid')).toContainText('100%');
  await expect(page.getByRole('img', { name: /Applications by month:/ })).toBeVisible();
  const weekly = page.getByRole('region', { name: 'Recorded activity by week' });
  await expect(weekly).toBeVisible();
  await expect(weekly.getByRole('img')).toHaveAttribute('aria-label', /1 created, 1 status changes/);
  await expect(weekly).toContainText('Changes made before activity tracking began were not backfilled.');
  await page.reload();
  await card.getByRole('button', { name: 'View history' }).click();
  await expect(card.getByLabel('Application activity')).toContainText('Status changed: Saved → Interview');
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
