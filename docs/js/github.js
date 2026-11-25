// Operaciones de lectura sobre GitHub: conexión, archivos del factory, pedidos,
// corridas, comentarios y datos de diseño de los proyectos. Todas reciben la
// función de red. Las URL se arman con segmentos validados (S-12).

import { pedirGitHub, urlGitHub, ErrorDeRed } from './red.js';
import { validarRepo } from './config.js';
import { base64ATexto, FORMATO_NOMBRE, esTexto } from './adjuntos.js';
import { validarEtapas, validarWorkflow } from './etapas.js';
import { numerosDePedidos } from './proyectos.js';
import { NOMBRE_PROYECTO } from './pedido.js';

export const RUTAS_FACTORY = Object.freeze({
  esquema: 'esquemas/pedido.json',
  ficha: 'agentes/relevamiento.md',
  etapas: 'brain/nucleo/etapas.json',
});

function repoDe(config) {
  const repo = validarRepo(config.repo);
  if (!repo) throw new ErrorDeRed('El repo del factory no es válido: tiene que ser dueño/nombre.');
  return repo;
}

/**
 * Comprueba que el token llega al repo del factory.
 * Devuelve { ok: true, mensaje } o { ok: false, mensaje }; nunca lanza.
 */
export async function comprobarConexion(fetchFn, config) {
  const repo = validarRepo(config.repo);
  if (!repo) return { ok: false, mensaje: 'El repo del factory tiene que tener la forma dueño/nombre.' };
  try {
    await pedirGitHub(fetchFn, config.token, { url: urlGitHub(['repos', repo.owner, repo.nombre]) });
    return { ok: true, mensaje: `Conexión correcta: el token llega a ${repo.owner}/${repo.nombre}.` };
  } catch (error) {
    const motivo = error instanceof ErrorDeRed ? error.message : 'Error inesperado.';
    return { ok: false, mensaje: `El token no llega al repo del factory ${repo.owner}/${repo.nombre}. ${motivo}` };
  }
}

/** Decodifica el contenido de una respuesta de /contents (base64 partido en líneas). */
export function decodificarContenido(datos) {
  if (!datos || typeof datos.content !== 'string' || (datos.encoding && datos.encoding !== 'base64')) {
    throw new ErrorDeRed('GitHub no devolvió el contenido del archivo.');
  }
  return base64ATexto(datos.content);
}

function urlContenido(owner, nombre, ruta) {
  return urlGitHub(['repos', owner, nombre, 'contents', ...ruta.split('/')]);
}

/** Lee un archivo del repo del factory (ruta de RUTAS_FACTORY) como texto. */
export async function leerArchivoFactory(fetchFn, config, ruta) {
  if (!Object.values(RUTAS_FACTORY).includes(ruta)) throw new ErrorDeRed('Archivo del factory no previsto.');
  const repo = repoDe(config);
  const { datos } = await pedirGitHub(fetchFn, config.token, { url: urlContenido(repo.owner, repo.nombre, ruta) });
  return decodificarContenido(datos);
}

function parsear(texto, que) {
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorDeRed(`${que} del factory no es un JSON válido.`);
  }
}

export async function leerEsquema(fetchFn, config) {
  const texto = await leerArchivoFactory(fetchFn, config, RUTAS_FACTORY.esquema);
  return { texto, esquema: parsear(texto, 'El esquema del pedido') };
}

export async function leerFicha(fetchFn, config) {
  return leerArchivoFactory(fetchFn, config, RUTAS_FACTORY.ficha);
}

export async function leerEtapas(fetchFn, config) {
  const texto = await leerArchivoFactory(fetchFn, config, RUTAS_FACTORY.etapas);
  try {
    return validarEtapas(parsear(texto, 'El archivo de etapas'));
  } catch (error) {
    throw error instanceof ErrorDeRed ? error : new ErrorDeRed(error.message);
  }
}

/** Issues con la etiqueta factory:pedido (hasta 50). */
export async function listarIssuesDePedidos(fetchFn, config) {
  const repo = repoDe(config);
  const { datos } = await pedirGitHub(fetchFn, config.token, {
    url: urlGitHub(['repos', repo.owner, repo.nombre, 'issues'], 'labels=factory:pedido&state=all&per_page=50'),
  });
  return Array.isArray(datos) ? datos : [];
}

/** Corridas del workflow del recorrido (hasta 50). */
export async function listarCorridas(fetchFn, config, workflow) {
  if (!validarWorkflow(workflow)) throw new ErrorDeRed('El nombre del workflow del recorrido no es válido.');
  const repo = repoDe(config);
  const { datos } = await pedirGitHub(fetchFn, config.token, {
    url: urlGitHub(['repos', repo.owner, repo.nombre, 'actions', 'workflows', workflow, 'runs'], 'per_page=50'),
  });
  return datos && Array.isArray(datos.workflow_runs) ? datos.workflow_runs : [];
}

/** Trabajos (con sus pasos) de una corrida. */
export async function listarTrabajos(fetchFn, config, idCorrida) {
  if (!Number.isSafeInteger(idCorrida)) throw new ErrorDeRed('Identificador de corrida inválido.');
  const repo = repoDe(config);
  const { datos } = await pedirGitHub(fetchFn, config.token, {
    url: urlGitHub(['repos', repo.owner, repo.nombre, 'actions', 'runs', idCorrida, 'jobs'], 'per_page=100'),
  });
  return datos && Array.isArray(datos.jobs) ? datos.jobs : [];
}

/** Comentarios de un issue (hasta 5 páginas de 100). */
export async function listarComentarios(fetchFn, config, issue) {
  if (!Number.isSafeInteger(issue)) throw new ErrorDeRed('Número de issue inválido.');
  const repo = repoDe(config);
  const todos = [];
  for (let pagina = 1; pagina <= 5; pagina += 1) {
    const { datos } = await pedirGitHub(fetchFn, config.token, {
      url: urlGitHub(['repos', repo.owner, repo.nombre, 'issues', issue, 'comments'], `per_page=100&page=${pagina}`),
    });
    const lista = Array.isArray(datos) ? datos : [];
    todos.push(...lista);
    if (lista.length < 100) break;
  }
  return todos;
}

/**
 * Datos de diseño de un proyecto: los pedidos guardados en .factory/pedidos/ de
 * su repo, en orden, con la lista de adjuntos. Solo GET.
 * Devuelve { sinDatos: true } si la carpeta no existe, o { pedidos: [...] }.
 */
export async function leerDatosDeDiseno(fetchFn, config, proyecto) {
  const factory = repoDe(config);
  if (!NOMBRE_PROYECTO.test(proyecto)) throw new ErrorDeRed('Nombre de proyecto inválido.');
  const owner = factory.owner;
  const leer = (ruta) => pedirGitHub(fetchFn, config.token, { url: urlContenido(owner, proyecto, ruta) });

  let listado;
  try {
    listado = (await leer('.factory/pedidos')).datos;
  } catch (error) {
    if (error instanceof ErrorDeRed && error.estado === 404) return { sinDatos: true };
    throw error;
  }
  const pedidos = [];
  for (const numero of numerosDePedidos(listado)) {
    const carpeta = `.factory/pedidos/${numero}`;
    let pedido = null;
    try {
      pedido = JSON.parse(decodificarContenido((await leer(`${carpeta}/pedido.json`)).datos));
    } catch (error) {
      if (!(error instanceof SyntaxError) && !(error instanceof ErrorDeRed && error.estado === 404)) throw error;
    }
    const adjuntos = [];
    let entradas = [];
    try {
      entradas = (await leer(`${carpeta}/adjuntos`)).datos;
    } catch (error) {
      if (!(error instanceof ErrorDeRed && error.estado === 404)) throw error;
    }
    for (const entrada of Array.isArray(entradas) ? entradas : []) {
      if (!entrada || entrada.type !== 'file' || !FORMATO_NOMBRE.test(entrada.name) || entrada.name.includes('..')) continue;
      const adjunto = { nombre: entrada.name };
      if (esTexto(entrada.name)) {
        adjunto.texto = decodificarContenido((await leer(`${carpeta}/adjuntos/${entrada.name}`)).datos);
      }
      adjuntos.push(adjunto);
    }
    pedidos.push({ numero, pedido: pedido && typeof pedido === 'object' && !Array.isArray(pedido) ? pedido : null, adjuntos });
  }
  return { pedidos };
}
