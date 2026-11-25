import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VList, type VListHandle } from 'virtua'
import { ArrowsInLineVertical, ArrowsOutLineVertical, CaretRight, Copy, GitCommit, GitMerge, Tag } from '@phosphor-icons/react'
import type { Commit, DetalleCommit, Diff, InfoRepo, Ref } from '@shared/tipos'
import { api, mensajeError } from '@/api'
import { calcularGrafo, colorCarril, type FilaGrafo } from '@/grafo'
import { fechaLarga, fechaRelativa, iniciales, partesRuta } from '@/formato'
import { t } from '@/i18n'
import { Letra } from '@/components/Cambios'
import { VistaDiff } from '@/components/VistaDiff'
import { tipoVista, VisorBinario } from '@/components/Visor'

const ALTO = 52 // alto de cada fila: el grafo se dibuja fila a fila y tiene que encajar
const PASO = 14 // separación entre carriles
const MAX_CARRILES = 8 // más allá, el grafo se corta (con muchas ramas abiertas el texto se iría muy a la derecha)
const POR_PAGINA = 400

export function Historial({
  repo,
  info,
  version,
  todas,
  buscar,
  avisar,
  onMenu,
}: {
  repo: string
  info: InfoRepo
  version: number // cambia cuando hay commits o ramas nuevas: se vuelve a cargar
  todas: boolean
  buscar: string
  avisar: (texto: string, error?: boolean) => void
  onMenu: (x: number, y: number, c: Commit) => void
}) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [fin, setFin] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const cargando = useRef(false)
  const lista = useRef<VListHandle>(null)

  const cargar = useCallback(
    async (desde: number) => {
      if (cargando.current) return
      cargando.current = true
      try {
        if (info.hash === null) {
          setCommits([])
          setFin(true)
          return
        }
        const nuevos = await api.historial(repo, { todas, cantidad: POR_PAGINA, saltar: desde, buscar })
        setCommits((c) => (desde === 0 ? nuevos : [...c, ...nuevos]))
        setFin(nuevos.length < POR_PAGINA)
      } catch (e) {
        avisar(mensajeError(e), true)
      } finally {
        cargando.current = false
      }
    },
    [repo, todas, buscar, info.hash, avisar],
  )

  useEffect(() => {
    cargar(0)
  }, [cargar, version])
  useEffect(() => {
    setSel(null)
    lista.current?.scrollTo(0)
  }, [repo, buscar, todas])
  // Al entrar, el último commit elegido; si no está, el primero.
  useEffect(() => {
    if (commits.length && (!sel || !commits.some((c) => c.hash === sel))) setSel(commits[0].hash)
  }, [commits, sel])

  const buscando = !!buscar.trim()
  const grafo = useMemo(() => (buscando ? null : calcularGrafo(commits)), [commits, buscando])
  const ancho = grafo ? Math.min(grafo.carriles, MAX_CARRILES) * PASO + 10 : 0
  const actual = commits.find((c) => c.hash === sel)
  const padreDe = useMemo(() => new Map(commits.map((c) => [c.hash, c])), [commits])

  const alScroll = () => {
    const l = lista.current
    if (!l || fin || cargando.current) return
    if (l.scrollOffset + l.viewportSize > l.scrollSize - ALTO * 40) cargar(commits.length)
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = commits.findIndex((c) => c.hash === sel)
    const n = Math.min(commits.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
    if (commits[n]) {
      setSel(commits[n].hash)
      lista.current?.scrollToIndex(n, { align: 'nearest' })
    }
  }

  return (
    <div className="contenido columnas-historial">
      {commits.length === 0 ? (
        <div className="panel-lista vacio">
          <GitCommit size={38} weight="light" />
          <span>{info.hash === null ? t.historial.sinCommits : buscando ? t.historial.ninguno : t.historial.cargando}</span>
        </div>
      ) : (
        <div className="panel-lista historial" tabIndex={0} onKeyDown={teclas}>
          <VList ref={lista} data={commits} itemSize={ALTO} bufferSize={600} onScroll={alScroll} className="lista-commits">
            {(c, i) => (
              <FilaCommit
                key={c.hash}
                c={c}
                fila={grafo?.filas[i]}
                ancho={ancho}
                activa={c.hash === sel}
                head={c.hash === info.hash}
                onSel={setSel}
                onMenu={onMenu}
              />
            )}
          </VList>
        </div>
      )}
      <div className="panel-diff">
        {actual ? (
          <Detalle repo={repo} hash={actual.hash} refs={actual.refs} avisar={avisar} onIrA={(h) => padreDe.has(h) && setSel(h)} />
        ) : (
          <div className="vacio">
            <GitCommit size={38} weight="light" />
            <span>{t.historial.eligeCommit}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const Grafo = memo(function Grafo({ fila, ancho, head }: { fila: FilaGrafo; ancho: number; head: boolean }) {
  const x = (c: number) => 9 + c * PASO
  const y = (v: 0 | 1 | 2) => (v * ALTO) / 2
  return (
    <svg className="grafo" width={ancho} height={ALTO} viewBox={`0 0 ${ancho} ${ALTO}`}>
      {fila.segmentos.map((s, i) => {
        const [x1, y1, x2, y2] = [x(s.x1), y(s.y1), x(s.x2), y(s.y2)]
        const ym = (y1 + y2) / 2
        const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`
        return <path key={i} d={d} stroke={colorCarril(s.color)} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      })}
      {head && <circle cx={x(fila.col)} cy={ALTO / 2} r={7.5} fill="none" stroke={colorCarril(fila.color)} strokeOpacity={0.5} strokeWidth={1.5} />}
      {fila.merge ? (
        <circle cx={x(fila.col)} cy={ALTO / 2} r={3.6} fill="#1a1b1d" stroke={colorCarril(fila.color)} strokeWidth={1.8} />
      ) : (
        <circle cx={x(fila.col)} cy={ALTO / 2} r={4.4} fill={colorCarril(fila.color)} />
      )}
    </svg>
  )
})

export function Pildora({ r }: { r: Ref }) {
  return (
    <span className={`pildora p-${r.tipo}`} title={r.tipo === 'remota' ? t.historial.ramaRemota(r.nombre) : r.tipo === 'etiqueta' ? t.historial.etiqueta(r.nombre) : t.historial.rama(r.nombre)}>
      {r.tipo === 'etiqueta' && <Tag size={10} weight="bold" />}
      {r.nombre}
    </span>
  )
}

const FilaCommit = memo(function FilaCommit({
  c,
  fila,
  ancho,
  activa,
  head,
  onSel,
  onMenu,
}: {
  c: Commit
  fila?: FilaGrafo
  ancho: number
  activa: boolean
  head: boolean
  onSel: (h: string) => void
  onMenu: (x: number, y: number, c: Commit) => void
}) {
  return (
    <div
      className={`commit${activa ? ' activa' : ''}${fila ? '' : ' sin-grafo'}`}
      style={{ height: ALTO }}
      onMouseDown={() => onSel(c.hash)}
      onContextMenu={(e) => {
        e.preventDefault()
        onSel(c.hash)
        onMenu(e.clientX, e.clientY, c)
      }}
    >
      {fila && <Grafo fila={fila} ancho={ancho} head={head} />}
      <div className="commit-cuerpo">
        <div className="commit-linea">
          {c.refs.map((r) => (
            <Pildora key={r.tipo + r.nombre} r={r} />
          ))}
          <span className="commit-asunto">{c.asunto}</span>
        </div>
        <div className="commit-linea segunda">
          <span className="commit-autor">{c.autor}</span>
          <span className="commit-fecha">{fechaRelativa(c.fecha)}</span>
          <span className="commit-hash">{c.hash.slice(0, 7)}</span>
        </div>
      </div>
    </div>
  )
})

function Detalle({
  repo,
  hash,
  refs,
  avisar,
  onIrA,
}: {
  repo: string
  hash: string
  refs: Ref[]
  avisar: (texto: string, error?: boolean) => void
  onIrA: (hash: string) => void
}) {
  const [d, setD] = useState<DetalleCommit | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null) // el archivo desplegado
  const [completo, setCompleto] = useState(false) // el archivo entero, no solo los cambios
  const [diff, setDiff] = useState<Diff | null>(null)

  useEffect(() => {
    let vivo = true
    api.detalle(repo, hash).then(
      (x) => {
        if (!vivo) return
        setD(x)
        setAbierto(x.archivos[0]?.ruta ?? null)
      },
      (e) => avisar(mensajeError(e), true),
    )
    return () => {
      vivo = false
    }
  }, [repo, hash, avisar])

  const archivo = d?.archivos.find((a) => a.ruta === abierto) ?? null
  useEffect(() => {
    setDiff(null)
    if (!d || !archivo || tipoVista(archivo.ruta) !== 'texto') return
    let vivo = true
    api.diffCommit(repo, d.hash, d.padres[0], archivo, completo).then((x) => vivo && setDiff(x), () => {})
    return () => {
      vivo = false
    }
  }, [repo, d, archivo, completo])

  if (!d || d.hash !== hash) return <div className="detalle" />

  const [asunto, ...cuerpo] = d.mensaje.split('\n')
  const texto = cuerpo.join('\n').trim()
  const mas = d.archivos.reduce((s, a) => s + (a.mas ?? 0), 0)
  const menos = d.archivos.reduce((s, a) => s + (a.menos ?? 0), 0)

  return (
    <div className="detalle">
      <div className="tarjeta detalle-tarjeta">
        <div className="detalle-cabecera">
          <div className="avatar">{iniciales(d.autor)}</div>
          <div className="detalle-quien">
            <b>{d.autor}</b>
            <span>{d.email}</span>
          </div>
          <div className="detalle-cuando">
            <span>{fechaLarga(d.fecha)}</span>
            <button
              className="hash"
              title={t.historial.copiarHash}
              onClick={() => {
                api.copiar(d.hash)
                avisar(t.avisos.hashCopiado)
              }}
            >
              <Copy size={11} /> {d.hash.slice(0, 10)}
            </button>
          </div>
        </div>
        {refs.length > 0 && (
          <div className="detalle-refs">
            {refs.map((r) => (
              <Pildora key={r.tipo + r.nombre} r={r} />
            ))}
          </div>
        )}
        <h1 className="detalle-asunto">{asunto}</h1>
        {texto && <div className="detalle-cuerpo">{texto}</div>}
        <div className="detalle-meta">
          {d.padres.length > 1 && (
            <span>
              <GitMerge size={13} /> {t.historial.fusionDe}
            </span>
          )}
          {d.padres.length > 0 && (
            <span>
              {d.padres.length === 1 ? `${t.historial.padre} ` : ''}
              {d.padres.map((p) => (
                <button key={p} className="enlace-hash" onClick={() => onIrA(p)}>
                  {p.slice(0, 7)}
                </button>
              ))}
            </span>
          )}
          {d.committer !== d.autor && <span>{t.historial.commitDe(d.committer)}</span>}
        </div>
      </div>

      <div className="tarjeta archivos-commit">
        <div className="archivos-cabecera">
          <span>
            {t.historial.archivos(d.archivos.length)}
            {d.padres.length > 1 ? t.historial.contraPrimerPadre : ''}
          </span>
          <span className="stats">
            <span className="stat-mas">+{mas}</span> <span className="stat-menos">−{menos}</span>
          </span>
        </div>
        {d.archivos.map((a) => {
          const { nombre, carpeta } = partesRuta(a.ruta)
          const abiertoEste = a.ruta === abierto
          const tipo = tipoVista(a.ruta)
          return (
            <div key={a.ruta} className={`archivo-commit${abiertoEste ? ' abierto' : ''}`}>
              <div
                className={`archivo${abiertoEste ? ' activa' : ''}`}
                onClick={() => setAbierto(abiertoEste ? null : a.ruta)}
                title={a.original ? `${a.original} → ${a.ruta}` : a.ruta}
              >
                <CaretRight size={10} weight="bold" className="archivo-caret" />
                <Letra a={a} />
                <span className="archivo-nombre">{nombre}</span>
                <span className="archivo-carpeta">{carpeta}</span>
                {abiertoEste && tipo === 'texto' && (
                  <button
                    className={`boton-chico${completo ? ' activo' : ''}`}
                    title={t.diff.completoTitulo}
                    onClick={(e) => {
                      e.stopPropagation()
                      setCompleto((v) => !v)
                    }}
                  >
                    {completo ? <ArrowsInLineVertical size={13} /> : <ArrowsOutLineVertical size={13} />}
                    {completo ? t.diff.soloCambios : t.diff.completo}
                  </button>
                )}
                <span className="stats">
                  {a.mas !== undefined ? (
                    <>
                      <span className="stat-mas">+{a.mas}</span> <span className="stat-menos">−{a.menos}</span>
                    </>
                  ) : (
                    <span className="stat-bin">{t.historial.binario}</span>
                  )}
                </span>
              </div>
              {abiertoEste && (
                <div className="archivo-cambios">
                  {tipo !== 'texto' ? (
                    <VisorBinario
                      repo={repo}
                      ruta={a.ruta}
                      antes={d.padres[0] && a.letra !== 'A' ? { git: `${d.padres[0]}:${a.original ?? a.ruta}` } : null}
                      despues={a.letra !== 'D' ? { git: `${d.hash}:${a.ruta}` } : null}
                    />
                  ) : diff ? (
                    <VistaDiff diff={diff} />
                  ) : (
                    <div className="visor-nota">{t.visor.cargando}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
