// La página publicada: estática, sin terceros, con CSP y sin construcciones
// peligrosas en el código. Criterios C-01, C-02, C-03 (parte estática), C-05
// (casilla), C-08 (parte estática), C-10 (sin copias), C-32 (parte estática) y C-33.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const html = await readFile(new URL('docs/index.html', raiz), 'utf8');

async function archivos(dir) {
  const salida = [];
  for (const entrada of await readdir(new URL(dir, raiz), { withFileTypes: true })) {
    const ruta = `${dir}${entrada.name}`;
    if (entrada.isDirectory()) salida.push(...await archivos(`${ruta}/`));
    else salida.push(ruta);
  }
  return salida;
}

const archivosDocs = await archivos('docs/');
const archivosJs = archivosDocs.filter((r) => r.startsWith('docs/js/') && r.endsWith('.js'));
const fuentes = Object.fromEntries(await Promise.all(archivosJs.map(async (r) => [r, await readFile(new URL(r, raiz), 'utf8')])));

function etiquetas(nombre) {
  return [...html.matchAll(new RegExp(`<${nombre}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
}

function atributo(etiqueta, nombre) {
  const m = new RegExp(`\\b${nombre}\\s*=\\s*"([^"]*)"`, 'i').exec(etiqueta);
  return m ? m[1] : null;
}

describe('C-01: página estática, en español, apta para teléfono y sin terceros', () => {
  test('declara lang="es" y viewport con width=device-width', () => {
    assert.match(html, /<html[^>]*\blang="es"/i);
    const viewport = etiquetas('meta').find((m) => atributo(m, 'name') === 'viewport');
    assert.ok(viewport);
    assert.match(atributo(viewport, 'content'), /width=device-width/);
  });

  test('carga el código con <script type="module" src> relativo y no tiene scripts en línea', () => {
    const scripts = etiquetas('script');
    assert.ok(scripts.length >= 1);
    for (const s of scripts) {
      assert.equal(atributo(s, 'type'), 'module');
      const src = atributo(s, 'src');
      assert.ok(src, 'todo <script> tiene src');
      assert.doesNotMatch(src, /^(?:[a-z]+:|\/\/)/i);
    }
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  });

  test('sin atributos on*, sin javascript: y sin src/href a otro origen', () => {
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(html, /javascript:/i);
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/gi)) {
      assert.doesNotMatch(m[1], /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i, `ruta no relativa: ${m[1]}`);
    }
  });

  test('sin paquetes de terceros y package.json sin dependencias', async () => {
    assert.ok(!archivosDocs.some((r) => /node_modules|\.min\.js$|vendor/i.test(r)));
    const paquete = JSON.parse(await readFile(new URL('package.json', raiz), 'utf8'));
    assert.equal(paquete.dependencies, undefined);
    assert.equal(paquete.devDependencies, undefined);
  });

  test('tiene las cuatro secciones', () => {
    for (const nombre of ['Conexión', 'Pedido nuevo', 'Seguimiento', 'Proyectos']) {
      assert.match(html, new RegExp(`<h2>${nombre}</h2>`));
    }
  });
});

describe('C-02: política de seguridad de contenido', () => {
  const meta = etiquetas('meta').find((m) => /http-equiv="Content-Security-Policy"/i.test(m));
  const directivas = Object.fromEntries(atributo(meta, 'content').split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => { const [nombre, ...valores] = d.split(/\s+/); return [nombre, valores]; }));

  test('default-src es self o none', () => {
    assert.ok(["'self'", "'none'"].includes(directivas['default-src'].join(' ')));
  });

  test('script-src solo permite el propio origen', () => {
    const script = directivas['script-src'] || directivas['default-src'];
    assert.ok(script.includes("'self'"));
    for (const prohibido of ["'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'"]) assert.ok(!script.includes(prohibido));
    assert.ok(script.every((v) => v === "'self'"));
  });

  test('connect-src permite solo las dos APIs', () => {
    const connect = directivas['connect-src'];
    assert.ok(connect.includes('https://api.github.com'));
    assert.ok(connect.includes('https://api.anthropic.com'));
    assert.ok(connect.every((v) => ['https://api.github.com', 'https://api.anthropic.com', "'self'"].includes(v)));
  });

  test('ninguna directiva nombra otro origen remoto ni comodines', () => {
    for (const valores of Object.values(directivas)) {
      for (const v of valores) {
        assert.ok(!v.includes('*'), `comodín: ${v}`);
        if (/^(?:https?:|wss?:)/.test(v) || /\./.test(v)) {
          assert.ok(['https://api.github.com', 'https://api.anthropic.com'].includes(v), `origen: ${v}`);
        }
      }
    }
  });
});

describe('C-03 / C-08 / C-32: construcciones prohibidas en docs/js/', () => {
  test('hay código en docs/js/', () => assert.ok(archivosJs.length > 5));

  for (const [patron, nombre] of [
    [/innerHTML/, 'innerHTML'], [/outerHTML/, 'outerHTML'], [/insertAdjacentHTML/, 'insertAdjacentHTML'],
    [/document\.write/, 'document.write'], [/\beval\(/, 'eval('], [/new Function/, 'new Function'],
    [/set(?:Timeout|Interval)\(\s*['"`]/, 'setTimeout/setInterval con texto'],
    [/console\./, 'console.*'],
    [/\/merges|\/pulls|\/dispatches|\/pages\b|'merges'|'pulls'|'dispatches'|'pages'/, 'URLs de merges, pulls, dispatches o pages'],
  ]) {
    test(`ningún archivo usa ${nombre}`, () => {
      for (const [ruta, codigo] of Object.entries(fuentes)) assert.doesNotMatch(codigo, patron, ruta);
    });
  }

  test('los campos de token y clave son password y la casilla no está marcada', () => {
    const inputs = etiquetas('input');
    const porId = (id) => inputs.find((i) => atributo(i, 'id') === id);
    assert.equal(atributo(porId('token'), 'type'), 'password');
    assert.equal(atributo(porId('clave'), 'type'), 'password');
    assert.doesNotMatch(porId('recordar'), /\bchecked\b/);
    assert.match(html, /Recordar en este navegador/);
    assert.match(html, /Olvidar claves/);
  });
});

describe('C-10: la página no copia las etapas ni el esquema', () => {
  test('ningún archivo de docs/ contiene la lista de etapas ni el esquema', async () => {
    for (const ruta of archivosDocs) {
      const texto = await readFile(new URL(ruta, raiz), 'utf8');
      assert.doesNotMatch(texto, /Agente Spec writer|Preparar \(pedido y repo\)|Informar a quien pidió/, ruta);
      assert.doesNotMatch(texto, /"\$schema"|Pedido completo|funcionalidades_elegidas/, ruta);
    }
  });
});

describe('C-33: los módulos de lógica se importan en Node sin navegador', () => {
  for (const ruta of archivosJs) {
    test(`importa ${ruta}`, async () => {
      await import(new URL(ruta, raiz));
    });
  }
});
