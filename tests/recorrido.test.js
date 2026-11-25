// Recorrido completo de la página con la red reemplazada: conexión, entrevista,
// lanzamiento, seguimiento y proyectos. Criterios C-08, C-09 y C-32.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEscenario, rutasFactory } from './apoyo/escenario.js';
import { crearRed, redCaida, contenido } from './apoyo/red-falsa.js';
import { TOKEN, CLAVE, REPO, BASE, pedidoDelModelo, respuestaModelo, issueDePedido } from './apoyo/ejemplos.js';

const URL_MENSAJES = 'https://api.anthropic.com/v1/messages';
const PROYECTO = 'https://api.github.com/repos/dmassei/conversor-pulgadas/contents/.factory/pedidos';

function rutasDelRecorrido() {
  let mensajes = 0;
  let corridas = 0;
  return [
    {
      metodo: 'POST', url: URL_MENSAJES,
      responder: () => (mensajes++ === 0
        ? { body: respuestaModelo(JSON.stringify({ preguntas: ['¿Para quién es?'] })) }
        : { body: respuestaModelo(JSON.stringify({ pedido: pedidoDelModelo() })) }),
    },
    { metodo: 'POST', url: `${BASE}/issues`, responder: { status: 201, body: { number: 50 } } },
    { metodo: 'POST', url: `${BASE}/issues/50/comments`, responder: { status: 201, body: {} } },
    { metodo: 'POST', url: `${BASE}/issues/50/labels`, responder: { body: [] } },
    {
      url: `${BASE}/actions/workflows/recorrido.yml/runs?per_page=50`,
      responder: () => {
        const status = corridas++ === 0 ? 'in_progress' : 'completed';
        return { body: { workflow_runs: [{ id: 77, display_title: 'Pedido #50', status, conclusion: status === 'completed' ? 'success' : null, created_at: '2026-11-25T10:00:00Z' }] } };
      },
    },
    { url: `${BASE}/actions/runs/77/jobs?per_page=100`, responder: { body: { jobs: [{ name: 'Preparar (pedido y repo)', status: 'completed', conclusion: 'success', steps: [] }] } } },
    { url: /\/issues\/50\/comments\?/, responder: { body: [{ body: 'Listo: https://dmassei.github.io/conversor-pulgadas/' }] } },
    { url: `${BASE}/issues?labels=factory:pedido&state=all&per_page=50`, responder: { body: [issueDePedido(50, pedidoDelModelo())] } },
    { url: PROYECTO, responder: { body: [{ name: '50', type: 'dir' }] } },
    { url: `${PROYECTO}/50/pedido.json`, responder: { body: contenido(JSON.stringify(pedidoDelModelo())) } },
  ];
}

async function recorrer() {
  const red = crearRed([...rutasDelRecorrido(), ...rutasFactory()]);
  const e = crearEscenario({ sesion: {}, fetch: red.fetch });
  const c = e.controlador;
  await c.guardarConexion({ repo: REPO, token: TOKEN, clave: CLAVE, modelo: '', recordar: false });
  await c.abrir('pedido');
  c.actualizarDescripcion({ descripcion: 'una página que convierta pulgadas a milímetros', tipo: 'nuevo' });
  await c.agregarAdjunto({ nombre: 'notas.txt', tamano: 10, leer: async () => ({ clase: 'texto', base64: 'bm90YXM=', texto: 'notas', extension: 'txt' }) });
  await c.agregarAdjunto({ nombre: 'boceto.png', tamano: 100, leer: async () => ({ clase: 'imagen', base64: 'A'.repeat(50000), tipoMedio: 'image/png', extension: 'png' }) });
  await c.entrevistar();
  await c.responder(['Para mí']);
  await c.confirmarYLanzar();
  assert.equal(c.estado.seguimiento.detalle.issue, 50);
  await e.temporizador.disparar(e.temporizador.programados[0].id);
  assert.equal(c.estado.seguimiento.detalle.terminada, true);
  await c.abrir('seguimiento');
  await c.abrir('proyectos');
  await c.abrirProyecto('conversor-pulgadas');
  assert.equal(c.estado.proyectos.abierto.pedidos.length, 1);
  return { red, e };
}

describe('C-08: las claves solo viajan a su servicio y en su encabezado', () => {
  test('recorrido completo', async () => {
    const { red } = await recorrer();
    assert.ok(red.llamadas.length > 15);
    let deGithub = 0;
    let deAnthropic = 0;
    for (const l of red.llamadas) {
      assert.ok(!l.url.includes(TOKEN) && !l.url.includes(CLAVE), `secreto en URL: ${l.url}`);
      const origen = new URL(l.url).origin;
      for (const [nombre, valor] of Object.entries(l.encabezados)) {
        if (String(valor).includes(TOKEN)) {
          assert.equal(nombre, 'Authorization');
          assert.equal(origen, 'https://api.github.com');
        }
        if (String(valor).includes(CLAVE)) {
          assert.equal(nombre, 'x-api-key');
          assert.equal(origen, 'https://api.anthropic.com');
        }
      }
      if (origen === 'https://api.github.com') {
        deGithub += 1;
        assert.equal(l.encabezados.Authorization, `Bearer ${TOKEN}`);
        assert.equal(l.encabezados['x-api-key'], undefined);
      } else {
        deAnthropic += 1;
        assert.equal(l.encabezados.Authorization, undefined);
      }
      if (typeof l.cuerpoCrudo === 'string') {
        assert.ok(!l.cuerpoCrudo.includes(TOKEN) && !l.cuerpoCrudo.includes(CLAVE), 'secreto en un cuerpo');
      }
    }
    assert.ok(deGithub > 0 && deAnthropic === 2);
  });
});

describe('C-09: tiempo límite y manejo de falla', () => {
  test('toda llamada pasa una opción signal', async () => {
    const { red } = await recorrer();
    for (const l of red.llamadas) {
      assert.ok(l.opciones.signal, `sin signal: ${l.url}`);
      assert.equal(typeof l.opciones.signal.aborted, 'boolean');
    }
  });

  test('con un fetch que rechaza, cada operación termina en un mensaje en pantalla', async () => {
    const red = redCaida();
    const e = crearEscenario({ fetch: red.fetch });
    const c = e.controlador;

    await c.guardarConexion({ repo: REPO, token: TOKEN, clave: CLAVE, recordar: false });
    assert.equal(c.estado.aviso.tipo, 'error');
    assert.match(c.estado.aviso.texto, /No se pudo conectar con GitHub/);

    await c.abrir('seguimiento');
    assert.match(c.estado.aviso.texto, /No se pudieron leer los pedidos/);

    await c.seguir(5);
    assert.match(c.estado.seguimiento.detalle.error, /No se pudo actualizar/);

    await c.abrir('proyectos');
    assert.match(c.estado.aviso.texto, /No se pudieron leer los proyectos/);

    await c.abrir('pedido');
    c.actualizarDescripcion({ descripcion: 'algo' });
    await c.entrevistar();
    assert.match(c.estado.pedido.error, /No se pudo conectar/);
    assert.equal(c.estado.pedido.puedeReintentar, true);

    for (const l of red.llamadas) assert.ok(l.opciones.signal);
    for (const texto of [c.estado.aviso?.texto ?? '', c.estado.pedido.error]) {
      assert.ok(!texto.includes(TOKEN) && !texto.includes(CLAVE));
    }
  });

  test('una falla al lanzar queda en pantalla con reintento', async () => {
    let caida = false;
    const red = crearRed([
      { metodo: 'POST', url: URL_MENSAJES, responder: { body: respuestaModelo(JSON.stringify({ pedido: pedidoDelModelo() })) } },
      { metodo: 'POST', url: `${BASE}/issues`, responder: () => (caida ? new TypeError('Failed to fetch') : { status: 201, body: { number: 1 } }) },
      ...rutasFactory(),
    ]);
    const e = crearEscenario({ fetch: red.fetch });
    e.controlador.actualizarDescripcion({ descripcion: 'algo' });
    await e.controlador.entrevistar();
    caida = true;
    await e.controlador.confirmarYLanzar();
    assert.match(e.controlador.estado.pedido.error, /No se pudo crear el issue/);
    assert.equal(e.controlador.estado.pedido.paso, 'lanzando');
  });
});

describe('C-32: la página nunca escribe en un proyecto ni modifica el factory', () => {
  test('toda llamada que no es GET va a issues, comments, labels o a la API de mensajes', async () => {
    const { red } = await recorrer();
    const permitidas = [
      new RegExp(`^${BASE}/issues$`),
      new RegExp(`^${BASE}/issues/\\d+/comments$`),
      new RegExp(`^${BASE}/issues/\\d+/labels$`),
      new RegExp(`^${URL_MENSAJES}$`),
    ];
    const escrituras = red.llamadas.filter((l) => l.metodo !== 'GET');
    assert.ok(escrituras.length >= 5);
    for (const l of escrituras) {
      assert.equal(l.metodo, 'POST');
      assert.ok(permitidas.some((p) => p.test(l.url)), `escritura no permitida: ${l.metodo} ${l.url}`);
    }
    for (const l of red.llamadas.filter((x) => x.url.includes('/contents'))) assert.equal(l.metodo, 'GET');
  });
});
