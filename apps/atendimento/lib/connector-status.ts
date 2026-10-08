export type ConnectorPing = {
  installed: boolean;
  version?: string;
  extensionId?: string;
  mlTabAvailable?: boolean;
};

export function connectorStatus(
  ping: ConnectorPing | null,
  requiredVersion: string,
  checked = false,
) {
  if (!checked) {
    return { kind: "checking" as const, ready: false, label: "Verificando comunicação com a extensão…" };
  }
  if (!ping?.installed) {
    return {
      kind: "unreachable" as const,
      ready: false,
      label: "Sem resposta nesta aba. A extensão pode estar instalada; recarregue esta página e verifique novamente.",
    };
  }
  if (!ping.version || ping.version !== requiredVersion) {
    return {
      kind: "version-mismatch" as const,
      ready: false,
      label: `Versão detectada: ${ping.version || "não informada"}. Versão necessária: ${requiredVersion}.`,
    };
  }
  return {
    kind: "ready" as const,
    ready: true,
    label: `ALC PNR Connector v${ping.version} detectado e atualizado.`,
  };
}
