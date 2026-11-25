// Lanzamiento de un pedido en tres pasos: issue sin etiquetas, un comentario por
// cada parte de cada adjunto y la etiqueta factory:pedido al final. Si un paso
// falla, el estado guarda hasta dónde se llegó y el reintento sigue desde ahí.

import { pedirGitHub, urlGitHub, ErrorDeRed } from './red.js';
import { validarRepo } from './config.js';
import { partirAdjunto } from './adjuntos.js';
import { tituloDelIssue, cuerpoDelIssue } from './pedido.js';

export const ETIQUETA_PEDIDO = 'factory:pedido';

/**
 * Prepara el lanzamiento. Rechaza un pedido que no está confirmado.
 * `adjuntos` es [{ nombre, base64 }].
 */
export function prepararLanzamiento(pedido, adjuntos = []) {
  if (!pedido || !pedido.relevamiento || pedido.relevamiento.confirmado !== true) {
    throw new Error('El pedido no está confirmado: no se puede lanzar.');
  }
  const partes = [];
  for (const adjunto of adjuntos) {
    const cuerpos = partirAdjunto(adjunto.nombre, adjunto.base64);
    cuerpos.forEach((cuerpo, i) => partes.push({ nombre: adjunto.nombre, parte: i + 1, de: cuerpos.length, cuerpo }));
  }
  return { pedido, partes, issue: null, enviadas: 0, etiquetado: false, fallo: null };
}

/**
 * Ejecuta (o retoma) el lanzamiento. Devuelve el estado nuevo; si un paso falla,
 * el estado lleva `fallo` con el paso y el mensaje, y no se sigue.
 */
export async function ejecutarLanzamiento(fetchFn, config, estado) {
  const factory = validarRepo(config.repo);
  if (!factory) throw new Error('El repo del factory no es válido.');
  if (!estado.pedido || !estado.pedido.relevamiento || estado.pedido.relevamiento.confirmado !== true) {
    throw new Error('El pedido no está confirmado: no se puede lanzar.');
  }
  const actual = { ...estado, fallo: null };
  const base = ['repos', factory.owner, factory.nombre, 'issues'];

  if (actual.issue === null) {
    try {
      const { datos } = await pedirGitHub(fetchFn, config.token, {
        metodo: 'POST',
        url: urlGitHub(base),
        cuerpo: { title: tituloDelIssue(actual.pedido), body: cuerpoDelIssue(actual.pedido) },
      });
      if (!datos || !Number.isInteger(datos.number)) throw new ErrorDeRed('GitHub no devolvió el número del issue.');
      actual.issue = datos.number;
    } catch (error) {
      actual.fallo = { paso: 'issue', mensaje: `No se pudo crear el issue del pedido. ${mensajeDe(error)}` };
      return actual;
    }
  }

  while (actual.enviadas < actual.partes.length) {
    const parte = actual.partes[actual.enviadas];
    try {
      await pedirGitHub(fetchFn, config.token, {
        metodo: 'POST',
        url: urlGitHub([...base, actual.issue, 'comments']),
        cuerpo: { body: parte.cuerpo },
      });
      actual.enviadas += 1;
    } catch (error) {
      actual.fallo = {
        paso: 'adjunto',
        nombre: parte.nombre,
        parte: parte.parte,
        de: parte.de,
        mensaje: `Falló el envío del adjunto ${parte.nombre} (parte ${parte.parte} de ${parte.de}). ${mensajeDe(error)}`,
      };
      return actual;
    }
  }

  if (!actual.etiquetado) {
    try {
      await pedirGitHub(fetchFn, config.token, {
        metodo: 'POST',
        url: urlGitHub([...base, actual.issue, 'labels']),
        cuerpo: { labels: [ETIQUETA_PEDIDO] },
      });
      actual.etiquetado = true;
    } catch (error) {
      actual.fallo = { paso: 'etiqueta', mensaje: `No se pudo poner la etiqueta ${ETIQUETA_PEDIDO}, que es la que arranca el pedido. ${mensajeDe(error)}` };
      return actual;
    }
  }
  return actual;
}

function mensajeDe(error) {
  return error instanceof ErrorDeRed ? error.message : 'Error inesperado.';
}
