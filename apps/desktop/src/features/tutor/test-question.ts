/** A quiz question for the tutor's tests (no node:fs, so it works in jsdom tests). */
import type { Question } from '@bygglov/content-schema';

export const multipleChoice: Question = {
  id: 'lov-042',
  typ: 'flerval',
  svarighet: 2,
  fraga: 'Hur stor får en bygglovsbefriad komplementbyggnad inom plan vara?',
  alternativ: [
    { text: '15 kvm', ratt: false, forklaring: 'Det var friggebodens gamla gräns.' },
    { text: '30 kvm', ratt: true },
    { text: '45 kvm', ratt: false },
  ],
  forklaring: 'Högst 30 kvm byggnadsarea per byggnad, sammanlagt 45 kvm per tomt.',
  lagrum: ['PBL 9 kap. 4 §'],
  taggar: [],
  status: 'utkast',
  rattslage: '2025-12-01',
};
