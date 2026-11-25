import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowsClockwise, ArrowUp, CaretDown, Check, Code, GitBranch, GitFork, Globe, MagnifyingGlass, Plus, TerminalWindow, X,
} from '@phosphor-icons/react'
import type { InfoRepo, Rama } from '@shared/tipos'
import { api } from '@/api'
import { t } from '@/i18n'

export type Vista = 'cambios' | 'historial'
export type Operacion = 'traer' | 'bajar' | 'subir'

/**
 * La barra de arriba, lo único fijo de Cauce: «repo › rama» a la izquierda (cada miga abre su
 * buscador), las pestañas en el centro y las acciones a la derecha.
 */
export function Barra({
  nombre,
  info,
  ramas,
  vista,
  cambios,
  onVista,
  todas,
  onTodas,
  buscar,
  onBuscar,
  ocupado,
  onOperacion,
  onPaleta,
  selectorAbierto,
  onSelector,
  onRama,
  onMenuRama,
  onNuevaRama,
  onAbrir,
  web,
}: {
  nombre: string
  info: InfoRepo
  ramas: Rama[]
  vista: Vista
  cambios: number
  onVista: (v: Vista) => void
  todas: boolean
  onTodas: (v: boolean) => void
  buscar: string
  onBuscar: (s: string) => void
  ocupado: Operacion | null
  onOperacion: (o: Operacion) => void
  onPaleta: () => void
  selectorAbierto: boolean
  onSelector: (v: boolean) => void
  onRama: (r: Rama) => void
  onMenuRama: (x: number, y: number, r: Rama) => void
  onNuevaRama: () => void
  onAbrir: (donde: 'editor' | 'terminal' | 'web') => void
  web: boolean
}) {
  const sync = !info.rama
    ? info.hash
      ? t.barra.headSeparada
      : t.barra.sinCommits
    : !info.upstream
      ? t.barra.sinPublicar
      : info.delante || info.detras
        ? [info.delante && `↑${info.delante}`, info.detras && `↓${info.detras}`].filter(Boolean).join(' ')
        : t.barra.alDia

  return (
    <header className="barra">
      <div className="barra-izq">
        <Marca />
        <button className="miga" onClick={onPaleta} title={t.barra.cambiarRepo}>
          <span className="miga-repo">{nombre}</span>
          <CaretDown size={10} weight="bold" className="miga-caret" />
        </button>
        <span className="miga-sep">/</span>
        <div className="miga-rama-caja">
          <button className="miga rama" onClick={() => onSelector(!selectorAbierto)} title={t.barra.cambiarRama}>
            <GitBranch size={14} />
            <span>{info.rama ?? info.hash?.slice(0, 7) ?? 'main'}</span>
            <CaretDown size={10} weight="bold" className="miga-caret" />
          </button>
          {selectorAbierto && (
            <SelectorRama
              ramas={ramas}
              onElegir={(r) => {
                onSelector(false)
                onRama(r)
              }}
              onMenu={(x, y, r) => {
                onSelector(false)
                onMenuRama(x, y, r)
              }}
              onNueva={() => {
                onSelector(false)
                onNuevaRama()
              }}
              onCerrar={() => onSelector(false)}
            />
          )}
        </div>
        <span className={`sync${info.delante || info.detras ? ' pendiente' : ''}`} title={info.upstream ? t.barra.siguiendo(info.upstream) : undefined}>
          {sync}
        </span>
      </div>

      <nav className="pestanas">
        <button className={vista === 'cambios' ? 'activa' : ''} onClick={() => onVista('cambios')} title="Ctrl+1">
          {t.barra.cambios}
          {cambios > 0 && <span className="pestana-n">{cambios}</span>}
        </button>
        <button className={vista === 'historial' ? 'activa' : ''} onClick={() => onVista('historial')} title="Ctrl+2">
          {t.barra.historial}
        </button>
      </nav>

      <div className="barra-der">
        {vista === 'historial' && (
          <>
            <div className="buscador">
              <MagnifyingGlass size={13} className="buscador-lupa" />
              <input placeholder={t.barra.buscarCommits} value={buscar} onChange={(e) => onBuscar(e.target.value)} spellCheck={false} />
              {buscar && (
                <button className="buscador-cerrar" onClick={() => onBuscar('')} aria-label={t.comun.borrar}>
                  <X size={9} weight="bold" />
                </button>
              )}
            </div>
            <button className={`accion${todas ? ' activa' : ''}`} title={todas ? t.barra.todas : t.barra.soloActual} onClick={() => onTodas(!todas)}>
              <GitFork size={17} />
            </button>
            <span className="barra-sep" />
          </>
        )}
        <button className={`accion${ocupado === 'traer' ? ' girando' : ''}`} title={t.barra.traer} disabled={!!ocupado} onClick={() => onOperacion('traer')}>
          <ArrowsClockwise size={17} />
        </button>
        <button
          className={`accion${ocupado === 'bajar' ? ' latiendo' : ''}`}
          title={info.upstream ? t.barra.bajar(info.upstream) : t.barra.sinUpstream}
          disabled={!!ocupado || !info.upstream}
          onClick={() => onOperacion('bajar')}
        >
          <ArrowDown size={17} />
          {info.detras > 0 && <span className="accion-n">{info.detras}</span>}
        </button>
        <button
          className={`accion${ocupado === 'subir' ? ' latiendo' : ''}`}
          title={info.upstream ? t.barra.subir(info.upstream) : t.barra.publicar}
          disabled={!!ocupado || !info.rama}
          onClick={() => onOperacion('subir')}
        >
          <ArrowUp size={17} />
          {(info.delante > 0 || (!info.upstream && info.hash)) && <span className="accion-n">{info.upstream ? info.delante : '+'}</span>}
        </button>
        <span className="barra-sep" />
        <button className="accion" title={t.barra.terminal} onClick={() => onAbrir('terminal')}>
          <TerminalWindow size={17} />
        </button>
        <button className="accion" title={t.barra.editor} onClick={() => onAbrir('editor')}>
          <Code size={17} />
        </button>
        <button className="accion" title={t.barra.web} disabled={!web} onClick={() => onAbrir('web')}>
          <Globe size={17} />
        </button>
        <span className="barra-sep" />
        <button className="accion cerrar" title={t.barra.cerrar} onClick={() => api.cerrarVentana()}>
          <X size={16} />
        </button>
      </div>
    </header>
  )
}

/** La marca de Cauce en la barra: el grafo del icono, en pequeño. */
export function Marca({ tamano = 20 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 64 64" fill="none" className="marca" aria-hidden>
      <path d="M22 16c0 9 22 6 22 15v2c0 9-22 6-22 15" stroke="#8b98a6" strokeWidth="5" strokeLinecap="round" />
      <path d="M22 10v44" stroke="#c8ccd0" strokeWidth="5" strokeLinecap="round" />
      <circle cx="22" cy="10" r="6" fill="#e4e6e7" />
      <circle cx="44" cy="32" r="5" fill="#8b98a6" />
      <circle cx="22" cy="54" r="6" fill="#e4e6e7" />
    </svg>
  )
}

function SelectorRama({
  ramas,
  onElegir,
  onMenu,
  onNueva,
  onCerrar,
}: {
  ramas: Rama[]
  onElegir: (r: Rama) => void
  onMenu: (x: number, y: number, r: Rama) => void
  onNueva: () => void
  onCerrar: () => void
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const lista = useMemo(() => {
    const f = q.trim().toLowerCase()
    const locales = new Set(ramas.filter((r) => r.tipo === 'local').map((r) => r.nombre))
    // Las remotas que ya tienen rama local con el mismo nombre no se repiten. La actual, la primera.
    return ramas
      .filter((r) => (!f || r.nombre.toLowerCase().includes(f)) && !(r.tipo === 'remota' && locales.has(r.nombre.split('/').slice(1).join('/'))))
      .sort((a, b) => +b.actual - +a.actual || (a.tipo === b.tipo ? b.fecha - a.fecha : a.tipo === 'local' ? -1 : 1))
  }, [ramas, q])

  useEffect(() => {
    const fuera = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onCerrar()
    window.addEventListener('mousedown', fuera, true)
    return () => window.removeEventListener('mousedown', fuera, true)
  }, [onCerrar])
  useEffect(() => setI(0), [q])

  let tipoAnterior: string | null = null
  return (
    <div className="selector-rama" ref={ref}>
      <input
        autoFocus
        className="selector-buscar"
        placeholder={t.selector.buscar}
        value={q}
        spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCerrar()
          else if (e.key === 'ArrowDown') setI((x) => Math.min(lista.length - 1, x + 1))
          else if (e.key === 'ArrowUp') setI((x) => Math.max(0, x - 1))
          else if (e.key === 'Enter' && lista[i]) onElegir(lista[i])
        }}
      />
      <div className="selector-lista">
        {lista.map((r, k) => {
          const titulo = r.tipo !== tipoAnterior && !r.actual ? (r.tipo === 'local' ? t.selector.locales : t.selector.remotas) : null
          if (!r.actual) tipoAnterior = r.tipo
          return (
            <div key={r.tipo + r.nombre}>
              {titulo && <div className="selector-grupo">{titulo}</div>}
              <button
                className={`selector-item${k === i ? ' marcado' : ''}${r.actual ? ' actual' : ''}`}
                onMouseEnter={() => setI(k)}
                onClick={() => !r.actual && onElegir(r)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onMenu(e.clientX, e.clientY, r)
                }}
              >
                {r.actual ? <Check size={13} weight="bold" /> : <GitBranch size={13} />}
                <span className="selector-nombre">{r.nombre}</span>
                {(r.delante > 0 || r.detras > 0) && (
                  <span className="selector-sync">
                    {r.delante > 0 && `↑${r.delante}`}
                    {r.detras > 0 && `↓${r.detras}`}
                  </span>
                )}
              </button>
            </div>
          )
        })}
        {lista.length === 0 && <div className="selector-vacio">{t.selector.ninguna}</div>}
      </div>
      <div className="selector-pie">
        <button className="selector-nueva" onClick={onNueva}>
          <Plus size={13} weight="bold" /> {t.selector.nueva}
        </button>
        <span>{t.selector.pista}</span>
      </div>
    </div>
  )
}
