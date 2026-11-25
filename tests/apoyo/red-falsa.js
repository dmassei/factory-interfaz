// Red falsa para los tests: registra cada llamada y responde según rutas.
// No termina en .test.js, así que el corredor no la toma por test.

/** Respuesta de /contents de GitHub: base64 partido en líneas de 60, como lo devuelve la API. */
export function contenido(texto) {
  const base64 = Buffer.from(texto, 'utf8').toString('base64');
  return { type: 'file', encoding: 'base64', content: base64.match(/.{1,60}/g).join('\n') + '\n' };
}

/**
 * Crea un fetch falso. `rutas` es una lista de { metodo, url, responder }, donde
 * url es un texto (coincidencia exacta), una RegExp o una función, y responder
 * es { status, body } o una función (llamada) => { status, body } | Error.
 * Lo que no coincide responde 404.
 */
export function crearRed(rutas = []) {
  const llamadas = [];
  const fetch = async (url, opciones = {}) => {
    const metodo = (opciones.method || 'GET').toUpperCase();
    let cuerpo;
    if (typeof opciones.body === 'string') {
      try { cuerpo = JSON.parse(opciones.body); } catch { cuerpo = opciones.body; }
    }
    const llamada = { url, metodo, opciones, encabezados: opciones.headers || {}, cuerpo, cuerpoCrudo: opciones.body };
    llamadas.push(llamada);
    const ruta = rutas.find((r) => (r.metodo || 'GET') === metodo && coincide(r.url, url, llamada));
    let resultado = ruta ? ruta.responder : { status: 404, body: { message: 'Not Found' } };
    if (typeof resultado === 'function') resultado = resultado(llamada);
    if (resultado instanceof Error) throw resultado;
    const status = resultado.status ?? 200;
    return new Response(resultado.body === undefined ? null : JSON.stringify(resultado.body), { status });
  };
  return { fetch, llamadas };
}

function coincide(patron, url, llamada) {
  if (typeof patron === 'string') return patron === url;
  if (patron instanceof RegExp) return patron.test(url);
  if (typeof patron === 'function') return patron(url, llamada);
  return false;
}

/** fetch que siempre rechaza la promesa, como una falla de red. */
export function redCaida() {
  const llamadas = [];
  const fetch = async (url, opciones = {}) => {
    llamadas.push({ url, metodo: (opciones.method || 'GET').toUpperCase(), opciones, encabezados: opciones.headers || {} });
    throw new TypeError('Failed to fetch');
  };
  return { fetch, llamadas };
}
