// El grafo del historial: a cada commit le toca un carril (columna) y por cada fila se calculan las
// líneas que la cruzan, las que llegan al commit (sus hijos) y las que salen hacia sus padres.
import type { Commit } from '@shared/tipos'

/** y: 0 = arriba de la fila · 1 = el centro (el commit) · 2 = abajo. x: el carril. */
export interface Segmento {
  x1: number
  y1: 0 | 1 | 2
  x2: number
  y2: 0 | 1 | 2
  color: number
}

export interface FilaGrafo {
  col: number
  color: number
  merge: boolean
  segmentos: Segmento[]
}

// Colores de los carriles: suaves sobre el fondo oscuro de Niebla. El primero, plata.
export const COLORES = ['#c8ccd0', '#8fb4e8', '#b393dd', '#7fc08f', '#e0a26a', '#e07fa6', '#8b98a6', '#d9c27a']
export const colorCarril = (i: number) => COLORES[i % COLORES.length]

export function calcularGrafo(commits: Commit[]): { filas: FilaGrafo[]; carriles: number } {
  let carriles: (string | null)[] = []
  let colores: number[] = []
  let siguiente = 0
  let maximo = 1
  const libre = () => {
    const i = carriles.indexOf(null)
    if (i !== -1) return i
    carriles.push(null)
    colores.push(0)
    return carriles.length - 1
  }

  const filas = commits.map((c): FilaGrafo => {
    let col = carriles.indexOf(c.hash)
    if (col === -1) {
      // Punta de una rama: carril nuevo con color nuevo.
      col = libre()
      colores[col] = siguiente++
    }
    const antes = carriles.slice()
    const colAntes = colores.slice()
    const segmentos: Segmento[] = []

    for (let j = 0; j < antes.length; j++) {
      if (antes[j] === null) continue
      if (antes[j] === c.hash) {
        segmentos.push({ x1: j, y1: 0, x2: col, y2: 1, color: colAntes[j] }) // un hijo que llega
        if (j !== col) carriles[j] = null
      } else {
        segmentos.push({ x1: j, y1: 0, x2: j, y2: 2, color: colAntes[j] }) // otra rama que pasa de largo
      }
    }

    const [primero, ...otros] = c.padres
    if (!primero) {
      carriles[col] = null
    } else {
      const ya = carriles.findIndex((h, k) => h === primero && k !== col)
      if (ya !== -1) {
        // Otra rama ya espera a este padre: se junta con ella.
        segmentos.push({ x1: col, y1: 1, x2: ya, y2: 2, color: colores[ya] })
        carriles[col] = null
      } else {
        carriles[col] = primero
        segmentos.push({ x1: col, y1: 1, x2: col, y2: 2, color: colores[col] })
      }
      for (const p of otros) {
        let k = carriles.indexOf(p)
        if (k === -1) {
          k = libre()
          carriles[k] = p
          colores[k] = siguiente++
        }
        segmentos.push({ x1: col, y1: 1, x2: k, y2: 2, color: colores[k] })
      }
    }

    while (carriles.length && carriles[carriles.length - 1] === null) {
      carriles.pop()
      colores.pop()
    }
    maximo = Math.max(maximo, antes.length, carriles.length, col + 1)
    return { col, color: colAntes[col] ?? colores[col] ?? 0, merge: c.padres.length > 1, segmentos }
  })
  carriles = []
  colores = []
  return { filas, carriles: maximo }
}
