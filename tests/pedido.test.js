// Confirmación y validación del pedido. Criterios C-19 y C-20.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  completarPedido, confirmarPedido, validarPedido, editarCampo, extraerPedido, cuerpoDelIssue, tituloDelIssue,
} from '../docs/js/pedido.js';
import { prepararLanzamiento, ejecutarLanzamiento } from '../docs/js/lanzamiento.js';
import { vistaConfirmacion } from '../docs/js/vista.js';
import { crearDocumento } from './apoyo/dom-falso.js';
import { crearRed } from './apoyo/red-falsa.js';
import { crearEscenario } from './apoyo/escenario.js';
import { ESQUEMA, REPO, TOKEN, pedidoDelModelo, respuestaModelo } from './apoyo/ejemplos.js';

const URL_MENSAJES = 'https://api.anthropic.com/v1/messages';

async function escenarioEnConfirmacion(pedidoModelo = pedidoDelModelo()) {
  const e = crearEscenario({
    rutas: [
      { metodo: 'POST', url: URL_MENSAJES, responder: { body: respuestaModelo(JSON.stringify({ pedido: pedidoModelo })) } },
      { metodo: 'POST', url: /\/issues$/, responder: { status: 201, body: { number: 21 } } },
      { metodo: 'POST', url: /\/labels$/, responder: { body: [] } },
    ],
  });
  e.controlador.actualizarDescripcion({ descripcion: 'conversor', tipo: 'nuevo' });
  await e.controlador.entrevistar();
  return e;
}

const llamadasIssues = (red) => red.llamadas.filter((l) => /\/issues(\/|$)/.test(new URL(l.url).pathname) && l.metodo !== 'GET');

describe('C-19: confirmación campo por campo', () => {
  test('muestra cada campo presente y los supuestos marcados como supuestos', () => {
    const pedido = completarPedido(pedidoDelModelo(), { tipo: 'nuevo' });
    const doc = crearDocumento();
    const vista = vistaConfirmacion(doc, pedido);
    const campos = vista.conAtributo('data-campo').map((t) => t.getAttribute('data-campo'));
    assert.deepEqual(campos, Object.keys(pedido));
    const supuestos = vista.conAtributo('class', 'supuesto');
    assert.equal(supuestos.length, 2);
    assert.equal(supuestos[0].textContent, 'Supuesto: A');
    assert.equal(supuestos[1].textContent, 'Supuesto: B');
  });

  test('editar el objetivo cambia el pedido que se lanzaría', async () => {
    const e = await escenarioEnConfirmacion();
    assert.equal(e.controlador.estado.pedido.paso, 'confirmar');
    await e.controlador.confirmarYLanzar([{ campo: 'objetivo', texto: 'Objetivo corregido' }]);
    const [crear] = llamadasIssues(e.red);
    const enviado = extraerPedido(crear.cuerpo.body);
    assert.equal(enviado.objetivo, 'Objetivo corregido');
    assert.equal(crear.cuerpo.title, 'Pedido: Objetivo corregido');
  });

  test('hasta confirmar no hay ninguna llamada a /issues', async () => {
    const e = await escenarioEnConfirmacion();
    e.controlador.editarCampo('usuarios', 'Docentes');
    assert.equal(llamadasIssues(e.red).length, 0);
    assert.equal(e.red.llamadas.filter((l) => l.url.includes('/issues')).length, 0);
  });

  test('al confirmar, relevamiento.confirmado es true aunque el modelo haya dicho false o lo haya omitido', async () => {
    for (const relevamiento of [{ rondas: 0, confirmado: false }, undefined]) {
      const modelo = pedidoDelModelo({ relevamiento });
      if (!relevamiento) delete modelo.relevamiento;
      const e = await escenarioEnConfirmacion(modelo);
      assert.equal(e.controlador.estado.pedido.borrador.relevamiento.confirmado, false);
      await e.controlador.confirmarYLanzar();
      const enviado = extraerPedido(llamadasIssues(e.red)[0].cuerpo.body);
      assert.equal(enviado.relevamiento.confirmado, true);
    }
  });

  test('la función de lanzamiento rechaza un pedido no confirmado', async () => {
    const pedido = completarPedido(pedidoDelModelo(), { tipo: 'nuevo' });
    assert.throws(() => prepararLanzamiento(pedido, []), /no está confirmado/);
    const red = crearRed();
    const estado = { pedido, partes: [], issue: null, enviadas: 0, etiquetado: false, fallo: null };
    await assert.rejects(ejecutarLanzamiento(red.fetch, { repo: REPO, token: TOKEN }, estado), /no está confirmado/);
    assert.equal(red.llamadas.length, 0);
    assert.doesNotThrow(() => prepararLanzamiento(confirmarPedido(pedido), []));
  });

  test('editar un campo JSON inválido da un error y no cambia el pedido', () => {
    const pedido = completarPedido(pedidoDelModelo(), { tipo: 'nuevo' });
    assert.ok(editarCampo(pedido, 'proyecto', '{no es json').error);
    assert.deepEqual(editarCampo(pedido, 'supuestos', 'uno\n\n dos ').pedido.supuestos, ['uno', 'dos']);
  });

  test('el texto de los campos no se interpreta como HTML', () => {
    const doc = crearDocumento();
    const vista = vistaConfirmacion(doc, { objetivo: '<img src=x onerror=alert(1)>', supuestos: ['<b>x</b>'] });
    assert.equal(vista.buscar('img').length, 0);
    assert.equal(vista.buscar('b').length, 0);
    assert.equal(vista.conAtributo('data-campo', 'objetivo')[0].textContent, '<img src=x onerror=alert(1)>');
  });
});

describe('C-20: campos obligatorios y límites de la versión', () => {
  const valido = () => confirmarPedido(completarPedido(pedidoDelModelo(), { tipo: 'nuevo' }));

  test('un pedido completo es válido', () => {
    assert.deepEqual(validarPedido(valido(), ESQUEMA), []);
  });

  test('sin objetivo o sin criterio_de_exito no se lanza y se dice qué falta', () => {
    const p = valido();
    delete p.objetivo;
    p.criterio_de_exito = '  ';
    const errores = validarPedido(p, ESQUEMA).join(' ');
    assert.match(errores, /objetivo/);
    assert.match(errores, /criterio_de_exito/);
  });

  test('los obligatorios salen del esquema leído', () => {
    const esquema = { ...ESQUEMA, required: [...ESQUEMA.required, 'entorno'] };
    assert.match(validarPedido(valido(), esquema).join(' '), /entorno/);
  });

  test('réplica y privado no se admiten en esta versión', () => {
    const replica = { ...valido(), escenario: 'replica' };
    assert.match(validarPedido(replica, ESQUEMA).join(' '), /no admite.*réplica/);
    const privado = valido();
    privado.proyecto.visibilidad = 'privado';
    assert.match(validarPedido(privado, ESQUEMA).join(' '), /no admite proyectos privados/);
  });

  test('un pedido nuevo armado por la página es público, con solicitante persona/chat', () => {
    const p = completarPedido(pedidoDelModelo({ solicitante: { tipo: 'bot', canal: 'github' } }), { tipo: 'nuevo' });
    assert.equal(p.proyecto.visibilidad, 'publico');
    assert.deepEqual(p.solicitante, { tipo: 'persona', canal: 'chat' });
    assert.equal(p.escenario, 'original');
  });

  test('un cambio lleva escenario cambio y el proyecto elegido', () => {
    const p = completarPedido(pedidoDelModelo(), { tipo: 'cambio', proyecto: 'calculadora-pesos' });
    assert.equal(p.escenario, 'cambio');
    assert.equal(p.proyecto.nombre, 'calculadora-pesos');
    assert.equal(p.proyecto.visibilidad, 'publico');
  });

  test('el controlador no lanza un pedido con faltantes, réplica o privado', async () => {
    for (const ediciones of [
      [{ campo: 'objetivo', texto: '' }],
      [{ campo: 'escenario', texto: 'replica' }],
      [{ campo: 'proyecto', texto: JSON.stringify({ nombre: 'conversor-pulgadas', visibilidad: 'privado' }) }],
    ]) {
      const e = await escenarioEnConfirmacion();
      await e.controlador.confirmarYLanzar(ediciones);
      assert.equal(llamadasIssues(e.red).length, 0);
      assert.match(e.controlador.estado.pedido.error, /No se puede lanzar/);
    }
  });

  test('el cuerpo del issue es leído por el factory y el título se corta en 80', () => {
    const p = valido();
    assert.deepEqual(extraerPedido(cuerpoDelIssue(p)), p);
    p.objetivo = 'x'.repeat(100);
    assert.equal(tituloDelIssue(p), `Pedido: ${'x'.repeat(80)}`);
    p.objetivo = 'y'.repeat(80);
    assert.equal(tituloDelIssue(p), `Pedido: ${'y'.repeat(80)}`);
  });
});
