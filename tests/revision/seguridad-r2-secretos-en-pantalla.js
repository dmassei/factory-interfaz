// Revisión 2 (seguridad). Criterio C-08 (y C-18): ni el token ni la clave aparecen en lo que se muestra,
// aunque la API repita el secreto en su mensaje de error, en cualquiera de los flujos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEscenario } from '../apoyo/escenario.js';
import { TOKEN, CLAVE, BASE, pedidoDelModelo, respuestaModelo } from '../apoyo/ejemplos.js';

const URL_MENSAJES = 'https://api.anthropic.com/v1/messages';
const eco = (status) => ({ status, body: { message: `fallo con ${TOKEN}` } });
const modeloOk = { metodo: 'POST', url: URL_MENSAJES, responder: { body: respuestaModelo(JSON.stringify({ pedido: pedidoDelModelo() })) } };

function sinSecretosEn(controlador) {
  const volcado = JSON.stringify(controlador.estado);
  assert.ok(!volcado.includes(TOKEN), 'el token aparece en el estado');
  assert.ok(!volcado.includes(CLAVE), 'la clave aparece en el estado');
}

test('C-08: GitHub repite el token en sus errores y no llega a pantalla en seguimiento, proyectos ni lanzamiento', async () => {
  const e = crearEscenario({
    rutas: [
      { url: `${BASE}/issues?labels=factory:pedido&state=all&per_page=50`, responder: eco(500) },
      { url: `${BASE}/actions/workflows/recorrido.yml/runs?per_page=50`, responder: eco(500) },
      modeloOk,
      { metodo: 'POST', url: `${BASE}/issues`, responder: eco(502) },
    ],
  });
  const c = e.controlador;

  await c.abrir('seguimiento');
  assert.match(c.estado.aviso.texto, /No se pudieron leer los pedidos/);
  assert.match(c.estado.aviso.texto, /\[oculto\]/);
  sinSecretosEn(c);

  await c.seguir(5);
  assert.match(c.estado.seguimiento.detalle.error, /\[oculto\]/);
  sinSecretosEn(c);

  await c.abrir('proyectos');
  assert.match(c.estado.aviso.texto, /No se pudieron leer los proyectos/);
  sinSecretosEn(c);

  await c.abrir('pedido');
  c.actualizarDescripcion({ descripcion: 'un conversor', tipo: 'nuevo' });
  await c.entrevistar();
  assert.equal(c.estado.pedido.paso, 'confirmar');
  await c.confirmarYLanzar();
  assert.match(c.estado.pedido.error, /No se pudo crear el issue/);
  assert.match(c.estado.pedido.error, /\[oculto\]/);
  sinSecretosEn(c);

  for (const l of e.red.llamadas) {
    assert.ok(!l.url.includes(TOKEN) && !l.url.includes(CLAVE), `secreto en la URL ${l.url}`);
  }
});

test('C-18: si la API de Anthropic repite la clave y el token, ninguno se muestra', async () => {
  const mensaje = `invalid x-api-key ${CLAVE} / ${TOKEN}`;
  const body = { type: 'error', error: { type: 'authentication_error', message: mensaje } };
  const e = crearEscenario({ rutas: [{ metodo: 'POST', url: URL_MENSAJES, responder: { status: 401, body } }] });
  const c = e.controlador;
  c.actualizarDescripcion({ descripcion: 'un conversor', tipo: 'nuevo' });
  await c.entrevistar();
  assert.match(c.estado.pedido.error, /invalid x-api-key/);
  assert.equal(c.estado.pedido.puedeReintentar, true);
  sinSecretosEn(c);
});
