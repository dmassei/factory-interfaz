// Entrevista con el modelo. Criterios C-15, C-16, C-17 y C-18.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  armarSistema, armarPrimerMensaje, armarLlamada, interpretarRespuesta, INSTRUCCION_SIN_PREGUNTAS,
} from '../docs/js/entrevista.js';
import { crearDocumento } from './apoyo/dom-falso.js';
import { vistaPreguntas } from '../docs/js/vista.js';
import { crearEscenario } from './apoyo/escenario.js';
import {
  CLAVE, TOKEN, FICHA_TEXTO, ESQUEMA_TEXTO, pedidoDelModelo, respuestaModelo,
} from './apoyo/ejemplos.js';

const URL_MENSAJES = 'https://api.anthropic.com/v1/messages';

/** Ruta de Anthropic que responde, en orden, con la lista dada. */
function rutaAnthropic(respuestas) {
  let i = 0;
  return {
    metodo: 'POST',
    url: URL_MENSAJES,
    responder: () => {
      const r = respuestas[Math.min(i, respuestas.length - 1)];
      i += 1;
      return r;
    },
  };
}

const ok = (texto) => ({ status: 200, body: respuestaModelo(texto) });
const preguntas = (lista) => ok(JSON.stringify({ preguntas: lista }));
const pedido = (p = pedidoDelModelo()) => ok(JSON.stringify({ pedido: p }));

function llamadasAnthropic(red) {
  return red.llamadas.filter((l) => l.url === URL_MENSAJES);
}

function textoDe(mensaje) {
  return mensaje.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

function cargarDescripcion(controlador, extra = {}) {
  controlador.actualizarDescripcion({ descripcion: 'una página que convierta pulgadas a milímetros', tipo: 'nuevo', ...extra });
}

describe('C-15: la llamada a la API de Anthropic', () => {
  test('encabezados, modelo, instrucciones y adjuntos', async () => {
    const e = crearEscenario({ rutas: [rutaAnthropic([preguntas(['¿Para quién es?'])])] });
    cargarDescripcion(e.controlador);
    const leerTexto = async () => ({ clase: 'texto', base64: 'eA==', texto: 'Notas del boceto: botón grande', extension: 'md' });
    await e.controlador.agregarAdjunto({ nombre: 'notas.md', tamano: 30, leer: leerTexto });
    await e.controlador.agregarAdjunto({
      nombre: 'boceto.png', tamano: 100,
      leer: async () => ({ clase: 'imagen', base64: 'iVBORw0KGgo=', tipoMedio: 'image/png', extension: 'png' }),
    });
    await e.controlador.agregarAdjunto({
      nombre: 'foto.webp', tamano: 9_000_000,
      leer: async () => ({ clase: 'imagen', base64: '/9j/4AAQ', tipoMedio: 'image/jpeg', extension: 'jpg' }),
    });
    await e.controlador.entrevistar();

    const [llamada] = llamadasAnthropic(e.red);
    assert.equal(llamada.metodo, 'POST');
    assert.equal(llamada.encabezados['x-api-key'], CLAVE);
    assert.equal(llamada.encabezados['anthropic-version'], '2023-06-01');
    assert.equal(llamada.encabezados['content-type'], 'application/json');
    assert.equal(llamada.encabezados['anthropic-dangerous-direct-browser-access'], 'true');
    const cuerpo = llamada.cuerpo;
    assert.equal(cuerpo.model, 'claude-sonnet-5-5');
    assert.equal(typeof cuerpo.max_tokens, 'number');
    assert.ok(cuerpo.system.includes(FICHA_TEXTO));
    assert.ok(cuerpo.system.includes(ESQUEMA_TEXTO));
    assert.match(cuerpo.system, /\{"preguntas": \[/);
    assert.match(cuerpo.system, /\{"pedido": \{/);
    assert.ok(Array.isArray(cuerpo.messages));
    const primero = cuerpo.messages[0];
    assert.equal(primero.role, 'user');
    const texto = textoDe(primero);
    assert.match(texto, /pulgadas a milímetros/);
    assert.match(texto, /software nuevo/);
    assert.match(texto, /Notas del boceto: botón grande/);
    const imagenes = primero.content.filter((b) => b.type === 'image');
    assert.deepEqual(imagenes, [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' } },
    ]);
  });

  test('usa el modelo de Conexión si el usuario lo cambió', async () => {
    const e = crearEscenario({ rutas: [rutaAnthropic([preguntas(['¿Qué?'])])] });
    e.sesion.setItem('factory.modelo', 'claude-opus-5-5');
    const otro = crearEscenario({ rutas: [rutaAnthropic([preguntas(['¿Qué?'])])], sesion: e.sesion.volcar() });
    cargarDescripcion(otro.controlador);
    await otro.controlador.entrevistar();
    assert.equal(llamadasAnthropic(otro.red)[0].cuerpo.model, 'claude-opus-5-5');
  });

  test('un cambio dice a qué proyecto', () => {
    const bloques = armarPrimerMensaje({ descripcion: 'agregar libras', tipo: 'cambio', proyecto: 'calculadora-pesos', adjuntos: [] });
    const texto = bloques.map((b) => b.text).join('\n');
    assert.match(texto, /cambio al proyecto existente "calculadora-pesos"/);
  });

  test('el sistema incluye la ficha y el esquema leídos', () => {
    const sistema = armarSistema('FICHA X', '{"esquema": 1}');
    assert.ok(sistema.includes('FICHA X'));
    assert.ok(sistema.includes('{"esquema": 1}'));
  });
});

describe('C-16: interpretación de la respuesta del modelo', () => {
  test('preguntas válidas, mostradas numeradas como texto', () => {
    const r = interpretarRespuesta(respuestaModelo('{"preguntas": ["¿Para quién es?", "¿Qué unidades?"]}'));
    assert.deepEqual(r.preguntas, ['¿Para quién es?', '¿Qué unidades?']);
    const doc = crearDocumento();
    const vista = vistaPreguntas(doc, r.preguntas);
    const [lista] = vista.buscar('ol');
    assert.ok(lista, 'una lista ordenada numera las preguntas 1 y 2');
    const items = lista.children;
    assert.equal(items.length, 2);
    assert.equal(items[0].buscar('label')[0].textContent, '¿Para quién es?');
    assert.equal(items[1].buscar('label')[0].textContent, '¿Qué unidades?');
  });

  test('pedido válido', () => {
    const r = interpretarRespuesta(respuestaModelo(JSON.stringify({ pedido: { objetivo: 'x' } })));
    assert.deepEqual(r.pedido, { objetivo: 'x' });
  });

  for (const malo of ['Hola, ¿en qué te ayudo?', '{"otra": 1}', '{"preguntas": "texto"}', '{"preguntas": [1, 2]}', '[]', '{"preguntas": []}', '{"pedido": "x"}']) {
    test(`rechaza ${malo}`, () => {
      const r = interpretarRespuesta(respuestaModelo(malo));
      assert.ok(r.error);
    });
  }

  test('una preguntas con HTML se muestra como texto', () => {
    const doc = crearDocumento();
    const vista = vistaPreguntas(doc, ['<img src=x onerror=alert(1)>']);
    assert.equal(vista.buscar('img').length, 0);
    assert.equal(vista.buscar('label')[0].textContent, '<img src=x onerror=alert(1)>');
  });

  test('ante una respuesta inválida, se muestra el error y no se pierde nada', async () => {
    const e = crearEscenario({ rutas: [rutaAnthropic([preguntas(['¿Para quién?']), ok('Hola, ¿en qué te ayudo?'), pedido()])] });
    cargarDescripcion(e.controlador);
    await e.controlador.agregarAdjunto({ nombre: 'n.txt', tamano: 4, leer: async () => ({ clase: 'texto', base64: 'aG9sYQ==', texto: 'hola', extension: 'txt' }) });
    await e.controlador.entrevistar();
    await e.controlador.responder(['Para mí']);
    const p = e.controlador.estado.pedido;
    assert.ok(p.error);
    assert.equal(p.puedeReintentar, true);
    assert.equal(p.paso, 'preguntas');
    assert.deepEqual(p.respuestas, ['Para mí']);
    assert.equal(p.adjuntos.length, 1);
    assert.match(p.descripcion, /pulgadas/);
    await e.controlador.responder(p.respuestas);
    assert.equal(e.controlador.estado.pedido.paso, 'confirmar');
  });
});

describe('C-17: rondas de preguntas', () => {
  test('tras 2 rondas respondidas, la siguiente llamada pide el pedido sin más preguntas', async () => {
    const e = crearEscenario({ rutas: [rutaAnthropic([preguntas(['¿1?']), preguntas(['¿2?']), pedido()])] });
    cargarDescripcion(e.controlador);
    await e.controlador.entrevistar();
    const primera = llamadasAnthropic(e.red)[0].cuerpo.messages;
    assert.ok(!textoDe(primera[primera.length - 1]).includes(INSTRUCCION_SIN_PREGUNTAS));
    await e.controlador.responder(['r1']);
    const segunda = llamadasAnthropic(e.red)[1].cuerpo.messages;
    assert.ok(!textoDe(segunda[segunda.length - 1]).includes(INSTRUCCION_SIN_PREGUNTAS));
    await e.controlador.responder(['r2']);
    const tercera = llamadasAnthropic(e.red)[2].cuerpo.messages;
    assert.ok(textoDe(tercera[tercera.length - 1]).includes(INSTRUCCION_SIN_PREGUNTAS));
    const borrador = e.controlador.estado.pedido.borrador;
    assert.equal(borrador.relevamiento.rondas, 2);
    assert.ok(!borrador.relevamiento.rondas_extra_pedidas);
  });

  test('si el usuario pide otra ronda, la siguiente llamada permite preguntas y queda registrada', async () => {
    const e = crearEscenario({
      rutas: [rutaAnthropic([preguntas(['¿1?']), preguntas(['¿2?']), pedido(), preguntas(['¿3?']), pedido()])],
    });
    cargarDescripcion(e.controlador);
    await e.controlador.entrevistar();
    await e.controlador.responder(['r1']);
    await e.controlador.responder(['r2']);
    assert.equal(e.controlador.estado.pedido.paso, 'confirmar');
    await e.controlador.pedirOtraRonda();
    const cuarta = llamadasAnthropic(e.red)[3].cuerpo.messages;
    const ultimo = textoDe(cuarta[cuarta.length - 1]);
    assert.ok(!ultimo.includes(INSTRUCCION_SIN_PREGUNTAS));
    assert.match(ultimo, /otra ronda/);
    // Los mensajes alternan usuario y asistente.
    cuarta.forEach((m, i) => assert.equal(m.role, i % 2 === 0 ? 'user' : 'assistant'));
    assert.equal(e.controlador.estado.pedido.paso, 'preguntas');
    await e.controlador.responder(['r3']);
    const quinta = llamadasAnthropic(e.red)[4].cuerpo.messages;
    assert.ok(textoDe(quinta[quinta.length - 1]).includes(INSTRUCCION_SIN_PREGUNTAS));
    const borrador = e.controlador.estado.pedido.borrador;
    assert.equal(borrador.relevamiento.rondas, 3);
    assert.equal(borrador.relevamiento.rondas_extra_pedidas, 1);
  });

  test('armarLlamada decide por las rondas', () => {
    const base = { modelo: 'm', sistema: 's', primerMensaje: [{ type: 'text', text: 'hola' }] };
    const sin = armarLlamada({ ...base, turnos: [], rondas: 2, rondasExtra: 0 });
    assert.ok(textoDe(sin.messages[0]).includes(INSTRUCCION_SIN_PREGUNTAS));
    const con = armarLlamada({ ...base, turnos: [], rondas: 2, rondasExtra: 1 });
    assert.ok(!textoDe(con.messages[0]).includes(INSTRUCCION_SIN_PREGUNTAS));
    assert.equal(base.primerMensaje.length, 1, 'no modifica el mensaje original');
  });
});

describe('C-18: errores de la API de Anthropic', () => {
  const casos = [
    { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, texto: 'invalid x-api-key' },
    { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, texto: 'credit balance is too low' },
    { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit' } }, texto: 'rate limit' },
  ];
  for (const caso of casos) {
    test(`estado ${caso.status}: muestra el motivo y conserva lo escrito`, async () => {
      const e = crearEscenario({ rutas: [{ metodo: 'POST', url: URL_MENSAJES, responder: { status: caso.status, body: caso.body } }] });
      cargarDescripcion(e.controlador);
      await e.controlador.agregarAdjunto({ nombre: 'n.txt', tamano: 4, leer: async () => ({ clase: 'texto', base64: 'aG9sYQ==', texto: 'hola', extension: 'txt' }) });
      await e.controlador.entrevistar();
      const p = e.controlador.estado.pedido;
      assert.ok(p.error.includes(caso.texto), p.error);
      assert.ok(!p.error.includes(CLAVE));
      assert.ok(!p.error.includes(TOKEN));
      assert.equal(p.puedeReintentar, true);
      assert.match(p.descripcion, /pulgadas/);
      assert.equal(p.adjuntos.length, 1);
    });
  }

  test('un error en la segunda ronda conserva las respuestas', async () => {
    const e = crearEscenario({ rutas: [rutaAnthropic([preguntas(['¿1?', '¿2?']), { status: 429, body: casos[2].body }])] });
    cargarDescripcion(e.controlador);
    await e.controlador.entrevistar();
    await e.controlador.responder(['uno', 'dos']);
    const p = e.controlador.estado.pedido;
    assert.match(p.error, /rate limit/);
    assert.deepEqual(p.respuestas, ['uno', 'dos']);
    assert.deepEqual(p.preguntas, ['¿1?', '¿2?']);
    assert.equal(p.rondas, 0);
  });

  test('aunque la API repita la clave en el mensaje, no se muestra', async () => {
    const body = { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${CLAVE}` } };
    const e = crearEscenario({ rutas: [{ metodo: 'POST', url: URL_MENSAJES, responder: { status: 401, body } }] });
    cargarDescripcion(e.controlador);
    await e.controlador.entrevistar();
    assert.ok(!e.controlador.estado.pedido.error.includes(CLAVE));
  });
});
