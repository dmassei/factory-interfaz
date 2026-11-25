# Decisiones — factory-interfaz

## D-01. Tipo: aplicación web estática

El pedido lo fija: sin servidor propio, sin paso de compilación, publicada con GitHub Pages. Todo corre en el navegador y habla directo con las APIs de GitHub y de Anthropic.

## D-02. Stack: HTML, CSS y JavaScript sin dependencias

- JavaScript como módulos ES nativos (`<script type="module">`), que los navegadores actuales cargan sin empaquetar.
- Sin bibliotecas, frameworks, fuentes ni scripts de terceros: el pedido los prohíbe, y además la política de seguridad de contenido solo permite el propio origen y las dos APIs.

Alternativas descartadas:

- **TypeScript o un framework (React, Vue, Svelte):** necesitan compilación o cargar código de terceros. El pedido excluye las dos cosas.
- **Un servidor intermediario para las claves:** el pedido excluye el servidor propio y lo resuelve con claves del usuario guardadas en su navegador.

## D-03. Tests: corredor integrado de Node, sin dependencias

- `node --test` con el informe JUnit integrado. No hace falta instalar nada: la máquina solo necesita Node 24.
- `package.json` existe únicamente para declarar `"type": "module"`, de modo que Node cargue como módulos ES los mismos archivos de `docs/js/` que carga el navegador. No declara dependencias.
- Los tests prueban la lógica pura importando los módulos de `docs/js/`. Lo que toca el navegador (DOM, `fetch`, almacenamiento, lienzo para reducir imágenes) va en los bordes, para que el núcleo se pruebe sin navegador y sin red, como pide el pedido.
- El comando corre `tests/**/*.test.js` y todo `.js` de `tests/revision/`, para que los tests de los revisores se ejecuten aunque no terminen en `.test.js`. Los datos de ejemplo de los tests van como `.json` o con otro nombre que no termine en `.test.js`, para que el corredor no los tome por tests.

Alternativas descartadas:

- **Probar en un navegador sin cabeza (Playwright, Puppeteer):** suma dependencias pesadas. El pedido pide que la lógica se pruebe sin navegador.
- **Jest, Vitest o Mocha:** son dependencias que el corredor de Node ya reemplaza.

## D-04. Publicación desde `/docs`

Se publica la carpeta `docs/` de la rama principal con GitHub Pages. Así lo publicado queda separado de los tests, del contrato y del Brain, que no tienen por qué servirse.

## D-05. El informe de tests va en la raíz

`informe-tests.xml`, ignorado por git. El corredor de Node no crea carpetas para el destino del informe; dejarlo en la raíz evita un paso previo en el comando.

## D-06. Revisores: código y seguridad

Son los que el factory tiene hoy. La seguridad pesa especialmente acá: el proyecto maneja dos claves del usuario y muestra texto que llega de afuera.
