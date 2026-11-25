const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const corta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const conAno = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' })
const larga = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** «hace 5 minutos», «ayer», «hace 3 días», «12 nov», «3 mar 2024». */
export function fechaRelativa(ms: number, ahora = Date.now()): string {
  const s = (ahora - ms) / 1000
  if (s < 45) return 'ahora'
  if (s < 3600) return relativo.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return relativo.format(-Math.round(s / 3600), 'hour')
  if (s < 7 * 86400) return relativo.format(-Math.round(s / 86400), 'day')
  return new Date(ms).getFullYear() === new Date(ahora).getFullYear() ? corta.format(ms) : conAno.format(ms)
}

export function fechaLarga(ms: number): string {
  const t = larga.format(ms)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/** «src/main/git.ts» → { nombre: «git.ts», carpeta: «src/main» } */
export function partesRuta(ruta: string) {
  const i = ruta.lastIndexOf('/')
  return { nombre: ruta.slice(i + 1), carpeta: i > 0 ? ruta.slice(0, i) : '' }
}

const GRUPOS: Record<string, string> = { personal: 'Personal', work: 'Trabajo', company: 'Empresa', otros: 'Otros' }
export const nombreGrupo = (g: string) => GRUPOS[g] ?? g.charAt(0).toUpperCase() + g.slice(1)
