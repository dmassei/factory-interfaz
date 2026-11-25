// Conexión y claves. Criterios C-04, C-05, C-06, C-07 y C-08 (máscara).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validarRepo, cargarConfig, guardarConfig, olvidarClaves, faltantes, enmascarar, CLAVES, MODELO_POR_DEFECTO,
} from '../docs/js/config.js';
import { comprobarConexion } from '../docs/js/github.js';
import { urlGitHub, ORIGEN_GITHUB } from '../docs/js/red.js';
import { crearAlmacen } from './apoyo/almacen.js';
import { crearRed, redCaida } from './apoyo/red-falsa.js';
import { crearEscenario, sesionConClaves } from './apoyo/escenario.js';
import { TOKEN, CLAVE, REPO, BASE } from './apoyo/ejemplos.js';

describe('C-04: sin claves, las secciones no llaman a la red y llevan a Conexión', () => {
  test('faltantes por sección', () => {
    const vacio = { repo: '', token: '', clave: '' };
    assert.deepEqual(faltantes(vacio, 'seguimiento'), ['repo', 'token']);
    assert.deepEqual(faltantes(vacio, 'proyectos'), ['repo', 'token']);
    assert.deepEqual(faltantes(vacio, 'pedido'), ['repo', 'token', 'clave']);
    const sinClave = { repo: REPO, token: TOKEN, clave: '' };
    assert.deepEqual(faltantes(sinClave, 'seguimiento'), []);
    assert.deepEqual(faltantes(sinClave, 'proyectos'), []);
    assert.deepEqual(faltantes(sinClave, 'pedido'), ['clave']);
  });

  for (const seccion of ['pedido', 'seguimiento', 'proyectos']) {
    test(`abrir ${seccion} con el almacenamiento vacío: cero llamadas, Conexión y qué falta`, async () => {
      const { controlador, red } = crearEscenario({ sesion: {} });
      await controlador.abrir(seccion);
      assert.equal(red.llamadas.length, 0);
      assert.equal(controlador.estado.seccion, 'conexion');
      const esperado = seccion === 'pedido' ? ['repo', 'token', 'clave'] : ['repo', 'token'];
      assert.deepEqual(controlador.estado.faltan, esperado);
      assert.match(controlador.estado.aviso.texto, /falta cargar: el repo del factory, el token de GitHub/);
    });
  }

  test('con repo y token sin clave: Pedido nuevo solo pide la clave; Seguimiento abre', async () => {
    const { controlador, red } = crearEscenario({ sesion: sesionConClaves({ clave: false }) });
    await controlador.abrir('pedido');
    assert.equal(red.llamadas.length, 0);
    assert.equal(controlador.estado.seccion, 'conexion');
    assert.deepEqual(controlador.estado.faltan, ['clave']);
    assert.match(controlador.estado.aviso.texto, /la clave de API de Anthropic/);
    await controlador.abrir('seguimiento');
    assert.equal(controlador.estado.seccion, 'seguimiento');
    assert.deepEqual(controlador.estado.faltan, []);
  });
});

describe('C-05: dónde se guardan las claves', () => {
  const datos = { repo: REPO, token: TOKEN, clave: CLAVE, modelo: MODELO_POR_DEFECTO };

  test('con la casilla desmarcada escribe solo en la sesión', () => {
    const sesion = crearAlmacen();
    const local = crearAlmacen();
    guardarConfig(sesion, local, datos, false);
    assert.equal(sesion.getItem(CLAVES.token), TOKEN);
    assert.equal(sesion.getItem(CLAVES.clave), CLAVE);
    assert.equal(local.length, 0);
  });

  test('con la casilla marcada escribe en el local', () => {
    const sesion = crearAlmacen();
    const local = crearAlmacen();
    guardarConfig(sesion, local, datos, true);
    assert.equal(local.getItem(CLAVES.token), TOKEN);
    assert.equal(local.getItem(CLAVES.clave), CLAVE);
    assert.equal(cargarConfig(sesion, local).recordar, true);
  });

  test('desmarcar la casilla borra lo que había en el local', () => {
    const sesion = crearAlmacen();
    const local = crearAlmacen();
    guardarConfig(sesion, local, datos, true);
    guardarConfig(sesion, local, datos, false);
    assert.equal(local.length, 0);
  });

  test('Olvidar claves deja vacíos de token y clave a los dos', () => {
    const sesion = crearAlmacen();
    const local = crearAlmacen();
    guardarConfig(sesion, local, datos, false);
    local.setItem(CLAVES.token, TOKEN);
    local.setItem(CLAVES.clave, CLAVE);
    olvidarClaves(sesion, local);
    for (const almacen of [sesion, local]) {
      assert.equal(almacen.getItem(CLAVES.token), null);
      assert.equal(almacen.getItem(CLAVES.clave), null);
    }
  });

  test('con los dos almacenamientos vacíos (pestaña cerrada sin recordar) faltan las claves', () => {
    const config = cargarConfig(crearAlmacen(), crearAlmacen());
    assert.equal(config.token, '');
    assert.equal(config.clave, '');
    assert.equal(config.modelo, MODELO_POR_DEFECTO);
    assert.deepEqual(faltantes(config, 'pedido'), ['repo', 'token', 'clave']);
  });

  test('en la página la casilla no tiene el atributo checked', async () => {
    const html = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
    const casilla = /<input[^>]*id="recordar"[^>]*>/.exec(html)[0];
    assert.doesNotMatch(casilla, /checked/);
  });

  test('el controlador guarda sin recordar por defecto y Olvidar borra', async () => {
    const e = crearEscenario({ sesion: {} });
    await e.controlador.guardarConexion({ repo: REPO, token: TOKEN, clave: CLAVE, modelo: '', recordar: false });
    assert.equal(e.sesion.getItem(CLAVES.token), TOKEN);
    assert.equal(e.local.length, 0);
    e.controlador.olvidar();
    assert.equal(e.sesion.getItem(CLAVES.token), null);
    assert.equal(e.sesion.getItem(CLAVES.clave), null);
  });
});

describe('C-06: el repo del factory se valida antes de usarse', () => {
  test('acepta dueño/nombre válidos', () => {
    assert.deepEqual(validarRepo('dmassei/Factory'), { owner: 'dmassei', nombre: 'Factory' });
    assert.deepEqual(validarRepo('una-org/mi.repo_2'), { owner: 'una-org', nombre: 'mi.repo_2' });
  });

  for (const malo of ['', 'solo-nombre', 'a/b/c', '../x', 'a/..', 'a/b?x=1', 'a/b#c', 'https://github.com/a/b', 'a /b', 'a/b c', ' a/b']) {
    test(`rechaza ${JSON.stringify(malo)} sin llamar a la red`, async () => {
      assert.equal(validarRepo(malo), null);
      const e = crearEscenario({ sesion: {} });
      await e.controlador.guardarConexion({ repo: malo, token: TOKEN, clave: CLAVE, recordar: false });
      if (malo.trim() !== 'a/b') assert.equal(e.red.llamadas.length, 0);
      const r = crearRed();
      const resultado = await comprobarConexion(r.fetch, { repo: malo, token: TOKEN });
      assert.equal(resultado.ok, false);
      assert.equal(r.llamadas.length, 0);
    });
  }

  test('las URL de GitHub siempre tienen el origen de la API', () => {
    const url = urlGitHub(['repos', 'a', '..', 'contents', 'x?y#z']);
    assert.ok(url.startsWith(`${ORIGEN_GITHUB}/`));
    assert.equal(new URL(url).origin, ORIGEN_GITHUB);
    assert.equal(new URL(urlGitHub(['repos', '@evil.com', 'x'])).origin, ORIGEN_GITHUB);
  });
});

describe('C-07: comprobación de la conexión', () => {
  test('guardar hace GET /repos/{factory} con los encabezados previstos e informa éxito', async () => {
    const e = crearEscenario({ sesion: {} });
    await e.controlador.guardarConexion({ repo: REPO, token: TOKEN, clave: CLAVE, modelo: '', recordar: false });
    assert.equal(e.red.llamadas.length, 1);
    const [llamada] = e.red.llamadas;
    assert.equal(llamada.url, BASE);
    assert.equal(llamada.metodo, 'GET');
    assert.equal(llamada.encabezados.Authorization, `Bearer ${TOKEN}`);
    assert.equal(llamada.encabezados.Accept, 'application/vnd.github+json');
    assert.equal(e.controlador.estado.aviso.tipo, 'ok');
    assert.match(e.controlador.estado.aviso.texto, /Conexión correcta/);
  });

  for (const status of [401, 403, 404]) {
    test(`respuesta ${status}: dice que el token no llega, con el motivo y sin el token`, async () => {
      const red = crearRed([{ url: BASE, responder: { status, body: { message: `Motivo ${status}` } } }]);
      const resultado = await comprobarConexion(red.fetch, { repo: REPO, token: TOKEN });
      assert.equal(resultado.ok, false);
      assert.match(resultado.mensaje, /El token no llega al repo del factory/);
      assert.match(resultado.mensaje, new RegExp(`Motivo ${status}`));
      assert.ok(!resultado.mensaje.includes(TOKEN));
    });
  }

  test('error de red: mensaje de falla, sin excepción ni token', async () => {
    const red = redCaida();
    const resultado = await comprobarConexion(red.fetch, { repo: REPO, token: TOKEN });
    assert.equal(resultado.ok, false);
    assert.match(resultado.mensaje, /El token no llega/);
    assert.ok(!resultado.mensaje.includes(TOKEN));
  });

  test('la sección Conexión muestra los permisos y el riesgo de recordar', async () => {
    const html = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
    assert.match(html, /Issues: lectura y escritura/);
    assert.match(html, /Actions: lectura/);
    assert.match(html, /Contents: lectura/);
    assert.match(html, /limitado al repo del factory/);
    assert.match(html, /riesgo de recordar las claves/i);
  });
});

describe('C-08: la representación de una clave guardada no la muestra completa', () => {
  test('enmascarar', () => {
    for (const secreto of [TOKEN, CLAVE, 'corta']) {
      const visible = enmascarar(secreto);
      assert.ok(visible.length > 0);
      assert.ok(!visible.includes(secreto));
    }
    assert.equal(enmascarar(''), '');
  });

  test('el estado de la conexión no lleva las claves', () => {
    const { controlador } = crearEscenario();
    const texto = JSON.stringify(controlador.estado);
    assert.ok(!texto.includes(TOKEN));
    assert.ok(!texto.includes(CLAVE));
  });
});
