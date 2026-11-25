import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Copy, FolderOpen, GitBranch, GitMerge, Code, TerminalWindow, Trash, Warning } from '@phosphor-icons/react'
import type { Commit, Estado, Rama, Repo, Resumen } from '@shared/tipos'
import { api, mensajeError } from '@/api'
import { Barra, Marca, type Operacion, type Vista } from '@/components/Barra'
import { Paleta } from '@/components/Paleta'
import { Cambios } from '@/components/Cambios'
import { Historial } from '@/components/Historial'
import { DialogoConfirmar, DialogoRama, MenuContextual, type Confirmacion, type MenuAbierto } from '@/components/Flotantes'

const CADA = 3000 // sondeo del repo abierto mientras la ventana tiene el foco
const NOMBRE_OP = { merge: 'Fusión', rebase: 'Rebase', 'cherry-pick': 'Cherry-pick', revert: 'Revert' } as const

const resumenDe = (e: Estado): Resumen => ({
  rama: e.info.rama,
  cambios: new Set([...e.preparados, ...e.sinPreparar, ...e.conflictos].map((a) => a.ruta)).size,
  delante: e.info.delante,
  detras: e.info.detras,
})

export function App() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [resumenes, setResumenes] = useState<Record<string, Resumen | null>>({})
  const [activo, setActivo] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('cambios')
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ramas, setRamas] = useState<Rama[]>([])
  const [version, setVersion] = useState(0)
  const [pulso, setPulso] = useState(0)
  const [ocupado, setOcupado] = useState<Operacion | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; error: boolean; id: number } | null>(null)
  const [menu, setMenu] = useState<MenuAbierto | null>(null)
  const [nuevaRama, setNuevaRama] = useState<{ ref: string | null; texto: string } | null>(null)
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null)
  const [todas, setTodas] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [web, setWeb] = useState<string | null>(null)
  const [paleta, setPaleta] = useState(false)
  const [selector, setSelector] = useState(false)
  const [recientes, setRecientes] = useState<string[]>([])

  const activoRef = useRef<string | null>(null)
  const firmaEstado = useRef('')
  const firmaRefs = useRef('')
  const ultimosResumenes = useRef(0)

  const avisar = useCallback((texto: string, error = false) => {
    const id = Date.now()
    setAviso({ texto, error, id })
    setTimeout(() => setAviso((a) => (a?.id === id ? null : a)), error ? 8000 : 3200)
  }, [])

  /** Vuelve a leer el estado del repo abierto. Con `completo`, también las ramas (y el historial si han cambiado). */
  const refrescar = useCallback(async (completo = false) => {
    const r = activoRef.current
    if (!r) return
    try {
      const [e, rs] = await Promise.all([api.estado(r), completo ? api.ramas(r) : null])
      if (r !== activoRef.current) return
      setError(null)
      const f = JSON.stringify(e)
      if (f !== firmaEstado.current) {
        firmaEstado.current = f
        setEstado(e)
        setResumenes((p) => ({ ...p, [r]: resumenDe(e) }))
      }
      if (rs) {
        const fr = e.info.hash + JSON.stringify(rs)
        if (fr !== firmaRefs.current) {
          firmaRefs.current = fr
          setRamas(rs)
          setVersion((v) => v + 1)
        }
      }
    } catch (err) {
      if (r === activoRef.current) setError(mensajeError(err))
    }
    setPulso((p) => p + 1)
  }, [])

  const refrescarResumenes = useCallback(async (lista: Repo[]) => {
    ultimosResumenes.current = Date.now()
    const r = await api.resumenes(lista.map((x) => x.ruta))
    setResumenes((p) => ({ ...p, ...r }))
  }, [])

  // Al arrancar: los repos de ~/dev y el último abierto.
  useEffect(() => {
    Promise.all([api.repos(), api.preferencias()]).then(([lista, prefs]) => {
      setRepos(lista)
      setRecientes(prefs.recientes ?? [])
      setActivo(lista.some((r) => r.ruta === prefs.ultimo) ? prefs.ultimo : (lista[0]?.ruta ?? null))
      refrescarResumenes(lista)
    })
  }, [refrescarResumenes])

  // Cambio de repo: se vigila su .git, se recuerda y se lee todo.
  useEffect(() => {
    activoRef.current = activo
    firmaEstado.current = ''
    firmaRefs.current = ''
    setEstado(null)
    setRamas([])
    setError(null)
    setBuscar('')
    setWeb(null)
    api.vigilar(activo)
    if (!activo) return
    api.recordar(activo)
    setRecientes((r) => [activo, ...r.filter((x) => x !== activo)].slice(0, 8))
    refrescar(true)
    api.webRemoto(activo).then((w) => activoRef.current === activo && setWeb(w))
  }, [activo, refrescar])

  // Sondeo con la ventana en primer plano, avisos del .git y al volver a la ventana.
  useEffect(() => {
    const t = setInterval(() => document.hasFocus() && document.visibilityState === 'visible' && refrescar(), CADA)
    const quitarCambio = window.cauce.alCambio((r) => r === activoRef.current && refrescar(true))
    const quitarFoco = window.cauce.alFoco(() => {
      refrescar(true)
      if (Date.now() - ultimosResumenes.current > 30_000) refrescarResumenes(repos)
    })
    return () => {
      clearInterval(t)
      quitarCambio()
      quitarFoco()
    }
  }, [refrescar, refrescarResumenes, repos])

  // Al abrir la paleta, los puntos y flechas de cada repo al día (como mucho cada 30 s).
  useEffect(() => {
    if (paleta && Date.now() - ultimosResumenes.current > 30_000) refrescarResumenes(repos)
  }, [paleta, repos, refrescarResumenes])

  // Atajos: Ctrl+P repos, Ctrl+B ramas, Ctrl+1 / Ctrl+2 vistas, F5 o Ctrl+R para refrescar.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setSelector(false)
        setPaleta((v) => !v)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'b' && activoRef.current) {
        e.preventDefault()
        setPaleta(false)
        setSelector((v) => !v)
      } else if (e.ctrlKey && e.key === '1') setVista('cambios')
      else if (e.ctrlKey && e.key === '2') setVista('historial')
      else if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
        e.preventDefault()
        refrescar(true)
      } else return
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [refrescar])

  /** Ejecuta algo sobre el repo abierto: avisa si sale bien, enseña el error de git si no, y refresca. */
  const hacer = useCallback(
    async (fn: (repo: string) => Promise<unknown>, exito?: string) => {
      const r = activoRef.current
      if (!r) return
      try {
        await fn(r)
        if (exito) avisar(exito)
      } catch (e) {
        avisar(mensajeError(e), true)
      }
      refrescar(true)
    },
    [avisar, refrescar],
  )

  const operar = async (o: Operacion) => {
    if (!activo || !estado) return
    setOcupado(o)
    try {
      if (o === 'traer') {
        await api.traer(activo)
        avisar('Remotos al día')
      } else if (o === 'bajar') {
        const s = await api.bajar(activo)
        avisar(/up to date/i.test(s) ? 'Ya estaba al día' : 'Cambios bajados')
      } else {
        await api.subir(activo, estado.info.upstream)
        avisar(estado.info.upstream ? `Subido a ${estado.info.upstream}` : `Rama ${estado.info.rama} publicada`)
      }
    } catch (e) {
      avisar(mensajeError(e), true)
    }
    setOcupado(null)
    refrescar(true)
    refrescarResumenes(repos.filter((r) => r.ruta === activo))
  }

  const cambiarRama = (r: Rama) => {
    const destino = r.tipo === 'remota' ? r.nombre.split('/').slice(1).join('/') : r.nombre
    hacer((repo) => api.cambiarRama(repo, r.nombre, r.tipo === 'remota'), `Ahora en ${destino}`)
  }

  const borrarRama = (r: Rama, forzar = false) =>
    hacer(async (repo) => {
      try {
        await api.borrarRama(repo, r.nombre, forzar)
        avisar(`Rama ${r.nombre} borrada`)
      } catch (e) {
        // Sin fusionar: se pregunta otra vez, avisando de que se pierden commits.
        if (!forzar && /not fully merged/i.test(mensajeError(e))) {
          setConfirmar({
            titulo: 'La rama no está fusionada',
            texto: (
              <>
                <b>{r.nombre}</b> tiene commits que no están en ninguna otra rama. Si la borras, se perderán (salvo que alguien los tenga en otro sitio).
              </>
            ),
            boton: 'Borrar igualmente',
            peligro: true,
            accion: () => borrarRama(r, true),
          })
          return
        }
        throw e
      }
    })

  const menuRama = (x: number, y: number, r: Rama) => {
    const actual = estado?.info.rama
    setMenu({
      x,
      y,
      elementos: [
        { texto: 'Cambiar a esta rama', icono: <GitBranch size={15} />, accion: () => cambiarRama(r), deshabilitado: r.actual },
        {
          texto: `Fusionar en ${actual ?? 'HEAD'}`,
          icono: <GitMerge size={15} />,
          deshabilitado: r.actual || !actual,
          accion: () => hacer((repo) => api.fusionar(repo, r.nombre), `${r.nombre} fusionada en ${actual}`),
        },
        { texto: 'Nueva rama desde aquí…', icono: <GitBranch size={15} />, accion: () => setNuevaRama({ ref: r.nombre, texto: r.nombre }) },
        { texto: 'Copiar el nombre', icono: <Copy size={15} />, accion: () => api.copiar(r.nombre) },
        'separador',
        {
          texto: 'Borrar la rama…',
          icono: <Trash size={15} />,
          peligro: true,
          deshabilitado: r.actual,
          accion: () =>
            setConfirmar({
              titulo: 'Borrar rama',
              texto: (
                <>
                  ¿Borrar la rama local <b>{r.nombre}</b>? La remota, si existe, no se toca.
                </>
              ),
              boton: 'Borrar',
              peligro: true,
              accion: () => borrarRama(r),
            }),
        },
      ],
    })
  }

  const menuCommit = (x: number, y: number, c: Commit) =>
    setMenu({
      x,
      y,
      elementos: [
        { texto: 'Copiar el hash', icono: <Copy size={15} />, accion: () => (api.copiar(c.hash), avisar('Hash copiado')) },
        { texto: 'Copiar el asunto', icono: <Copy size={15} />, accion: () => api.copiar(c.asunto) },
        { texto: 'Nueva rama desde este commit…', icono: <GitBranch size={15} />, accion: () => setNuevaRama({ ref: c.hash, texto: `${c.hash.slice(0, 7)} · ${c.asunto}` }) },
        ...(web ? [{ texto: 'Ver en la web', icono: <ArrowSquareOut size={15} />, accion: () => api.abrirEnlace(`${web}/commit/${c.hash}`) }] : []),
      ],
    })

  const menuRepo = (x: number, y: number, r: Repo) =>
    setMenu({
      x,
      y,
      elementos: [
        { texto: 'Abrir en una terminal', icono: <TerminalWindow size={15} />, accion: () => api.abrirEn(r.ruta, 'terminal') },
        { texto: 'Abrir en Zed', icono: <Code size={15} />, accion: () => api.abrirEn(r.ruta, 'editor') },
        { texto: 'Abrir la carpeta', icono: <FolderOpen size={15} />, accion: () => api.abrirEn(r.ruta, 'carpeta') },
        { texto: 'Copiar la ruta', icono: <Copy size={15} />, accion: () => api.copiar(r.ruta) },
      ],
    })

  const anadir = async () => {
    try {
      const r = await api.anadirRepo()
      if (!r) return
      const lista = await api.repos()
      setRepos(lista)
      setActivo(r)
      refrescarResumenes(lista)
    } catch (e) {
      avisar(mensajeError(e), true)
    }
  }

  const repo = repos.find((r) => r.ruta === activo)
  const info = estado?.info
  const cambios = estado ? resumenDe(estado).cambios : 0

  return (
    <div className="app">
      <main className="principal">
        {!activo ? (
          <div className="bienvenida">
            <Marca tamano={64} />
            <h1>Cauce</h1>
            <p>No hay repositorios en ~/dev. Añade uno para empezar.</p>
            <button className="boton destacado" onClick={anadir}>
              Añadir repositorio
            </button>
          </div>
        ) : error && !estado ? (
          <div className="bienvenida">
            <Warning size={40} weight="light" />
            <p>{error}</p>
          </div>
        ) : estado && info && repo && info.ruta === repo.ruta ? (
          // Solo con el estado del repo elegido: justo al cambiar de repo aún está el del anterior.
          <>
            <Barra
              nombre={repo.nombre}
              info={info}
              ramas={ramas}
              vista={vista}
              cambios={cambios}
              onVista={setVista}
              todas={todas}
              onTodas={setTodas}
              buscar={buscar}
              onBuscar={setBuscar}
              ocupado={ocupado}
              onOperacion={operar}
              onPaleta={() => setPaleta(true)}
              selectorAbierto={selector}
              onSelector={setSelector}
              onRama={cambiarRama}
              onMenuRama={menuRama}
              onNuevaRama={() => setNuevaRama({ ref: null, texto: info.rama ?? info.hash?.slice(0, 7) ?? 'HEAD' })}
              onAbrir={(d) => (d === 'web' ? web && api.abrirEnlace(web) : api.abrirEn(repo.ruta, d))}
              web={!!web}
            />
            {info.operacion && (
              <div className="banda">
                <Warning size={15} />
                <span>
                  <b>{NOMBRE_OP[info.operacion]} en curso.</b>{' '}
                  {estado.conflictos.length
                    ? `Quedan ${estado.conflictos.length} ${estado.conflictos.length === 1 ? 'archivo' : 'archivos'} en conflicto.`
                    : info.operacion === 'merge'
                      ? 'Sin conflictos: haz commit para terminar.'
                      : `Sigue en la terminal con git ${info.operacion} --continue.`}
                </span>
                <button
                  className="boton-chico"
                  onClick={() =>
                    setConfirmar({
                      titulo: `Cancelar ${NOMBRE_OP[info.operacion!].toLowerCase()}`,
                      texto: 'El repositorio vuelve a como estaba antes de empezar. Lo que hayas resuelto se pierde.',
                      boton: 'Cancelar la operación',
                      peligro: true,
                      accion: () => hacer((r) => api.abortar(r, info.operacion!), 'Operación cancelada'),
                    })
                  }
                >
                  Cancelar {NOMBRE_OP[info.operacion].toLowerCase()}
                </button>
              </div>
            )}
            {vista === 'cambios' ? (
              <Cambios key={repo.ruta} repo={repo.ruta} estado={estado} pulso={pulso} onRefrescar={() => refrescar(true)} avisar={avisar} />
            ) : (
              <Historial key={repo.ruta} repo={repo.ruta} info={info} version={version} todas={todas} buscar={buscar} avisar={avisar} onMenu={menuCommit} />
            )}
          </>
        ) : (
          <div className="bienvenida tenue" />
        )}
        {aviso && (
          <div className={`aviso${aviso.error ? ' error' : ''}`} key={aviso.id} onClick={() => setAviso(null)}>
            {aviso.error && <Warning size={15} weight="bold" />}
            <span>{aviso.texto}</span>
          </div>
        )}
      </main>

      {paleta && (
        <Paleta
          repos={repos}
          resumenes={resumenes}
          recientes={recientes}
          activo={activo}
          onElegir={(r) => {
            setPaleta(false)
            setActivo(r)
          }}
          onMenu={menuRepo}
          onAnadir={() => {
            setPaleta(false)
            anadir()
          }}
          onCerrar={() => setPaleta(false)}
        />
      )}
      {menu && <MenuContextual menu={menu} onCerrar={() => setMenu(null)} />}
      {nuevaRama && (
        <DialogoRama
          desde={nuevaRama}
          onCerrar={() => setNuevaRama(null)}
          onCrear={(nombre, cambiar) => {
            const desde = nuevaRama.ref
            setNuevaRama(null)
            hacer((r) => api.crearRama(r, nombre, desde, cambiar), cambiar ? `Ahora en ${nombre}` : `Rama ${nombre} creada`)
          }}
        />
      )}
      {confirmar && <DialogoConfirmar c={confirmar} onCerrar={() => setConfirmar(null)} />}
    </div>
  )
}
