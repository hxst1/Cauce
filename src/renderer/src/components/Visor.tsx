// Archivos que no se leen como texto: imágenes (antes y después, lado a lado), PDF (con el visor de
// Chromium) y hojas de cálculo (tabla por hoja, con las celdas que cambian resaltadas).
import { useEffect, useMemo, useState } from 'react'
import { FileXls, ImageSquare, FilePdf, Warning } from '@phosphor-icons/react'
import type { Fuente } from '@shared/tipos'
import { api, mensajeError } from '@/api'
import { t } from '@/i18n'

export type TipoVista = 'texto' | 'imagen' | 'pdf' | 'hoja'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}
const HOJAS = new Set(['xlsx', 'xlsm', 'xlsb', 'xls', 'ods'])

const extension = (ruta: string) => ruta.slice(ruta.lastIndexOf('.') + 1).toLowerCase()

export function tipoVista(ruta: string): TipoVista {
  const ext = extension(ruta)
  if (ext === 'pdf') return 'pdf'
  if (MIME[ext]) return 'imagen'
  if (HOJAS.has(ext)) return 'hoja'
  return 'texto'
}

function tamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Version {
  bytes: Uint8Array
  url: string
}

/** Carga las dos versiones (la que no exista, null) y les da una URL blob: para pintarlas. */
function useVersiones(repo: string, ruta: string, antes: Fuente | null, despues: Fuente | null, conUrl: boolean) {
  const [estado, setEstado] = useState<{ antes: Version | null; despues: Version | null; error: string | null; listo: boolean }>({
    antes: null,
    despues: null,
    error: null,
    listo: false,
  })
  const clave = JSON.stringify([repo, antes, despues])
  useEffect(() => {
    let vivo = true
    const urls: string[] = []
    const tipo = MIME[extension(ruta)] ?? 'application/octet-stream'
    const cargar = async (f: Fuente | null): Promise<Version | null> => {
      if (!f) return null
      const bytes = await api.leerArchivo(repo, f)
      const url = conUrl ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo })) : ''
      if (url) urls.push(url)
      return { bytes, url }
    }
    setEstado((e) => ({ ...e, listo: false, error: null }))
    Promise.all([cargar(antes), cargar(despues)]).then(
      ([a, d]) => vivo && setEstado({ antes: a, despues: d, error: null, listo: true }),
      (e) => vivo && setEstado({ antes: null, despues: null, error: mensajeError(e), listo: true }),
    )
    return () => {
      vivo = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, ruta, conUrl])
  return estado
}

export function VisorBinario({ repo, ruta, antes, despues }: { repo: string; ruta: string; antes: Fuente | null; despues: Fuente | null }) {
  const tipo = tipoVista(ruta)
  const v = useVersiones(repo, ruta, antes, despues, tipo !== 'hoja')

  if (v.error)
    return (
      <div className="visor-nota">
        <Warning size={16} /> {v.error}
      </div>
    )
  if (!v.listo) return <div className="visor-nota">{t.visor.cargando}</div>
  if (tipo === 'imagen') return <Imagenes antes={v.antes} despues={v.despues} />
  if (tipo === 'pdf') return <Pdf antes={v.antes} despues={v.despues} />
  return <Hoja antes={v.antes?.bytes ?? null} despues={v.despues?.bytes ?? null} />
}

// ------------------------------------------------------------ imágenes

function Imagenes({ antes, despues }: { antes: Version | null; despues: Version | null }) {
  return (
    <div className={`visor-imagenes${antes && despues ? ' dos' : ''}`}>
      {antes && <Figura v={antes} etiqueta={t.visor.antes} clase="antes" />}
      {despues && <Figura v={despues} etiqueta={antes ? t.visor.despues : t.visor.nuevo} clase="despues" />}
    </div>
  )
}

function Figura({ v, etiqueta, clase }: { v: Version; etiqueta: string; clase: string }) {
  const [dim, setDim] = useState<string | null>(null)
  return (
    <figure className={`visor-figura ${clase}`}>
      <div className="ajedrez">
        <img src={v.url} alt={etiqueta} onLoad={(e) => setDim(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} />
      </div>
      <figcaption>
        <ImageSquare size={13} />
        <b>{etiqueta}</b>
        {dim && <span>{dim}</span>}
        <span>{tamano(v.bytes.length)}</span>
      </figcaption>
    </figure>
  )
}

// ------------------------------------------------------------ PDF

function Pdf({ antes, despues }: { antes: Version | null; despues: Version | null }) {
  const [lado, setLado] = useState<'antes' | 'despues'>(despues ? 'despues' : 'antes')
  const actual = lado === 'antes' ? antes : despues
  return (
    <div className="visor-pdf">
      <div className="visor-barra">
        <FilePdf size={14} />
        {antes && despues ? (
          <div className="segmentado">
            <button className={lado === 'antes' ? 'activo' : ''} onClick={() => setLado('antes')}>
              {t.visor.antes}
            </button>
            <button className={lado === 'despues' ? 'activo' : ''} onClick={() => setLado('despues')}>
              {t.visor.despues}
            </button>
          </div>
        ) : (
          <b>{despues ? t.visor.nuevo : t.visor.antes}</b>
        )}
        {actual && <span>{tamano(actual.bytes.length)}</span>}
      </div>
      {actual && <iframe key={actual.url} src={actual.url} title="PDF" />}
    </div>
  )
}

// ------------------------------------------------------------ hojas de cálculo

const MAX_FILAS = 1000
const MAX_COLUMNAS = 60

type Rejilla = string[][]
type Libro = Map<string, Rejilla>

async function leerLibro(bytes: Uint8Array): Promise<Libro> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true })
  const libro: Libro = new Map()
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: false, defval: '', blankrows: true })
    libro.set(
      nombre,
      filas.map((f) => f.map((c) => (c == null ? '' : String(c)))),
    )
  }
  return libro
}

const letraColumna = (c: number) => {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function Hoja({ antes, despues }: { antes: Uint8Array | null; despues: Uint8Array | null }) {
  const [libros, setLibros] = useState<{ a: Libro | null; d: Libro | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoja, setHoja] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([antes ? leerLibro(antes) : null, despues ? leerLibro(despues) : null]).then(
      ([a, d]) => vivo && setLibros({ a, d }),
      (e) => vivo && setError(mensajeError(e)),
    )
    return () => {
      vivo = false
    }
  }, [antes, despues])

  // Las hojas de la versión nueva, en su orden, y después las que se han borrado.
  const hojas = useMemo(() => {
    if (!libros) return []
    const nombres = [...(libros.d?.keys() ?? [])]
    for (const n of libros.a?.keys() ?? []) if (!nombres.includes(n)) nombres.push(n)
    return nombres.map((n) => {
      const a = libros.a?.get(n)
      const d = libros.d?.get(n)
      const estado = !libros.a ? 'igual' : !a ? 'nueva' : !d ? 'borrada' : JSON.stringify(a) === JSON.stringify(d) ? 'igual' : 'cambiada'
      return { nombre: n, estado }
    })
  }, [libros])

  useEffect(() => {
    if (hojas.length && !hojas.some((h) => h.nombre === hoja)) setHoja((hojas.find((h) => h.estado !== 'igual') ?? hojas[0]).nombre)
  }, [hojas, hoja])

  const tabla = useMemo(() => {
    if (!libros || !hoja) return null
    const a = libros.a?.get(hoja) ?? (libros.a ? [] : null) // null: no hay versión anterior (archivo nuevo)
    const d = libros.d?.get(hoja) ?? []
    const filas = Math.max(a?.length ?? 0, d.length)
    const columnas = Math.max(0, ...(a ?? []).map((f) => f.length), ...d.map((f) => f.length))
    let cambios = 0
    const celdas: { texto: string; viejo: string; clase: string }[][] = []
    for (let r = 0; r < Math.min(filas, MAX_FILAS); r++) {
      const fila = []
      for (let c = 0; c < Math.min(columnas, MAX_COLUMNAS); c++) {
        const viejo = a?.[r]?.[c] ?? ''
        const nuevo = libros.d ? (d[r]?.[c] ?? '') : viejo // archivo borrado: se ve lo que había
        let clase = ''
        if (a && libros.d && viejo !== nuevo) {
          clase = !viejo ? 'nueva' : !nuevo ? 'borrada' : 'cambiada'
          cambios++
        }
        fila.push({ texto: clase === 'borrada' ? viejo : nuevo, viejo, clase })
      }
      celdas.push(fila)
    }
    return { celdas, columnas: Math.min(columnas, MAX_COLUMNAS), recortada: filas > MAX_FILAS || columnas > MAX_COLUMNAS, cambios }
  }, [libros, hoja])

  if (error)
    return (
      <div className="visor-nota">
        <Warning size={16} /> {error}
      </div>
    )
  if (!libros || !tabla) return <div className="visor-nota">{t.visor.cargando}</div>

  return (
    <div className="visor-hoja">
      <div className="visor-barra">
        <FileXls size={14} />
        <div className="hojas">
          {hojas.map((h) => (
            <button key={h.nombre} className={`${h.nombre === hoja ? 'activa' : ''} h-${h.estado}`} onClick={() => setHoja(h.nombre)} title={t.visor.estadoHoja[h.estado as keyof typeof t.visor.estadoHoja]}>
              {h.nombre}
            </button>
          ))}
        </div>
        {libros.a && libros.d && <span>{t.visor.celdasCambiadas(tabla.cambios)}</span>}
      </div>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th />
              {Array.from({ length: tabla.columnas }, (_, c) => (
                <th key={c}>{letraColumna(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.celdas.map((fila, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {fila.map((celda, c) => (
                  <td key={c} className={celda.clase} title={celda.clase === 'cambiada' ? t.visor.antesEra(celda.viejo) : undefined}>
                    {celda.texto}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabla.recortada && <div className="visor-nota">{t.visor.recortada(MAX_FILAS, MAX_COLUMNAS)}</div>}
    </div>
  )
}
