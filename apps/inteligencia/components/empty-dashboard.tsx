"use client";

import { FileSpreadsheet, FlaskConical, LockKeyhole } from "lucide-react";
import { useDashboardStore } from "@/lib/store";

export function EmptyDashboard({ onImport, canImport }: { onImport: () => void; canImport: boolean }) {
  const loadDemo = useDashboardStore((state) => state.loadDemo);
  return (
    <section className="empty-dashboard">
      <div className="empty-dashboard__copy">
        <span className="eyebrow">Comece pela fonte</span>
        <h2>Transforme suas planilhas em uma visão operacional única.</h2>
        <p>Importe os ZIPs enviados pelas bases e a planilha de coordenadores. O painel identifica as abas, cruza IDs explícitos e ativa os filtros hierárquicos.</p>
        <div className="empty-dashboard__actions">
          <button className="primary-button" onClick={onImport} disabled={!canImport} title={canImport ? "Importar dados reais" : "Importação restrita a Diretor/ADM"}><FileSpreadsheet size={18} />Importar dados reais</button>
          <button className="secondary-button" onClick={() => void loadDemo()}><FlaskConical size={18} />Ver demonstração</button>
        </div>
        <div className="local-pill"><LockKeyhole size={15} />Arquivos salvos no Supabase privado</div>
      </div>
      <div className="source-stack" aria-label="Fontes suportadas">
        <div><i>01</i><span><strong>Hierarquia</strong><small>Coordenador, supervisor, sigla e base</small></span><em>XLSX</em></div>
        <div><i>02</i><span><strong>Operação</strong><small>PNR, pré-fatura e risco LM</small></span><em>ZIP</em></div>
        <div><i>03</i><span><strong>Motoristas</strong><small>Entregas, incidentes e penalidades</small></span><em>XLSX</em></div>
      </div>
    </section>
  );
}
