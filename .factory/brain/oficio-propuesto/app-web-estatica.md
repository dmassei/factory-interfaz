# App web estática — Oficio propuesto (tipo)

Borrador de la Fundación de `factory-interfaz`. Destino sugerido: `brain/oficio/tipos/app-web-estatica/`. Hasta que se apruebe, no es una regla citable del factory.

Vale para aplicaciones que se publican como archivos estáticos y corren enteras en el navegador, sin servidor propio.

## Arquitectura

- **WE-01. Sin servidor propio.** Todo lo que hace la aplicación pasa en el navegador o en servicios externos declarados en la spec.
- **WE-02. Lo publicable vive en una sola carpeta**, la que declara `publicacion.carpeta` en el contrato. Nada fuera de ella hace falta para que la página funcione.
- **WE-03. La lógica pura se separa del navegador.** DOM, `fetch`, almacenamiento, reloj y lienzo se usan en módulos de borde; el resto se prueba sin navegador ni red.
- **WE-04. Rutas relativas.** La página funciona publicada en una subcarpeta (por ejemplo `usuario.github.io/proyecto/`).

## Seguridad

- **WE-05. Política de seguridad de contenido declarada en la página.** Por defecto solo el propio origen; cada destino de conexión extra se lista explícitamente en `connect-src`. Sin `unsafe-inline` ni `unsafe-eval`.
- **WE-06. Nada de código de terceros en tiempo de ejecución**, salvo que la spec lo declare: ni scripts, ni hojas de estilo, ni fuentes de otros orígenes.
- **WE-07. El texto externo se inserta como texto.** Se usa `textContent` o la creación de nodos; nunca `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write` con datos que no sean constantes del propio código.
- **WE-08. Sin manejadores en línea.** Ni atributos `on*` en el HTML ni `javascript:` en enlaces; los eventos se asignan desde los módulos.
- **WE-09. Los enlaces externos abren con `rel="noopener noreferrer"`** y solo si su esquema es `https:`.
- **WE-10. Claves del usuario: almacenamiento mínimo.** Si la aplicación guarda credenciales, por defecto usa `sessionStorage`; `localStorage` solo con consentimiento explícito. Nunca van en la URL, en la consola ni completas en pantalla.
- **WE-11. Entrada de archivos validada en el navegador**: extensión, tipo y tamaño, antes de leer o enviar el contenido.

## Usabilidad

- **WE-12. Funciona en escritorio y en teléfono.** Se declara `viewport` y el diseño se adapta al ancho.
- **WE-13. Cada error se muestra en pantalla** con qué pasó y qué puede hacer el usuario, sin perder lo que ya escribió.
