// Resultado que informa el factory: el último comentario del issue que no es un
// adjunto. Se muestra como texto; solo los enlaces https se vuelven enlaces
// (oficio/base/seguridad.md#S-07).

import { esComentarioDeAdjunto } from './adjuntos.js';

/** Último comentario que no es un adjunto, o null. */
export function elegirResultado(comentarios) {
  const lista = Array.isArray(comentarios) ? comentarios : [];
  for (let i = lista.length - 1; i >= 0; i -= 1) {
    const cuerpo = lista[i] && typeof lista[i].body === 'string' ? lista[i].body : '';
    if (cuerpo.trim() !== '' && !esComentarioDeAdjunto(cuerpo)) return cuerpo;
  }
  return null;
}

const URL_HTTPS = /https:\/\/[^\s<>"'`()[\]{}]+/g;
const PUNTUACION_FINAL = /[.,;:!?]+$/;

/** Devuelve la URL si es https válida, o null. */
export function enlaceSeguro(texto) {
  try {
    const url = new URL(texto);
    return url.protocol === 'https:' && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Parte un texto en segmentos { tipo: 'texto', texto } y { tipo: 'enlace', texto, url }.
 * Solo las URL https son enlaces; el resto (http, javascript:, Markdown) queda como texto.
 */
export function segmentarTexto(texto) {
  const fuente = String(texto ?? '');
  const segmentos = [];
  let desde = 0;
  for (const hallado of fuente.matchAll(URL_HTTPS)) {
    let candidato = hallado[0];
    const sobra = PUNTUACION_FINAL.exec(candidato);
    if (sobra) candidato = candidato.slice(0, -sobra[0].length);
    const url = enlaceSeguro(candidato);
    if (!url) continue;
    if (hallado.index > desde) segmentos.push({ tipo: 'texto', texto: fuente.slice(desde, hallado.index) });
    segmentos.push({ tipo: 'enlace', texto: candidato, url });
    desde = hallado.index + candidato.length;
  }
  if (desde < fuente.length) segmentos.push({ tipo: 'texto', texto: fuente.slice(desde) });
  return segmentos;
}
