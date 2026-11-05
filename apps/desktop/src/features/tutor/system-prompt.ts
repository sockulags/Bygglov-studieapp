import legalStatusText from '../../../../../docs/rattslage/README.md?raw';
import { TUTOR_MODEL_INFO, type TutorModelId } from './pricing';
import type {
  TutorContext,
  TutorEffort,
  TutorMessage,
  TutorRequest,
  TutorSystemBlock,
} from './types';

/**
 * The tutor's system prompt, in three blocks:
 *
 * 1. the role and the rules (stable),
 * 2. the legal state after 2025-12-01, the whole of docs/rattslage/README.md imported at
 *    build time (stable, several thousand tokens),
 * 3. what the student is looking at right now (changes with every step).
 *
 * Blocks 1 and 2 form a prefix that is identical in every request, so block 2 carries the
 * cache marker: the API caches everything up to and including it, and every later question
 * (in any conversation) reads it from the cache at a tenth of the price. Block 3 comes after
 * the marker without cache, because it changes whenever the student answers or moves on.
 */

/** The legal-state summary the tutor must stay within (docs/rattslage/README.md). */
export const LEGAL_STATUS_TEXT: string = legalStatusText;

/** Date of the legal state everything in the app is written against. */
export const LEGAL_STATE_DATE = '2025-12-01';

export const TUTOR_ROLE = `Du är en erfaren bygglovshandläggare på en svensk kommun. Du handleder en student på en YH-utbildning till bygglovshandläggare medan studenten pluggar i en studieapp med quizfrågor och simulerade bygglovsärenden. Studenten har också en riktig handledare; du är ett komplement till den handledaren, inte en ersättning.

Regler för hur du svarar:

1. Svara alltid på svenska och tilltala studenten med "du".
2. Ange lagrum med lag, kapitel och paragraf för varje rättsligt påstående, till exempel "9 kap. 10 § PBL" eller "6 kap. 1 § PBF".
3. Hitta aldrig på paragrafer. Om du inte säkert vet vilken paragraf som gäller: säg det rakt ut, beskriv regeln utan nummer och föreslå var studenten kan slå upp den.
4. Säg uttryckligen när du är osäker, och skilj på vad lagtexten säger och vad som är din bedömning eller vanlig praxis.
5. Utgå från rättsläget efter ${LEGAL_STATE_DATE}, som sammanfattas i nästa avsnitt. Plan- och bygglagens 9 kap. har fått ny numrering och gamla paragrafnummer som "9:4 a" gäller inte längre; begreppen friggebod och attefallshus finns inte heller kvar i lagen. Möter studenten den äldre numreringen i kurslitteraturen: förklara vad som gäller nu med hjälp av översättningstabellen.
6. Bedömningsfrågor, som om en avvikelse är liten i ett konkret fall, om något är lämpligt eller hur en kommun brukar göra: ge gärna ditt resonemang, men hänvisa till handledaren och till boken Lagtextens byggregler 2026-01-01 för det slutliga beskedet.
7. Avslöja aldrig facit för en fråga eller ett ärende som studenten inte har besvarat ännu. Kontexten sist i den här instruktionen säger om svaret är lämnat. Har studenten inte svarat: ge ledtrådar, peka ut vilket lagrum som är värt att läsa och ställ motfrågor, men säg inte vilket alternativ som är rätt, vilket beslut som är rätt eller vad modellsvaret innehåller.
8. Var kort. Börja direkt med svaret, utan inledning, utan att upprepa frågan och utan sammanfattning på slutet. Sikta på högst 100 ord: ett kort stycke eller tre till fem punkter. Skriv längre bara när studenten ber om det, till exempel "förklara djupare". Ta bara med det som behövs för frågan, inte allt som hör till ämnet.
9. Ställ en motfråga bara när den hjälper studenten vidare, till exempel när du ger ledtrådar i stället för facit. Högst en motfråga per svar, och ingen när studenten bara vill ha ett besked.
10. Innehållet i appen är utkast som handledaren ännu inte granskat. Ser du något i en fråga, förklaring eller ett ärende som verkar stå i strid med lagtexten: säg det försiktigt och föreslå att studenten tar upp det med handledaren.
11. Håll dig till bygglov, plan- och bygglagen, angränsande lagstiftning och studierna. Gäller frågan något annat: svara kort och styr tillbaka.

Formatera med Markdown: fetstil för lagrum och nyckelord, punktlistor för steg. Inga rubriker.`;

const LEGAL_BLOCK_HEADER = `Rättsläget som gäller (sammanfattning från appens dokumentation, kontrollerad mot lagtexten på riksdagen.se). Lagrum i 9 kap. PBL ska anges med numreringen i kolumnen "Nu":`;

/** Per-model request settings: answers rarely need more, and thinking counts toward max. */
export const TUTOR_REQUEST_SETTINGS: Record<
  TutorModelId,
  { maxTokens: number; effort: TutorEffort }
> = {
  'claude-opus-5-5': { maxTokens: 4000, effort: 'medium' },
  'claude-haiku-5-5': { maxTokens: 4000, effort: 'low' },
};

/** At most this many earlier messages (user and assistant) are sent along with a question. */
export const MAX_HISTORY_MESSAGES = 12;

function contextBlock(context: TutorContext | null): string {
  if (!context) {
    return 'Studenten har öppnat handledaren utan någon särskild fråga eller något ärende framför sig.';
  }
  if (context.kind === 'general') {
    return `Det här vet appen om studentens studier just nu (${context.title}):\n\n${context.text}\n\nStudenten har ingen quizfråga eller något ärende framför sig. Hjälp till att välja vad som ska pluggas, förhör studenten eller förklara begrepp. Ställer du en övningsfråga: vänta på studentens svar innan du ger facit.`;
  }
  const status = context.answered
    ? 'Studenten HAR besvarat frågan eller lämnat in beslutet. Du får diskutera rätt svar, facit och modellbeslut.'
    : 'Studenten har INTE besvarat frågan eller lämnat in beslutet ännu. Avslöja inte rätt svar, modellsvar, modellbeslut eller bedömningspunkter (regel 7).';
  return `Det här har studenten framför sig just nu (${context.title}):\n\n${context.text}\n\n${status}`;
}

/** The three system blocks; only the legal-state block carries the cache marker. */
export function buildTutorSystem(context: TutorContext | null): TutorSystemBlock[] {
  return [
    { text: TUTOR_ROLE, cache: false },
    { text: `${LEGAL_BLOCK_HEADER}\n\n${LEGAL_STATUS_TEXT}`, cache: true },
    { text: contextBlock(context), cache: false },
  ];
}

/**
 * Keeps the conversation valid for the API: alternating roles starting with the user, the
 * last `MAX_HISTORY_MESSAGES` only, no empty messages.
 */
export function trimHistory(history: readonly TutorMessage[]): TutorMessage[] {
  const clean: TutorMessage[] = [];
  for (const message of history) {
    if (message.content.trim() === '') continue;
    const previous = clean.at(-1);
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      clean.push({ ...message });
    }
  }
  let recent = clean.slice(-MAX_HISTORY_MESSAGES);
  while (recent[0] && recent[0].role !== 'user') recent = recent.slice(1);
  // The new question is appended as a user message, so the history must end with the assistant.
  while (recent.at(-1)?.role === 'user') recent = recent.slice(0, -1);
  return recent;
}

/** The complete request for a new question in a conversation. */
export function buildTutorRequest(
  context: TutorContext | null,
  history: readonly TutorMessage[],
  question: string,
  model: TutorModelId,
): TutorRequest {
  const settings = TUTOR_REQUEST_SETTINGS[model];
  return {
    model: TUTOR_MODEL_INFO[model].id,
    maxTokens: settings.maxTokens,
    effort: settings.effort,
    system: buildTutorSystem(context),
    messages: [...trimHistory(history), { role: 'user', content: question.trim() }],
  };
}
