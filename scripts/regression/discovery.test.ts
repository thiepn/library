import assert from 'node:assert/strict';
import test from 'node:test';
import { rankRelatedWorks, type DiscoveryWork } from '../../src/lib/content/discovery';

function work(
  id: string,
  overrides: Partial<DiscoveryWork> = {},
): DiscoveryWork {
  return {
    id,
    slug: id,
    title: id,
    language: 'en-US',
    contributors: [{ name: 'Author A', role: 'author' }],
    classification: {
      subjects: [],
      tags: [],
      collections: [],
    },
    relationships: {
      relatedWorks: [],
      prerequisites: [],
    },
    ...overrides,
  };
}

test('P5 discovery prioritizes explicit relationships over inferred metadata', () => {
  const source = work('source', {
    classification: { subjects: ['missions'], tags: ['great-commission'], collections: ['mission'] },
    relationships: { relatedWorks: ['explicit'], prerequisites: [] },
  });
  const explicit = work('explicit', {
    contributors: [{ name: 'Other', role: 'author' }],
  });
  const inferred = work('inferred', {
    classification: { subjects: ['missions'], tags: ['great-commission'], collections: ['mission'] },
  });
  const ranked = rankRelatedWorks(source, [source, inferred, explicit]);
  assert.equal(ranked[0]?.work.id, 'explicit');
  assert.ok(ranked[0]?.reasons.includes('Explicitly related'));
});

test('P5 discovery ranks shared author, collection, subject, and tags deterministically', () => {
  const source = work('source', {
    title: 'Source',
    classification: {
      subjects: ['missions', 'theology'],
      tags: ['great-commission', 'strategy'],
      collections: ['mission'],
    },
  });
  const close = work('close', {
    title: 'Close',
    classification: {
      subjects: ['missions'],
      tags: ['great-commission'],
      collections: ['mission'],
    },
  });
  const subjectOnly = work('subject-only', {
    title: 'Subject only',
    contributors: [{ name: 'Other', role: 'author' }],
    classification: {
      subjects: ['missions'],
      tags: [],
      collections: [],
    },
  });
  const unrelated = work('unrelated', {
    contributors: [{ name: 'Other', role: 'author' }],
    classification: {
      subjects: [],
      tags: ['strategy'],
      collections: [],
    },
  });

  const ranked = rankRelatedWorks(source, [subjectOnly, unrelated, close, source]);
  assert.deepEqual(ranked.map(({ work: item }) => item.id), ['close', 'subject-only']);
  assert.equal(ranked.some(({ work: item }) => item.id === 'unrelated'), false);
});

test('P5 discovery honors prerequisite direction and result limits', () => {
  const source = work('source', {
    relationships: { relatedWorks: [], prerequisites: ['foundation'] },
  });
  const foundation = work('foundation', { contributors: [] });
  const next = work('next', {
    contributors: [],
    relationships: { relatedWorks: [], prerequisites: ['source'] },
  });
  const ranked = rankRelatedWorks(source, [source, next, foundation], 1);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.work.id, 'foundation');
  assert.equal(ranked[0]?.reasons[0], 'Prerequisite');
});
