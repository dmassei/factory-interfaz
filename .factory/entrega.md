# Entrega — Trabajo 1: interfaz web del factory

Spec: `.factory/specs/1-interfaz-web.json` (issue 12).

## Verificación

Comando del contrato, después de la corrección: 195 tests (191 propios y 4 de revisión), 195 pasan, 0 fallan, 0 salteados. Deja `informe-tests.xml` (JUnit). El test de humo sigue pasando sin cambios.

Además, fuera de los tests: abrí la página publicada desde `docs/` en Chrome sin cabeza, por el protocolo de DevTools. Arranca sin errores de JavaScript ni violaciones de la CSP. Sin claves, Pedido nuevo lleva a Conexión con los faltantes. Las claves guardadas se muestran enmascaradas. Una imagen PNG de 4000×3000 y 36 MB se redujo en el lienzo y quedó adjunta como `ruido-grande.jpg`. El único error de consola fue el 404 de `/favicon.ico`.

## Cómo está armado

Módulos ES en `docs/js/`, sin dependencias. La lógica no toca globales del navegador: recibe `fetch`, los almacenamientos, el temporizador y el documento como parámetros.

| Módulo | Qué hace |
|---|---|
| `red.js` | Llamadas a GitHub y a Anthropic: encabezados, `AbortSignal.timeout`, mensajes de error sin secretos, URL de GitHub por segmentos codificados |
| `config.js` | Conexión: validación de `dueño/nombre`, sesión o local, Olvidar claves, faltantes por sección, máscara |
| `github.js` | Lecturas: comprobación del token, archivos del factory (base64 → UTF-8), issues, corridas, trabajos, comentarios, datos de diseño |
| `adjuntos.js` | Validación, nombres, dimensiones y reducción (con codificador inyectado), partición en comentarios, base64 |
| `entrevista.js` | Sistema, primer mensaje, historial de turnos, control de rondas, interpretación de la respuesta |
| `pedido.js` | Completar, confirmar, validar contra el esquema leído, título y cuerpo del issue, edición de campos |
| `lanzamiento.js` | Issue, comentarios y etiqueta, con estado que permite retomar desde el paso que falló |
| `etapas.js` | Corrida de un pedido, estado del pedido y de cada etapa |
| `resultado.js` | Último comentario que no es adjunto; segmentación en texto y enlaces https |
| `proyectos.js` | Lista de proyectos, números de pedidos, pedido de cambio |
| `controlador.js` | Estado y acciones de la página. Ninguna acción deja escapar excepciones |
| `vista.js` | Armado del DOM solo con `createElement`, `createTextNode`, `setAttribute`, `append` y `textContent` |
| `interfaz.js`, `app.js` | Bordes: eventos del DOM, lectura de archivos, lienzo, `sessionStorage`/`localStorage`, `setTimeout` |

## Criterios y tests

| Criterio | Tests |
|---|---|
| C-01 | `tests/pagina.test.js` › "C-01: página estática, en español, apta para teléfono y sin terceros" (lang, viewport, script module relativo, sin scripts en línea, sin `on*` ni `javascript:`, todo src/href relativo, sin paquetes de terceros, package.json sin dependencias, cuatro secciones) |
| C-02 | `tests/pagina.test.js` › "C-02: política de seguridad de contenido" (default-src, script-src, connect-src, sin otros orígenes ni comodines) |
| C-03 | `tests/pagina.test.js` › "C-03 / C-08 / C-32: construcciones prohibidas en docs/js/" (innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, setTimeout/setInterval con texto); `tests/seguimiento.test.js` › "C-03: el resultado con HTML se muestra literal". Además, vistas con HTML como texto en `tests/entrevista.test.js` (preguntas) y `tests/pedido.test.js` (confirmación) |
| C-04 | `tests/conexion.test.js` › "C-04: …" (faltantes por sección; abrir Pedido nuevo, Seguimiento y Proyectos sin almacenamiento: cero llamadas, Conexión, qué falta; con repo y token sin clave) |
| C-05 | `tests/conexion.test.js` › "C-05: dónde se guardan las claves" (desmarcada → solo sesión; marcada → local; desmarcar limpia el local; Olvidar vacía los dos; pestaña cerrada → faltan claves; casilla sin `checked`; recorrido por el controlador) |
| C-06 | `tests/conexion.test.js` › "C-06: …" (aceptados, cada rechazado sin red, origen de las URL de GitHub) |
| C-07 | `tests/conexion.test.js` › "C-07: comprobación de la conexión" (GET con Authorization y Accept, éxito, 401, 403, 404 y error de red sin token, permisos y riesgo en la página) |
| C-08 | `tests/recorrido.test.js` › "C-08: …" (conexión, entrevista, lanzamiento, seguimiento y proyectos con `ghp_TOKENSECRETO123` y `sk-ant-CLAVESECRETA456`: URLs, encabezados por origen, cuerpos); `tests/pagina.test.js` (sin `console.*`, campos password); `tests/conexion.test.js` › "C-08: la representación de una clave guardada no la muestra completa" |
| C-09 | `tests/recorrido.test.js` › "C-09: tiempo límite y manejo de falla" (signal en toda llamada; fetch que rechaza en conexión, seguimiento, detalle, proyectos y entrevista → mensaje en pantalla; falla al lanzar → mensaje y reintento) |
| C-10 | `tests/seguimiento.test.js` › "C-10: archivos del factory leídos de su repo" (GET a las tres rutas, base64 en líneas con tildes y eñes, rutas no previstas rechazadas, etapas validadas); `tests/pagina.test.js` › "C-10: la página no copia las etapas ni el esquema" |
| C-11 | `tests/adjuntos.test.js` › "C-11: validación de adjuntos" (extensiones aceptadas con mayúsculas, rechazos que nombran el archivo, séptimo adjunto, texto de más de 600000 bytes, validación antes de leer en el controlador) |
| C-12 | `tests/adjuntos.test.js` › "C-12: nombres de adjuntos en formato del factory" (`boceto 1.png`, `diseño.jpg`, `.oculto.txt`, nombre de 120 caracteres y otros; conversión a `.jpg`; nombres repetidos) |
| C-13 | `tests/adjuntos.test.js` › "C-13: reducción de imágenes" (dimensiones, primer intento que entra, JPEG con calidad decreciente, error si no entra y no queda en la lista) |
| C-14 | `tests/adjuntos.test.js` › "C-14: partición de adjuntos en comentarios" (100000 → 45000/45000/10000 con el formato exacto, 45000 → 1 parte, aceptado por MARCA y reconstrucción) |
| C-15 | `tests/entrevista.test.js` › "C-15: la llamada a la API de Anthropic" (encabezados, modelo por defecto y cambiado, max_tokens, system con la ficha y el esquema y la instrucción de formato, primer mensaje con descripción, tipo, texto de los .md/.txt y bloques de imagen con su media_type; cambio con proyecto) |
| C-16 | `tests/entrevista.test.js` › "C-16: interpretación de la respuesta del modelo" (preguntas numeradas en una lista ordenada, pedido, rechazos de los cuatro casos del criterio y otros, reintento sin perder descripción, adjuntos ni respuestas) |
| C-17 | `tests/entrevista.test.js` › "C-17: rondas de preguntas" (tras 2 rondas se pide el pedido; otra ronda pedida permite preguntas; `rondas` y `rondas_extra_pedidas` en el pedido) |
| C-18 | `tests/entrevista.test.js` › "C-18: errores de la API de Anthropic" (401, 400 por saldo y 429 con el message de la API; se conserva lo escrito, también las respuestas de una ronda; la clave nunca aparece) |
| C-19 | `tests/pedido.test.js` › "C-19: confirmación campo por campo" (cada campo y supuestos marcados, editar el objetivo cambia lo lanzado, sin llamadas a /issues antes de confirmar, `confirmado` true al confirmar, el lanzamiento rechaza un pedido sin confirmar) |
| C-20 | `tests/pedido.test.js` › "C-20: campos obligatorios y límites de la versión" (faltantes tomados de `required` del esquema leído, réplica y privado rechazados, pedido nuevo público con solicitante persona/chat, cambio con el proyecto elegido, el controlador no lanza) |
| C-21 | `tests/lanzamiento.test.js` › "C-21: …" (orden issue → 2 comentarios → etiqueta, título, sin labels, cuerpo con el pedido, sin PUT/PATCH/DELETE ni /contents, pasa al seguimiento) |
| C-22 | `tests/lanzamiento.test.js` › "C-22: reintento desde el paso que falló" (falla la parte 2, falla el issue, falla la etiqueta, y en el controlador) |
| C-23 | `tests/seguimiento.test.js` › "C-23: lista de pedidos con su estado" (GET exacto, orden 10, 7, 3, sin PRs, ilegible, estados) |
| C-24 | `tests/seguimiento.test.js` › "C-24: la corrida de un pedido" (la más reciente con título exacto; `Pedido #10` y `Pedido #12` nunca; sin corrida; jobs con per_page=100) |
| C-25 | `tests/seguimiento.test.js` › "C-25: estado de cada etapa" (los cinco casos del criterio, pasos fuera de la lista, trabajo entero, opcional inexistente, entrada sin corrida) |
| C-26 | `tests/seguimiento.test.js` › "C-26: Preparar terminado y Agente Builder en curso" |
| C-27 | `tests/seguimiento.test.js` › "C-27: aprobado en la primera revisión" (salteados con y sin pasos; trabajos ausentes) |
| C-28 | `tests/seguimiento.test.js` › "C-28: actualización cada 10 segundos mientras corre" (10000 ms, se detiene al terminar, salir cancela, cambiar de sección cancela) |
| C-29 | `tests/seguimiento.test.js` › "C-29: resultado informado por el factory" (último no adjunto, salto de línea, un solo enlace https con target y rel, http/javascript/Markdown como texto) |
| C-30 | `tests/proyectos.test.js` › "C-30: proyectos a partir de los pedidos" (sin repetir, dueño del factory, nombres inválidos omitidos y fuera de las URL, orden 3, 7, 12, adjuntos por nombre con el texto de los .md, 404 → sin datos, solo GET al repo del proyecto) |
| C-31 | `tests/proyectos.test.js` › "C-31: Proponer cambio" (pedido de cambio con `anexos.cambios` de un solo elemento, frase vacía, sin cambios, confirmación y lanzamiento sin entrevista) |
| C-32 | `tests/recorrido.test.js` › "C-32: …" (toda llamada que no es GET va a issues, comments, labels o mensajes); `tests/pagina.test.js` (sin /merges, /pulls, /dispatches ni /pages en docs/js/) |
| C-33 | Todo el comando del contrato corre sin red ni navegador; `tests/pagina.test.js` › "C-33: los módulos de lógica se importan en Node sin navegador" importa cada archivo de docs/js/; `tests/humo.test.js` intacto |

## Zonas tocadas

- `docs/index.html` (reemplaza el esqueleto)
- `docs/js/` (14 módulos nuevos)
- `docs/css/estilos.css` (nuevo)
- `tests/` (9 archivos de test nuevos y `tests/apoyo/`, con copias de `brain/nucleo/etapas.json` y `esquemas/pedido.json` del factory como datos de ejemplo)

No toqué `package.json`, el contrato, el test de humo ni `tests/revision/`. No agregué dependencias.

## Decisiones dentro de la spec

- **Valor anterior y nuevo (C-31):** van en `anexos.cambios`, una lista de `{ pedido_origen, campo, valor_anterior, valor_nuevo }`. El esquema pide que `anexos` sea un objeto. El pedido de cambio lleva un `criterio_de_exito` armado a partir de la frase, porque el esquema lo exige; se puede editar en la confirmación.
- **Proyecto público:** un pedido de la entrevista sale siempre con `proyecto.visibilidad: "publico"`. Si en la confirmación alguien lo cambia a `privado`, o pone `escenario: replica`, la validación lo rechaza.
- **Historial de la entrevista:** cada llamada manda la conversación completa, y los mensajes alternan entre usuario y asistente. Si el usuario pide otra ronda después del borrador, el modelo recibe el borrador con las ediciones del usuario. Si el modelo pregunta cuando ya no puede, se muestra un error con reintento. Si una llamada falla, se vuelve a las preguntas con las respuestas escritas y la ronda no cuenta.
- **Imágenes:** una imagen que ya mide 1600 px o menos, pesa 600000 bytes o menos y tiene la firma de su extensión viaja sin tocar. Si no, primero se prueba el formato original, con GIF pasado a PNG porque el lienzo no produce GIF, y después JPEG con calidades de 0,85 a 0,25. Para no exceder la CSP (`img-src 'self'`), se usa `createImageBitmap` en lugar de URLs `blob:`.
- **Seguimiento recién lanzado:** apenas se lanza un pedido, su corrida tarda unos segundos en aparecer. Mientras tanto, el seguimiento consulta cada 10 segundos, hasta 30 veces. Un pedido viejo sin corrida no se consulta.
- **Comentarios del resultado:** se leen hasta 5 páginas de 100, porque los adjuntos pueden sumar muchos comentarios.
- **Token en los repos de proyectos:** las lecturas de los repos de proyectos públicos también llevan el token, siempre a `api.github.com`. Un token de grano fino puede leer repos públicos.

## Objeciones

Ninguna.

## Corrección — respuesta a la lista única de la primera revisión

No modifiqué ni salteé ningún test de revisión ni test existente, ni el bloque `verificar` del contrato. Zonas tocadas: `docs/js/controlador.js`, `docs/js/vista.js` y `docs/js/interfaz.js`, todas dentro de `docs/js/`.

1. **Bloqueante, capa 1 (P-15): fallaban 3 tests de revisión.** Resuelto con los puntos 2 y 3. El comando del contrato da 195 tests, 195 pasan, 0 fallan, 0 salteados.
2. **Bloqueante, `Controlador.abrir` con `seccion === 'seguimiento'` (C-28, P-15).** `abrir` ahora llama a `salirDelSeguimiento(false)` para cualquier sección, incluida Seguimiento. Así cancela la consulta programada y no solo borra el detalle. Saqué el `detalle = null` que quedaba suelto, porque `salirDelSeguimiento` ya lo hace. Lo cubre `tests/revision/codigo-r1-seguimiento-salida.js` (ahora pasa).
3. **Bloqueante, `vistaProyectos` con un proyecto abierto (C-30, C-31, P-15).** Los pedidos se agregaban a `partes` como un arreglo anidado, que `el` no aplanaba. Ahora se agregan elemento por elemento (`partes.push(...)`) y `partes` se pasa expandido a `el`. Cada pedido se dibuja como `article`, con sus campos, sus adjuntos y el botón «Proponer cambio». Lo cubre `tests/revision/codigo-r1-proyectos-vista.js` (los dos tests pasan).
4. **Menor, expresión del nombre de proyecto duplicada en `Controlador.entrevistar` (C-20, P-08).** `entrevistar` usa ahora `NOMBRE_PROYECTO` importado de `pedido.js`. La expresión queda definida en un solo lugar.
5. **Menor, `.catch(() => {})` en `interfaz.js` (P-12).** Agregué `Controlador.informarFalla(error)`, que muestra la falla como aviso de error en pantalla (con el mismo texto sin secretos que el resto de los errores) y redibuja. Los cinco manejadores de `interfaz.js` y la consulta programada del seguimiento en `controlador.js` terminan ahora en `informarFalla`, y ya no descartan el error.
