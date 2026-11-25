// Arma un controlador con red falsa, almacenamientos en memoria y temporizador falso.
import { Controlador } from '../../docs/js/controlador.js';
import { crearRed, contenido } from './red-falsa.js';
import { crearAlmacen, crearTemporizador } from './almacen.js';
import { ETAPAS_TEXTO, ESQUEMA_TEXTO, FICHA_TEXTO, TOKEN, CLAVE, REPO, BASE } from './ejemplos.js';

/** Rutas de lectura del factory: esquema, ficha y etapas. */
export function rutasFactory({ esquema = ESQUEMA_TEXTO, ficha = FICHA_TEXTO, etapas = ETAPAS_TEXTO } = {}) {
  return [
    { url: `${BASE}/contents/esquemas/pedido.json`, responder: { body: contenido(esquema) } },
    { url: `${BASE}/contents/agentes/relevamiento.md`, responder: { body: contenido(ficha) } },
    { url: `${BASE}/contents/brain/nucleo/etapas.json`, responder: { body: contenido(etapas) } },
    { url: BASE, responder: { body: { full_name: REPO } } },
  ];
}

export function sesionConClaves({ clave = true } = {}) {
  const datos = { 'factory.repo': REPO, 'factory.token': TOKEN, 'factory.modelo': 'claude-sonnet-5-5' };
  if (clave) datos['factory.clave'] = CLAVE;
  return datos;
}

export function crearEscenario({ rutas = [], sesion = sesionConClaves(), local = {}, fetch } = {}) {
  const red = fetch ? { fetch, llamadas: [] } : crearRed([...rutas, ...rutasFactory()]);
  const temporizador = crearTemporizador();
  const cambios = [];
  const almacenSesion = crearAlmacen(sesion);
  const almacenLocal = crearAlmacen(local);
  const controlador = new Controlador({
    fetch: red.fetch,
    sesion: almacenSesion,
    local: almacenLocal,
    temporizador,
    alCambiar: (estado) => cambios.push(estado.seccion),
  });
  return { controlador, red, temporizador, cambios, sesion: almacenSesion, local: almacenLocal };
}
