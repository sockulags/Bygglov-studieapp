import { parseProcessFile, type Process } from '@bygglov/content-schema';

/**
 * A small process map with a branch, a side track and a loop back, validated through the
 * real schema so the tests see the same defaults as the app.
 */
export function sampleProcess(): Process {
  const result = parseProcessFile({
    processer: [
      {
        id: 'prov',
        titel: 'Provprocess',
        beskrivning: 'En process för tester.',
        modul: '06-handlaggning',
        steg: [
          {
            id: 'in',
            titel: 'Ansökan kommer in',
            beskrivning: 'Ansökan registreras.',
            lagrum: ['PBL 9 kap. 99 §'],
            frist: 'Tio veckor',
          },
          {
            id: 'komplett',
            titel: 'Fullständighetsgranskning',
            beskrivning: 'Är allt med?',
            fraga: 'Är ansökan komplett?',
            nasta: [
              { till: 'beslut', etikett: 'Ja' },
              { till: 'komplettering', etikett: 'Nej' },
            ],
          },
          {
            id: 'komplettering',
            titel: 'Föreläggande om komplettering',
            beskrivning: 'Sökanden föreläggs att komplettera.',
            lagrum: ['PBL 9 kap. 91 §', 'FL 20 §'],
            begrepp: ['komplettering'],
            spar: 1,
            nasta: [{ till: 'komplett', etikett: 'Kompletterat' }],
          },
          {
            id: 'beslut',
            titel: 'Beslut',
            beskrivning: 'Nämnden beslutar.',
            slut: true,
            se_process: 'prov',
          },
        ],
      },
    ],
  });
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  const process = result.data.processer[0];
  if (!process) throw new Error('no process');
  return process;
}
