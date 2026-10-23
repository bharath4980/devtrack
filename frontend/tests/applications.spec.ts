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

test('interview preparation creates, updates, persists and deletes a round', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Interview Studio');
  await page.reload();

  const card = page.getByRole('article', { name: 'Interview Studio — Software Engineer' });
  await card.getByRole('button', { name: 'Interview prep' }).click();
  const workspace = card.getByRole('region', { name: 'Interview preparation' });
  await expect(workspace.getByText('No rounds yet.', { exact: false })).toBeVisible();
  await workspace.getByRole('button', { name: 'Add interview round' }).click();
  const form = workspace.getByRole('form', { name: 'Interview round form' });
  await form.getByLabel('Round name').fill('Technical screen');
  await form.getByLabel('Scheduled date').fill('2026-11-02');
  await form.getByLabel('Format').selectOption('VIDEO');
  await form.getByLabel('Recruiter or interviewer').fill('Jordan');
  await form.getByLabel('Contact email').fill('jordan@example.com');
  await form.getByLabel('Preparation notes').fill('Practice APIs and SQL');
  await form.getByLabel('Follow-up notes').fill('Ask about team goals');
  await form.getByRole('button', { name: 'Save interview round' }).click();
  const round = workspace.getByRole('article', { name: 'Technical screen' });
  await expect(round).toContainText('Practice APIs and SQL');
  await expect(round).toContainText('jordan@example.com');

  await page.reload();
  const reopened = page.getByRole('article', { name: 'Interview Studio — Software Engineer' });
  await reopened.getByRole('button', { name: 'Interview prep' }).click();
  const restored = reopened.getByRole('region', { name: 'Interview preparation' });
  const storedRound = restored.getByRole('article', { name: 'Technical screen' });
  await expect(storedRound).toContainText('Ask about team goals');
  await storedRound.getByRole('button', { name: 'Edit round' }).click();
  const edit = restored.getByRole('form', { name: 'Interview round form' });
  await edit.getByLabel('Outcome').selectOption('COMPLETED');
  await edit.getByLabel('Follow-up notes').fill('Sent thank-you note');
  await edit.getByRole('button', { name: 'Save interview round' }).click();
  await expect(restored.getByRole('article', { name: 'Technical screen' })).toContainText('Completed');
  await expect(restored.getByRole('article', { name: 'Technical screen' })).toContainText('Sent thank-you note');

  page.once('dialog', dialog => dialog.dismiss());
  await restored.getByRole('button', { name: 'Delete round' }).click();
  await expect(restored.getByRole('article', { name: 'Technical screen' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await restored.getByRole('button', { name: 'Delete round' }).click();
  await expect(restored.getByText('No rounds yet.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('dashboard shows newly scheduled interview rounds and opens the application', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Scheduled Studio');
  await page.reload();

  const upcomingRounds = page.getByRole('region', { name: 'Upcoming interview rounds' });
  await expect(upcomingRounds).toContainText('No planned interview rounds.');

  const card = page.getByRole('article', { name: 'Scheduled Studio — Software Engineer' });
  await card.getByRole('button', { name: 'Interview prep' }).click();
  const prep = card.getByRole('region', { name: 'Interview preparation' });
  await prep.getByRole('button', { name: 'Add interview round' }).click();
  const form = prep.getByRole('form', { name: 'Interview round form' });
  const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await form.getByLabel('Round name').fill('Technical interview');
  await form.getByLabel('Scheduled date').fill(date);
  await form.getByLabel('Preparation notes').fill('Keep these notes private');
  await form.getByRole('button', { name: 'Save interview round' }).click();

  await expect(upcomingRounds).toContainText('Technical interview');
  await expect(upcomingRounds).toContainText('Scheduled Studio');
  await expect(upcomingRounds).not.toContainText('Keep these notes private');
  await expect(upcomingRounds.locator('time')).toHaveAttribute('datetime', date);
  await upcomingRounds.getByRole('button', { name: 'Open application' }).click();
  const quickView = page.getByRole('region', { name: 'Application quick view' });
  await expect(quickView).toContainText('Scheduled Studio');
  const quickPrep = quickView.getByRole('region', { name: 'Interview preparation' });
  await expect(quickPrep.getByRole('article', { name: 'Technical interview' }))
    .toContainText('Keep these notes private');

  await quickPrep.getByRole('article', { name: 'Technical interview' })
    .getByRole('button', { name: 'Edit round' }).click();
  const edit = quickPrep.getByRole('form', { name: 'Interview round form' });
  await edit.getByLabel('Outcome').selectOption('COMPLETED');
  await edit.getByRole('button', { name: 'Save interview round' }).click();
  await expect(upcomingRounds).toContainText('No planned interview rounds.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('bulk status change confirms before moving selected applications and records each change', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Batch Alpha');
  await seed(page, 'Batch Beta');
  await seed(page, 'Batch Gamma');
  await page.reload();

  const alpha = page.getByRole('article', { name: 'Batch Alpha — Software Engineer' });
  const beta = page.getByRole('article', { name: 'Batch Beta — Software Engineer' });
  const gamma = page.getByRole('article', { name: 'Batch Gamma — Software Engineer' });
  await alpha.getByRole('checkbox', { name: 'Select Batch Alpha — Software Engineer' }).check();
  await beta.getByRole('checkbox', { name: 'Select Batch Beta — Software Engineer' }).check();
  const toolbar = page.getByRole('group', { name: 'Bulk status actions' });
  await expect(toolbar).toContainText('2 selected on this page');
  await toolbar.getByLabel('Move selected to').selectOption('APPLIED');

  page.once('dialog', dialog => dialog.dismiss());
  await toolbar.getByRole('button', { name: 'Move selected' }).click();
  await expect(alpha.getByLabel('Status', { exact: true })).toHaveValue('SAVED');
  await expect(beta.getByLabel('Status', { exact: true })).toHaveValue('SAVED');

  page.once('dialog', dialog => dialog.accept());
  await toolbar.getByRole('button', { name: 'Move selected' }).click();
  await expect(alpha.getByLabel('Status', { exact: true })).toHaveValue('APPLIED');
  await expect(beta.getByLabel('Status', { exact: true })).toHaveValue('APPLIED');
  await expect(gamma.getByLabel('Status', { exact: true })).toHaveValue('SAVED');
  await expect(toolbar).toContainText('0 selected on this page');
  await expect(page.getByText('2 applications moved to Applied.')).toBeVisible();
  await page.reload();
  await expect(alpha.getByLabel('Status', { exact: true })).toHaveValue('APPLIED');
  await expect(beta.getByLabel('Status', { exact: true })).toHaveValue('APPLIED');
  await expect(gamma.getByLabel('Status', { exact: true })).toHaveValue('SAVED');
});

test('bulk status selection never includes applications from another page', async ({ page }) => {
  await registerAndLogin(page);
  for (let i = 0; i < 11; i++) await seed(page, 'Page Batch ' + i);
  await page.reload();
  const toolbar = page.getByRole('group', { name: 'Bulk status actions' });
  await toolbar.getByRole('checkbox', { name: 'Select all applications on this page' }).check();
  await expect(toolbar).toContainText('10 selected on this page');
  await toolbar.getByLabel('Move selected to').selectOption('APPLIED');
  page.once('dialog', dialog => dialog.accept());
  await toolbar.getByRole('button', { name: 'Move selected' }).click();
  await expect(toolbar).toContainText('0 selected on this page');
  await page.getByLabel('Status filter').selectOption('SAVED');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('article', { name: 'Page Batch 0 — Software Engineer' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(toolbar).toContainText('0 selected on this page');
  await toolbar.getByRole('checkbox', { name: 'Select all applications on this page' }).check();
  await page.getByRole('button', { name: 'Board view' }).click();
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('group', { name: 'Bulk status actions' })).toContainText('0 selected on this page');
});

test('pipeline board moves applications by stage selector and stays in sync with list and dashboard', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Board Example');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  const board = page.getByRole('region', { name: 'Application pipeline board' });
  const saved = board.getByRole('region', { name: 'Saved stage' });
  const applied = board.getByRole('region', { name: 'Applied stage' });
  const card = saved.getByRole('article', { name: 'Board Example — Software Engineer' });
  await expect(card).toBeVisible();
  await expect(saved.getByLabel('1 applications')).toBeVisible();
  await card.getByLabel('Move to stage').selectOption('APPLIED');
  await expect(applied.getByRole('article', { name: 'Board Example — Software Engineer' })).toBeVisible();
  await expect(saved.getByLabel('0 applications')).toBeVisible();
  await page.getByRole('button', { name: 'List view' }).click();
  const listCard = page.getByRole('article', { name: 'Board Example — Software Engineer' });
  await expect(listCard.getByLabel('Status', { exact: true })).toHaveValue('APPLIED');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(board.getByRole('region', { name: 'Applied stage' })
    .getByRole('article', { name: 'Board Example — Software Engineer' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('pipeline board loads later pages instead of silently hiding applications', async ({ page }) => {
  await registerAndLogin(page);
  for (let i = 0; i < 22; i++) await seed(page, 'Board Company ' + i);
  await page.getByRole('button', { name: 'Board view' }).click();
  const saved = page.getByRole('region', { name: 'Saved stage' });
  await expect(saved.getByRole('article')).toHaveCount(20);
  await expect(saved.getByLabel('22 applications')).toBeVisible();
  await saved.getByRole('button', { name: 'Load more (20 of 22)' }).click();
  await expect(saved.getByRole('article')).toHaveCount(22);
  await expect(saved.getByRole('button', { name: 'Load more (20 of 22)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'List view' }).click();
  await page.getByLabel('Search', { exact: true }).fill('not listed');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No matches. Try another search or clear your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(page.getByRole('region', { name: 'Saved stage' })
    .getByRole('article')).toHaveCount(20);
});

test('dragging a pipeline card changes its saved stage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Mobile uses the accessible stage selector.');
  await registerAndLogin(page);
  await seed(page, 'Drag Example');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  const board = page.getByRole('region', { name: 'Application pipeline board' });
  const saved = board.getByRole('region', { name: 'Saved stage' });
  const applied = board.getByRole('region', { name: 'Applied stage' });
  const card = saved.getByRole('article', { name: 'Drag Example — Software Engineer' });
  await expect(card).toBeVisible();
  await card.dragTo(applied);
  await expect(applied.getByRole('article', { name: 'Drag Example — Software Engineer' })).toBeVisible();
  await expect(saved.getByRole('article')).toHaveCount(0);
});

test('board application details open and edit without switching to the list', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Detail Example');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  const saved = page.getByRole('region', { name: 'Saved stage' });
  const card = saved.getByRole('article', { name: 'Detail Example — Software Engineer' });
  await card.getByRole('button', { name: 'View details' }).click();
  const details = page.getByRole('region', { name: 'Application details' });
  await expect(details).toContainText('Detail Example');
  await expect(details).toContainText('Software Engineer');
  await details.getByRole('button', { name: 'Edit application' }).click();
  const form = details.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Job title').fill('Senior Platform Engineer');
  await form.getByLabel('Notes').fill('Confirm team structure and responsibilities.');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(details).toContainText('Senior Platform Engineer');
  await expect(details).toContainText('Confirm team structure and responsibilities.');
  await expect(saved.getByRole('article', { name: 'Detail Example — Senior Platform Engineer' })).toBeVisible();
  await details.getByRole('button', { name: 'Close details' }).click();
  await expect(details).toHaveCount(0);
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('article', { name: 'Detail Example — Senior Platform Engineer' }))
    .toContainText('Confirm team structure and responsibilities.');
});

test('board searches full account data and can filter stages independently of list', async ({ page }) => {
  await registerAndLogin(page);
  for (let i = 0; i < 22; i++) await seed(page, 'Searchable Company ' + i);
  await page.getByRole('button', { name: 'Board view' }).click();
  const board = page.getByRole('region', { name: 'Application pipeline board' });
  await board.getByLabel('Search board').fill('Searchable Company 21');
  await board.getByRole('button', { name: 'Apply', exact: true }).click();
  const saved = board.getByRole('region', { name: 'Saved stage' });
  await expect(saved.getByRole('article', { name: 'Searchable Company 21 — Software Engineer' }))
    .toBeVisible();
  await expect(saved.getByRole('article')).toHaveCount(1);
  await board.getByLabel('Show stages').selectOption('APPLIED');
  await board.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(board.getByRole('region', { name: 'Saved stage' })).toHaveCount(0);
  await expect(board.getByRole('region', { name: 'Applied stage' }).getByRole('article'))
    .toHaveCount(0);
  await board.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(board.getByRole('region', { name: 'Saved stage' }).getByRole('article')).toHaveCount(20);
  await expect(board.getByRole('region', { name: 'Applied stage' })).toBeVisible();
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('article')).toHaveCount(10);
});

test('board highlights actionable dates and stacks columns on mobile', async ({ page }, testInfo) => {
  await registerAndLogin(page);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  for (const [company, date] of [['Overdue Corp', yesterday], ['Upcoming Corp', tomorrow]]) {
    const result = await page.request.post('/api/applications', {
      headers: { [csrf.headerName]: csrf.token },
      data: { company, title: 'Engineer', applicationDate: '2026-10-20', postingUrl: '',
        notes: '', followUpDate: date },
    });
    expect(result.status()).toBe(201);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  const board = page.getByRole('region', { name: 'Application pipeline board' });
  await expect(board.getByRole('article', { name: 'Overdue Corp — Engineer' }))
    .toContainText('Follow-up overdue');
  await expect(board.getByRole('article', { name: 'Upcoming Corp — Engineer' }))
    .toContainText('Follow-up in 1 day');
  if (testInfo.project.name === 'mobile') {
    const positions = await board.getByRole('region', { name: 'Saved stage' }).boundingBox();
    const applied = await board.getByRole('region', { name: 'Applied stage' }).boundingBox();
    expect(positions).not.toBeNull();
    expect(applied).not.toBeNull();
    expect(applied!.y).toBeGreaterThan(positions!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('dashboard actions open the exact application for editing and history', async ({ page }) => {
  await registerAndLogin(page);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const headers = { [csrf.headerName]: csrf.token };
  const dueResponse = await page.request.post('/api/applications', {
    headers,
    data: { company: 'Quick Access Labs', title: 'Platform Engineer',
      applicationDate: '2026-10-20', followUpDate: yesterday,
      postingUrl: '', notes: 'Email hiring manager after the application.' },
  });
  expect(dueResponse.status()).toBe(201);
  const dueId = (await dueResponse.json()).id;
  const interviewResponse = await page.request.post('/api/applications', {
    headers,
    data: { company: 'Interview Works', title: 'Backend Engineer',
      applicationDate: '2026-10-20', interviewDate: tomorrow,
      postingUrl: '', notes: 'Ask about backend architecture.' },
  });
  expect(interviewResponse.status()).toBe(201);
  const interviewId = (await interviewResponse.json()).id;
  const scheduled = await page.request.put('/api/applications/' + interviewId, {
    headers,
    data: { company: 'Interview Works', title: 'Backend Engineer',
      applicationDate: '2026-10-20', interviewDate: tomorrow,
      followUpDate: null, location: '', postingUrl: '',
      notes: 'Ask about backend architecture.' },
  });
  expect(scheduled.ok()).toBe(true);
  const transition = await page.request.patch('/api/applications/' + interviewId + '/status', {
    headers, data: { status: 'INTERVIEW' },
  });
  expect(transition.ok()).toBe(true);
  await page.reload();

  const due = page.locator('.due-follow-up').filter({ hasText: 'Quick Access Labs' });
  await due.getByRole('button', { name: 'Open application' }).click();
  const view = page.getByRole('region', { name: 'Application quick view' });
  await expect(view).toContainText('Platform Engineer');
  await expect(view).toContainText('Email hiring manager after the application.');
  await view.getByRole('button', { name: 'View history' }).click();
  await expect(view.getByLabel('Application activity')).toContainText('Application saved');
  await view.getByRole('button', { name: 'Edit application' }).click();
  const form = view.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Notes').fill('Followed up with hiring manager.');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(view).toContainText('Followed up with hiring manager.');
  await view.getByRole('button', { name: 'Close quick view' }).click();
  await expect(view).toHaveCount(0);

  const interviews = page.locator('.schedule-panel').filter({ hasText: 'Upcoming interviews' });
  await interviews.getByRole('button', { name: 'Open application' }).click();
  await expect(view).toContainText('Interview Works');
  await expect(view).toContainText('Ask about backend architecture.');
  await view.getByRole('button', { name: 'Close quick view' }).click();

  const activity = page.locator('.recent-panel').getByRole('button', { name: 'Open application' });
  await expect(activity.first()).toBeVisible();
  await activity.first().click();
  await expect(view).toContainText('Interview Works');
  await view.getByRole('button', { name: 'Close quick view' }).click();
  await page.reload();
  const savedCard = page.getByRole('article', { name: 'Quick Access Labs — Platform Engineer' });
  await expect(savedCard).toContainText('Followed up with hiring manager.');
  expect(dueId).toBeGreaterThan(0);
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
  expect(content.trimEnd().split('\r\n')).toHaveLength(13);
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

test('in-app reminders show seven-day follow-ups and allow inline rescheduling', async ({ page }) => {
  await registerAndLogin(page);
  const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const inThreeDays = plusDays(3);
  const tomorrow = plusDays(1);
  const yesterday = plusDays(-1);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Reminder Labs');
  await form.getByLabel('Job title').fill('Backend Engineer');
  await form.getByLabel('Follow-up date').fill(inThreeDays);
  await form.getByRole('button', { name: 'Save application' }).click();

  let upcoming = page.locator('.upcoming-follow-up').filter({ hasText: 'Reminder Labs' });
  await expect(upcoming).toContainText('In 3 days');
  await upcoming.getByRole('button', { name: 'Reschedule' }).click();
  await upcoming.getByLabel('New follow-up date for Reminder Labs').fill(tomorrow);
  await upcoming.getByRole('button', { name: 'Save date' }).click();
  upcoming = page.locator('.upcoming-follow-up').filter({ hasText: 'Reminder Labs' });
  await expect(upcoming).toContainText('Tomorrow');
  await upcoming.getByRole('button', { name: 'Reschedule' }).click();
  await upcoming.getByLabel('New follow-up date for Reminder Labs').fill(yesterday);
  await upcoming.getByRole('button', { name: 'Save date' }).click();

  const due = page.locator('.due-follow-up').filter({ hasText: 'Reminder Labs' });
  await expect(due).toContainText('1 day overdue');
  await expect(page.getByText('Follow-ups need attention')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Follow-up priorities' })).toContainText('1 overdue');
  await page.reload();
  await expect(page.locator('.due-follow-up').filter({ hasText: 'Reminder Labs' }))
    .toContainText('1 day overdue');

  await due.getByRole('button', { name: 'Reschedule' }).click();
  await due.getByLabel('New follow-up date for Reminder Labs').fill(plusDays(8));
  await due.getByRole('button', { name: 'Save date' }).click();
  await expect(page.locator('.due-follow-up')).toHaveCount(0);
  await expect(page.locator('.upcoming-follow-up')).toHaveCount(0);
  await expect(page.getByText('Follow-ups need attention')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Reminder Labs — Backend Engineer' }))
    .toContainText(plusDays(8));
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

test('warns before duplicate job URL save and requires explicit confirmation', async ({ page }) => {
  await registerAndLogin(page);
  const url = 'https://jobs.lever.co/acme/role-123';
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const initial = await page.request.post('/api/applications', {
    headers: { [csrf.headerName]: csrf.token },
    data: { company: 'Acme', title: 'Backend Engineer', applicationDate: '2026-10-20',
      postingUrl: url + '?utm_source=linkedin', notes: '' },
  });
  expect(initial.status()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Job posting URL').fill(url + '?source=careers');
  await expect(form.getByText(/Already tracked: Acme — Backend Engineer/)).toBeVisible();
  await form.getByLabel('Company', { exact: true }).fill('Acme');
  await form.getByLabel('Job title').fill('Backend Engineer');
  await form.getByRole('button', { name: 'Save application' }).click();
  await expect(form.getByText(/Choose Save anyway/)).toBeVisible();
  await expect(page.locator('.results-count')).toContainText('1 application');
  await form.getByRole('button', { name: 'Save anyway' }).click();
  await expect(form.getByText('Duplicate acknowledged. Select Save application to continue.'))
    .toBeVisible();
  await form.getByRole('button', { name: 'Save application' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.results-count')).toContainText('2 applications');
});

test('editing an application does not flag its own posting URL as a duplicate', async ({ page }) => {
  await registerAndLogin(page);
  const url = 'https://jobs.lever.co/acme/role-123';
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const initial = await page.request.post('/api/applications', {
    headers: { [csrf.headerName]: csrf.token },
    data: { company: 'Acme', title: 'Backend Engineer', applicationDate: '2026-10-20',
      postingUrl: url, notes: '' },
  });
  expect(initial.status()).toBe(201);
  await page.reload();
  const card = page.getByRole('article', { name: 'Acme — Backend Engineer' });
  await card.getByRole('button', { name: 'Edit' }).click();
  const form = card.getByRole('form', { name: 'Edit application' });
  await expect(form.getByText(/Already tracked:/)).toHaveCount(0);
  await form.getByLabel('Job title').fill('Backend Engineer II');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('article', { name: 'Acme — Backend Engineer II' })).toBeVisible();
});

test('Workday job posting link fills editable details and preserves the job URL', async ({ page }) => {
  await registerAndLogin(page);
  const jobUrl = 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Platform-Engineer_JR102030';
  await page.route('**/api/job-postings/preview?**', async route => {
    const request = new URL(route.request().url());
    expect(request.searchParams.get('url')).toBe(jobUrl);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        company: 'Nvidia', title: 'Platform Engineer', location: 'Santa Clara, CA',
      }),
    });
  });
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Job posting URL').fill(jobUrl);
  await form.getByRole('button', { name: 'Fill from job link' }).click();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('Nvidia');
  await expect(form.getByLabel('Job title')).toHaveValue('Platform Engineer');
  await expect(form.getByLabel('Location')).toHaveValue('Santa Clara, CA');
  await form.getByLabel('Company', { exact: true }).fill('NVIDIA');
  await form.getByRole('button', { name: 'Save application' }).click();
  const card = page.getByRole('article', { name: 'NVIDIA — Platform Engineer' });
  await expect(card).toContainText('Santa Clara, CA');
  await expect(card.getByRole('link', { name: 'View job posting' }))
    .toHaveAttribute('href', jobUrl);
});

test('BambooHR posting fills editable details before saving', async ({ page }) => {
  await registerAndLogin(page);
  const jobUrl = 'https://flyio.bamboohr.com/careers/35';
  await page.route('**/api/job-postings/preview?**', async route => {
    const request = new URL(route.request().url());
    expect(request.searchParams.get('url')).toBe(jobUrl);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        company: 'Flyio', title: 'Infrastructure Ops Engineer', location: 'Remote',
      }),
    });
  });
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Job posting URL').fill(jobUrl);
  await form.getByRole('button', { name: 'Fill from job link' }).click();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('Flyio');
  await expect(form.getByLabel('Job title')).toHaveValue('Infrastructure Ops Engineer');
  await expect(form.getByLabel('Location')).toHaveValue('Remote');
  await form.getByLabel('Company', { exact: true }).fill('Fly.io');
  await form.getByRole('button', { name: 'Save application' }).click();
  const card = page.getByRole('article', { name: 'Fly.io — Infrastructure Ops Engineer' });
  await expect(card).toContainText('Remote');
  await expect(card.getByRole('link', { name: 'View job posting' }))
    .toHaveAttribute('href', jobUrl);
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
