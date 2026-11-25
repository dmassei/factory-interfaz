// Adjuntos: validación, nombres, reducción de imágenes y partición.
// Criterios C-11, C-12, C-13 y C-14.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarArchivo, normalizarNombre, dimensionesDestino, reducirImagen, partirAdjunto,
  bytesABase64, base64ATexto, MAXIMO_BYTES, FORMATO_NOMBRE, EXTENSIONES, firmaCoincide, nombreUnico,
} from '../docs/js/adjuntos.js';
import { crearEscenario } from './apoyo/escenario.js';

// Traducción a JavaScript de la expresión MARCA de scripts/adjuntos.py del factory.
const MARCA = /<!--\s*factory:adjunto\s+nombre="(?<nombre>[^"]+)"\s+parte="(?<parte>\d+)"\s+de="(?<de>\d+)"\s*-->\s*```base64\s*\n(?<datos>[A-Za-z0-9+/=\s]*?)\n?```/g;

describe('C-11: validación de adjuntos', () => {
  for (const nombre of ['a.png', 'b.jpg', 'c.jpeg', 'd.gif', 'e.webp', 'f.md', 'g.txt', 'H.PNG', 'i.JpG', 'J.TXT']) {
    test(`acepta ${nombre}`, () => assert.equal(validarArchivo(nombre, 1000, 0), null));
  }

  for (const nombre of ['dibujo.svg', 'pagina.html', 'doc.pdf', 'programa.exe', 'sinextension']) {
    test(`rechaza ${nombre} con un mensaje que lo nombra`, () => {
      const error = validarArchivo(nombre, 1000, 0);
      assert.ok(error);
      assert.ok(error.includes(nombre));
    });
  }

  test('con 6 adjuntos, el séptimo se rechaza diciendo que el máximo es 6', () => {
    const error = validarArchivo('septimo.png', 1000, 6);
    assert.match(error, /máximo es 6/);
  });

  test('un .md o .txt de más de 600000 bytes se rechaza', () => {
    assert.ok(validarArchivo('largo.md', 600001, 0));
    assert.ok(validarArchivo('largo.txt', 600001, 0));
    assert.equal(validarArchivo('justo.txt', 600000, 0), null);
  });

  test('el controlador valida antes de leer y no agrega el rechazado', async () => {
    const { controlador } = crearEscenario();
    let leidos = 0;
    const leer = async () => { leidos += 1; return { clase: 'texto', base64: 'aG9sYQ==', texto: 'hola', extension: 'txt' }; };
    assert.equal(await controlador.agregarAdjunto({ nombre: 'x.svg', tamano: 10, leer }), false);
    assert.equal(leidos, 0);
    assert.match(controlador.estado.aviso.texto, /x\.svg/);
    for (let i = 0; i < 6; i += 1) assert.equal(await controlador.agregarAdjunto({ nombre: `n${i}.txt`, tamano: 4, leer }), true);
    assert.equal(await controlador.agregarAdjunto({ nombre: 'n7.txt', tamano: 4, leer }), false);
    assert.match(controlador.estado.aviso.texto, /máximo es 6/);
    assert.equal(controlador.estado.pedido.adjuntos.length, 6);
    assert.equal(leidos, 6);
  });
});

describe('C-12: nombres de adjuntos en formato del factory', () => {
  const largo = `${'a'.repeat(116)}.png`;
  for (const nombre of ['boceto 1.png', 'diseño.jpg', '.oculto.txt', largo, '..x.md', 'a..b.png', 'ñandú (copia).webp', '---.gif']) {
    test(`${nombre.slice(0, 30)} da un nombre válido o un rechazo`, () => {
      const r = normalizarNombre(nombre);
      if (r.error) {
        assert.ok(r.error.length > 0);
        return;
      }
      assert.match(r.nombre, FORMATO_NOMBRE);
      assert.ok(!r.nombre.includes('..'));
      const ext = r.nombre.split('.').pop();
      assert.ok(EXTENSIONES.includes(ext));
    });
  }

  test('casos concretos', () => {
    assert.equal(normalizarNombre('boceto 1.png').nombre, 'boceto-1.png');
    assert.equal(normalizarNombre('diseño.jpg').nombre, 'diseno.jpg');
    assert.equal(normalizarNombre('.oculto.txt').nombre, 'oculto.txt');
    assert.equal(normalizarNombre(largo).nombre.length, 80);
  });

  test('una imagen convertida a JPEG termina en .jpg', () => {
    assert.equal(normalizarNombre('captura.png', 'jpg').nombre, 'captura.jpg');
    assert.equal(normalizarNombre('animada.gif', 'jpg').nombre, 'animada.jpg');
  });

  test('un tipo no admitido es un rechazo', () => {
    assert.ok(normalizarNombre('x.svg').error);
  });

  test('dos adjuntos con el mismo nombre no se pisan', () => {
    assert.equal(nombreUnico('a.png', ['a.png']), 'a-2.png');
    assert.match(nombreUnico(`${'b'.repeat(76)}.png`, [`${'b'.repeat(76)}.png`]), FORMATO_NOMBRE);
  });

  test('el controlador guarda el nombre normalizado, con .jpg si se convirtió', async () => {
    const { controlador } = crearEscenario();
    await controlador.agregarAdjunto({
      nombre: 'Foto grande.PNG', tamano: 5_000_000,
      leer: async () => ({ clase: 'imagen', base64: '/9j/', tipoMedio: 'image/jpeg', extension: 'jpg' }),
    });
    assert.equal(controlador.estado.pedido.adjuntos[0].nombre, 'Foto-grande.jpg');
  });
});

describe('C-13: reducción de imágenes', () => {
  test('dimensiones destino', () => {
    assert.deepEqual(dimensionesDestino(4000, 3000), { ancho: 1600, alto: 1200 });
    assert.deepEqual(dimensionesDestino(1000, 3200), { ancho: 500, alto: 1600 });
    assert.deepEqual(dimensionesDestino(800, 600), { ancho: 800, alto: 600 });
    assert.deepEqual(dimensionesDestino(1601, 1001), { ancho: 1600, alto: 1000 });
  });

  test('si el primer intento ya entra, se usa ese', async () => {
    const intentos = [];
    const codificar = async (ancho, alto, tipo, calidad) => {
      intentos.push({ ancho, alto, tipo, calidad });
      return { datos: 'x', tamano: 500000, tipo };
    };
    const r = await reducirImagen({ nombre: 'a.png', ancho: 4000, alto: 3000, tipo: 'image/png' }, codificar);
    assert.equal(intentos.length, 1);
    assert.equal(intentos[0].tipo, 'image/png');
    assert.equal(intentos[0].ancho, 1600);
    assert.equal(r.tipo, 'image/png');
    assert.equal(r.tamano, 500000);
  });

  test('si no entra, reintenta en JPEG con calidad decreciente hasta entrar', async () => {
    const intentos = [];
    const codificar = async (ancho, alto, tipo, calidad) => {
      intentos.push({ tipo, calidad });
      const tamano = tipo === 'image/png' ? 3_000_000 : Math.round(calidad * 1_000_000);
      return { datos: 'x', tamano, tipo };
    };
    const r = await reducirImagen({ nombre: 'a.png', ancho: 2000, alto: 1000, tipo: 'image/png' }, codificar);
    assert.ok(!r.error);
    assert.equal(r.tipo, 'image/jpeg');
    assert.ok(r.tamano <= MAXIMO_BYTES);
    const jpeg = intentos.filter((i) => i.tipo === 'image/jpeg').map((i) => i.calidad);
    assert.ok(jpeg.length >= 2);
    for (let i = 1; i < jpeg.length; i += 1) assert.ok(jpeg[i] < jpeg[i - 1]);
    assert.equal(normalizarNombre('a.png', 'jpg').nombre, 'a.jpg');
  });

  test('si con la calidad mínima sigue sin entrar, es un error y no queda en la lista', async () => {
    const codificar = async (ancho, alto, tipo) => ({ datos: 'x', tamano: 900000, tipo });
    const r = await reducirImagen({ nombre: 'enorme.png', ancho: 5000, alto: 5000, tipo: 'image/png' }, codificar);
    assert.match(r.error, /no entra/);

    const { controlador } = crearEscenario();
    const ok = await controlador.agregarAdjunto({ nombre: 'enorme.png', tamano: 9_000_000, leer: async () => ({ error: r.error }) });
    assert.equal(ok, false);
    assert.equal(controlador.estado.pedido.adjuntos.length, 0);
    assert.match(controlador.estado.aviso.texto, /no entra/);
  });

  test('firmas de imagen', () => {
    assert.ok(firmaCoincide(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'));
    assert.ok(!firmaCoincide(new Uint8Array([0xff, 0xd8, 0xff]), 'png'));
    assert.ok(firmaCoincide(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'jpg'));
  });
});

describe('C-14: partición de adjuntos en comentarios', () => {
  const base64 = 'QUJD'.repeat(25000); // 100000 caracteres

  test('100000 caracteres dan 3 partes de 45000, 45000 y 10000, con el formato exacto', () => {
    const partes = partirAdjunto('boceto.jpg', base64);
    assert.equal(partes.length, 3);
    assert.equal(partes[0], `<!-- factory:adjunto nombre="boceto.jpg" parte="1" de="3" -->\n\`\`\`base64\n${base64.slice(0, 45000)}\n\`\`\``);
    assert.equal(partes[1], `<!-- factory:adjunto nombre="boceto.jpg" parte="2" de="3" -->\n\`\`\`base64\n${base64.slice(45000, 90000)}\n\`\`\``);
    assert.equal(partes[2], `<!-- factory:adjunto nombre="boceto.jpg" parte="3" de="3" -->\n\`\`\`base64\n${base64.slice(90000)}\n\`\`\``);
  });

  test('45000 caracteres dan 1 parte', () => {
    assert.equal(partirAdjunto('a.png', 'A'.repeat(45000)).length, 1);
    assert.equal(partirAdjunto('a.png', 'A'.repeat(45001)).length, 2);
  });

  test('cada cuerpo es aceptado por MARCA y al concatenar se obtiene el original', () => {
    const partes = partirAdjunto('boceto.jpg', base64);
    let reconstruido = '';
    partes.forEach((cuerpo, i) => {
      const hallados = [...cuerpo.matchAll(MARCA)];
      assert.equal(hallados.length, 1);
      assert.equal((cuerpo.match(/factory:adjunto/g) || []).length, 1);
      const { nombre, parte, de, datos } = hallados[0].groups;
      assert.equal(nombre, 'boceto.jpg');
      assert.equal(Number(parte), i + 1);
      assert.equal(Number(de), 3);
      reconstruido += datos.replace(/\s+/g, '');
    });
    assert.equal(reconstruido, base64);
  });

  test('un nombre fuera de formato no se parte', () => {
    assert.throws(() => partirAdjunto('../x.png', 'AAAA'));
    assert.throws(() => partirAdjunto('a.svg', 'AAAA'));
  });

  test('bytes a base64 y vuelta', () => {
    const bytes = new TextEncoder().encode('Diseño con tildes: áéíóú ñ');
    assert.equal(base64ATexto(bytesABase64(bytes)), 'Diseño con tildes: áéíóú ñ');
    const grande = new Uint8Array(200000).map((_, i) => i % 256);
    assert.equal(bytesABase64(grande), Buffer.from(grande).toString('base64'));
  });
});
