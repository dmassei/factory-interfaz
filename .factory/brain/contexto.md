# Contexto — factory-interfaz

## Qué es

Una página web para usar un software factory sin entrar a GitHub. Tiene cuatro secciones:

1. **Conexión:** el repo del factory, el token de GitHub, la clave de API de Anthropic y el modelo de la entrevista.
2. **Pedido nuevo:** el usuario describe lo que quiere, adjunta archivos, responde la entrevista de un modelo, confirma y lanza el pedido.
3. **Seguimiento:** los pedidos con su estado, y el avance de cada uno módulo por módulo.
4. **Proyectos:** los datos de diseño de los proyectos ya construidos; al editarlos se arma un pedido de cambio.

## Para quién

La persona dueña de una instalación del factory. No necesita saber usar GitHub. Trae dos claves propias: un token de GitHub con acceso al repo de su factory y una clave de API de Anthropic.

## Cómo se relaciona con el factory

- Habla solo con `https://api.github.com` y `https://api.anthropic.com`, directamente desde el navegador. No tiene servidor propio.
- No depende de un factory en particular: el repo del factory es un dato de la conexión.
- No copia el esquema del pedido, la ficha del relevamiento ni la lista de etapas. Los lee del repo del factory cada vez (`esquemas/pedido.json`, `agentes/relevamiento.md`, `brain/nucleo/etapas.json`).
- En el factory solo crea issues, comentarios y etiquetas. Nunca escribe en el repo de un proyecto ni decide nada del recorrido.

## Lo que más importa

- **Las claves.** Nunca van en una URL, ni en la consola, ni completas en pantalla, y solo viajan al servicio al que pertenecen. Por defecto se guardan solo mientras la pestaña está abierta.
- **El texto externo es texto.** Todo lo que llega de una API, de un archivo o del usuario se muestra como texto, nunca como HTML.
- **Nada se lanza sin confirmar.**
- **La lógica se prueba sin navegador ni red.** Armar el pedido, partir adjuntos, calcular el estado de las etapas, armar el pedido de cambio y leer las respuestas de las APIs son funciones puras, que se prueban con respuestas de ejemplo.

## Estructura

- `docs/`: lo que se publica en GitHub Pages. `docs/index.html` es la página; el código va en `docs/js/` como módulos ES.
- `tests/`: tests con el corredor de Node (`*.test.js`). `tests/revision/` es de los revisores del factory.
- `.factory/`: contrato, Brain y specs del proyecto.
