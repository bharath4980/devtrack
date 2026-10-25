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

test('repeated sign-in submission sends one authentication request', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('duplicate-attempt@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  let attempts = 0;
  await page.route('**/api/auth/login', async route => {
    if (route.request().method() === 'POST') {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await route.continue();
  });
  await page.locator('.auth-form').evaluate(element => {
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(attempts).toBe(1);
});

test('password visibility toggle preserves input across account modes', async ({ page }) => {
  await page.goto('/');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('example-password-123');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('example-password-123');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await expect(password).toHaveValue('');
  await expect(password).toHaveAttribute('type', 'password');
});

test('recruiter contact and resume version persist when an application is edited', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const create = page.getByRole('form', { name: 'New application' });
  await create.getByLabel('Company', { exact: true }).fill('Contact Example');
  await create.getByLabel('Job title').fill('Backend Engineer');
  await create.getByLabel('Recruiter name (optional)').fill('Jordan Lee');
  await create.getByLabel('Recruiter email (optional)').fill('jordan@example.com');
  await create.getByLabel('Resume version used (optional)').fill('Backend v2');
  await create.getByRole('button', { name: 'Save application' }).click();

  const card = page.getByRole('article', { name: 'Contact Example — Backend Engineer' });
  await expect(card).toContainText('Jordan Lee');
  await expect(card).toContainText('jordan@example.com');
  await expect(card).toContainText('Backend v2');
  await card.getByRole('button', { name: 'Edit' }).click();
  const edit = card.getByRole('form', { name: 'Edit application' });
  await expect(edit.getByLabel('Recruiter email (optional)')).toHaveValue('jordan@example.com');
  await edit.getByLabel('Resume version used (optional)').fill('Backend v3');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(card).toContainText('Backend v3');
  await page.reload();
  await expect(page.getByRole('article', { name: 'Contact Example — Backend Engineer' }))
    .toContainText('Backend v3');
});

test('repeated form submission creates only one application', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Single Save Co');
  await form.getByLabel('Job title').fill('Backend Engineer');

  let creates = 0;
  await page.route('**/api/applications', async route => {
    if (route.request().method() === 'POST') {
      creates++;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await route.continue();
  });
  await form.evaluate(element => {
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('article', { name: 'Single Save Co — Backend Engineer' })).toBeVisible();
  expect(creates).toBe(1);
});

test('browser exit warning activates only for unsaved application edits', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });

  const isExitBlocked = () => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(await isExitBlocked()).toBe(false);

  await form.getByLabel('Company', { exact: true }).fill('Unsaved Draft');
  await expect.poll(isExitBlocked).toBe(true);

  await form.getByLabel('Company', { exact: true }).fill('');
  await expect.poll(isExitBlocked).toBe(false);
});

test('cancel asks before discarding unsaved application details', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Keep My Draft');

  page.once('dialog', dialog => dialog.dismiss());
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('Keep My Draft');

  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toHaveCount(0);
  expect((await (await page.request.get('/api/applications')).json()).totalElements).toBe(0);
});

test('first-time guide shows only on an empty account and leads to the first real application', async ({ page }) => {
  await registerAndLogin(page);
  const gettingStarted = page.getByRole('region', { name: 'Welcome to your job search workspace' });
  await expect(gettingStarted).toBeVisible();
  await expect(gettingStarted).toContainText('Nothing is added to your account until you save or import it.');
  await expect(page.getByRole('heading', { name: 'Your search, at a glance' })).toHaveCount(0);
  const before = await (await page.request.get('/api/applications')).json();
  expect(before.totalElements).toBe(0);

  await gettingStarted.getByRole('button', { name: 'Add your first application' }).click();
  const editor = page.getByRole('region', { name: 'Add application' });
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  const form = editor.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Onboarding Labs');
  await form.getByLabel('Job title').fill('Software Engineer');
  await form.getByRole('button', { name: 'Save application' }).click();

  await expect(gettingStarted).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your search, at a glance' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Onboarding Labs — Software Engineer' })).toBeVisible();
  await page.getByLabel('Search', { exact: true }).fill('no-results-expected');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No matches. Try another search or clear your filters.')).toBeVisible();
  await expect(gettingStarted).toHaveCount(0);
  await page.reload();
  await expect(gettingStarted).toHaveCount(0);
});

test('first-time guide opens the CSV importer without creating sample data', async ({ page }) => {
  await registerAndLogin(page);
  const gettingStarted = page.getByRole('region', { name: 'Welcome to your job search workspace' });
  await expect(gettingStarted).toBeVisible();
  await gettingStarted.getByRole('button', { name: 'Import an existing CSV' }).click();
  const importer = page.getByRole('region', { name: 'Import applications from CSV' });
  await expect(importer).toBeVisible();
  await expect(page.locator('#applications')).toBeFocused();
  const response = await (await page.request.get('/api/applications')).json();
  expect(response.totalElements).toBe(0);
  await importer.getByRole('button', { name: 'Close import' }).click();
  await expect(importer).toHaveCount(0);
  await expect(gettingStarted).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('CSV import ignores a slower read from a previously selected file', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed.csv') return read.call(this);
      return new Promise<string>(resolve => {
        (window as Window & { releaseDelayedCsv?: () => void }).releaseDelayedCsv = () => {
          void read.call(this).then(resolve);
        };
      });
    };
  });
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Import applications from CSV' });
  const file = panel.getByLabel('CSV file (up to 100 applications, 500 KB)');
  await file.setInputFiles({
    name: 'delayed.csv', mimeType: 'text/csv',
    buffer: Buffer.from('company,title,application_date\nOlder File,Engineer,2026-10-20\n'),
  });
  await expect(panel.getByText('Reading selected CSV…')).toBeVisible();
  await file.setInputFiles({
    name: 'latest.csv', mimeType: 'text/csv',
    buffer: Buffer.from('company,title,application_date\nCorrect File,Engineer,2026-10-20\n'),
  });
  await expect(panel).toContainText('1 application from latest.csv');
  await page.evaluate(async () => {
    (window as Window & { releaseDelayedCsv?: () => void }).releaseDelayedCsv?.();
    await new Promise<void>(resolve => window.setTimeout(resolve, 150));
  });
  await expect(panel).toContainText('1 application from latest.csv');
  await expect(panel).toContainText('Correct File');
  await expect(panel).not.toContainText('Older File');
  await panel.getByRole('checkbox', { name: /I reviewed the CSV/ }).check();
  await panel.getByRole('button', { name: 'Import 1 application' }).click();
  await expect(page.getByText('1 application imported.')).toBeVisible();
  const saved = await (await page.request.get('/api/applications')).json();
  expect(saved.totalElements).toBe(1);
  expect(saved.items[0].company).toBe('Correct File');
});

test('repeated CSV import clicks send only one batch', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Import applications from CSV' });
  await panel.getByLabel('CSV file (up to 100 applications, 500 KB)').setInputFiles({
    name: 'single.csv', mimeType: 'text/csv',
    buffer: Buffer.from('company,title,application_date\nImport Once,Backend Engineer,2026-10-23\n'),
  });
  await panel.getByRole('checkbox', { name: /I reviewed the CSV/ }).check();

  let imports = 0;
  await page.route('**/api/applications/import', async route => {
    if (route.request().method() === 'POST') {
      imports++;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await route.continue();
  });
  await panel.getByRole('button', { name: 'Import 1 application' }).evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByText('1 application imported.')).toBeVisible();
  expect(imports).toBe(1);
});

test('CSV preview validates files and imports atomically with duplicate protection', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Import applications from CSV' });
  // Native section also exposes aria-label as region.
  const file = panel.getByLabel('CSV file (up to 100 applications, 500 KB)');
  await file.setInputFiles({
    name: 'invalid.csv', mimeType: 'text/csv',
    buffer: Buffer.from('company,title,application_date\nBadCo,Engineer,2026-02-31\n'),
  });
  await expect(panel.getByRole('alert')).toContainText('invalid application date');
  expect((await page.request.get('/api/applications')).status()).toBe(200);

  const csv = [
    'id,company,title,location,status,application_date,interview_date,follow_up_date,posting_url,notes',
    '55,"Import, Inc.","Platform ""Engineer""",Remote,INTERVIEW,2026-10-15,2026-10-30,,https://jobs.lever.co/import/co1,"Line 1',
    'Line 2"',
    '56,Foo,Developer,,APPLIED,2026-10-16,,,,',
  ].join('\r\n');
  await file.setInputFiles({ name: 'applications.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(panel).toContainText('2 applications from applications.csv');
  await expect(panel.getByRole('table', { name: 'CSV application preview' }))
    .toContainText('Platform "Engineer"');
  const confirm = panel.getByRole('checkbox', { name: /I reviewed the CSV/ });
  const submit = panel.getByRole('button', { name: 'Import 2 applications' });
  await expect(submit).toBeDisabled();
  await confirm.check();
  await submit.click();
  await expect(page.getByText('2 applications imported.')).toBeVisible();
  const list = page.locator('.applications-list');
  await expect(list).toContainText('Import, Inc.');
  await expect(list).toContainText('Foo');
  await page.reload();
  await expect(page.locator('.applications-list')).toContainText('Platform "Engineer"');
  await expect(page.locator('.applications-list')).toContainText('Line 1');

  // Re-importing the same file is rejected; existing records remain unchanged.
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const again = page.getByRole('region', { name: 'Import applications from CSV' });
  await again.getByLabel('CSV file (up to 100 applications, 500 KB)').setInputFiles({
    name: 'applications.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await again.getByRole('checkbox', { name: /I reviewed the CSV/ }).check();
  await again.getByRole('button', { name: 'Import 2 applications' }).click();
  await expect(again.getByRole('alert')).toContainText('already exists');
  await expect(page.getByText('2 applications', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

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
  await form.getByLabel('Start time (optional)').fill('14:30');
  const timeZone = form.getByLabel('Time zone', { exact: true });
  await expect(timeZone).not.toHaveValue('');
  await timeZone.selectOption('Asia/Kolkata');
  await expect(timeZone).toHaveValue('Asia/Kolkata');
  await timeZone.selectOption('America/Chicago');
  await form.getByLabel('Format').selectOption('VIDEO');
  await form.getByLabel('Recruiter or interviewer').fill('Jordan');
  await form.getByLabel('Contact email').fill('jordan@example.com');
  await form.getByLabel('Preparation notes').fill('Practice APIs and SQL');
  await form.getByLabel('Follow-up notes').fill('Ask about team goals');
  await form.getByRole('button', { name: 'Save interview round' }).click();
  const round = workspace.getByRole('article', { name: 'Technical screen' });
  await expect(round).toContainText('Practice APIs and SQL');
  await expect(round).toContainText('jordan@example.com');
  await expect(round).toContainText('14:30 (America/Chicago)');
  // Direct links open prefilled calendar editors with UTC-correct dates; no .ics download needed.
  const googleLink = round.getByRole('link', { name: 'Open Technical screen in Google Calendar' });
  await expect(googleLink).toHaveAttribute('target', '_blank');
  await expect(googleLink).toHaveAttribute('rel', 'noopener noreferrer');
  const googleUrl = new URL(await googleLink.getAttribute('href') || '');
  expect(googleUrl.origin).toBe('https://calendar.google.com');
  expect(googleUrl.searchParams.get('dates')).toBe('20261102T203000Z/20261102T213000Z');
  expect(googleUrl.searchParams.get('stz')).toBe('America/Chicago');
  expect(googleUrl.searchParams.get('text')).toContain('Technical screen');
  expect(googleUrl.searchParams.get('details')).not.toContain('Practice APIs and SQL');

  const outlookLink = round.getByRole('link', { name: 'Open Technical screen in Outlook Calendar' });
  await expect(outlookLink).toHaveAttribute('target', '_blank');
  const outlookUrl = new URL(await outlookLink.getAttribute('href') || '');
  expect(outlookUrl.origin).toBe('https://outlook.office.com');
  expect(outlookUrl.searchParams.get('startdt')).toBe('2026-11-02T20:30:00Z');
  expect(outlookUrl.searchParams.get('enddt')).toBe('2026-11-02T21:30:00Z');
  expect(outlookUrl.searchParams.get('body')).not.toContain('Practice APIs and SQL');

  const [calendarDownload] = await Promise.all([
    page.waitForEvent('download'),
    round.getByRole('button', { name: 'Apple / other (.ics)' }).click(),
  ]);
  expect(calendarDownload.suggestedFilename()).toMatch(/devtrack-interview-\d+\.ics/);

  await page.reload();
  const reopened = page.getByRole('article', { name: 'Interview Studio — Software Engineer' });
  await reopened.getByRole('button', { name: 'Interview prep' }).click();
  const restored = reopened.getByRole('region', { name: 'Interview preparation' });
  const storedRound = restored.getByRole('article', { name: 'Technical screen' });
  await expect(storedRound).toContainText('Ask about team goals');
  await expect(storedRound).toContainText('14:30 (America/Chicago)');
  await storedRound.getByRole('button', { name: 'Edit round' }).click();
  const edit = restored.getByRole('form', { name: 'Interview round form' });
  await expect(edit.getByLabel('Time zone', { exact: true })).toHaveValue('America/Chicago');
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

test.describe('interview time-zone context', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('shows the viewer date and time without changing the interview slot', async ({ page }) => {
    await registerAndLogin(page);
    await seed(page, 'Cross-zone Interview');
    await page.reload();

    const card = page.getByRole('article', { name: 'Cross-zone Interview — Software Engineer' });
    await card.getByRole('button', { name: 'Interview prep' }).click();
    const prep = card.getByRole('region', { name: 'Interview preparation' });
    await prep.getByRole('button', { name: 'Add interview round' }).click();
    const form = prep.getByRole('form', { name: 'Interview round form' });
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await form.getByLabel('Round name').fill('Eastern time screen');
    await form.getByLabel('Scheduled date').fill(date);
    await form.getByLabel('Start time (optional)').fill('00:30');
    await form.getByLabel('Time zone', { exact: true }).selectOption('America/New_York');
    await form.getByRole('button', { name: 'Save interview round' }).click();

    const round = prep.getByRole('article', { name: 'Eastern time screen' });
    await expect(round).toContainText('00:30 (America/New_York)');
    const dayBefore = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.parse(date + 'T00:00:00Z') - 86400000));
    const local = round.getByText(/Your local time:/);
    await expect(local).toContainText(dayBefore);
    await expect(local).toContainText('9:30 PM');

    const dashboard = page.getByRole('region', { name: 'Upcoming interview rounds' });
    await expect(dashboard).toContainText('Eastern time screen');
    await expect(dashboard.getByText(/Your local time:/)).toContainText(dayBefore);
    await expect(dashboard.getByText(/Your local time:/)).toContainText('9:30 PM');

    await page.reload();
    const restored = page.getByRole('article', { name: 'Cross-zone Interview — Software Engineer' });
    await restored.getByRole('button', { name: 'Interview prep' }).click();
    const saved = restored.getByRole('article', { name: 'Eastern time screen' });
    await expect(saved).toContainText('00:30 (America/New_York)');
    await expect(saved.getByText(/Your local time:/)).toContainText('9:30 PM');
  });
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

  let bulkRequests = 0;
  await page.route('**/api/applications/bulk/status', async route => {
    bulkRequests++;
    await route.continue();
  });

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
  expect(bulkRequests).toBe(1);
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

test('board details show recruiter, resume, notes and recorded history', async ({ page }) => {
  await registerAndLogin(page);
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const created = await page.request.post('/api/applications', {
    headers: { [csrf.headerName]: csrf.token },
    data: {
      company: 'Contact Board', title: 'Platform Engineer',
      applicationDate: '2026-10-23', postingUrl: '',
      recruiterName: 'Jordan Lee', recruiterEmail: 'jordan@example.com',
      resumeVersion: 'Platform v3', notes: 'Ask about team ownership.',
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const status = await page.request.patch(`/api/applications/${id}/status`, {
    headers: { [csrf.headerName]: csrf.token },
    data: { status: 'APPLIED' },
  });
  expect(status.ok()).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  const applied = page.getByRole('region', { name: 'Applied stage' });
  const card = applied.getByRole('article', { name: 'Contact Board — Platform Engineer' });
  await card.getByRole('button', { name: 'View details' }).click();

  const details = page.getByRole('region', { name: 'Application details' });
  const contact = details.getByRole('region', { name: 'Recruiter and resume details' });
  await expect(contact).toContainText('Jordan Lee');
  await expect(contact).toContainText('jordan@example.com');
  await expect(contact).toContainText('Platform v3');
  await expect(details.getByRole('region', { name: 'Application notes' }))
    .toContainText('Ask about team ownership.');
  await expect(details.getByRole('region', { name: 'Interview preparation' })).toBeVisible();
  const history = details.getByRole('region', { name: 'Application history' });
  await history.getByRole('button', { name: 'View history' }).click();
  await expect(history.getByLabel('Application activity'))
    .toContainText('Status changed: Saved → Applied');
  await details.getByRole('button', { name: 'Close details' }).click();
  await expect(details).toHaveCount(0);
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

test.describe('board calendar boundaries', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('shows follow-ups and interviews relative to the browser date, not UTC', async ({ page }) => {
    await registerAndLogin(page);
    // In Los Angeles it is still October 23, although UTC is already October 24.
    await page.clock.setFixedTime(new Date('2026-10-24T01:30:00Z'));

    const csrf = await (await page.request.get('/api/auth/csrf')).json();
    const headers = { [csrf.headerName]: csrf.token };
    const created = await page.request.post('/api/applications', {
      headers,
      data: {
        company: 'Local Clock Works', title: 'Backend Engineer',
        applicationDate: '2026-10-20', followUpDate: '2026-10-23',
        postingUrl: '', notes: '',
      },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).id;
    const scheduled = await page.request.put('/api/applications/' + id, {
      headers,
      data: {
        company: 'Local Clock Works', title: 'Backend Engineer',
        applicationDate: '2026-10-20', followUpDate: '2026-10-23',
        interviewDate: '2026-10-24', location: '', postingUrl: '', notes: '',
      },
    });
    expect(scheduled.ok()).toBe(true);
    const moved = await page.request.patch('/api/applications/' + id + '/status', {
      headers, data: { status: 'INTERVIEW' },
    });
    expect(moved.ok()).toBe(true);

    await page.reload();
    await page.getByRole('button', { name: 'Board view' }).click();
    const card = page.getByRole('region', { name: 'Application pipeline board' })
      .getByRole('article', { name: 'Local Clock Works — Backend Engineer' });
    await expect(card).toContainText('Follow-up today');
    await expect(card).toContainText('Interview tomorrow');
  });
});

test.describe('refresh after local midnight', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('updates board date labels without reloading the page', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-24T05:00:00Z'));
    await registerAndLogin(page);

    const csrf = await (await page.request.get('/api/auth/csrf')).json();
    const response = await page.request.post('/api/applications', {
      headers: { [csrf.headerName]: csrf.token },
      data: {
        company: 'Midnight Reminder', title: 'Developer',
        applicationDate: '2026-10-20', followUpDate: '2026-10-24',
        postingUrl: '', notes: '',
      },
    });
    expect(response.status()).toBe(201);

    await page.reload();
    await page.getByRole('button', { name: 'Board view' }).click();
    const card = page.getByRole('region', { name: 'Application pipeline board' })
      .getByRole('article', { name: 'Midnight Reminder — Developer' });
    await expect(card).toContainText('Follow-up in 1 day');

    const refreshed = page.waitForResponse(response =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/dashboard');
    await page.clock.setFixedTime(new Date('2026-10-24T08:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshed;
    await expect(card).toContainText('Follow-up today');
  });
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

test('next actions prioritize overdue follow-ups and open scheduled applications', async ({ page }) => {
  await registerAndLogin(page);
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const headers = { [csrf.headerName]: csrf.token };
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const overdue = await page.request.post('/api/applications', {
    headers,
    data: {
      company: 'Overdue Priority', title: 'Software Engineer',
      applicationDate: '2026-10-20', followUpDate: '2020-01-01',
      postingUrl: '', notes: 'Ask about next steps.',
    },
  });
  expect(overdue.status()).toBe(201);
  const overdueId = (await overdue.json()).id;

  const interview = await page.request.post('/api/applications', {
    headers,
    data: {
      company: 'Upcoming Interview', title: 'Backend Engineer',
      applicationDate: '2026-10-20',
      postingUrl: '', notes: '',
    },
  });
  expect(interview.status()).toBe(201);
  const interviewId = (await interview.json()).id;
  const scheduled = await page.request.put('/api/applications/' + interviewId, {
    headers,
    data: {
      company: 'Upcoming Interview', title: 'Backend Engineer',
      applicationDate: '2026-10-20', interviewDate: tomorrow,
      followUpDate: null, location: '', postingUrl: '', notes: '',
    },
  });
  expect(scheduled.ok()).toBe(true);
  const applied = await page.request.patch('/api/applications/' + interviewId + '/status', {
    headers, data: { status: 'INTERVIEW' },
  });
  expect(applied.ok()).toBe(true);

  await page.reload();
  const queue = page.getByRole('region', { name: 'Next actions' });
  await expect(queue.getByRole('listitem').first()).toContainText('Overdue Priority');
  await expect(queue).toContainText('Upcoming Interview');

  await queue.getByRole('listitem').filter({ hasText: 'Overdue Priority' })
    .getByRole('button', { name: 'Open application' }).click();
  const detail = page.getByRole('region', { name: 'Application quick view' });
  await expect(detail).toContainText('Ask about next steps.');
  await detail.getByRole('button', { name: 'Close quick view' }).click();
  const overdueAction = queue.getByRole('listitem').filter({ hasText: 'Overdue Priority' });
  page.once('dialog', dialog => dialog.dismiss());
  await overdueAction.getByRole('button', { name: 'Complete follow-up' }).click();
  await expect(overdueAction).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await overdueAction.getByRole('button', { name: 'Complete follow-up' }).click();
  await expect(queue).not.toContainText('Overdue Priority');
  await expect(queue).toContainText('Upcoming Interview');

  const saved = await (await page.request.get('/api/applications/' + overdueId)).json();
  expect(saved.followUpDate).toBeNull();
  expect(saved.status).toBe('SAVED');
  const history = await (await page.request.get('/api/applications/' + overdueId + '/activity')).json();
  expect(history.some((event: { type: string }) => event.type === 'FOLLOW_UP_COMPLETED')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
      postingUrl: '', notes: 'Email hiring manager after the application.',
      recruiterName: 'Alex Rivera', recruiterEmail: 'alex@example.com',
      resumeVersion: 'Platform v2' },
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
  const contact = view.getByRole('region', { name: 'Recruiter and resume details' });
  await expect(contact).toContainText('Alex Rivera');
  await expect(contact).toContainText('alex@example.com');
  await expect(contact).toContainText('Platform v2');
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

test('completing an overdue follow-up clears date and records history without changing status', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Company', { exact: true }).fill('Follow-up Finishing Co');
  await form.getByLabel('Job title').fill('Backend Developer');
  await form.getByLabel('Follow-up date').fill('2020-01-01');
  await form.getByRole('button', { name: 'Save application' }).click();
  const due = page.locator('.due-follow-up').filter({ hasText: 'Follow-up Finishing Co' });
  await expect(due).toBeVisible();
  await expect(page.getByRole('group', { name: 'Follow-up priorities' })).toContainText('1 overdue');

  // Cancel in the native confirmation: no change is made.
  page.once('dialog', dialog => dialog.dismiss());
  await due.getByRole('button', { name: 'Complete follow-up' }).click();
  await expect(due).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await due.getByRole('button', { name: 'Complete follow-up' }).click();
  await expect(due).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Follow-up priorities' })).toContainText('0 overdue');
  await expect(page.getByText('Follow-up completed. Its due date was cleared and the completion was recorded.')).toBeVisible();

  const card = page.getByRole('article', { name: 'Follow-up Finishing Co — Backend Developer' });
  await expect(card).toContainText('Saved');
  await expect(card.locator('.application-details')).not.toContainText('Follow up');
  await page.reload();
  await expect(page.locator('.due-follow-up').filter({ hasText: 'Follow-up Finishing Co' })).toHaveCount(0);
  await card.getByRole('button', { name: 'View history' }).click();
  const history = card.locator('.timeline-content');
  await expect(history).toContainText('Follow-up completed');
  await expect(history).toContainText('Application saved');
  await expect(history).not.toContainText('Status changed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
  await expect(page.getByRole('region', { name: 'Next actions' })).toContainText('Reminder Labs');
  await expect(page.getByRole('group', { name: 'Follow-up priorities' })).toContainText('1 overdue');
  await page.reload();
  await expect(page.locator('.due-follow-up').filter({ hasText: 'Reminder Labs' }))
    .toContainText('1 day overdue');

  await due.getByRole('button', { name: 'Reschedule' }).click();
  await due.getByLabel('New follow-up date for Reminder Labs').fill(plusDays(8));
  await due.getByRole('button', { name: 'Save date' }).click();
  await expect(page.locator('.due-follow-up')).toHaveCount(0);
  await expect(page.locator('.upcoming-follow-up')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Next actions' })).not.toContainText('Reminder Labs');
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

test.describe('history in the browser time zone', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('application history timestamps use the browser time zone', async ({ page }) => {
    await registerAndLogin(page);
    await seed(page, 'Local Time Co');
    await page.reload();
    const card = page.getByRole('article', { name: 'Local Time Co — Software Engineer' });
    await card.getByRole('button', { name: 'View history' }).click();
    const timestamp = card.locator('.timeline-list time').first();
    await expect(timestamp).toBeVisible();
    const utc = await timestamp.getAttribute('datetime');
    const expected = await page.evaluate(iso => new Date(iso!).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }), utc);
    await expect(timestamp).toHaveText(expected);
    expect(expected).not.toMatch(/ UTC$/);
  });
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

test('interview draft survives cancelled discard and requires confirmation when switching rounds', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Draft Guard Studio');
  await page.reload();
  const card = page.getByRole('article', { name: 'Draft Guard Studio — Software Engineer' });
  await card.getByRole('button', { name: 'Interview prep' }).click();
  const workspace = card.getByRole('region', { name: 'Interview preparation' });
  await workspace.getByRole('button', { name: 'Add interview round' }).click();
  const form = workspace.getByRole('form', { name: 'Interview round form' });
  await form.getByLabel('Round name').fill('Unfinished round');

  page.once('dialog', dialog => dialog.dismiss());
  await card.getByRole('button', { name: 'Hide interview prep' }).click();
  await expect(form.getByLabel('Round name')).toHaveValue('Unfinished round');

  page.once('dialog', dialog => dialog.dismiss());
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form.getByLabel('Round name')).toHaveValue('Unfinished round');

  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toHaveCount(0);
  await expect(workspace.getByText('No rounds yet.', { exact: false })).toBeVisible();

  await workspace.getByRole('button', { name: 'Add interview round' }).click();
  await form.getByLabel('Round name').fill('Saved screen');
  await form.getByRole('button', { name: 'Save interview round' }).click();
  const round = workspace.getByRole('article', { name: 'Saved screen' });
  await expect(round).toBeVisible();
  await round.getByRole('button', { name: 'Edit round' }).click();
  await form.getByLabel('Preparation notes').fill('A draft that should not disappear');

  page.once('dialog', dialog => dialog.dismiss());
  await round.getByRole('button', { name: 'Edit round' }).click();
  await expect(form.getByLabel('Preparation notes')).toHaveValue('A draft that should not disappear');

  page.once('dialog', dialog => dialog.accept());
  await round.getByRole('button', { name: 'Edit round' }).click();
  await expect(form.getByLabel('Preparation notes')).toHaveValue('');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toHaveCount(0);
  await expect(round).not.toContainText('A draft that should not disappear');
});

test('interview form warns before leaving and sends one request for rapid double submit', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Submission Guard Studio');
  await page.reload();
  const card = page.getByRole('article', { name: 'Submission Guard Studio — Software Engineer' });
  await card.getByRole('button', { name: 'Interview prep' }).click();
  const workspace = card.getByRole('region', { name: 'Interview preparation' });
  await workspace.getByRole('button', { name: 'Add interview round' }).click();
  const form = workspace.getByRole('form', { name: 'Interview round form' });

  const exitBlocked = () => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(await exitBlocked()).toBe(false);
  await form.getByLabel('Round name').fill('Only one interview');
  await expect.poll(exitBlocked).toBe(true);

  let submissions = 0;
  await page.route('**/api/applications/*/interviews', async route => {
    if (route.request().method() === 'POST') {
      submissions++;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    await route.continue();
  });
  await form.evaluate(element => {
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(workspace.getByRole('article', { name: 'Only one interview' })).toHaveCount(1);
  expect(submissions).toBe(1);
  await expect.poll(exitBlocked).toBe(false);
});

test('list filters and view switch do not silently discard application edits', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'List Draft Company');
  await page.reload();
  const card = page.getByRole('article', { name: 'List Draft Company — Software Engineer' });
  await card.getByRole('button', { name: 'Edit' }).click();
  const form = card.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Notes').fill('Important unsaved note');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(form.getByLabel('Notes')).toHaveValue('Important unsaved note');

  await page.getByLabel('Search', { exact: true }).fill('other company');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(form.getByLabel('Notes')).toHaveValue('Important unsaved note');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('No matches. Try another search or clear your filters.')).toBeVisible();
  const saved = await (await page.request.get('/api/applications')).json();
  expect(saved.items[0].notes).not.toBe('Important unsaved note');
});

test('list view switch protects unfinished interview round details', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'List Interview Draft');
  await page.reload();
  const card = page.getByRole('article', { name: 'List Interview Draft — Software Engineer' });
  await card.getByRole('button', { name: 'Interview prep' }).click();
  const workspace = card.getByRole('region', { name: 'Interview preparation' });
  await workspace.getByRole('button', { name: 'Add interview round' }).click();
  const form = workspace.getByRole('form', { name: 'Interview round form' });
  await form.getByLabel('Round name').fill('Unfinished interview');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(form.getByLabel('Round name')).toHaveValue('Unfinished interview');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(page.getByRole('region', { name: 'Application pipeline board' })).toBeVisible();
  await page.getByRole('button', { name: 'List view' }).click();
  const reopened = page.getByRole('article', { name: 'List Interview Draft — Software Engineer' });
  await reopened.getByRole('button', { name: 'Interview prep' }).click();
  await expect(reopened.getByText('No rounds yet.', { exact: false })).toBeVisible();
});

test('pipeline board protects unsaved application details when closing and switching views', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Board Draft Company');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  const board = page.getByRole('region', { name: 'Application pipeline board' });
  await board.getByRole('article', { name: 'Board Draft Company — Software Engineer' })
    .getByRole('button', { name: 'View details' }).click();
  const details = page.getByRole('region', { name: 'Application details' });
  await details.getByRole('button', { name: 'Edit application' }).click();
  const form = details.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Notes').fill('Unfinished board edit');

  page.once('dialog', dialog => dialog.dismiss());
  await details.getByRole('button', { name: 'Close details' }).click();
  await expect(form.getByLabel('Notes')).toHaveValue('Unfinished board edit');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(form.getByLabel('Notes')).toHaveValue('Unfinished board edit');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(details).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Board Draft Company — Software Engineer' }))
    .not.toContainText('Unfinished board edit');
});

test('dashboard quick view protects unsaved edits when closing or opening another application', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Quick View One');
  await seed(page, 'Quick View Two');
  await page.reload();
  const openers = page.locator('.recent-panel').getByRole('button', { name: 'Open application' });
  await expect(openers).toHaveCount(2);
  await openers.first().click();
  const quickView = page.getByRole('region', { name: 'Application quick view' });
  await quickView.getByRole('button', { name: 'Edit application' }).click();
  const form = quickView.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Notes').fill('Private unsaved edit');

  page.once('dialog', dialog => dialog.dismiss());
  await quickView.getByRole('button', { name: 'Close quick view' }).click();
  await expect(form.getByLabel('Notes')).toHaveValue('Private unsaved edit');

  page.once('dialog', dialog => dialog.dismiss());
  await openers.last().click();
  await expect(form.getByLabel('Notes')).toHaveValue('Private unsaved edit');

  page.once('dialog', dialog => dialog.accept());
  await openers.last().click();
  await expect(quickView).toBeVisible();
  await expect(quickView.getByRole('form', { name: 'Edit application' })).toHaveCount(0);
  await expect(quickView).not.toContainText('Private unsaved edit');
});

test('sign-out does not discard an unsaved dashboard application edit without confirmation', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Signout Draft Example');
  await page.reload();

  await page.locator('.recent-panel').getByRole('button', { name: 'Open application' }).first().click();
  const quickView = page.getByRole('region', { name: 'Application quick view' });
  await quickView.getByRole('button', { name: 'Edit application' }).click();
  const form = quickView.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Notes').fill('Do not lose this note');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(form.getByLabel('Notes')).toHaveValue('Do not lose this note');
  await expect(page.getByRole('heading', { name: 'Your applications' })).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

test('sign-out also protects unfinished interview notes in dashboard quick view', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Signout Interview Draft');
  await page.reload();

  await page.locator('.recent-panel').getByRole('button', { name: 'Open application' }).first().click();
  const quickView = page.getByRole('region', { name: 'Application quick view' });
  const interview = quickView.getByRole('region', { name: 'Interview preparation' });
  await interview.getByRole('button', { name: 'Add interview round' }).click();
  const form = interview.getByRole('form', { name: 'Interview round form' });
  await form.getByLabel('Round name').fill('Important unsaved interview');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(form.getByLabel('Round name')).toHaveValue('Important unsaved interview');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

test('job link lookup preserves fields edited manually while the response is pending', async ({ page }) => {
  await registerAndLogin(page);
  let releaseLookup!: () => void;
  const delayed = new Promise<void>(resolve => { releaseLookup = resolve; });
  await page.route('**/api/job-postings/preview?**', async route => {
    await delayed;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ company: 'Automatic Company', title: 'Automatic Title', location: 'Remote' }),
    });
  });
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  const form = page.getByRole('form', { name: 'New application' });
  await form.getByLabel('Job posting URL').fill('https://boards.greenhouse.io/auto/jobs/12345');
  const requestStarted = page.waitForRequest(request => request.url().includes('/api/job-postings/preview?'));
  await form.getByRole('button', { name: 'Fill from job link' }).click();
  await requestStarted;

  await form.getByLabel('Company', { exact: true }).fill('My Corrected Company');
  await form.getByLabel('Job title').fill('My Preferred Title');
  releaseLookup();

  await expect(form.getByText('Job details loaded.', { exact: false })).toBeVisible();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('My Corrected Company');
  await expect(form.getByLabel('Job title')).toHaveValue('My Preferred Title');
  await expect(form.getByLabel('Location')).toHaveValue('Remote');
  await form.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('article', { name: 'My Corrected Company — My Preferred Title' })).toBeVisible();
});

test('editing an application preserves a newer location while the job lookup completes', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Existing Draft');
  await page.reload();
  let releaseLookup!: () => void;
  const delayed = new Promise<void>(resolve => { releaseLookup = resolve; });
  await page.route('**/api/job-postings/preview?**', async route => {
    await delayed;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ company: 'Posting Company', title: 'Backend Developer', location: 'Remote' }),
    });
  });

  const card = page.getByRole('article', { name: 'Existing Draft — Software Engineer' });
  await card.getByRole('button', { name: 'Edit' }).click();
  const form = card.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Job posting URL').fill('https://boards.greenhouse.io/posting/jobs/67890');
  const requestStarted = page.waitForRequest(request => request.url().includes('/api/job-postings/preview?'));
  await form.getByRole('button', { name: 'Fill from job link' }).click();
  await requestStarted;

  await form.getByLabel('Location').fill('Houston, TX');
  releaseLookup();

  await expect(form.getByText('Job details loaded.', { exact: false })).toBeVisible();
  await expect(form.getByLabel('Company', { exact: true })).toHaveValue('Posting Company');
  await expect(form.getByLabel('Job title')).toHaveValue('Backend Developer');
  await expect(form.getByLabel('Location')).toHaveValue('Houston, TX');
  await form.getByRole('button', { name: 'Save changes' }).click();
  const updated = page.getByRole('article', { name: 'Posting Company — Backend Developer' });
  await expect(updated).toContainText('Houston, TX');
});

test('CSV import review displays all rows and keeps wide previews inside the panel', async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Import applications from CSV' });
  const csv = [
    'company,title,location,status,application_date',
    ...Array.from({ length: 15 }, (_, index) =>
      `Company ${index + 1},Engineer ${index + 1},Remote,APPLIED,2026-10-20`),
  ].join('\n');
  await panel.getByLabel('CSV file (up to 100 applications, 500 KB)').setInputFiles({
    name: 'many-rows.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });

  await expect(panel.getByText('Review all 15 rows below.', { exact: false })).toBeVisible();
  const preview = panel.getByRole('region', { name: 'Review CSV rows' });
  const table = preview.getByRole('table', { name: 'CSV application preview' });
  await expect(table.locator('tbody tr')).toHaveCount(15);
  await expect(table.locator('tbody tr').last()).toContainText('Company 15');
  await expect(table.locator('tbody tr').last()).toContainText('15');
  await expect(table.locator('tbody tr').last()).toContainText('Remote');
  expect(await preview.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const submit = panel.getByRole('button', { name: 'Import 15 applications' });
  await expect(submit).toBeDisabled();
  await panel.getByRole('checkbox', { name: /I reviewed the CSV/ }).check();
  await expect(submit).toBeEnabled();
  // Preview alone never imports or modifies any saved application.
  await expect(page.locator('.results-count')).toContainText('0 applications');
});

test('opening CSV import from board confirms before discarding an unsaved application edit', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Board Import Guard');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();
  const board = page.getByRole('region', { name: 'Application pipeline board' });
  await board.getByRole('article', { name: 'Board Import Guard — Software Engineer' })
    .getByRole('button', { name: 'View details' }).click();
  const details = page.getByRole('region', { name: 'Application details' });
  await details.getByRole('button', { name: 'Edit application' }).click();
  const form = details.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Notes').fill('Keep my unfinished board note');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await expect(form.getByLabel('Notes')).toHaveValue('Keep my unfinished board note');
  await expect(page.getByRole('region', { name: 'Import applications from CSV' })).toHaveCount(0);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import applications from CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  await expect(details).toHaveCount(0);
});

test('successful CSV import keeps another unsaved application editor open', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Draft In Progress');
  await page.reload();
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Import applications from CSV' });
  const card = page.getByRole('article', { name: 'Draft In Progress — Software Engineer' });
  await card.getByRole('button', { name: 'Edit' }).click();
  const editor = card.getByRole('form', { name: 'Edit application' });
  await editor.getByLabel('Notes').fill('Unfinished application edit');

  await panel.getByLabel('CSV file (up to 100 applications, 500 KB)').setInputFiles({
    name: 'another-application.csv', mimeType: 'text/csv',
    buffer: Buffer.from('company,title,application_date\nImported While Editing,Developer,2026-10-20\n'),
  });
  await panel.getByRole('checkbox', { name: /I reviewed the CSV/ }).check();
  await panel.getByRole('button', { name: 'Import 1 application' }).click();
  await expect(page.getByText('1 application imported.', { exact: false })).toBeVisible();
  await expect(editor.getByLabel('Notes')).toHaveValue('Unfinished application edit');
  await expect(page.getByRole('region', { name: 'Import applications from CSV' })).toHaveCount(0);

  const response = await page.request.get('/api/applications');
  const records = await response.json();
  expect(records.totalElements).toBe(2);
  expect(records.items.find((item: { company: string }) => item.company === 'Draft In Progress').notes).toBe('');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('article', { name: 'Draft In Progress — Software Engineer' }))
    .toContainText('Unfinished application edit');
  await expect(page.getByRole('article', { name: 'Imported While Editing — Developer' })).toBeVisible();
});

test('pipeline background refresh keeps unsaved application details while another card changes stage', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Editing In Progress');
  await seed(page, 'Unrelated Stage Change');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();

  const board = page.getByRole('region', { name: 'Application pipeline board' });
  const editingCard = board.getByRole('article', { name: 'Editing In Progress — Software Engineer' });
  await editingCard.getByRole('button', { name: 'View details' }).click();
  const details = board.getByRole('region', { name: 'Application details' });
  await details.getByRole('button', { name: 'Edit application' }).click();
  const form = details.getByRole('form', { name: 'Edit application' });
  await form.getByLabel('Notes').fill('My note must survive a background refresh');

  await board.getByRole('article', { name: 'Unrelated Stage Change — Software Engineer' })
    .getByLabel('Move to stage').selectOption('APPLIED');
  await expect(board.getByRole('region', { name: 'Applied stage' })
    .getByRole('article', { name: 'Unrelated Stage Change — Software Engineer' })).toBeVisible();

  await expect(form.getByLabel('Notes')).toHaveValue('My note must survive a background refresh');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(details).toContainText('My note must survive a background refresh');
});

test('pipeline background refresh preserves unfinished interview round notes', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Interview In Progress');
  await seed(page, 'Another Card To Move');
  await page.reload();
  await page.getByRole('button', { name: 'Board view' }).click();

  const board = page.getByRole('region', { name: 'Application pipeline board' });
  await board.getByRole('article', { name: 'Interview In Progress — Software Engineer' })
    .getByRole('button', { name: 'View details' }).click();
  const details = board.getByRole('region', { name: 'Application details' });
  const workspace = details.getByRole('region', { name: 'Interview preparation' });
  await workspace.getByRole('button', { name: 'Add interview round' }).click();
  const form = workspace.getByRole('form', { name: 'Interview round form' });
  await form.getByLabel('Round name').fill('Important technical interview');
  await form.getByLabel('Preparation notes').fill('Prepare transaction isolation examples');

  await board.getByRole('article', { name: 'Another Card To Move — Software Engineer' })
    .getByLabel('Move to stage').selectOption('APPLIED');
  await expect(board.getByRole('region', { name: 'Applied stage' })
    .getByRole('article', { name: 'Another Card To Move — Software Engineer' })).toBeVisible();

  await expect(form.getByLabel('Round name')).toHaveValue('Important technical interview');
  await expect(form.getByLabel('Preparation notes')).toHaveValue('Prepare transaction isolation examples');
  await form.getByRole('button', { name: 'Save interview round' }).click();
  await expect(workspace.getByRole('article', { name: 'Important technical interview' }))
    .toContainText('Prepare transaction isolation examples');
});

test('loaded pipeline pages and unsaved drafts survive a status-change refresh', async ({ page }) => {
  await registerAndLogin(page);
  for (let i = 0; i < 22; i++) await seed(page, 'Refresh Page Company ' + i);
  await page.getByRole('button', { name: 'Board view' }).click();

  const board = page.getByRole('region', { name: 'Application pipeline board' });
  const saved = board.getByRole('region', { name: 'Saved stage' });
  await saved.getByRole('button', { name: 'Load more (20 of 22)' }).click();
  await expect(saved.getByRole('article')).toHaveCount(22);

  await saved.getByRole('article', { name: 'Refresh Page Company 0 — Software Engineer' })
    .getByRole('button', { name: 'View details' }).click();
  const details = board.getByRole('region', { name: 'Application details' });
  await details.getByRole('button', { name: 'Edit application' }).click();
  const editor = details.getByRole('form', { name: 'Edit application' });
  await editor.getByLabel('Notes').fill('Preserve this later-page draft');

  await saved.getByRole('article', { name: 'Refresh Page Company 21 — Software Engineer' })
    .getByLabel('Move to stage').selectOption('APPLIED');
  await expect(saved.getByRole('article')).toHaveCount(21);
  await expect(saved.getByRole('article', { name: 'Refresh Page Company 0 — Software Engineer' })).toBeVisible();
  await expect(editor.getByLabel('Notes')).toHaveValue('Preserve this later-page draft');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(details).toContainText('Preserve this later-page draft');

  const interviews = details.getByRole('region', { name: 'Interview preparation' });
  await interviews.getByRole('button', { name: 'Add interview round' }).click();
  const interviewForm = interviews.getByRole('form', { name: 'Interview round form' });
  await interviewForm.getByLabel('Round name').fill('Later page interview');
  await interviewForm.getByLabel('Preparation notes').fill('Keep prep notes');

  await board.getByRole('region', { name: 'Applied stage' })
    .getByRole('article', { name: 'Refresh Page Company 21 — Software Engineer' })
    .getByLabel('Move to stage').selectOption('SAVED');
  await expect(saved.getByRole('article')).toHaveCount(22);
  await expect(interviewForm.getByLabel('Preparation notes')).toHaveValue('Keep prep notes');
  await interviewForm.getByRole('button', { name: 'Save interview round' }).click();
  await expect(interviews.getByRole('article', { name: 'Later page interview' })).toContainText('Keep prep notes');
});


test('failed pipeline refresh can be retried without discarding an unsaved edit', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Draft Company');
  await seed(page, 'Moving Company');
  await page.getByRole('button', { name: 'Board view' }).click();

  const board = page.getByRole('region', { name: 'Application pipeline board' });
  const saved = board.getByRole('region', { name: 'Saved stage' });
  await saved.getByRole('article', { name: 'Draft Company — Software Engineer' })
    .getByRole('button', { name: 'View details' }).click();
  const details = board.getByRole('region', { name: 'Application details' });
  await details.getByRole('button', { name: 'Edit application' }).click();
  const editor = details.getByRole('form', { name: 'Edit application' });
  await editor.getByLabel('Notes').fill('Keep my unfinished notes');

  let failRefresh = true;
  await page.route('**/api/applications?**', async route => {
    if (failRefresh && route.request().method() === 'GET') {
      await route.fulfill({ status: 503, body: 'Service temporarily unavailable' });
      return;
    }
    await route.continue();
  });

  await saved.getByRole('article', { name: 'Moving Company — Software Engineer' })
    .getByLabel('Move to stage').selectOption('APPLIED');

  await expect(board.getByRole('button', { name: 'Retry refresh' })).toBeVisible();
  await expect(editor.getByLabel('Notes')).toHaveValue('Keep my unfinished notes');

  failRefresh = false;
  await board.getByRole('button', { name: 'Retry refresh' }).click();
  await expect(board.getByRole('button', { name: 'Retry refresh' })).toHaveCount(0);
  await expect(editor.getByLabel('Notes')).toHaveValue('Keep my unfinished notes');
  await expect(board.getByRole('region', { name: 'Applied stage' })
    .getByRole('article', { name: 'Moving Company — Software Engineer' })).toBeVisible();
});

test('applying unchanged list filters keeps an unfinished application edit', async ({ page }) => {
  await registerAndLogin(page);
  await seed(page, 'Unchanged Filter Company');
  await page.reload();
  const card = page.getByRole('article', { name: 'Unchanged Filter Company — Software Engineer' });
  await card.getByRole('button', { name: 'Edit' }).click();
  const editor = card.getByRole('form', { name: 'Edit application' });
  await editor.getByLabel('Notes').fill('Keep this unfinished edit');

  let requests = 0;
  await page.route('**/api/applications?**', async route => {
    requests++;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(editor.getByLabel('Notes')).toHaveValue('Keep this unfinished edit');
  expect(requests).toBe(0);
});
