import type { CaseFile } from '@bygglov/content-schema';
import type { CaseState, DecisionDraft, DeliveryMethod } from '@/engine';
import { municipalityName, propertyName } from '../case-model';
import { Paper } from '../documents/paper';
import {
  appealText,
  DECIDING_BODY,
  decisionSentence,
  decisionTitle,
  feeText,
} from './decision-text';

const DELIVERY_HEADINGS: Record<DeliveryMethod, string> = {
  delges: 'Delges med delgivningskvitto, tillsammans med information om hur man överklagar',
  meddelande: 'Meddelande om kungörelsen skickas till',
  skickas: 'För kännedom',
};

function Paragraphs({ text, empty }: { text: string; empty: string }) {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return <p className="text-muted italic">{empty}</p>;
  return (
    <>
      {parts.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </>
  );
}

/**
 * Her decision as an A4 document in the same layout as the model decisions. Updates live
 * while the form is filled in, and is shown again in the comparison view.
 */
export function DecisionPreview({
  caseFile,
  state,
  draft,
  diaryNumber,
  decisionDate,
  label = 'Förhandsvisning av beslutet',
}: {
  caseFile: CaseFile;
  state: CaseState;
  draft: DecisionDraft;
  diaryNumber?: string | undefined;
  /** Defaults to today in the simulation. */
  decisionDate?: string;
  label?: string;
}) {
  const date = decisionDate ?? state.simDate;
  const sentence = decisionSentence(draft, caseFile);
  const groups = (['delges', 'meddelande', 'skickas'] as const)
    .map((satt) => ({
      satt,
      recipients: draft.expediering.filter((r) => r.satt === satt && r.mottagare.trim() !== ''),
    }))
    .filter((g) => g.recipients.length > 0);
  return (
    <Paper
      meta={{
        avsandare: `${DECIDING_BODY}, ${municipalityName(caseFile)}`,
        datum: date,
        ...(diaryNumber ? { diarienummer: diaryNumber } : {}),
        extra: {},
      }}
      aria-label={label}
    >
      <div className="paper-body">
        <h1>{decisionTitle(draft.utfall, caseFile)}</h1>
        <table>
          <tbody>
            <tr>
              <td>Fastighet</td>
              <td>{caseFile.fastighet}</td>
            </tr>
            <tr>
              <td>Åtgärd</td>
              <td>{caseFile.titel}</td>
            </tr>
            <tr>
              <td>Ansökan kom in</td>
              <td>
                {state.applicationDate}
                {state.completionDate ? `, komplett ${state.completionDate}` : ''}
              </td>
            </tr>
            <tr>
              <td>Beslutsdatum</td>
              <td>{date}</td>
            </tr>
          </tbody>
        </table>

        <h2>Beslut</h2>
        <p>
          {sentence.body} <strong>{sentence.verb}</strong>
          {sentence.rest}
        </p>

        <h2>Avgift</h2>
        <p>
          Avgiften är <strong>{feeText(draft.avgift)}</strong>.
        </p>

        <h2>Skäl för beslutet</h2>
        <Paragraphs text={draft.motivering} empty="Motiveringen skrivs i formuläret." />

        {draft.villkor_upplysningar.trim() !== '' && (
          <>
            <h2>
              {draft.utfall === 'bevilja_med_villkor' ? 'Villkor och upplysningar' : 'Upplysningar'}
            </h2>
            <Paragraphs text={draft.villkor_upplysningar} empty="" />
          </>
        )}

        {draft.overklagandehanvisning && (
          <>
            <h2>Hur man överklagar</h2>
            {appealText(caseFile, { diaryNumber, outcome: draft.utfall }).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </>
        )}

        <h2>Beslutet expedieras till</h2>
        {groups.length === 0 ? (
          <p className="text-muted italic">Ingen expediering angiven.</p>
        ) : (
          groups.map((group) => (
            <div key={group.satt}>
              <p>
                <strong>{DELIVERY_HEADINGS[group.satt]}:</strong>
              </p>
              <ul>
                {group.recipients.map((r, i) => (
                  <li key={i}>{r.mottagare}</li>
                ))}
              </ul>
            </div>
          ))
        )}

        <hr />
        <p>Beslutet har fattats med stöd av delegation från {DECIDING_BODY.toLowerCase()}.</p>
        <p>
          Bygglovshandläggare, {municipalityName(caseFile)}
          <br />
          <em>Fiktivt beslut för utbildning, {propertyName(caseFile)}.</em>
        </p>
      </div>
    </Paper>
  );
}
