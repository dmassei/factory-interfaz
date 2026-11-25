// Lanzamiento en tres pasos con reintento. Criterios C-21 y C-22.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepararLanzamiento, ejecutarLanzamiento } from '../docs/js/lanzamiento.js';
import { completarPedido, confirmarPedido, extraerPedido } from '../docs/js/pedido.js';
import { crearRed } from './apoyo/red-falsa.js';
import { crearEscenario } from './apoyo/escenario.js';
import { BASE, REPO, TOKEN, pedidoDelModelo, respuestaModelo } from './apoyo/ejemplos.js';

const config = { repo: REPO, token: TOKEN };
const base64Imagen = 'A'.repeat(60000); // 2 partes

function confirmado(objetivo) {
  const p = confirmarPedido(completarPedido(pedidoDelModelo(), { tipo: 'nuevo' }));
  if (objetivo) p.objetivo = objetivo;
  return p;
}

/** Red del lanzamiento; `fallar` decide qué llamada falla (por índice de comentario, etc.). */
function redDeLanzamiento({ fallarIssue = 0, fallarComentario = null, fallarEtiqueta = 0 } = {}) {
  let comentarios = 0;
  let issues = 0;
  let etiquetas = 0;
  return crearRed([
    {
      metodo: 'POST', url: `${BASE}/issues`,
      responder: () => (issues++ < fallarIssue ? { status: 500, body: { message: 'Server Error' } } : { status: 201, body: { number: 42 } }),
    },
    {
      metodo: 'POST', url: `${BASE}/issues/42/comments`,
      responder: (llamada) => {
        comentarios += 1;
        if (fallarComentario !== null && comentarios === fallarComentario) return new TypeError('Failed to fetch');
        return { status: 201, body: { id: comentarios, body: llamada.cuerpo.body } };
      },
    },
    {
      metodo: 'POST', url: `${BASE}/issues/42/labels`,
      responder: () => (etiquetas++ < fallarEtiqueta ? { status: 502, body: { message: 'Bad Gateway' } } : { body: [{ name: 'factory:pedido' }] }),
    },
  ]);
}

describe('C-21: issue sin etiquetas, comentarios por parte y etiqueta al final', () => {
  test('orden y contenido de las llamadas', async () => {
    const red = redDeLanzamiento();
    const pedido = confirmado();
    const estado = await ejecutarLanzamiento(red.fetch, config, prepararLanzamiento(pedido, [{ nombre: 'boceto.png', base64: base64Imagen }]));
    assert.equal(estado.fallo, null);
    assert.equal(estado.issue, 42);
    assert.deepEqual(red.llamadas.map((l) => `${l.metodo} ${l.url}`), [
      `POST ${BASE}/issues`,
      `POST ${BASE}/issues/42/comments`,
      `POST ${BASE}/issues/42/comments`,
      `POST ${BASE}/issues/42/labels`,
    ]);
    const [crear, parte1, parte2, etiqueta] = red.llamadas;
    assert.equal(crear.cuerpo.title, `Pedido: ${pedido.objetivo}`);
    assert.ok(!('labels' in crear.cuerpo));
    assert.deepEqual(extraerPedido(crear.cuerpo.body), pedido);
    assert.match(parte1.cuerpo.body, /parte="1" de="2"/);
    assert.match(parte2.cuerpo.body, /parte="2" de="2"/);
    assert.deepEqual(etiqueta.cuerpo, { labels: ['factory:pedido'] });
    for (const l of red.llamadas) {
      assert.ok(!['PUT', 'PATCH', 'DELETE'].includes(l.metodo));
      assert.ok(!l.url.includes('/contents'));
    }
  });

  test('el título usa los primeros 80 caracteres del objetivo', async () => {
    const red = redDeLanzamiento();
    const largo = `${'á'.repeat(79)}bc`;
    await ejecutarLanzamiento(red.fetch, config, prepararLanzamiento(confirmado(largo), []));
    assert.equal(red.llamadas[0].cuerpo.title, `Pedido: ${'á'.repeat(79)}b`);
  });

  test('al terminar, la página pasa al seguimiento del issue', async () => {
    const e = crearEscenario({
      rutas: [
        { metodo: 'POST', url: 'https://api.anthropic.com/v1/messages', responder: { body: respuestaModelo(JSON.stringify({ pedido: pedidoDelModelo() })) } },
        ...redDeLanzamientoRutas(),
      ],
    });
    e.controlador.actualizarDescripcion({ descripcion: 'conversor' });
    await e.controlador.agregarAdjunto({
      nombre: 'boceto.png', tamano: 100,
      leer: async () => ({ clase: 'imagen', base64: base64Imagen, tipoMedio: 'image/png', extension: 'png' }),
    });
    await e.controlador.entrevistar();
    await e.controlador.confirmarYLanzar();
    const escrituras = e.red.llamadas.filter((l) => l.metodo === 'POST' && l.url.startsWith('https://api.github.com'));
    assert.deepEqual(escrituras.map((l) => l.url.replace(BASE, '')), ['/issues', '/issues/42/comments', '/issues/42/comments', '/issues/42/labels']);
    assert.equal(e.controlador.estado.seccion, 'seguimiento');
    assert.equal(e.controlador.estado.seguimiento.detalle.issue, 42);
  });
});

function redDeLanzamientoRutas() {
  return [
    { metodo: 'POST', url: `${BASE}/issues`, responder: { status: 201, body: { number: 42 } } },
    { metodo: 'POST', url: `${BASE}/issues/42/comments`, responder: { status: 201, body: {} } },
    { metodo: 'POST', url: `${BASE}/issues/42/labels`, responder: { body: [] } },
  ];
}

describe('C-22: reintento desde el paso que falló', () => {
  test('falla el segundo comentario: lo informa, no etiqueta y el reintento sigue desde ahí', async () => {
    const red = redDeLanzamiento({ fallarComentario: 2 });
    let estado = prepararLanzamiento(confirmado(), [{ nombre: 'boceto.png', base64: base64Imagen }]);
    estado = await ejecutarLanzamiento(red.fetch, config, estado);
    assert.equal(estado.fallo.paso, 'adjunto');
    assert.match(estado.fallo.mensaje, /boceto\.png \(parte 2 de 2\)/);
    assert.ok(!red.llamadas.some((l) => l.url.endsWith('/labels')));
    const antes = red.llamadas.length;
    estado = await ejecutarLanzamiento(red.fetch, config, estado);
    assert.equal(estado.fallo, null);
    const nuevas = red.llamadas.slice(antes);
    assert.deepEqual(nuevas.map((l) => l.url.replace(BASE, '')), ['/issues/42/comments', '/issues/42/labels']);
    assert.match(nuevas[0].cuerpo.body, /parte="2" de="2"/);
  });

  test('falla la creación del issue: al reintentar se crea uno solo', async () => {
    const red = redDeLanzamiento({ fallarIssue: 1 });
    let estado = await ejecutarLanzamiento(red.fetch, config, prepararLanzamiento(confirmado(), []));
    assert.equal(estado.fallo.paso, 'issue');
    assert.equal(estado.issue, null);
    estado = await ejecutarLanzamiento(red.fetch, config, estado);
    assert.equal(estado.fallo, null);
    const creados = red.llamadas.filter((l) => l.url === `${BASE}/issues`);
    assert.equal(creados.length, 2, 'un intento fallido y uno exitoso');
    assert.equal(estado.issue, 42);
  });

  test('falla la etiqueta: al reintentar solo se pone la etiqueta', async () => {
    const red = redDeLanzamiento({ fallarEtiqueta: 1 });
    let estado = await ejecutarLanzamiento(red.fetch, config, prepararLanzamiento(confirmado(), [{ nombre: 'b.png', base64: 'AAAA' }]));
    assert.equal(estado.fallo.paso, 'etiqueta');
    const antes = red.llamadas.length;
    estado = await ejecutarLanzamiento(red.fetch, config, estado);
    assert.equal(estado.fallo, null);
    assert.deepEqual(red.llamadas.slice(antes).map((l) => l.url.replace(BASE, '')), ['/issues/42/labels']);
  });

  test('en el controlador: informa el paso, y el reintento no crea otro issue', async () => {
    let comentarios = 0;
    const e = crearEscenario({
      rutas: [
        { metodo: 'POST', url: 'https://api.anthropic.com/v1/messages', responder: { body: respuestaModelo(JSON.stringify({ pedido: pedidoDelModelo() })) } },
        { metodo: 'POST', url: `${BASE}/issues`, responder: { status: 201, body: { number: 42 } } },
        { metodo: 'POST', url: `${BASE}/issues/42/comments`, responder: () => (++comentarios === 2 ? { status: 500, body: { message: 'boom' } } : { status: 201, body: {} }) },
        { metodo: 'POST', url: `${BASE}/issues/42/labels`, responder: { body: [] } },
      ],
    });
    e.controlador.actualizarDescripcion({ descripcion: 'conversor' });
    await e.controlador.agregarAdjunto({
      nombre: 'boceto.png', tamano: 100,
      leer: async () => ({ clase: 'imagen', base64: base64Imagen, tipoMedio: 'image/png', extension: 'png' }),
    });
    await e.controlador.entrevistar();
    await e.controlador.confirmarYLanzar();
    assert.equal(e.controlador.estado.pedido.paso, 'lanzando');
    assert.match(e.controlador.estado.pedido.error, /parte 2 de 2/);
    await e.controlador.continuarLanzamiento();
    const creados = e.red.llamadas.filter((l) => l.metodo === 'POST' && l.url === `${BASE}/issues`);
    assert.equal(creados.length, 1);
    assert.equal(e.controlador.estado.seccion, 'seguimiento');
  });
});
