// Todo lo que Cauce le pide a git. Se usa el git del sistema (no una librería): así valen tal cual tu
// configuración, tus identidades por carpeta (includeIf), tus alias SSH, los hooks y el llavero.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { t } from './idioma'
import type { Archivo, Bloque, Fuente, Commit, DetalleCommit, Diff, Estado, InfoRepo, Letra, Linea, Operacion, Rama, Ref, Resumen } from '@shared/tipos'

// Contraseñas de SSH y de HTTPS en un diálogo gráfico (git corre sin terminal).
const ASKPASS = ['/usr/bin/ksshaskpass', '/usr/lib/ssh/ssh-askpass', '/usr/bin/ssh-askpass', '/usr/lib/seahorse/ssh-askpass'].find(existsSync)

const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  LC_ALL: 'C', // la salida de git, siempre en inglés: se analiza
  GIT_TERMINAL_PROMPT: '0', // nunca esperar a que alguien escriba en una terminal que no existe
  GIT_OPTIONAL_LOCKS: '0', // git status no bloquea el índice (no choca con el editor ni la terminal)
  ...(ASKPASS ? { SSH_ASKPASS: ASKPASS, SSH_ASKPASS_REQUIRE: 'force', GIT_ASKPASS: ASKPASS } : {}),
}

const MAX_SALIDA = 64 * 1024 * 1024

export class ErrorGit extends Error {}

interface Opciones {
  entrada?: string
  codigosValidos?: number[] // además del 0 (git diff --no-index sale con 1 si hay diferencias)
}

/** Ejecuta git en el repo y devuelve lo que escribe. Si falla, el error lleva el mensaje de git. */
export function git(repo: string, args: string[], o: Opciones = {}): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const p = spawn('git', args, { cwd: repo, env: ENV })
    const salida: Buffer[] = []
    const errores: Buffer[] = []
    let tamano = 0
    p.stdout.on('data', (d: Buffer) => {
      tamano += d.length
      if (tamano > MAX_SALIDA) return p.kill()
      salida.push(d)
    })
    p.stderr.on('data', (d: Buffer) => errores.push(d))
    p.on('error', (e) => rechazar(new ErrorGit(e.message)))
    p.on('close', (codigo) => {
      if (codigo === 0 || (codigo !== null && o.codigosValidos?.includes(codigo))) return resolver(Buffer.concat(salida).toString('utf8'))
      const msg = Buffer.concat(errores).toString('utf8').trim() || Buffer.concat(salida).toString('utf8').trim()
      rechazar(new ErrorGit(limpiarMensaje(msg) || t.git.fallo(args[0], String(codigo ?? 'killed'))))
    })
    if (o.entrada !== undefined) p.stdin.end(o.entrada)
    else p.stdin.end()
  })
}

/** Quita el ruido de los mensajes de git (pistas, «error:»…) y deja lo que importa. */
function limpiarMensaje(msg: string): string {
  return msg
    .split('\n')
    .filter((l) => !/^hint:/.test(l))
    .map((l) => l.replace(/^(error|fatal): /, ''))
    .join('\n')
    .trim()
}

// ------------------------------------------------------------ estado

const dirGit = new Map<string, string>()
async function carpetaGit(repo: string): Promise<string> {
  let d = dirGit.get(repo)
  if (!d) {
    d = (await git(repo, ['rev-parse', '--absolute-git-dir'])).trim()
    dirGit.set(repo, d)
  }
  return d
}

function operacionEnCurso(gitDir: string): Operacion {
  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) return 'rebase'
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge'
  if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
  if (existsSync(join(gitDir, 'REVERT_HEAD'))) return 'revert'
  return null
}

async function identidad(repo: string) {
  const leer = (clave: string) => git(repo, ['config', '--get', clave], { codigosValidos: [1] }).then((s) => s.trim())
  const [nombre, email] = await Promise.all([leer('user.name'), leer('user.email')])
  return { nombre, email }
}

const LETRAS = new Set(['M', 'A', 'D', 'R', 'C', 'T', 'U'])
const letra = (c: string): Letra => (LETRAS.has(c) ? (c as Letra) : 'M')

interface Cabecera {
  hash: string | null
  rama: string | null
  upstream: string | null
  delante: number
  detras: number
}

/** git status --porcelain=v2 -z: cabecera de la rama y archivos, separados en preparados, sin preparar y conflictos. */
function leerStatus(salida: string) {
  const cab: Cabecera = { hash: null, rama: null, upstream: null, delante: 0, detras: 0 }
  const preparados: Archivo[] = []
  const sinPreparar: Archivo[] = []
  const conflictos: Archivo[] = []
  const partes = salida.split('\0')
  for (let i = 0; i < partes.length; i++) {
    const l = partes[i]
    if (!l) continue
    if (l.startsWith('# ')) {
      const [, clave, ...resto] = l.split(' ')
      const valor = resto.join(' ')
      if (clave === 'branch.oid') cab.hash = valor === '(initial)' ? null : valor
      else if (clave === 'branch.head') cab.rama = valor === '(detached)' ? null : valor
      else if (clave === 'branch.upstream') cab.upstream = valor
      else if (clave === 'branch.ab') {
        const m = valor.match(/\+(\d+) -(\d+)/)
        if (m) [cab.delante, cab.detras] = [Number(m[1]), Number(m[2])]
      }
      continue
    }
    const tipo = l[0]
    if (tipo === '?') {
      sinPreparar.push({ ruta: l.slice(2), letra: '?' })
    } else if (tipo === '1' || tipo === '2') {
      // 1 XY sub mH mI mW hH hI ruta · 2 XY sub mH mI mW hH hI Xpuntos ruta\0original
      const campos = l.split(' ')
      const xy = campos[1]
      const ruta = campos.slice(tipo === '1' ? 8 : 9).join(' ')
      const original = tipo === '2' ? partes[++i] : undefined
      if (xy[0] !== '.') preparados.push({ ruta, original, letra: letra(xy[0]) })
      if (xy[1] !== '.') sinPreparar.push({ ruta, letra: letra(xy[1]) })
    } else if (tipo === 'u') {
      conflictos.push({ ruta: l.split(' ').slice(10).join(' '), letra: 'U' })
    }
  }
  return { cab, preparados, sinPreparar, conflictos }
}

const porRuta = (a: Archivo, b: Archivo) => a.ruta.localeCompare(b.ruta)

export async function estado(repo: string): Promise<Estado> {
  const [salida, gd, yo] = await Promise.all([
    git(repo, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
    carpetaGit(repo),
    identidad(repo),
  ])
  const { cab, preparados, sinPreparar, conflictos } = leerStatus(salida)
  const info: InfoRepo = { ruta: repo, ...cab, operacion: operacionEnCurso(gd), identidad: yo }
  return { info, preparados: preparados.sort(porRuta), sinPreparar: sinPreparar.sort(porRuta), conflictos: conflictos.sort(porRuta) }
}

/** Lo justo para la barra lateral: rama, cambios y si hay algo por subir o bajar. */
export async function resumen(repo: string): Promise<Resumen> {
  const { cab, preparados, sinPreparar, conflictos } = leerStatus(await git(repo, ['status', '--porcelain=v2', '--branch', '-z']))
  const rutas = new Set([...preparados, ...sinPreparar, ...conflictos].map((a) => a.ruta))
  return { rama: cab.rama, cambios: rutas.size, delante: cab.delante, detras: cab.detras }
}

// ------------------------------------------------------------ diffs

const MAX_LINEAS = 6000
const MAX_LINEAS_COMPLETO = 40000 // con «archivo completo» cabe mucho más

interface DiffCrudo {
  cabecera: string // de «diff --git» a «+++ b/…», tal cual (para volver a aplicar bloques sueltos)
  bloques: { cabecera: string; texto: string }[]
  binario: boolean
}

/** Separa la salida de git diff (un solo archivo) en su cabecera y sus bloques, sin tocar el texto. */
function trocear(salida: string): DiffCrudo {
  const lineas = salida.split('\n')
  if (lineas[lineas.length - 1] === '') lineas.pop()
  let i = 0
  const cab: string[] = []
  while (i < lineas.length && !lineas[i].startsWith('@@')) cab.push(lineas[i++])
  const binario = cab.some((l) => l.startsWith('Binary files') || l === 'GIT binary patch')
  const bloques: DiffCrudo['bloques'] = []
  while (i < lineas.length) {
    const inicio = i++
    while (i < lineas.length && !lineas[i].startsWith('@@')) i++
    bloques.push({ cabecera: lineas[inicio], texto: lineas.slice(inicio, i).join('\n') })
  }
  return { cabecera: cab.join('\n'), bloques, binario }
}

function analizar(crudo: DiffCrudo, nuevo: boolean, max = MAX_LINEAS): Diff {
  let total = 0
  let recortado = false
  const bloques: Bloque[] = []
  for (const b of crudo.bloques) {
    const m = b.cabecera.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    let viejo = m ? Number(m[1]) : 0
    let nuevoN = m ? Number(m[2]) : 0
    const lineas: Linea[] = []
    for (const l of b.texto.split('\n').slice(1)) {
      if (total++ > max) {
        recortado = true
        break
      }
      const tipo = (l[0] ?? ' ') as Linea['tipo']
      const texto = l.slice(1)
      if (tipo === '+') lineas.push({ tipo, texto, nuevo: nuevoN++ })
      else if (tipo === '-') lineas.push({ tipo, texto, viejo: viejo++ })
      else if (tipo === '\\') lineas.push({ tipo, texto })
      else lineas.push({ tipo: ' ', texto, viejo: viejo++, nuevo: nuevoN++ })
    }
    bloques.push({ cabecera: b.cabecera, lineas })
    if (recortado) break
  }
  return { binario: crudo.binario, nuevo, bloques, recortado }
}

/** Opciones de git diff. Con `completo`, todo el archivo como contexto (un solo bloque con todo). */
const baseDiff = (completo = false) => ['--no-color', '--no-ext-diff', '-M', completo ? '-U1000000' : '-U3']

async function diffCrudo(repo: string, a: Archivo, preparado: boolean, completo = false): Promise<DiffCrudo> {
  if (a.letra === '?') {
    return trocear(await git(repo, ['diff', ...baseDiff(completo), '--no-index', '--', '/dev/null', a.ruta], { codigosValidos: [1] }))
  }
  const rutas = a.original ? [a.original, a.ruta] : [a.ruta]
  return trocear(await git(repo, ['diff', ...baseDiff(completo), ...(preparado ? ['--cached'] : []), '--', ...rutas]))
}

/** El diff de un archivo con cambios: lo preparado (contra HEAD) o lo que no (contra el índice). */
export async function diff(repo: string, a: Archivo, preparado: boolean, completo = false): Promise<Diff> {
  return analizar(await diffCrudo(repo, a, preparado, completo), a.letra === '?' || a.letra === 'A', completo ? MAX_LINEAS_COMPLETO : MAX_LINEAS)
}

/** Prepara, quita del índice o descarta un único bloque de un archivo. */
export async function bloque(repo: string, a: Archivo, preparado: boolean, cabecera: string, indice: number, accion: 'preparar' | 'quitar' | 'descartar') {
  const crudo = await diffCrudo(repo, a, preparado)
  // El diff puede haber cambiado desde que se pintó: se busca el bloque por su cabecera.
  const b = crudo.bloques[indice]?.cabecera === cabecera ? crudo.bloques[indice] : crudo.bloques.find((x) => x.cabecera === cabecera)
  if (!b) throw new ErrorGit(t.git.archivoCambiado)
  const parche = `${crudo.cabecera}\n${b.texto}\n`
  const args = accion === 'preparar' ? ['--cached'] : accion === 'quitar' ? ['--cached', '--reverse'] : ['--reverse']
  await git(repo, ['apply', ...args, '--whitespace=nowarn', '-'], { entrada: parche })
}

// ------------------------------------------------------------ preparar, descartar y commit

export function preparar(repo: string, rutas: string[]) {
  return git(repo, ['add', '-A', '--', ...rutas])
}

export async function quitar(repo: string, rutas: string[], sinCommits: boolean) {
  if (sinCommits) await git(repo, ['rm', '--cached', '-r', '-q', '--', ...rutas])
  else await git(repo, ['restore', '--staged', '--', ...rutas])
}

/** Deshace los cambios sin preparar de archivos con seguimiento (los nuevos los manda a la papelera index.ts). */
export function descartar(repo: string, rutas: string[]) {
  return git(repo, ['restore', '--worktree', '--', ...rutas])
}

export function commit(repo: string, mensaje: string, modificar: boolean) {
  return git(repo, ['commit', '-F', '-', ...(modificar ? ['--amend'] : [])], { entrada: mensaje })
}

export async function ultimoMensaje(repo: string) {
  return (await git(repo, ['log', '-1', '--format=%B'])).trimEnd()
}

// ------------------------------------------------------------ historial

const remotos = new Map<string, Set<string>>()
async function nombresRemotos(repo: string, refrescar = false) {
  let r = remotos.get(repo)
  if (!r || refrescar) {
    r = new Set((await git(repo, ['remote'])).split('\n').filter(Boolean))
    remotos.set(repo, r)
  }
  return r
}

function leerRefs(d: string, rem: Set<string>): Ref[] {
  if (!d.trim()) return []
  const refs: Ref[] = []
  for (const parte of d.split(', ')) {
    if (parte.startsWith('HEAD -> ')) {
      refs.push({ nombre: parte.slice(8), tipo: 'head' })
    } else if (parte === 'HEAD') {
      refs.push({ nombre: 'HEAD', tipo: 'head' })
    } else if (parte.startsWith('tag: ')) {
      refs.push({ nombre: parte.slice(5), tipo: 'etiqueta' })
    } else if (rem.has(parte.split('/')[0]) && parte.includes('/')) {
      if (!parte.endsWith('/HEAD')) refs.push({ nombre: parte, tipo: 'remota' })
    } else refs.push({ nombre: parte, tipo: 'local' })
  }
  return refs
}

const SEP = '\x1f'
const FIN = '\x1e'

export async function historial(repo: string, o: { todas: boolean; cantidad: number; saltar: number; buscar?: string }): Promise<Commit[]> {
  const rem = await nombresRemotos(repo, o.saltar === 0)
  const args = ['log', '--date-order', `-n${o.cantidad}`, `--skip=${o.saltar}`, `--format=%H${SEP}%P${SEP}%aN${SEP}%aE${SEP}%at${SEP}%D${SEP}%s${FIN}`]
  if (o.buscar?.trim()) args.push('-i', '-F', `--grep=${o.buscar.trim()}`, `--author=${o.buscar.trim()}`)
  args.push(...(o.todas ? ['--branches', '--remotes', '--tags', 'HEAD'] : ['HEAD']), '--')
  const salida = await git(repo, args)
  return salida
    .split(FIN)
    .map((s) => s.replace(/^\n/, ''))
    .filter(Boolean)
    .map((s) => {
      const [hash, padres, autor, email, fecha, refs, asunto] = s.split(SEP)
      return { hash, padres: padres ? padres.split(' ') : [], autor, email, fecha: Number(fecha) * 1000, refs: leerRefs(refs, rem), asunto }
    })
}

/** numstat y name-status de un commit (contra su primer padre), juntos. */
async function archivosDe(repo: string, hash: string, padre: string | undefined): Promise<Archivo[]> {
  const base = ['diff-tree', '-r', '-M', '-z', '--no-commit-id', ...(padre ? [padre, hash] : ['--root', hash])]
  const [nombres, numeros] = await Promise.all([git(repo, [...base, '--name-status']), git(repo, [...base, '--numstat'])])
  const archivos: Archivo[] = []
  const n = nombres.split('\0')
  for (let i = 0; i < n.length - 1; ) {
    const st = n[i++]
    if (!st) continue
    if (st[0] === 'R' || st[0] === 'C') archivos.push({ letra: st[0] as Letra, original: n[i++], ruta: n[i++] })
    else archivos.push({ letra: letra(st[0]), ruta: n[i++] })
  }
  const stats = new Map<string, { mas?: number; menos?: number }>()
  const m = numeros.split('\0')
  for (let i = 0; i < m.length - 1; ) {
    const l = m[i++]
    if (!l) continue
    const [mas, menos, ruta] = l.split('\t')
    const final = ruta === '' ? (i++, m[i++]) : ruta // renombrado: «+\t-\t\0original\0nueva»
    stats.set(final, { mas: mas === '-' ? undefined : Number(mas), menos: menos === '-' ? undefined : Number(menos) })
  }
  return archivos.map((a) => ({ ...a, ...stats.get(a.ruta) }))
}

export async function detalle(repo: string, hash: string): Promise<DetalleCommit> {
  const s = await git(repo, ['show', '-s', `--format=%H${SEP}%P${SEP}%aN${SEP}%aE${SEP}%at${SEP}%cN${SEP}%ct${SEP}%B`, hash])
  const [h, padres, autor, email, fecha, committer, fechaCommit, ...mensaje] = s.split(SEP)
  const listaPadres = padres ? padres.split(' ') : []
  return {
    hash: h,
    padres: listaPadres,
    autor,
    email,
    fecha: Number(fecha) * 1000,
    committer,
    fechaCommit: Number(fechaCommit) * 1000,
    mensaje: mensaje.join(SEP).trimEnd(),
    archivos: await archivosDe(repo, h, listaPadres[0]),
  }
}

export async function diffCommit(repo: string, hash: string, padre: string | undefined, a: Archivo, completo = false): Promise<Diff> {
  const rutas = a.original ? [a.original, a.ruta] : [a.ruta]
  const salida = padre
    ? await git(repo, ['diff', ...baseDiff(completo), padre, hash, '--', ...rutas])
    : await git(repo, ['show', ...baseDiff(completo), '--format=', hash, '--', ...rutas])
  return analizar(trocear(salida), a.letra === 'A', completo ? MAX_LINEAS_COMPLETO : MAX_LINEAS)
}

// ------------------------------------------------------------ contenido de archivos (imágenes, PDF, hojas)

const MAX_ARCHIVO = 60 * 1024 * 1024

/** Como git(), pero devuelve los bytes tal cual (para archivos binarios). */
function gitBytes(repo: string, args: string[]): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const p = spawn('git', args, { cwd: repo, env: ENV })
    const trozos: Buffer[] = []
    const errores: Buffer[] = []
    let tamano = 0
    p.stdout.on('data', (d: Buffer) => {
      tamano += d.length
      if (tamano > MAX_ARCHIVO) return p.kill()
      trozos.push(d)
    })
    p.stderr.on('data', (d: Buffer) => errores.push(d))
    p.on('error', (e) => rechazar(new ErrorGit(e.message)))
    p.on('close', (codigo) =>
      codigo === 0 ? resolver(Buffer.concat(trozos)) : rechazar(new ErrorGit(limpiarMensaje(Buffer.concat(errores).toString('utf8')) || t.git.fallo(args[0], String(codigo ?? 'killed')))),
    )
    p.stdin.end()
  })
}

/**
 * Los bytes de una versión de un archivo: de git («HEAD:ruta», «hash:ruta», «:ruta» para el índice)
 * o del disco (ruta dentro del repo).
 */
export async function leerArchivo(repo: string, f: Fuente): Promise<Uint8Array> {
  if ('git' in f) return gitBytes(repo, ['cat-file', 'blob', f.git])
  const abs = resolve(repo, f.disco)
  if (abs !== repo && !abs.startsWith(repo + sep)) throw new ErrorGit('Path outside the repository')
  if ((await stat(abs)).size > MAX_ARCHIVO) throw new ErrorGit('File too large to preview')
  return readFile(abs)
}

// ------------------------------------------------------------ ramas

export async function ramas(repo: string): Promise<Rama[]> {
  const formato = ['%(refname)', '%(refname:short)', '%(HEAD)', '%(upstream:short)', '%(upstream:track,nobracket)', '%(committerdate:unix)', '%(contents:subject)'].join('%1f')
  const salida = await git(repo, ['for-each-ref', `--format=${formato}`, '--sort=-committerdate', 'refs/heads', 'refs/remotes'])
  const lista: Rama[] = []
  for (const l of salida.split('\n')) {
    if (!l) continue
    const [ref, corto, head, upstream, track, fecha, asunto] = l.split(SEP)
    if (ref.startsWith('refs/remotes/') && ref.endsWith('/HEAD')) continue
    lista.push({
      nombre: corto,
      tipo: ref.startsWith('refs/heads/') ? 'local' : 'remota',
      actual: head === '*',
      upstream: upstream || null,
      delante: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
      detras: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
      fecha: Number(fecha) * 1000,
      asunto,
    })
  }
  return lista
}

export async function cambiarRama(repo: string, nombre: string, remota: boolean) {
  if (!remota) return git(repo, ['switch', nombre])
  // Una remota («origin/x»): a su rama local si ya existe; si no, se crea siguiéndola.
  const local = nombre.split('/').slice(1).join('/')
  const existe = await git(repo, ['show-ref', '--verify', '--quiet', `refs/heads/${local}`]).then(
    () => true,
    () => false,
  )
  return existe ? git(repo, ['switch', local]) : git(repo, ['switch', '--track', nombre])
}

export async function crearRama(repo: string, nombre: string, desde: string | null, cambiar: boolean) {
  await git(repo, ['check-ref-format', '--branch', nombre]).catch(() => {
    throw new ErrorGit(t.git.nombreRama(nombre))
  })
  return cambiar ? git(repo, ['switch', '-c', nombre, ...(desde ? [desde] : [])]) : git(repo, ['branch', nombre, ...(desde ? [desde] : [])])
}

export function borrarRama(repo: string, nombre: string, forzar: boolean) {
  return git(repo, ['branch', forzar ? '-D' : '-d', nombre])
}

export function fusionar(repo: string, nombre: string) {
  return git(repo, ['merge', '--no-edit', nombre])
}

export function abortar(repo: string, op: Exclude<Operacion, null>) {
  return git(repo, [op, '--abort'])
}

// ------------------------------------------------------------ red

export function traer(repo: string) {
  return git(repo, ['fetch', '--all', '--prune'])
}

export function bajar(repo: string) {
  return git(repo, ['pull'])
}

export async function subir(repo: string, upstream: string | null) {
  if (upstream) return git(repo, ['push'])
  // Rama nueva: se publica en origin (o en el único remoto que haya) y se queda siguiéndolo.
  const rem = [...(await nombresRemotos(repo, true))]
  const destino = rem.includes('origin') ? 'origin' : rem[0]
  if (!destino) throw new ErrorGit(t.git.sinRemoto)
  return git(repo, ['push', '-u', destino, 'HEAD'])
}
