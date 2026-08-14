"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { CheckCircle2, FileArchive, FileSpreadsheet, LoaderCircle, LockKeyhole, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { parseFiles } from "@/lib/parser";
import { useDashboardStore } from "@/lib/store";

export function ImportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addBatches = useDashboardStore((state) => state.addBatches);
  const importing = useDashboardStore((state) => state.importing);
  const setImporting = useDashboardStore((state) => state.setImporting);
  const [progress, setProgress] = useState<string[]>([]);

  const onDrop = useCallback(async (accepted: File[], rejected: FileRejection[]) => {
    rejected.forEach(({ file, errors }) => toast.error(`${file.name}: ${errors[0]?.message ?? "arquivo inválido"}`));
    if (!accepted.length) return;
    setImporting(true);
    setProgress(accepted.map((file) => `Lendo ${file.name}…`));
    try {
      const batches = await parseFiles(accepted);
      await addBatches(batches);
      const rows = batches.reduce((sum, batch) => sum + batch.entry.rowCount, 0);
      const alerts = batches.reduce((sum, batch) => sum + batch.entry.issues.length, 0);
      setProgress(batches.map((batch) => `${batch.entry.name}: ${batch.entry.rowCount.toLocaleString("pt-BR")} linhas`));
      toast.success(`${rows.toLocaleString("pt-BR")} linhas processadas${alerts ? ` com ${alerts} alerta(s)` : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao processar os arquivos.");
    } finally {
      setImporting(false);
    }
  }, [addBatches, setImporting]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: importing,
    maxSize: 80 * 1024 * 1024,
    accept: {
      "application/zip": [".zip"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xlsm"],
      "application/vnd.ms-excel.sheet.macroenabled.12": [".xlsm"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
  });

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !importing && onClose()}>
      <section className="import-panel" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="import-panel__head">
          <div><span>Central de dados</span><h2 id="import-title">Importar planilhas</h2></div>
          <button className="icon-button" onClick={onClose} disabled={importing} aria-label="Fechar"><X size={20} /></button>
        </div>

        <div {...getRootProps({ className: isDragActive ? "dropzone is-active" : "dropzone" })}>
          <input {...getInputProps()} />
          <div className="dropzone__icon">{importing ? <LoaderCircle className="spin" size={28} /> : <FileArchive size={28} />}</div>
          <h3>{importing ? "Processando no navegador…" : isDragActive ? "Solte os arquivos aqui" : "Arraste ZIPs ou planilhas"}</h3>
          <p>Você pode selecionar vários lotes de uma vez. Cada ZIP continua independente.</p>
          <button className="primary-button" type="button" disabled={importing}><FileSpreadsheet size={17} />Selecionar arquivos</button>
          <small>XLSX, XLSM, XLS, CSV ou ZIP · até 80 MB por arquivo</small>
        </div>

        {progress.length > 0 && (
          <div className="import-progress">
            {progress.map((message, index) => <div key={`${message}-${index}`}>{importing ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />}<span>{message}</span></div>)}
          </div>
        )}

        <div className="recognized-sources">
          <h3>Estruturas reconhecidas automaticamente</h3>
          <div className="recognized-grid">
            {["Coordenadores", "KPI PNR", "Pré-fatura SVC/XPT/PNR", "Risco LM", "Transportistas"].map((label) => <span key={label}><CheckCircle2 size={15} />{label}</span>)}
          </div>
        </div>

        <div className="privacy-note"><LockKeyhole size={18} /><div><strong>Processamento local</strong><p>Os arquivos e os dados operacionais ficam no navegador deste dispositivo. Nenhuma macro VBA é executada.</p></div></div>
        <div className="warning-note"><TriangleAlert size={17} /><p>Importe também a planilha de coordenadores para habilitar os filtros Coordenador → Base/Sigla → Supervisor. <a href="/modelos/coordenadores.csv" download>Baixar modelo CSV</a></p></div>
      </section>
    </div>
  );
}
