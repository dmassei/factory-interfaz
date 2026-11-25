// Llamadas a las dos APIs que usa la página. La función de red (fetch) siempre
// llega como parámetro: así la lógica se prueba sin red y nada de este módulo
// toca globales del navegador al cargarse.
//
// Reglas: las claves viajan solo en encabezados y solo a su servicio
// (oficio/base/seguridad.md#S-01, #S-02); toda llamada tiene tiempo límite y
// manejo de falla (#S-10); los destinos son fijos (#S-12).

export const ORIGEN_GITHUB = 'https://api.github.com';
export const ORIGEN_ANTHROPIC = 'https://api.anthropic.com';
export const URL_MENSAJES = `${ORIGEN_ANTHROPIC}/v1/messages`;
export const VERSION_ANTHROPIC = '2023-06-01';

export const LIMITE_GITHUB_MS = 30000;
export const LIMITE_ANTHROPIC_MS = 180000;

/** Error de una llamada de red, con un mensaje apto para mostrar en pantalla. */
export class ErrorDeRed extends Error {
  constructor(mensaje, estado = 0) {
    super(mensaje);
    this.name = 'ErrorDeRed';
    this.estado = estado;
  }
}

/** Quita de un texto cualquier aparición de los secretos dados. */
export function sinSecretos(texto, secretos = []) {
  let limpio = String(texto ?? '');
  for (const secreto of secretos) {
    if (typeof secreto === 'string' && secreto.length > 0) {
      limpio = limpio.split(secreto).join('[oculto]');
    }
  }
  return limpio;
}

function senal(ms) {
  return AbortSignal.timeout(ms);
}

/**
 * Arma una URL de la API de GitHub. Cada segmento se codifica por separado, así
 * que un dato no puede cambiar la ruta ni el origen. La consulta es un texto
 * constante del propio código.
 */
export function urlGitHub(segmentos, consulta = '') {
  const ruta = segmentos.map((s) => encodeURIComponent(String(s))).join('/');
  return `${ORIGEN_GITHUB}/${ruta}${consulta ? `?${consulta}` : ''}`;
}

async function leerCuerpo(respuesta) {
  let texto = '';
  try {
    texto = await respuesta.text();
  } catch {
    return null;
  }
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function motivoDeFalla(error, servicio) {
  if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `${servicio} tardó demasiado en responder.`;
  }
  return `No se pudo conectar con ${servicio}. Revisá tu conexión a internet.`;
}

/**
 * Llamada a GitHub. Devuelve { estado, datos } si la respuesta es 2xx y lanza
 * ErrorDeRed en cualquier otro caso. El token va solo en Authorization.
 */
export async function pedirGitHub(fetchFn, token, { metodo = 'GET', url, cuerpo } = {}) {
  if (typeof url !== 'string' || !url.startsWith(`${ORIGEN_GITHUB}/`)) {
    throw new ErrorDeRed('Destino de GitHub no permitido.');
  }
  const encabezados = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) encabezados.Authorization = `Bearer ${token}`;
  const opciones = { method: metodo, headers: encabezados, signal: senal(LIMITE_GITHUB_MS) };
  if (cuerpo !== undefined) {
    encabezados['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  let respuesta;
  try {
    respuesta = await fetchFn(url, opciones);
  } catch (error) {
    throw new ErrorDeRed(motivoDeFalla(error, 'GitHub'));
  }
  const datos = await leerCuerpo(respuesta);
  if (!respuesta.ok) {
    const motivo = datos && typeof datos.message === 'string' ? `: ${datos.message}` : '';
    throw new ErrorDeRed(sinSecretos(`GitHub respondió ${respuesta.status}${motivo}`, [token]), respuesta.status);
  }
  return { estado: respuesta.status, datos };
}

/**
 * Llamada a la API de mensajes de Anthropic desde el navegador. La clave va solo
 * en x-api-key. Devuelve el cuerpo de la respuesta o lanza ErrorDeRed con el
 * motivo que informa la API.
 */
export async function pedirAnthropic(fetchFn, clave, cuerpo) {
  const opciones = {
    method: 'POST',
    headers: {
      'x-api-key': clave,
      'anthropic-version': VERSION_ANTHROPIC,
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(cuerpo),
    signal: senal(LIMITE_ANTHROPIC_MS),
  };
  let respuesta;
  try {
    respuesta = await fetchFn(URL_MENSAJES, opciones);
  } catch (error) {
    throw new ErrorDeRed(motivoDeFalla(error, 'la API de Anthropic'));
  }
  const datos = await leerCuerpo(respuesta);
  if (!respuesta.ok) {
    throw new ErrorDeRed(sinSecretos(mensajeDeErrorAnthropic(respuesta.status, datos), [clave]), respuesta.status);
  }
  return datos;
}

/** Arma el mensaje para mostrar a partir de una respuesta de error de Anthropic. */
export function mensajeDeErrorAnthropic(estado, datos) {
  const error = datos && typeof datos === 'object' ? datos.error : null;
  const mensaje = error && typeof error.message === 'string' ? error.message : '';
  const tipo = error && typeof error.type === 'string' ? error.type : '';
  let base = `La API de Anthropic respondió con un error (${estado}`;
  base += tipo ? `, ${tipo})` : ')';
  return mensaje ? `${base}: ${mensaje}` : `${base}.`;
}
