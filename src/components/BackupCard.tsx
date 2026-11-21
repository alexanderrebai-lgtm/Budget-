import { useCallback, useEffect, useState } from 'react';
import { desktopBackup, listBackups, readBackup, snapshotNow, type LocalBackup } from '../backup/backups';
import { parseBackup, useStore } from '../store/store';
import { Card, toast } from './ui';

const size = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1000))} Ko`);

export default function BackupCard() {
  const replaceAll = useStore((s) => s.replaceAll);
  const desktop = desktopBackup();
  const [local, setLocal] = useState<LocalBackup[]>([]);
  const [files, setFiles] = useState<{ name: string; size: number; mtime: string }[]>([]);
  const [folder, setFolder] = useState('');
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    setLocal(await listBackups());
    if (desktop) {
      setFiles(await desktop.list());
      setFolder(await desktop.folder());
    }
  }, [desktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restore = async (json: string | null, label: string) => {
    if (!json) return toast('Sauvegarde illisible.');
    if (!confirm(`Remplacer toutes vos données par la sauvegarde du ${label} ? Une copie de l’état actuel est faite avant.`)) return;
    try {
      const data = parseBackup(json);
      await snapshotNow('Avant restauration');
      replaceAll({ ...data, settings: { ...data.settings, onboarded: true } });
      toast('Sauvegarde restaurée.');
      void refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const shown = showAll ? local : local.slice(0, 5);

  return (
    <Card title="Sauvegardes automatiques" actions={<button className="small" onClick={async () => { await snapshotNow('Copie manuelle'); toast('Copie enregistrée.'); void refresh(); }}>Faire une copie maintenant</button>}>
      <div className="stack" style={{ gap: 12 }}>
        <p className="muted small">
          Une copie complète est faite chaque jour à l’ouverture (14 jours gardés), et avant chaque action risquée (restauration, effacement,
          remplacement par la synchronisation). {desktop ? 'Le logiciel PC enregistre aussi un fichier par jour sur votre ordinateur (30 jours gardés).' : 'Ces copies restent dans ce navigateur : exportez aussi une sauvegarde de temps en temps.'}
        </p>
        {local.length === 0 ? (
          <p className="faint small">Aucune copie pour l’instant.</p>
        ) : (
          <div className="list">
            {shown.map((b) => {
              const label = new Date(b.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
              return (
                <div key={b.id} className="list-item small">
                  <span className="icon-chip">{b.id.startsWith('daily:') ? '🗓️' : '📌'}</span>
                  <div className="grow">
                    <div>{label} <span className="faint">· {b.reason}</span></div>
                    <div className="faint">{b.transactions} opérations · {b.accounts} comptes · {size(b.size)}</div>
                  </div>
                  <button className="small" onClick={async () => restore(await readBackup(b.id), label)}>Restaurer</button>
                </div>
              );
            })}
          </div>
        )}
        {local.length > 5 && <button className="ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Réduire' : `Voir les ${local.length} copies`}</button>}

        {desktop && (
          <div className="callout small stack" style={{ gap: 6 }}>
            <div className="row between">
              <span><strong>Fichiers sur l’ordinateur</strong> · {files.length} sauvegarde(s)</span>
              <button className="small" onClick={() => void desktop.openFolder()}>Ouvrir le dossier</button>
            </div>
            <span className="faint" style={{ wordBreak: 'break-all' }}>{folder}</span>
            {files[0] && (
              <div className="row between">
                <span>Dernière : {files[0].name.replace('cap-budget-', '').replace('.json', '')} ({size(files[0].size)})</span>
                <button className="small ghost" onClick={async () => restore(await desktop.read(files[0].name), files[0].name)}>Restaurer ce fichier</button>
              </div>
            )}
            <span className="faint">Astuce : placez ce dossier dans OneDrive, Google Drive ou Dropbox pour en avoir une copie hors de l’ordinateur.</span>
          </div>
        )}
      </div>
    </Card>
  );
}
