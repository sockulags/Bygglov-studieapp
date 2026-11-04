import { Download, RotateCcw, Upload } from 'lucide-react';
import { useState } from 'react';
import { queryClient } from '@/app/query-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BackupFormatError,
  dataKeys,
  exportStudyData,
  getDataStore,
  importStudyData,
  parseStudyDataBackup,
  type StudyDataBackup,
} from '@/data';
import { clearStudyRun } from '@/features/study/study-store';
import { formatWhen } from '@/lib/format';
import { getAppVersion, isTauri } from '@/lib/tauri';
import { openTextFile, saveTextFile } from '@/lib/text-file';
import { SettingsRow, SettingsSection } from './settings-layout';

type Status = { tone: 'ok' | 'error'; text: string } | null;

type Confirm = { kind: 'import'; backup: StudyDataBackup } | { kind: 'reset' } | null;

function exportFileName(now: Date): string {
  return `bygglov-studiedata-${now.toISOString().slice(0, 10)}.json`;
}

async function refreshEverything() {
  await queryClient.invalidateQueries({ queryKey: dataKeys.all });
}

export function DataSection() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const local = isTauri();

  const run = async (task: () => Promise<Status>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await task());
    } catch (error: unknown) {
      console.error(error);
      setStatus({
        tone: 'error',
        text:
          error instanceof BackupFormatError
            ? error.message
            : 'Något gick fel. Ingen data har ändrats.',
      });
    } finally {
      setBusy(false);
    }
  };

  const onExport = () =>
    run(async () => {
      const store = await getDataStore();
      const now = new Date();
      const backup = await exportStudyData(store, { appVersion: await getAppVersion(), now });
      const saved = await saveTextFile(exportFileName(now), `${JSON.stringify(backup, null, 2)}\n`);
      if (!saved) return null;
      return {
        tone: 'ok',
        text: `Exporterat: ${backup.data.answers.length} svar och ${backup.data.sessions.length} pass.`,
      };
    });

  const onPickImport = () =>
    run(async () => {
      const text = await openTextFile();
      if (text === null) return null;
      setConfirm({ kind: 'import', backup: parseStudyDataBackup(text) });
      return null;
    });

  const onConfirm = () => {
    const current = confirm;
    setConfirm(null);
    if (!current) return;
    void run(async () => {
      const store = await getDataStore();
      if (current.kind === 'import') {
        const result = await importStudyData(store, current.backup);
        clearStudyRun();
        await refreshEverything();
        return {
          tone: 'ok',
          text: `Inläst: ${result.answers} svar, ${result.sessions} pass och ${result.reviews} repetitionskort.`,
        };
      }
      await store.clearAll();
      clearStudyRun();
      await refreshEverything();
      return { tone: 'ok', text: 'All studiedata är raderad. Du börjar om från början.' };
    });
  };

  return (
    <SettingsSection
      id="settings-data"
      title="Data"
      description="Din studiedata ligger bara på den här datorn. Exportera den för att flytta den eller ha en säkerhetskopia."
    >
      <SettingsRow
        label="Exportera studiedata"
        hint="Sparar svar, pass, repetition och ärenden som en JSON-fil."
      >
        <Button variant="secondary" disabled={busy} onClick={() => void onExport()}>
          <Download aria-hidden="true" />
          Exportera
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Importera studiedata"
        hint="Läser in en tidigare exporterad fil. Den ersätter det som finns nu."
      >
        <Button variant="secondary" disabled={busy} onClick={() => void onPickImport()}>
          <Upload aria-hidden="true" />
          Importera
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Återställ"
        hint="Raderar all studiedata och börjar om från början. Går inte att ångra."
      >
        <Button variant="danger" disabled={busy} onClick={() => setConfirm({ kind: 'reset' })}>
          <RotateCcw aria-hidden="true" />
          Återställ
        </Button>
      </SettingsRow>
      {(status || !local) && (
        <div className="px-6 py-4 text-sm" aria-live="polite">
          {status && (
            <p className={status.tone === 'error' ? 'text-brick' : 'text-success'}>{status.text}</p>
          )}
          {!local && (
            <p className="text-muted">
              I webbläsaren sparas studiedatan bara tills sidan laddas om. I den installerade appen
              ligger den kvar på datorn.
            </p>
          )}
        </div>
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === 'import' ? 'Läsa in studiedata?' : 'Radera all studiedata?'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === 'import'
                ? `Filen exporterades ${formatWhen(confirm.backup.exportedAt)} och innehåller ${confirm.backup.data.answers.length} svar och ${confirm.backup.data.sessions.length} pass. Det ersätter all studiedata som finns i appen nu.`
                : 'Alla svar, pass, repetitioner och ärenden raderas. Exportera först om du vill kunna gå tillbaka.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Avbryt</Button>
            </DialogClose>
            <Button variant={confirm?.kind === 'reset' ? 'danger' : 'primary'} onClick={onConfirm}>
              {confirm?.kind === 'import' ? 'Läs in och ersätt' : 'Radera allt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
