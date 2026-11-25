import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, CheckCircle, Minus, PencilSimpleLine, Plus, Warning } from '@phosphor-icons/react'
import type { Archivo, Diff, Estado } from '@shared/tipos'
import { api, mensajeError } from '@/api'
import { partesRuta } from '@/formato'
import { VistaDiff, type AccionBloque } from '@/components/VistaDiff'

type Seccion = 'conflictos' | 'preparados' | 'sinPreparar'
interface Sel {
  ruta: string
  seccion: Seccion
}

// Borradores del mensaje por repo: cambiar de repo no los pierde.
const borradores = new Map<string, string>()

export function Letra({ a }: { a: Archivo }) {
  const texto = a.letra === '?' ? 'N' : a.letra
  return (
    <span className={`letra l-${a.letra === '?' ? 'N' : a.letra}`} title={TITULOS[a.letra]}>
      {texto}
    </span>
  )
}
const TITULOS: Record<Archivo['letra'], string> = {
  M: 'Modificado', A: 'Añadido', D: 'Borrado', R: 'Renombrado', C: 'Copiado', T: 'Cambio de tipo', U: 'En conflicto', '?': 'Nuevo, sin seguimiento',
}

export function Cambios({
  repo,
  estado,
  pulso,
  onRefrescar,
  avisar,
}: {
  repo: string
  estado: Estado
  pulso: number // cambia en cada sondeo: el diff abierto se vuelve a pedir
  onRefrescar: () => void
  avisar: (texto: string, error?: boolean) => void
}) {
  const { info, preparados, sinPreparar, conflictos } = estado
  const [sel, setSel] = useState<Sel | null>(null)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [mensaje, setMensajeCrudo] = useState(() => borradores.get(repo) ?? '')
  const [modificar, setModificar] = useState(false)
  const [confirmar, setConfirmar] = useState<string | null>(null) // ruta del archivo a descartar
  const [enviando, setEnviando] = useState(false)
  const texto = useRef<HTMLTextAreaElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const setMensaje = (m: string) => {
    borradores.set(repo, m)
    setMensajeCrudo(m)
  }
  useEffect(() => {
    setMensajeCrudo(borradores.get(repo) ?? '')
    setModificar(false)
    setSel(null)
  }, [repo])

  const secciones = useMemo(
    () => ({ conflictos, preparados, sinPreparar }) as Record<Seccion, Archivo[]>,
    [conflictos, preparados, sinPreparar],
  )
  const orden: Sel[] = useMemo(
    () => (['conflictos', 'preparados', 'sinPreparar'] as Seccion[]).flatMap((s) => secciones[s].map((a) => ({ ruta: a.ruta, seccion: s }))),
    [secciones],
  )
  const archivoSel = sel ? secciones[sel.seccion].find((a) => a.ruta === sel.ruta) : undefined

  // Si el archivo elegido cambia de sección (se ha preparado) se le sigue; si desaparece, el primero.
  useEffect(() => {
    if (sel && secciones[sel.seccion].some((a) => a.ruta === sel.ruta)) return
    const mismo = sel && orden.find((o) => o.ruta === sel.ruta)
    setSel(mismo ?? orden[0] ?? null)
  }, [orden, secciones, sel])

  // El diff del archivo elegido (y otra vez en cada sondeo, por si se ha seguido editando).
  useEffect(() => {
    if (!archivoSel || sel?.seccion === 'conflictos') return setDiff(null)
    let vivo = true
    api.diff(repo, archivoSel, sel!.seccion === 'preparados').then(
      (d) => vivo && setDiff((prev) => (JSON.stringify(prev) === JSON.stringify(d) ? prev : d)),
      () => vivo && setDiff(null),
    )
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, archivoSel?.ruta, archivoSel?.letra, sel?.seccion, pulso, estado])

  const hacer = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch (e) {
        avisar(mensajeError(e), true)
      }
      onRefrescar()
    },
    [avisar, onRefrescar],
  )

  const sinCommits = info.hash === null
  const alternar = (a: Archivo, s: Seccion) =>
    hacer(() => (s === 'preparados' ? api.quitar(repo, [a.ruta], sinCommits) : api.preparar(repo, [a.ruta])))

  const accionBloque = (indice: number, cabecera: string, accion: AccionBloque) => {
    if (!archivoSel || !sel) return
    hacer(() => api.bloque(repo, archivoSel, sel.seccion === 'preparados', cabecera, indice, accion))
  }

  // Modificar el último commit: si no hay mensaje escrito, se trae el suyo para editarlo.
  const cambiarModificar = async (v: boolean) => {
    setModificar(v)
    if (v && !mensaje.trim()) setMensaje(await api.ultimoMensaje(repo).catch(() => ''))
    texto.current?.focus()
  }

  const todo = preparados.length === 0 && !modificar && sinPreparar.length > 0
  const puede = !!mensaje.trim() && !enviando && conflictos.length === 0 && (preparados.length > 0 || modificar || todo)
  const hacerCommit = async () => {
    if (!puede) return
    setEnviando(true)
    try {
      if (todo) await api.preparar(repo, sinPreparar.map((a) => a.ruta))
      await api.commit(repo, mensaje.trim() + '\n', modificar)
      setMensaje('')
      setModificar(false)
      avisar(modificar ? 'Último commit modificado' : `Commit hecho en ${info.rama ?? 'HEAD'}`)
    } catch (e) {
      avisar(mensajeError(e), true)
    }
    setEnviando(false)
    onRefrescar()
  }

  // Teclado en la lista: ↑/↓ para moverse, espacio para preparar o quitar.
  const teclas = (e: React.KeyboardEvent) => {
    if (!sel) return
    const i = orden.findIndex((o) => o.ruta === sel.ruta && o.seccion === sel.seccion)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = orden[Math.min(orden.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (n) setSel(n)
    } else if (e.key === ' ' && archivoSel && sel.seccion !== 'conflictos') {
      e.preventDefault()
      alternar(archivoSel, sel.seccion)
    }
  }

  const primeraLinea = mensaje.split('\n')[0].length
  const total = conflictos.length + preparados.length + sinPreparar.length

  const fila = (a: Archivo, s: Seccion) => {
    const { nombre, carpeta } = partesRuta(a.ruta)
    const activa = sel?.ruta === a.ruta && sel.seccion === s
    const clave = `${s}:${a.ruta}`
    return (
      <div
        key={clave}
        className={`archivo${activa ? ' activa' : ''}`}
        onMouseDown={() => setSel({ ruta: a.ruta, seccion: s })}
        onDoubleClick={() => s !== 'conflictos' && alternar(a, s)}
        onMouseLeave={() => confirmar === clave && setConfirmar(null)}
        title={a.original ? `${a.original} → ${a.ruta}` : a.ruta}
      >
        <Letra a={a} />
        <span className="archivo-nombre">{nombre}</span>
        <span className="archivo-carpeta">{carpeta}</span>
        <span className="archivo-acciones">
          {s === 'sinPreparar' &&
            (confirmar === clave ? (
              <button className="boton-chico peligro" onMouseDown={(e) => e.stopPropagation()} onClick={() => (setConfirmar(null), hacer(() => api.descartar(repo, [a])))}>
                {a.letra === '?' ? '¿A la papelera?' : '¿Descartar?'}
              </button>
            ) : (
              <button className="boton-icono-chico" title={a.letra === '?' ? 'Mandar a la papelera' : 'Descartar los cambios'} onMouseDown={(e) => e.stopPropagation()} onClick={() => setConfirmar(clave)}>
                <ArrowCounterClockwise size={13} />
              </button>
            ))}
          {s === 'conflictos' ? (
            <button className="boton-icono-chico" title="Marcar como resuelto" onMouseDown={(e) => e.stopPropagation()} onClick={() => hacer(() => api.preparar(repo, [a.ruta]))}>
              <CheckCircle size={14} />
            </button>
          ) : (
            <button className="boton-icono-chico" title={s === 'preparados' ? 'Quitar del commit' : 'Preparar para el commit'} onMouseDown={(e) => e.stopPropagation()} onClick={() => alternar(a, s)}>
              {s === 'preparados' ? <Minus size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
            </button>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="contenido columnas-cambios">
      <div className="panel-lista">
        <div className="lista-archivos" ref={listaRef} tabIndex={0} onKeyDown={teclas}>
          {total === 0 && (
            <div className="limpio">
              <CheckCircle size={30} weight="light" />
              <b>Todo al día</b>
              <span>No hay cambios sin commit en {info.rama ?? 'HEAD'}.</span>
            </div>
          )}
          {conflictos.length > 0 && (
            <>
              <div className="seccion-titulo conflicto">
                <span>En conflicto</span>
                <span className="seccion-n">{conflictos.length}</span>
              </div>
              {conflictos.map((a) => fila(a, 'conflictos'))}
            </>
          )}
          {preparados.length > 0 && (
            <>
              <div className="seccion-titulo">
                <span>Preparados</span>
                <span className="seccion-n">{preparados.length}</span>
                <button className="seccion-boton" onClick={() => hacer(() => api.quitar(repo, preparados.map((a) => a.ruta), sinCommits))}>
                  Quitar todo
                </button>
              </div>
              {preparados.map((a) => fila(a, 'preparados'))}
            </>
          )}
          {sinPreparar.length > 0 && (
            <>
              <div className="seccion-titulo">
                <span>Cambios</span>
                <span className="seccion-n">{sinPreparar.length}</span>
                <button className="seccion-boton" onClick={() => hacer(() => api.preparar(repo, sinPreparar.map((a) => a.ruta)))}>
                  Preparar todo
                </button>
              </div>
              {sinPreparar.map((a) => fila(a, 'sinPreparar'))}
            </>
          )}
        </div>

        <div className="redactor">
          <textarea
            ref={texto}
            value={mensaje}
            placeholder={'Resumen del commit\n\nDescripción (opcional)'}
            spellCheck
            onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                hacerCommit()
              }
            }}
          />
          <div className="redactor-pie">
            <label className="interruptor" title="Rehacer el último commit con lo preparado y este mensaje">
              <button type="button" role="switch" aria-checked={modificar} className={modificar ? 'encendido' : ''} onClick={() => cambiarModificar(!modificar)} disabled={sinCommits}>
                <span />
              </button>
              Modificar el último
            </label>
            <span className={`contador${primeraLinea > 72 ? ' largo' : ''}`} title="Caracteres de la primera línea (mejor 50, como mucho 72)">
              {primeraLinea}
            </span>
          </div>
          <button className="boton-commit" disabled={!puede} onClick={hacerCommit} title="Ctrl+Enter">
            {enviando ? 'Haciendo commit…' : modificar ? 'Modificar el último commit' : todo ? `Commit de todo en ${info.rama ?? 'HEAD'}` : `Commit en ${info.rama ?? 'HEAD'}`}
          </button>
          {info.identidad.email && (
            <div className="identidad" title="La identidad de git de este repo (con tus includeIf)">
              como <b>{info.identidad.nombre || '—'}</b> · {info.identidad.email}
            </div>
          )}
        </div>
      </div>

      <div className="panel-diff">
        {!archivoSel ? (
          <div className="vacio">
            <PencilSimpleLine size={38} weight="light" />
            <span>{total ? 'Elige un archivo' : 'Nada que revisar'}</span>
          </div>
        ) : sel?.seccion === 'conflictos' ? (
          <div className="vacio conflicto">
            <Warning size={38} weight="light" />
            <span>
              <b>{archivoSel.ruta}</b> tiene conflictos
            </span>
            <p>Resuélvelos en tu editor y márcalo como resuelto. Cuando no quede ninguno, haz commit para terminar.</p>
            <div className="fila-botones">
              <button className="boton" onClick={() => api.abrirEn(repo, 'editor')}>
                Abrir en Zed
              </button>
              <button className="boton destacado" onClick={() => hacer(() => api.preparar(repo, [archivoSel.ruta]))}>
                Marcar como resuelto
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="diff-titulo">
              <Letra a={archivoSel} />
              <span className="diff-ruta">
                {archivoSel.original && <span className="diff-original">{archivoSel.original} → </span>}
                {archivoSel.ruta}
              </span>
              <span className="diff-donde">{sel?.seccion === 'preparados' ? 'Preparado' : archivoSel.letra === '?' ? 'Nuevo' : 'Sin preparar'}</span>
            </div>
            <div className="diff-scroll">
              {diff && (
                <VistaDiff
                  diff={diff}
                  // Los archivos nuevos van enteros (no tienen bloques que preparar por separado).
                  acciones={archivoSel.letra === '?' ? undefined : sel?.seccion === 'preparados' ? ['quitar'] : ['descartar', 'preparar']}
                  onAccion={accionBloque}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
