# Cauce

Un cliente de Git para Linux bonito y minimalista, con la paleta Niebla de [NimboMail](https://github.com/hxst1/NimboMail) (oscuro, monocromo y de cristal) pero con personalidad propia: barra superior en vez de lateral, acento acero y monoespaciada en ramas, rutas y hashes.

- **Tus repos de `~/dev`** a un `Ctrl+P`: una paleta con buscador, los recientes arriba y el resto agrupados por carpeta (personal, trabajo, empresa…), con su rama, lo que hay por subir o bajar y un punto si hay cambios. Los de otras carpetas se añaden desde ahí.
- **Cambios**: diff de cada archivo, preparar o descartar archivos enteros o **bloques sueltos**, y commit (Ctrl+Enter), con «modificar el último» y la identidad de git que vas a usar a la vista.
- **Historial** con el grafo de ramas, etiquetas, búsqueda por mensaje o autor, y el detalle de cada commit con sus archivos y diffs.
- **Ramas**: cambiar, crear (desde HEAD, otra rama o cualquier commit), fusionar y borrar; las remotas se siguen al elegirlas.
- **Traer, bajar y subir** (fetch, pull y push). Una rama nueva se publica con su upstream.
- Abrir el repo en la terminal (kitty), en Zed o en la web del remoto.

Usa el `git` de tu sistema: valen tu configuración, tus identidades por carpeta (`includeIf`), tus alias de SSH y los hooks. Las contraseñas de SSH o HTTPS se piden en un diálogo gráfico (`ksshaskpass` u otro `ssh-askpass`).

## Instalar

Necesitas Linux, Node.js 24, pnpm y git.

```sh
pnpm install
pnpm instalar   # compila e instala en ~/.local (sin root)
```

Para desarrollar: `pnpm dev`.

## Atajos

| Tecla | Qué hace |
|---|---|
| `Ctrl+P` | Ir a otro repositorio |
| `Ctrl+B` | Cambiar de rama |
| `Ctrl+1` · `Ctrl+2` | Cambios · Historial |
| `↑` / `↓` | Moverse por archivos o commits |
| `Espacio` | Preparar o quitar el archivo elegido |
| `Ctrl+Enter` | Commit |
| `F5` · `Ctrl+R` | Refrescar |
| `Ctrl+Q` | Salir |

## Licencia

GPL-3.0 o posterior.
