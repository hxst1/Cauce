// El idioma de Cauce sale del sistema (o de CAUCE_LANG) al arrancar; el principal lo usa en sus
// mensajes y se lo pasa a la interfaz.
import { idiomaDelSistema, textos } from '@shared/i18n'

export const IDIOMA = idiomaDelSistema(process.env)
export const t = textos(IDIOMA.idioma)
