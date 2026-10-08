import { expect, test } from '@playwright/test';

test('@p6 Knowledge unifies reader annotations and bookmarks without a parallel store', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'P6 Knowledge workspace is qualified once in canonical Chromium.');

  await page.goto('/library/knowledge');
  await expect(page.locator('[data-knowledge-workspace]')).toBeVisible();

  await page.evaluate(async () => {
    const rawCatalog = document.querySelector<HTMLElement>('[data-knowledge-work-catalog]')?.dataset.knowledgeWorkCatalog;
    const catalog = JSON.parse(rawCatalog ?? '[]') as Array<{ id: string; edition?: number; releaseVersion?: string }>;
    const publication = catalog.find((work) => work.id === 'ai-for-the-kingdom');
    if (!publication || typeof publication.edition !== 'number' || !publication.releaseVersion) {
      throw new Error('The publication identity is missing from Knowledge.');
    }
    const { edition, releaseVersion } = publication;
    const openDb = (name: string, version: number) => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const complete = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    const main = await openDb('thiepn-library', 10);
    const mainTx = main.transaction(['annotations', 'bookmarks'], 'readwrite');
    mainTx.objectStore('annotations').put({
      schemaVersion: 2,
      id: 'p6-annotation',
      workId: 'ai-for-the-kingdom',
      edition,
      releaseVersion,
      cfiRange: 'epubcfi(/6/2!/4/2,/1:0,/1:8)',
      href: 'chapter-1.xhtml',
      chapterLabel: 'Opening',
      spineIndex: 0,
      quote: 'Knowledge begins with a durable source.',
      note: 'P6 synthesis note',
      createdAt: '2026-10-08T06:00:00.000Z',
      updatedAt: '2026-10-08T06:05:00.000Z',
    });
    mainTx.objectStore('bookmarks').put({
      schemaVersion: 2,
      id: 'p6-stale-bookmark',
      workId: 'ai-for-the-kingdom',
      edition,
      releaseVersion: 'obsolete-release',
      cfi: 'epubcfi(/6/4!/4/2/1:2)',
      href: 'obsolete-chapter.xhtml',
      chapterLabel: 'Previous edition',
      spineIndex: 1,
      createdAt: '2026-10-08T06:08:00.000Z',
      updatedAt: '2026-10-08T06:08:00.000Z',
    });
    mainTx.objectStore('bookmarks').put({
      schemaVersion: 2,
      id: 'p6-epub-bookmark',
      workId: 'ai-for-the-kingdom',
      edition,
      releaseVersion,
      cfi: 'epubcfi(/6/4!/4/2/1:0)',
      href: 'chapter-2.xhtml',
      chapterLabel: 'Second section',
      spineIndex: 1,
      percentage: 0.25,
      createdAt: '2026-10-08T06:10:00.000Z',
      updatedAt: '2026-10-08T06:10:00.000Z',
    });
    await complete(mainTx);
    main.close();

    const pdf = await openDb('thiepn-library-pdf-reader', 2);
    const pdfTx = pdf.transaction('bookmarks', 'readwrite');
    pdfTx.objectStore('bookmarks').put({
      schemaVersion: 1,
      id: `ai-for-the-kingdom::${edition}::${releaseVersion}::page:7`,
      publicationKey: `ai-for-the-kingdom::${edition}::${releaseVersion}`,
      identity: {
        workId: 'ai-for-the-kingdom',
        edition,
        releaseVersion,
      },
      page: 7,
      label: 'Page 7',
      createdAt: '2026-10-08T06:12:00.000Z',
    });
    await complete(pdfTx);
    pdf.close();
  });

  await page.reload();

  await expect(page.locator('[data-knowledge-stat="notes"]')).toHaveText('1');
  await expect(page.locator('[data-knowledge-stat="highlights"]')).toHaveText('0');
  await expect(page.locator('[data-knowledge-stat="bookmarks"]')).toHaveText('3');
  await expect(page.locator('[data-knowledge-stat="books"]')).toHaveText('1');
  await expect(page.locator('.knowledge-card')).toHaveCount(4);

  await page.locator('[data-knowledge-kind]').selectOption('bookmark');
  await expect(page.locator('.knowledge-card')).toHaveCount(3);

  const epubBookmark = page.locator('[data-knowledge-key="epub-bookmark:p6-epub-bookmark"]');
  await expect(epubBookmark.getByRole('link', { name: 'Open in book' })).toHaveAttribute('href', /bookmark=p6-epub-bookmark/);
  const stale = page.locator('[data-knowledge-key="epub-bookmark:p6-stale-bookmark"]');
  await expect(stale.getByText(/original edition or local file is unavailable/i)).toBeVisible();
  await expect(stale.getByRole('link', { name: 'Open in book' })).toHaveCount(0);

  await page.locator('[data-knowledge-search]').fill('page 7');
  await expect(page.locator('.knowledge-card')).toHaveCount(1);
  await expect(page.locator('.knowledge-card')).toContainText('Page 7');

  await page.locator('[data-knowledge-search]').fill('');
  await page.locator('[data-knowledge-kind]').selectOption('all');
  const noteCard = page.locator('[data-knowledge-key="epub-annotation:p6-annotation"]');
  await noteCard.getByRole('button', { name: 'Edit note' }).click();
  await noteCard.getByRole('textbox', { name: /Note for/ }).fill('P6 edited synthesis');
  await noteCard.getByRole('button', { name: 'Save note' }).click();
  await expect(noteCard.locator('.knowledge-card__note')).toHaveText('P6 edited synthesis');

  await epubBookmark.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('[data-knowledge-stat="bookmarks"]')).toHaveText('3');
  await expect(epubBookmark.getByRole('button', { name: 'Confirm delete' })).toBeVisible();
  await epubBookmark.getByRole('button', { name: 'Cancel delete' }).click();
  await expect(page.locator('[data-knowledge-stat="bookmarks"]')).toHaveText('3');
  await expect(epubBookmark.getByRole('button', { name: 'Confirm delete' })).toHaveCount(0);

  await epubBookmark.getByRole('button', { name: 'Delete', exact: true }).click();
  await epubBookmark.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.locator('[data-knowledge-stat="bookmarks"]')).toHaveText('2');
  await expect(page.locator('[data-knowledge-status]')).toHaveText('Bookmark deleted.');
});
