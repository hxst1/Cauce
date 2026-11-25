import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderSimple, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import type { Repo, Resumen } from '@shared/tipos'
import { nombreGrupo } from '@/formato'

// Orden de los grupos: los recientes y luego tus tres cuentas.
const ORDEN = ['personal', 'work', 'company']

/** «/home/ana/dev/personal/proyectos/cauce» → «~/dev/personal/proyectos» */
function carpetaCorta(ruta: string) {
  const sinNombre = ruta.slice(0, ruta.lastIndexOf('/'))
  return sinNombre.replace(/^\/home\/[^/]+/, '~')
}

/**
 * Paleta para ir a un repositorio (Ctrl+P o clic en su nombre): escribes, ↑/↓, Enter. Sin buscar,
 * primero los recientes y luego todos agrupados por cuenta.
 */
export function Paleta({
  repos,
  resumenes,
  recientes,
  activo,
  onElegir,
  onMenu,
  onAnadir,
  onCerrar,
}: {
  repos: Repo[]
  resumenes: Record<string, Resumen | null>
  recientes: string[]
  activo: string | null
  onElegir: (ruta: string) => void
  onMenu: (x: number, y: number, r: Repo) => void
  onAnadir: () => void
  onCerrar: () => void
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const lista = useRef<HTMLDivElement>(null)

  // Filas a pintar: títulos de grupo y repos, en orden. `indice` es la posición entre los repos (para el teclado).
  const { filas, elegibles } = useMemo(() => {
    const f = q.trim().toLowerCase()
    const filas: ({ titulo: string } | { repo: Repo; indice: number })[] = []
    const elegibles: Repo[] = []
    const meter = (titulo: string, rs: Repo[]) => {
      if (!rs.length) return
      filas.push({ titulo })
      for (const repo of rs) {
        filas.push({ repo, indice: elegibles.length })
        elegibles.push(repo)
      }
    }
    if (f) {
      // Buscando: lo que empieza por el texto, antes que lo que solo lo contiene.
      const encontrados = repos
        .filter((r) => r.nombre.toLowerCase().includes(f) || r.ruta.toLowerCase().includes(f))
        .sort((a, b) => +b.nombre.toLowerCase().startsWith(f) - +a.nombre.toLowerCase().startsWith(f))
      meter('Resultados', encontrados)
    } else {
      const porRuta = new Map(repos.map((r) => [r.ruta, r]))
      meter('Recientes', recientes.filter((r) => r !== activo).map((r) => porRuta.get(r)!).filter(Boolean).slice(0, 4))
      const grupos = new Map<string, Repo[]>()
      for (const r of repos) grupos.set(r.grupo, [...(grupos.get(r.grupo) ?? []), r])
      const pos = (g: string) => (ORDEN.includes(g) ? ORDEN.indexOf(g) : g === 'otros' ? 99 : 50)
      for (const [g, rs] of [...grupos.entries()].sort((a, b) => pos(a[0]) - pos(b[0]) || a[0].localeCompare(b[0]))) meter(nombreGrupo(g), rs)
    }
    return { filas, elegibles }
  }, [repos, recientes, activo, q])

  useEffect(() => setI(0), [q])
  useEffect(() => {
    lista.current?.querySelector('.paleta-item.marcado')?.scrollIntoView({ block: 'nearest' })
  }, [i])

  return (
    <div className="paleta-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="paleta">
        <div className="paleta-buscar">
          <MagnifyingGlass size={16} />
          <input
            autoFocus
            placeholder="Ir a un repositorio…"
            value={q}
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCerrar()
              else if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(elegibles.length - 1, x + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(0, x - 1)))
              else if (e.key === 'Enter' && elegibles[i]) onElegir(elegibles[i].ruta)
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="paleta-lista" ref={lista}>
          {filas.map((f, k) => {
            if ('titulo' in f) return <div key={'t' + k} className="paleta-grupo">{f.titulo}</div>
            const r = f.repo
            const res = resumenes[r.ruta]
            return (
              <button
                key={r.ruta + k}
                className={`paleta-item${f.indice === i ? ' marcado' : ''}${r.ruta === activo ? ' abierto' : ''}`}
                onMouseMove={() => setI(f.indice)}
                onClick={() => onElegir(r.ruta)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onMenu(e.clientX, e.clientY, r)
                }}
              >
                <FolderSimple size={16} weight={r.ruta === activo ? 'fill' : 'regular'} />
                <span className="paleta-nombre">{r.nombre}</span>
                <span className="paleta-ruta">{carpetaCorta(r.ruta)}</span>
                <span className="paleta-estado">
                  {res?.rama && <span className="paleta-rama">{res.rama}</span>}
                  {res && res.delante > 0 && <span>↑{res.delante}</span>}
                  {res && res.detras > 0 && <span>↓{res.detras}</span>}
                  {res && res.cambios > 0 && <span className="paleta-punto" title={`${res.cambios} archivos con cambios`} />}
                </span>
              </button>
            )
          })}
          {elegibles.length === 0 && <div className="paleta-vacio">Ningún repositorio coincide</div>}
        </div>
        <div className="paleta-pie">
          <button onClick={onAnadir}>
            <Plus size={12} weight="bold" /> Añadir uno de fuera de ~/dev…
          </button>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> moverse · <kbd>Enter</kbd> abrir
          </span>
        </div>
      </div>
    </div>
  )
}
