// Test de humo de la Fundación: comprueba que lo publicable existe y que el
// corredor de tests funciona. No depende del pedido; los tests de las
// funcionalidades los escribe el Builder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('la página publicable existe y declara el idioma español', async () => {
  const url = new URL('../docs/index.html', import.meta.url);
  const html = await readFile(url, 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html[^>]*\blang="es"/i);
});
