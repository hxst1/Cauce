// Tipos compartidos entre el proceso principal y la interfaz.

/** Un repositorio de la barra lateral. */
export interface Repo {
  ruta: string
  nombre: string
  grupo: string // personal | work | company | otros (la carpeta de ~/dev de la que cuelga)
}

export type Operacion = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null

export interface InfoRepo {
  ruta: string
  rama: string | null // null: HEAD separada
  hash: string | null // null: repo sin commits
  upstream: string | null
  delante: number // commits por subir
  detras: number // commits por bajar
  operacion: Operacion
  identidad: { nombre: string; email: string }
}

/** M modificado · A añadido · D borrado · R renombrado · C copiado · T tipo · U en conflicto · ? sin seguimiento */
export type Letra = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?'

export interface Archivo {
  ruta: string
  original?: string // de dónde viene, si es un renombrado o una copia
  letra: Letra
  mas?: number // líneas añadidas (en el detalle de un commit)
  menos?: number
}

export interface Estado {
  info: InfoRepo
  preparados: Archivo[]
  sinPreparar: Archivo[] // modificados y sin seguimiento
  conflictos: Archivo[]
}

/** Resumen de un repo para la barra lateral. */
export interface Resumen {
  rama: string | null
  cambios: number
  delante: number
  detras: number
}

export interface Ref {
  nombre: string
  tipo: 'head' | 'local' | 'remota' | 'etiqueta'
}

export interface Commit {
  hash: string
  padres: string[]
  autor: string
  email: string
  fecha: number // ms
  refs: Ref[]
  asunto: string
}

export interface DetalleCommit {
  hash: string
  padres: string[]
  autor: string
  email: string
  fecha: number
  committer: string
  fechaCommit: number
  mensaje: string // entero: asunto y cuerpo
  archivos: Archivo[]
}

export interface Rama {
  nombre: string // «main», «origin/main»
  tipo: 'local' | 'remota'
  actual: boolean
  upstream: string | null
  delante: number
  detras: number
  fecha: number
  asunto: string
}

export interface Linea {
  tipo: ' ' | '+' | '-' | '\\'
  texto: string
  viejo?: number
  nuevo?: number
}

export interface Bloque {
  cabecera: string // «@@ -1,4 +1,5 @@ función»
  lineas: Linea[]
}

export interface Diff {
  binario: boolean
  nuevo: boolean // archivo sin seguimiento o añadido
  bloques: Bloque[]
  recortado: boolean // tan grande que no se muestra entero
}

/** Lo que sale de una operación con red (fetch, pull, push…): el texto de git, por si hay algo que contar. */
export interface Resultado {
  salida: string
}
