import { enableCompileCache } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { Archivo, Operacion } from '@shared/tipos'
import * as g from './git'
import { cambiarPreferencias, iniciarPreferencias, preferencias, repos } from './repos'

enableCompileCache?.()

// El app_id de Wayland sale del nombre del .desktop: así Hyprland ve «cauce».
process.env.CHROME_DESKTOP = 'cauce.desktop'
app.setName('cauce')
app.commandLine.appendSwitch('ozone-platform-hint', 'auto')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

iniciarPreferencias(app.getPath('userData'))

const ventana = () => BrowserWindow.getAllWindows()[0] as BrowserWindow | undefined

/** Lanza un programa suelto (editor, terminal), sin atarlo a Cauce. */
function lanzar(cmd: string, args: string[], cwd: string) {
  const p = spawn(cmd, args, { cwd, detached: true, stdio: 'ignore' })
  p.on('error', () => {})
  p.unref()
}

// ------------------------------------------------------------ vigilar el repo abierto

// Lo que cambia en .git (índice, HEAD, refs) avisa a la interfaz al momento: un commit o un cambio de
// rama hecho desde la terminal se ve sin esperar. Los cambios en los archivos se miran al volver a la
// ventana y cada pocos segundos (ver App.tsx).
let vigilantes: FSWatcher[] = []
let aviso: NodeJS.Timeout | null = null
async function vigilar(repo: string | null) {
  vigilantes.forEach((v) => v.close())
  vigilantes = []
  if (!repo) return
  const gd = (await g.git(repo, ['rev-parse', '--absolute-git-dir']).catch(() => '')).trim()
  if (!gd) return
  const avisar = (_e: string, archivo: string | null) => {
    if (archivo && /\.lock$/.test(archivo)) return
    if (aviso) clearTimeout(aviso)
    aviso = setTimeout(() => ventana()?.webContents.send('cauce:cambio', repo), 150)
  }
  for (const d of [gd, join(gd, 'refs', 'heads'), join(gd, 'refs', 'remotes')]) {
    if (!existsSync(d)) continue
    try {
      vigilantes.push(watch(d, { recursive: d !== gd }, avisar))
    } catch {
      /* sin inotify libres: queda el sondeo de la interfaz */
    }
  }
}

// ------------------------------------------------------------ API para la interfaz

const API = {
  repos: () => repos(),
  preferencias: () => preferencias(),
  recordar: (ultimo: string | null) =>
    cambiarPreferencias({ ultimo, recientes: ultimo ? [ultimo, ...preferencias().recientes.filter((r) => r !== ultimo)].slice(0, 8) : preferencias().recientes }),
  anadirRepo: async () => {
    const win = BrowserWindow.getFocusedWindow() ?? ventana()
    const r = await dialog.showOpenDialog(win!, { title: 'Añadir un repositorio', properties: ['openDirectory'] })
    const dir = r.filePaths[0]
    if (r.canceled || !dir) return null
    const raiz = (await g.git(dir, ['rev-parse', '--show-toplevel']).catch(() => '')).trim()
    if (!raiz) throw new Error('Esa carpeta no es un repositorio de git')
    if (!preferencias().extras.includes(raiz)) cambiarPreferencias({ extras: [...preferencias().extras, raiz] })
    return raiz
  },
  resumenes: async (rutas: string[]) => {
    // De cuatro en cuatro, para no lanzar cincuenta git a la vez.
    const out: Record<string, Awaited<ReturnType<typeof g.resumen>> | null> = {}
    const cola = [...rutas]
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let r = cola.shift(); r; r = cola.shift()) out[r] = await g.resumen(r).catch(() => null)
      }),
    )
    return out
  },
  vigilar: (repo: string | null) => vigilar(repo),

  estado: (repo: string) => g.estado(repo),
  diff: (repo: string, a: Archivo, preparado: boolean) => g.diff(repo, a, preparado),
  bloque: (repo: string, a: Archivo, preparado: boolean, cabecera: string, indice: number, accion: 'preparar' | 'quitar' | 'descartar') =>
    g.bloque(repo, a, preparado, cabecera, indice, accion),
  preparar: (repo: string, rutas: string[]) => g.preparar(repo, rutas).then(() => {}),
  quitar: (repo: string, rutas: string[], sinCommits: boolean) => g.quitar(repo, rutas, sinCommits),
  descartar: async (repo: string, archivos: Archivo[]) => {
    // Los archivos nuevos no tienen copia en git: van a la papelera, no se borran.
    const nuevos = archivos.filter((a) => a.letra === '?')
    const conSeguimiento = archivos.filter((a) => a.letra !== '?')
    for (const a of nuevos)
      await shell.trashItem(join(repo, a.ruta)).catch(() => {
        throw new Error(`No se ha podido mandar ${a.ruta} a la papelera (¿está en un disco sin papelera?)`)
      })
    if (conSeguimiento.length) await g.descartar(repo, conSeguimiento.map((a) => a.ruta))
  },
  commit: (repo: string, mensaje: string, modificar: boolean) => g.commit(repo, mensaje, modificar).then(() => {}),
  ultimoMensaje: (repo: string) => g.ultimoMensaje(repo),

  historial: (repo: string, o: Parameters<typeof g.historial>[1]) => g.historial(repo, o),
  detalle: (repo: string, hash: string) => g.detalle(repo, hash),
  diffCommit: (repo: string, hash: string, padre: string | undefined, a: Archivo) => g.diffCommit(repo, hash, padre, a),

  ramas: (repo: string) => g.ramas(repo),
  cambiarRama: (repo: string, nombre: string, remota: boolean) => g.cambiarRama(repo, nombre, remota).then(() => {}),
  crearRama: (repo: string, nombre: string, desde: string | null, cambiar: boolean) => g.crearRama(repo, nombre, desde, cambiar).then(() => {}),
  borrarRama: (repo: string, nombre: string, forzar: boolean) => g.borrarRama(repo, nombre, forzar).then(() => {}),
  fusionar: (repo: string, nombre: string) => g.fusionar(repo, nombre).then(() => {}),
  abortar: (repo: string, op: Exclude<Operacion, null>) => g.abortar(repo, op).then(() => {}),

  traer: (repo: string) => g.traer(repo).then(() => {}),
  bajar: (repo: string) => g.bajar(repo).then((s) => s.trim()),
  subir: (repo: string, upstream: string | null) => g.subir(repo, upstream).then(() => {}),

  abrirEn: (repo: string, donde: 'editor' | 'terminal' | 'carpeta') => {
    if (donde === 'editor') lanzar('zeditor', [repo], repo)
    else if (donde === 'terminal') lanzar('kitty', ['--directory', repo], repo)
    else shell.openPath(repo)
  },
  abrirEnlace: (url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  },
  /** La web del remoto (GitHub, GitLab…), si se puede deducir de su URL. */
  webRemoto: async (repo: string) => {
    const url = (await g.git(repo, ['remote', 'get-url', 'origin']).catch(() => '')).trim()
    if (!url) return null
    // git@github-trabajo:usuario/repo.git → https://github.com/usuario/repo (los alias de host de ~/.ssh/config se quitan)
    const m = url.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/) ?? url.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/)
    if (!m) return null
    const host = m[1].replace(/^(github|gitlab|bitbucket)[-.].*$/, (_, h: string) => (h === 'bitbucket' ? 'bitbucket.org' : `${h}.com`))
    return `https://${host}/${m[2]}`
  },
  copiar: (texto: string) => clipboard.writeText(texto),
  cerrarVentana: () => ventana()?.close(),
  salir: () => app.quit(),
}
export type ApiPrincipal = typeof API

ipcMain.handle('cauce', async (_e, metodo: keyof typeof API, ...args: unknown[]) => {
  const fn = API[metodo] as ((...a: unknown[]) => unknown) | undefined
  if (!fn) throw new Error(`Método desconocido: ${String(metodo)}`)
  return fn(...args)
})

function crearVentana(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'Cauce',
    icon: join(import.meta.dirname, '../../resources/cauce.png'),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  win.on('focus', () => win.webContents.send('cauce:foco'))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
  // Ctrl+Q sale; Ctrl+R recarga la interfaz solo en desarrollo.
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && i.control && i.key.toLowerCase() === 'q') {
      e.preventDefault()
      app.quit()
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return win
}

app.on('second-instance', () => {
  const w = ventana() ?? crearVentana()
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
})

app.whenReady().then(() => {
  crearVentana()
})

app.on('window-all-closed', () => app.quit())
