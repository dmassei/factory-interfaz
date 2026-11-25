# JavaScript para navegador sin dependencias — Oficio propuesto (stack)

Borrador de la Fundación de `factory-interfaz`. Destino sugerido: `brain/oficio/stacks/javascript/`. Hasta que se apruebe, no es una regla citable del factory.

Vale para proyectos en HTML, CSS y JavaScript sin paso de compilación, probados con el corredor integrado de Node.

## Código

- **JS-01. Módulos ES nativos.** Se usan `import` y `export`; la página carga el punto de entrada con `<script type="module">`. Nada de variables globales.
- **JS-02. El mismo código corre en el navegador y en los tests.** Un módulo de lógica no usa APIs exclusivas del navegador ni de Node.
- **JS-03. Sin dependencias.** Se usa lo que el navegador y Node traen. Agregar una exige declararla en la spec y fijar su versión.
- **JS-04. Igualdad estricta** (`===`, `!==`) y `const` por defecto; `let` solo si se reasigna; nunca `var`.
- **JS-05. Las promesas se esperan o se manejan.** Toda llamada asíncrona termina en `await` dentro de un `try` o con su `catch`.
- **JS-06. Las llamadas de red tienen tiempo límite**, con `AbortController` o `AbortSignal.timeout`.
- **JS-07. Sin `eval`, `new Function` ni `setTimeout` con texto.**

## Tests

- **JS-08. Corredor `node:test` y `node:assert/strict`.** Los archivos de test terminan en `.test.js` y viven en `tests/`.
- **JS-09. Los tests no usan red.** Las respuestas de las APIs se pasan como datos de ejemplo a funciones puras, o se reemplaza `fetch` por una función inyectada.
- **JS-10. Los datos de ejemplo no terminan en `.test.js`**, para que el corredor no los tome por tests.
