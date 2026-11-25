export const api = window.cauce.api

/** El mensaje de un error del principal, sin el «Error invoking remote method…» de Electron. */
export function mensajeError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/, '')
}
