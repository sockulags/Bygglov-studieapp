import { describe, expect, it } from 'vitest';
import { assembleContent, ContentLoadError, findQuestion, getQuestions } from './assemble';
import { caseDocumentUrl, loadContent, questionDrawingUrl } from './index';

const moduleFile = {
  moduler: [
    { id: '02-b', ordning: 2, titel: 'B', beskrivning: 'B', lagrum_sammanfattning: 'PBL' },
    { id: '01-a', ordning: 1, titel: 'A', beskrivning: 'A', lagrum_sammanfattning: 'FL' },
  ],
};

const questionFile = {
  modul: '01-a',
  fragor: [
    { id: 'a-1', typ: 'sant_falskt', svarighet: 1, fraga: 'Sant?', svar: true, forklaring: 'Ja.' },
  ],
};

describe('assembleContent', () => {
  it('sorts modules, groups questions and applies defaults', () => {
    const content = assembleContent({ 'moduler.json': moduleFile, 'fragor/01-a.json': questionFile });
    expect(content.modules.map((m) => m.id)).toEqual(['01-a', '02-b']);
    expect(getQuestions(content, '01-a')[0]).toMatchObject({ status: 'utkast', rattslage: '2025-12-01' });
    expect(getQuestions(content, '02-b')).toEqual([]);
    expect(findQuestion(content, 'a-1')?.modul).toBe('01-a');
    expect(content.index).toBeNull();
  });

  it('is empty when nothing has been built', () => {
    expect(assembleContent({})).toMatchObject({ modules: [], cases: [], index: null });
  });

  it('throws a readable error for invalid JSON content', () => {
    const broken = { modul: '01-a', fragor: [{ ...questionFile.fragor[0], svar: 'ja' }] };
    expect(() => assembleContent({ 'fragor/01-a.json': broken })).toThrow(ContentLoadError);
    expect(() => assembleContent({ 'fragor/01-a.json': broken })).toThrow(/fragor\[a-1\]\.svar/);
  });
});

describe('loadContent', () => {
  it('loads whatever content-dist contains without errors', () => {
    const content = loadContent();
    expect(loadContent()).toBe(content);
    for (const m of content.modules) expect(m.id).toMatch(/^\d{2}-/);
  });

  it('builds document URLs under public/content', () => {
    expect(caseDocumentUrl('A002', 'handlingar/ansokan.pdf')).toBe('/content/arenden/A002/handlingar/ansokan.pdf');
    expect(
      questionDrawingUrl('08-ritning-berakning', {
        id: 'rit-040',
        fil: 'arenden/A001-komplementbyggnad-larken-4/handlingar/situationsplan.SVG',
      }),
    ).toBe('/content/fragor/08-ritning-berakning/rit-040.svg');
  });
});
