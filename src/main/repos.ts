// Los repositorios que salen en la barra lateral: los que hay en ~/dev (agrupados por la carpeta de
// primer nivel: personal, work, company…) más los que se añadan a mano. Y las preferencias de Cauce.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { Repo } from '@shared/tipos'

const IGNORAR = new Set(['node_modules', 'vendor', 'dist', 'out', 'build', 'target', '__pycache__', 'venv'])
const PROFUNDIDAD = 4

export interface Preferencias {
  raices: string[] // dónde buscar repos
  extras: string[] // añadidos a mano
  ultimo: string | null // el repo abierto la última vez
  recientes: string[] // los últimos abiertos, el más reciente primero (para la paleta)
  [clave: string]: unknown
}

let ruta = ''
let prefs: Preferencias = { raices: [join(homedir(), 'dev')], extras: [], ultimo: null, recientes: [] }

export function iniciarPreferencias(dirDatos: string) {
  ruta = join(dirDatos, 'preferencias.json')
  try {
    prefs = { ...prefs, ...(JSON.parse(readFileSync(ruta, 'utf8')) as Partial<Preferencias>) }
  } catch {
    /* primera vez */
  }
}

export const preferencias = () => prefs

export function cambiarPreferencias(cambio: Partial<Preferencias>) {
  prefs = { ...prefs, ...cambio }
  mkdirSync(join(ruta, '..'), { recursive: true })
  writeFileSync(ruta + '.tmp', JSON.stringify(prefs, null, 2) + '\n')
  renameSync(ruta + '.tmp', ruta)
}

async function buscar(dir: string, nivel: number, encontrados: string[]) {
  if (existsSync(join(dir, '.git'))) return void encontrados.push(dir) // los submódulos no se recorren
  if (nivel >= PROFUNDIDAD) return
  let entradas
  try {
    entradas = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  await Promise.all(
    entradas
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORAR.has(e.name))
      .map((e) => buscar(join(dir, e.name), nivel + 1, encontrados)),
  )
}

/** «/home/ana/dev/personal/cauce» → «~/dev/personal» */
function abreviar(ruta: string) {
  const d = dirname(ruta)
  const casa = homedir()
  return d === casa || d.startsWith(casa + sep) ? '~' + d.slice(casa.length) : d
}

export async function repos(): Promise<Repo[]> {
  const lista: Repo[] = []
  const vistos = new Set<string>()
  for (const raiz of prefs.raices) {
    const encontrados: string[] = []
    await buscar(raiz, 0, encontrados)
    for (const r of encontrados) {
      if (vistos.has(r)) continue
      vistos.add(r)
      const rel = relative(raiz, r)
      // ~/dev/personal/proyectos/cauce → grupo «personal»; un repo directamente en la raíz, «otros».
      const grupo = rel.includes(sep) ? rel.split(sep)[0] : 'otros'
      lista.push({ ruta: r, nombre: basename(r), carpeta: abreviar(r), grupo })
    }
  }
  for (const r of prefs.extras) {
    if (vistos.has(r) || !existsSync(join(r, '.git'))) continue
    vistos.add(r)
    lista.push({ ruta: r, nombre: basename(r), carpeta: abreviar(r), grupo: 'otros' })
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { sensitivity: 'base' }))
}
