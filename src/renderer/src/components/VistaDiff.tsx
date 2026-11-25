import { memo, useState } from 'react'
import { ArrowCounterClockwise, Minus, Plus } from '@phosphor-icons/react'
import type { Diff } from '@shared/tipos'
import { t } from '@/i18n'

export type AccionBloque = 'preparar' | 'quitar' | 'descartar'

/**
 * Un diff en tarjetas, una por bloque, con números de línea a la izquierda. Con `acciones`, cada bloque
 * lleva sus botones (preparar / quitar del índice / descartar).
 */
export const VistaDiff = memo(function VistaDiff({
  diff,
  acciones,
  onAccion,
}: {
  diff: Diff
  acciones?: AccionBloque[]
  onAccion?: (indice: number, cabecera: string, accion: AccionBloque) => void
}) {
  const [confirmar, setConfirmar] = useState<number | null>(null)

  if (diff.binario) return <div className="diff-nota">{t.diff.binario}</div>
  if (!diff.bloques.length) return <div className="diff-nota">{t.diff.sinContenido}</div>

  return (
    <div className="diff">
      {diff.bloques.map((b, i) => (
        <section className="diff-bloque" key={i + b.cabecera}>
          <header className="diff-cabecera">
            <span className="diff-rango">{b.cabecera.replace(/^@@ (.*?) @@ ?/, '$1  ')}</span>
            {acciones && onAccion && (
              <span className="diff-acciones">
                {acciones.includes('descartar') &&
                  (confirmar === i ? (
                    <button className="boton-chico peligro" onClick={() => (setConfirmar(null), onAccion(i, b.cabecera, 'descartar'))} onMouseLeave={() => setConfirmar(null)}>
                      {t.diff.descartarBloque}
                    </button>
                  ) : (
                    <button className="boton-chico" title={t.diff.descartarBloqueTitulo} onClick={() => setConfirmar(i)}>
                      <ArrowCounterClockwise size={13} />
                    </button>
                  ))}
                {acciones.includes('preparar') && (
                  <button className="boton-chico" onClick={() => onAccion(i, b.cabecera, 'preparar')}>
                    <Plus size={12} weight="bold" /> {t.diff.prepararBloque}
                  </button>
                )}
                {acciones.includes('quitar') && (
                  <button className="boton-chico" onClick={() => onAccion(i, b.cabecera, 'quitar')}>
                    <Minus size={12} weight="bold" /> {t.diff.quitarBloque}
                  </button>
                )}
              </span>
            )}
          </header>
          <div className="diff-lineas">
            {b.lineas.map((l, j) =>
              l.tipo === '\\' ? (
                <div className="dl nota" key={j}>
                  <span className="dl-num" />
                  <span className="dl-num" />
                  <span className="dl-texto">{t.diff.sinSalto}</span>
                </div>
              ) : (
                <div className={`dl ${l.tipo === '+' ? 'mas' : l.tipo === '-' ? 'menos' : ''}`} key={j}>
                  <span className="dl-num">{l.viejo ?? ''}</span>
                  <span className="dl-num">{l.nuevo ?? ''}</span>
                  <span className="dl-texto">
                    <span className="dl-signo">{l.tipo === ' ' ? ' ' : l.tipo}</span>
                    {l.texto || ' '}
                  </span>
                </div>
              ),
            )}
          </div>
        </section>
      ))}
      {diff.recortado && <div className="diff-nota">{t.diff.recortado}</div>}
    </div>
  )
})
