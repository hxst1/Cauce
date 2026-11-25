// Los textos de la interfaz en el idioma del sistema (lo decide el principal al arrancar).
import { textos } from '@shared/i18n'

export const { idioma, locale } = window.cauce.idioma
export const t = textos(idioma)
document.documentElement.lang = idioma
