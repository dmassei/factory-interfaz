// Proyectos y pedidos de cambio. Criterios C-30 y C-31.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { listarProyectos, armarPedidoCambio } from '../docs/js/proyectos.js';
import { extraerPedido, confirmarPedido, validarPedido } from '../docs/js/pedido.js';
import { contenido } from './apoyo/red-falsa.js';
import { crearEscenario } from './apoyo/escenario.js';
import { BASE, ESQUEMA, issueDePedido, pedidoDelModelo } from './apoyo/ejemplos.js';

const URL_ISSUES = `${BASE}/issues?labels=factory:pedido&state=all&per_page=50`;
const PROYECTO = 'https://api.github.com/repos/dmassei/calculadora-pesos/contents/.factory/pedidos';

const pedidoCalculadora = (objetivo, extra = {}) => ({
  proyecto: { nombre: 'calculadora-pesos', visibilidad: 'publico' },
  escenario: 'original',
  objetivo,
  entradas_y_salidas: 'Entrada: kilos. Salida: gramos.',
  criterio_de_exito: 'Convierte bien',
  supuestos: [],
  relevamiento: { rondas: 1, confirmado: true },
  ...extra,
});

describe('C-30: proyectos a partir de los pedidos', () => {
  test('lista sin repetir, con el dueño del factory, y omite nombres fuera de formato', () => {
    const pedidos = [
      { proyecto: { nombre: 'calculadora-pesos' } },
      { proyecto: { nombre: 'calculadora-pesos' } },
      { proyecto: { nombre: 'otro' } },
      { proyecto: { nombre: '../malo' } },
      { proyecto: { nombre: 'X' } },
      {},
    ];
    assert.deepEqual(listarProyectos(pedidos, 'dmassei/Factory').map((p) => [p.nombre, p.repo]), [
      ['calculadora-pesos', 'dmassei/calculadora-pesos'],
      ['otro', 'dmassei/otro'],
    ]);
  });

  function escenarioProyecto(rutasExtra = []) {
    const issues = [
      issueDePedido(3, pedidoCalculadora('Primera')),
      issueDePedido(7, pedidoCalculadora('Segunda')),
      issueDePedido(9, { ...pedidoDelModelo(), proyecto: { nombre: 'Mal Nombre' } }),
    ];
    return crearEscenario({ rutas: [{ url: URL_ISSUES, responder: { body: issues } }, ...rutasExtra] });
  }

  test('al abrir uno, lee .factory/pedidos y muestra los pedidos en orden con sus adjuntos', async () => {
    const e = escenarioProyecto([
      { url: PROYECTO, responder: { body: ['12', '3', '7'].map((name) => ({ name, type: 'dir' })).concat([{ name: 'LEEME.md', type: 'file' }]) } },
      { url: `${PROYECTO}/3/pedido.json`, responder: { body: contenido(JSON.stringify(pedidoCalculadora('Primera'))) } },
      { url: `${PROYECTO}/7/pedido.json`, responder: { body: contenido(JSON.stringify(pedidoCalculadora('Segunda'))) } },
      { url: `${PROYECTO}/12/pedido.json`, responder: { body: contenido(JSON.stringify(pedidoCalculadora('Tercera'))) } },
      { url: `${PROYECTO}/7/adjuntos`, responder: { body: [{ name: 'notas.md', type: 'file' }, { name: 'boceto.png', type: 'file' }, { name: '..x', type: 'file' }] } },
      { url: `${PROYECTO}/7/adjuntos/notas.md`, responder: { body: contenido('Notas: «libras» y ñ') } },
    ]);
    await e.controlador.abrir('proyectos');
    const lista = e.controlador.estado.proyectos.lista;
    assert.deepEqual(lista.map((p) => p.nombre), ['calculadora-pesos']);
    await e.controlador.abrirProyecto('calculadora-pesos');
    const abierto = e.controlador.estado.proyectos.abierto;
    assert.deepEqual(abierto.pedidos.map((p) => p.numero), [3, 7, 12]);
    assert.equal(abierto.pedidos[0].pedido.objetivo, 'Primera');
    assert.deepEqual(abierto.pedidos[1].adjuntos, [{ nombre: 'notas.md', texto: 'Notas: «libras» y ñ' }, { nombre: 'boceto.png' }]);
    assert.deepEqual(abierto.pedidos[0].adjuntos, []);
    const aProyecto = e.red.llamadas.filter((l) => l.url.includes('/repos/dmassei/calculadora-pesos/'));
    assert.ok(aProyecto.length > 0);
    assert.ok(aProyecto.every((l) => l.metodo === 'GET'));
    assert.ok(!e.red.llamadas.some((l) => l.url.includes('Mal') || l.url.includes('..')));
  });

  test('si la carpeta no existe (404), dice que no hay datos de diseño guardados', async () => {
    const e = escenarioProyecto([{ url: PROYECTO, responder: { status: 404, body: { message: 'Not Found' } } }]);
    await e.controlador.abrir('proyectos');
    await e.controlador.abrirProyecto('calculadora-pesos');
    assert.equal(e.controlador.estado.proyectos.abierto.sinDatos, true);
    assert.equal(e.controlador.estado.proyectos.abierto.error, null);
  });
});

describe('C-31: Proponer cambio', () => {
  const original = pedidoCalculadora('Calcular pesos');
  const editado = { ...original, entradas_y_salidas: 'Entrada: kilos. Salida: gramos y libras.' };

  test('arma un pedido de cambio con el valor anterior y el nuevo', () => {
    const { pedido } = armarPedidoCambio({ proyecto: 'calculadora-pesos', numero: 3, original, editado, frase: 'mostrar el peso también en libras' });
    assert.equal(pedido.escenario, 'cambio');
    assert.equal(pedido.proyecto.nombre, 'calculadora-pesos');
    assert.equal(pedido.proyecto.visibilidad, 'publico');
    assert.equal(pedido.objetivo, 'mostrar el peso también en libras');
    assert.equal(pedido.relevamiento.confirmado, false);
    assert.ok(Array.isArray(pedido.supuestos));
    assert.deepEqual(pedido.anexos.cambios, [{
      pedido_origen: 3,
      campo: 'entradas_y_salidas',
      valor_anterior: original.entradas_y_salidas,
      valor_nuevo: editado.entradas_y_salidas,
    }]);
    assert.deepEqual(validarPedido(confirmarPedido(pedido), ESQUEMA), []);
  });

  test('sin frase o sin cambios no se arma', () => {
    for (const frase of ['', '   ']) {
      const r = armarPedidoCambio({ proyecto: 'calculadora-pesos', numero: 3, original, editado, frase });
      assert.match(r.error, /frase/);
    }
    const r = armarPedidoCambio({ proyecto: 'calculadora-pesos', numero: 3, original, editado: { ...original }, frase: 'algo' });
    assert.match(r.error, /No hay cambios/);
  });

  test('pasa por la confirmación sin entrevista y se lanza igual', async () => {
    let creado = null;
    const e = crearEscenario({
      rutas: [
        { url: URL_ISSUES, responder: { body: [issueDePedido(3, original)] } },
        { url: PROYECTO, responder: { body: [{ name: '3', type: 'dir' }] } },
        { url: `${PROYECTO}/3/pedido.json`, responder: { body: contenido(JSON.stringify(original)) } },
        { metodo: 'POST', url: `${BASE}/issues`, responder: (l) => { creado = l.cuerpo; return { status: 201, body: { number: 30 } }; } },
        { metodo: 'POST', url: `${BASE}/issues/30/labels`, responder: { body: [] } },
      ],
    });
    await e.controlador.abrir('proyectos');
    await e.controlador.abrirProyecto('calculadora-pesos');
    assert.equal(e.controlador.proponerCambio(3, [{ campo: 'entradas_y_salidas', texto: editado.entradas_y_salidas }], '   '), false);
    assert.match(e.controlador.estado.proyectos.abierto.error, /frase/);
    assert.equal(e.controlador.proponerCambio(3, [], 'algo'), false);
    assert.match(e.controlador.estado.proyectos.abierto.error, /No hay cambios/);
    assert.equal(e.controlador.proponerCambio(3, [{ campo: 'entradas_y_salidas', texto: editado.entradas_y_salidas }], 'mostrar el peso también en libras'), true);
    assert.equal(e.controlador.estado.seccion, 'pedido');
    assert.equal(e.controlador.estado.pedido.paso, 'confirmar');
    await e.controlador.confirmarYLanzar();
    assert.ok(!e.red.llamadas.some((l) => l.url.includes('anthropic')));
    const enviado = extraerPedido(creado.body);
    assert.equal(enviado.escenario, 'cambio');
    assert.equal(enviado.relevamiento.confirmado, true);
    assert.equal(enviado.anexos.cambios[0].campo, 'entradas_y_salidas');
    assert.equal(e.controlador.estado.seguimiento.detalle.issue, 30);
  });
});
