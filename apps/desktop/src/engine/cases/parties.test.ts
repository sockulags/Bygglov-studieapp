// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadA002, loadCaseYaml } from './a002.fixture';
import {
  caseParties,
  fold,
  isApplicant,
  isNeighbour,
  isOwner,
  mentionsName,
  mentionsProperty,
} from './parties';

const a002 = caseParties(loadA002());
const a003 = caseParties(loadCaseYaml('A003-nybyggnad-strandvik-1-9'));

describe('fold', () => {
  it('ignores case, å/ä/ö and extra spaces', () => {
    expect(fold('  Ägarna till  STRANDVIK 1:5 ')).toBe('agarna till strandvik 1:5');
    expect(fold('Göran Lundh')).toBe(fold('goran lundh'));
  });
});

describe('mentionsProperty', () => {
  it('finds every property in an abbreviated list', () => {
    const text = 'Ägarna till Strandvik 1:5, 1:3 och 1:1';
    expect(mentionsProperty(text, 'Strandvik 1:5')).toBe(true);
    expect(mentionsProperty(text, 'Strandvik 1:3')).toBe(true);
    expect(mentionsProperty(text, 'Strandvik 1:1')).toBe(true);
    expect(mentionsProperty(text, 'Strandvik 1:12')).toBe(false);
    expect(mentionsProperty('Björken 6 och 12', 'Björken 12')).toBe(true);
    expect(mentionsProperty('Björken 6 samt Björken 12', 'Björken 12')).toBe(true);
  });

  it('does not take one property for another', () => {
    expect(mentionsProperty('Björken 82', 'Björken 8')).toBe(false);
    expect(mentionsProperty('Björken 8:2', 'Björken 8')).toBe(false);
    expect(mentionsProperty('Strandvik 1:12', 'Strandvik 1:1')).toBe(false);
    expect(mentionsProperty('Lillbjörken 8', 'Björken 8')).toBe(false);
    expect(mentionsProperty('ägaren till bjorken 8', 'Björken 8')).toBe(true);
  });
});

describe('mentionsName', () => {
  it('matches the whole name, first name and surname, or the surname alone', () => {
    expect(mentionsName('Maria och Jonas Lindqvist', 'Maria Lindqvist')).toBe(true);
    expect(mentionsName('Familjen Lindqvist', 'Jonas Lindqvist')).toBe(true);
    expect(mentionsName('Monica och Goran Lundh', 'Göran Lundh')).toBe(true);
    expect(mentionsName('Lindqvists granne', 'Maria Lindqvist')).toBe(false);
  });

  it('needs the first name when another party has the same surname', () => {
    expect(mentionsName('Herr Nordin', 'Anders Nordin', ['Kalle Nordin'])).toBe(false);
    expect(mentionsName('Anders Nordin', 'Anders Nordin', ['Kalle Nordin'])).toBe(true);
  });

  it('matches organisations with or without the legal form', () => {
    expect(mentionsName('Strandviks gård', 'Strandviks gård AB')).toBe(true);
    expect(mentionsName('AB Fastigheter', 'Strandviks gård AB')).toBe(false);
  });
});

describe('roles in A002 and A003', () => {
  it('recognises the applicants and owners by name', () => {
    expect(isApplicant('Maria och Jonas Lindqvist', a002)).toBe(true);
    expect(isOwner('Maria och Jonas Lindqvist', a002)).toBe(true);
    expect(isApplicant('Byggherren', a002)).toBe(true);
    expect(isOwner('fastighetsägarna', a002)).toBe(true);
    // Every owner of Björken 7 applied, so "Sökanden" reaches the owners too.
    expect(isOwner('Sökanden', a002)).toBe(true);
    expect(isApplicant('Gunilla och Bertil Ahlgren', a002)).toBe(false);
  });

  it('keeps the applicant who does not own the property apart', () => {
    expect(isApplicant('Daniel Ek', a003)).toBe(true);
    expect(isOwner('Daniel Ek', a003)).toBe(false);
    expect(isOwner('Sara Holm', a003)).toBe(true);
    expect(isOwner('Sökandena', a003)).toBe(true);
    expect(isOwner('Ägaren till Strandvik 1:9', a003)).toBe(true);
  });

  it('recognises neighbours by property or by name', () => {
    expect(isNeighbour('Monica och Göran Lundh', 'Strandvik 1:12', a003)).toBe(true);
    expect(isNeighbour('Strandviks gård AB', 'Strandvik 1:1', a003)).toBe(true);
    expect(isNeighbour('Ulla Persson', 'Strandvik 1:5', a003)).toBe(false);
    expect(isNeighbour('Åkerslunda kommun, tekniska förvaltningen', 'Åkerslunda 1:1', a002)).toBe(
      true,
    );
  });
});
