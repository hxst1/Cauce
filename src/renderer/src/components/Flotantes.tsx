import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '@/i18n'

export type ElementoMenu = { texto: string; icono?: ReactNode; accion: () => void; peligro?: boolean; deshabilitado?: boolean } | 'separador'

export interface MenuAbierto {
  x: number
  y: number
  elementos: ElementoMenu[]
}

/** Menú contextual de cristal. Se cierra al elegir, con Escape o al pulsar fuera. */
export function MenuContextual({ menu, onCerrar }: { menu: MenuAbierto; onCerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })
  // Que no se salga de la ventana.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) })
  }, [menu])
  useEffect(() => {
    const fuera = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onCerrar()
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('mousedown', fuera, true)
    window.addEventListener('keydown', tecla, true)
    window.addEventListener('blur', onCerrar)
    return () => {
      window.removeEventListener('mousedown', fuera, true)
      window.removeEventListener('keydown', tecla, true)
      window.removeEventListener('blur', onCerrar)
    }
  }, [onCerrar])
  return (
    <div ref={ref} className="menu" style={{ left: pos.x, top: pos.y }}>
      {menu.elementos.map((e, i) =>
        e === 'separador' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className={`menu-item${e.peligro ? ' peligro' : ''}`}
            disabled={e.deshabilitado}
            onClick={() => {
              onCerrar()
              e.accion()
            }}
          >
            {e.icono}
            {e.texto}
          </button>
        ),
      )}
    </div>
  )
}

/** Ventana modal de cristal. */
export function Dialogo({ titulo, children, onCerrar }: { titulo: string; children: ReactNode; onCerrar: () => void }) {
  return (
    <div className="dialogo-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()} onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <div className="dialogo">
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

export function DialogoRama({
  desde,
  onCrear,
  onCerrar,
}: {
  desde: { ref: string | null; texto: string } // ref null = desde HEAD
  onCrear: (nombre: string, cambiar: boolean) => void
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [cambiar, setCambiar] = useState(true)
  const valido = /^[^\s~^:?*[\\]+$/.test(nombre) && !nombre.startsWith('-') && !nombre.endsWith('/') && !nombre.includes('..')
  const crear = () => valido && onCrear(nombre, cambiar)
  return (
    <Dialogo titulo={t.dialogos.nuevaRama} onCerrar={onCerrar}>
      <p className="dialogo-texto">
        {t.dialogos.desde} <b>{desde.texto}</b>
      </p>
      <input
        className="campo"
        autoFocus
        placeholder={t.dialogos.nombreRama}
        value={nombre}
        spellCheck={false}
        // Los espacios se vuelven guiones mientras se escribe.
        onChange={(e) => setNombre(e.target.value.replace(/\s/g, '-'))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') crear()
          if (e.key === 'Escape') onCerrar()
        }}
      />
      <label className="interruptor">
        <button type="button" role="switch" aria-checked={cambiar} className={cambiar ? 'encendido' : ''} onClick={() => setCambiar(!cambiar)}>
          <span />
        </button>
        {t.dialogos.cambiarANueva}
      </label>
      <div className="dialogo-botones">
        <button className="boton" onClick={onCerrar}>
          {t.comun.cancelar}
        </button>
        <button className="boton destacado" disabled={!valido} onClick={crear}>
          {t.dialogos.crear}
        </button>
      </div>
    </Dialogo>
  )
}

export interface Confirmacion {
  titulo: string
  texto: ReactNode
  boton: string
  peligro?: boolean
  accion: () => void
}

export function DialogoConfirmar({ c, onCerrar }: { c: Confirmacion; onCerrar: () => void }) {
  return (
    <Dialogo titulo={c.titulo} onCerrar={onCerrar}>
      <div className="dialogo-texto">{c.texto}</div>
      <div className="dialogo-botones">
        <button className="boton" onClick={onCerrar} autoFocus>
          {t.comun.cancelar}
        </button>
        <button
          className={`boton ${c.peligro ? 'peligro' : 'destacado'}`}
          onClick={() => {
            onCerrar()
            c.accion()
          }}
        >
          {c.boton}
        </button>
      </div>
    </Dialogo>
  )
}
