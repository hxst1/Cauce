import { contextBridge, ipcRenderer } from 'electron'
import type { ApiPrincipal } from '../main/index'
import type { InfoIdioma } from '../shared/i18n'

type Promesa<F> = F extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never
type Api = { [K in keyof ApiPrincipal]: Promesa<ApiPrincipal[K]> }

// contextBridge copia propiedades: hace falta un objeto normal con cada método, no un Proxy.
const METODOS: (keyof ApiPrincipal)[] = [
  'repos', 'preferencias', 'recordar', 'anadirRepo', 'resumenes', 'vigilar',
  'estado', 'diff', 'bloque', 'preparar', 'quitar', 'descartar', 'commit', 'ultimoMensaje',
  'historial', 'detalle', 'diffCommit', 'leerArchivo',
  'ramas', 'cambiarRama', 'crearRama', 'borrarRama', 'fusionar', 'abortar',
  'traer', 'bajar', 'subir',
  'abrirEn', 'abrirEnlace', 'webRemoto', 'copiar', 'cerrarVentana', 'salir',
]

const api = Object.fromEntries(METODOS.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke('cauce', m, ...args)])) as Api

const escuchar = (canal: string) => (fn: (...a: unknown[]) => void) => {
  const h = (_e: unknown, ...a: unknown[]) => fn(...a)
  ipcRenderer.on(canal, h)
  return () => {
    ipcRenderer.removeListener(canal, h)
  }
}

const cauce = {
  api,
  idioma: ipcRenderer.sendSync('cauce:idioma') as InfoIdioma,
  // Algo ha cambiado en el .git del repo vigilado (commit, cambio de rama…).
  alCambio: escuchar('cauce:cambio') as (fn: (repo: string) => void) => () => void,
  // La ventana ha vuelto a tener el foco: buen momento para mirar si hay cambios.
  alFoco: escuchar('cauce:foco') as (fn: () => void) => () => void,
}

contextBridge.exposeInMainWorld('cauce', cauce)

export type CauceApi = typeof cauce
