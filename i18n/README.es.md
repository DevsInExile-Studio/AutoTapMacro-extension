<p align="center"><img src="../docs/assets/github-banner.png" alt="AutoTap Macro — Graba. Repite. Hazlo a tu manera." width="100%"></p>

<p align="center"><strong>Un pequeño taller para tus rutinas del navegador, JavaScript y herramientas de página.</strong></p>

<!-- Replace the Chrome Web Store homepage URL below with your extension listing URL. -->
<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro"><img src="../docs/assets/google-play-badge.svg" alt="Consigue la aplicación Android en Google Play" width="220" height="64"></a>
  <a href="https://chromewebstore.google.com/"><img src="../docs/assets/chrome-web-store-badge.svg" alt="Instalar desde Chrome Web Store" width="220" height="64"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.2-6c9a3e?style=flat-square" alt="Versión 1.4.2">
  <img src="https://img.shields.io/badge/Chrome-138%2B-67563e?style=flat-square" alt="Chrome 138 o posterior">
  <img src="https://img.shields.io/badge/Manifest-V3-67563e?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/storage-local-6c9a3e?style=flat-square" alt="Almacenamiento local">
</p>

<p align="center"><a href="../README.md">English</a> · <strong>Español</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.hi.md">हिन्दी</a> · <a href="README.ar.md">العربية</a> · <a href="README.fr.md">Français</a></p>

Instala la extensión desde Chrome Web Store o de forma local. La interfaz está en inglés.

## Un espacio, tres formas de automatizar

| Macros | Scripts de usuario | Herramientas de página |
| --- | --- | --- |
| Graba clics, los cinco botones estándar del ratón, movimientos del puntero, pulsaciones mantenidas, arrastrar y soltar HTML, gestos de rueda, escritura y desplazamiento. | Escribe o importa archivos `.js` / `.user.js`. Ejecútalos una vez o automáticamente en sitios elegidos con las API GM compatibles. | Extrae elementos repetidos mediante selectores CSS, consulta una tabla y exporta CSV o JSON. |
| Edita acciones, selectores y tiempos. Configura ciclos, velocidad, esperas, comprobaciones de texto y gestión de errores. | Usa valores por script, solicitudes de red, recursos, comandos, notificaciones, descargas y escritura en el portapapeles. | Organiza favoritos y etiquetas, adapta ejemplos, consulta Activity y exporta copias JSON. |

Durante la grabación, unos indicadores sutiles y un carrusel de una fila muestran las acciones sobre una barra compacta y móvil de pausa y parada. Se respeta la preferencia de reducir movimiento. Los datos permanecen en el perfil del navegador salvo que los exportes o tu script envíe una solicitud.

<p align="center"><img src="../store/screenshot-macros-1280x800.png" alt="Editor de macros con una rutina guardada y ajustes de tiempo" width="100%"></p>

<details>
<summary><strong>Ver las otras cuatro capturas</strong></summary>

| Grabación en directo | Editor JavaScript |
| --- | --- |
| ![Indicadores de grabación](../store/screenshot-recording-1280x800.png) | ![Editor de scripts](../store/screenshot-javascript-1280x800.png) |
| Acceso y compatibilidad | Exportación de datos |
| ![Red y archivos adjuntos](../store/screenshot-compatibility-1280x800.png) | ![Vista previa de extracción](../store/screenshot-toolbox-1280x800.png) |

</details>

## Instalación local

1. Descarga o clona este repositorio. Usa **Chrome 138 o posterior**.
2. Abre `chrome://extensions` y activa **Developer mode**.
3. Pulsa **Load unpacked** y selecciona la carpeta **`chrome/`** del repositorio.
4. Abre un sitio HTTP(S) normal → icono de AutoTap → **Record this tab**. Interactúa y pulsa **Stop**. **Open workshop** permite editar o reproducir la rutina.

Para actualizar, conserva la carpeta de instalación, sustituye sus archivos y pulsa **Reload** en la tarjeta de la extensión. Actualiza las pestañas de los sitios. No hace falta compilar ni instalar la aplicación Android.

Atajos: **Alt+Shift+R** para grabar y **Alt+Shift+X** para parar. Puedes cambiarlos en `chrome://extensions/shortcuts`.

## Tu propio JavaScript

Activa **Allow user scripts** en los detalles de AutoTap en Chrome. Abre **JavaScript** en el taller, crea o importa un script, revisa sus permisos y pulsa **Run once**. Para ejecutarlo automáticamente, configura los sitios, activa la opción y guarda. Los scripts importados tienen la ejecución automática desactivada.

La compatibilidad con Tampermonkey es **parcial**: las API implementadas ofrecen las formas clásicas `GM_*` y modernas `GM.*`. Puedes adjuntar archivos `@require` / `@resource` locales o descargarlos explícitamente a un borrador para revisarlos. No se descargan ni actualizan en segundo plano. Consulta la [matriz de compatibilidad](../docs/COMPATIBILITY.md), en inglés.

## Privacidad y límites prácticos

- Sin cuenta, analítica integrada ni servidor propio de la extensión. Los permisos de sitios y funciones nativas se solicitan cuando hacen falta. Los scripts pueden acceder a los destinos que autorices.
- Se omiten contraseñas, archivos y campos reconocidos de pago o códigos de un solo uso. El texto normal, los scripts, los registros y las copias pueden contener datos personales.
- Las macros y la extracción funcionan en el documento principal. Navegar termina la sesión. No se admiten páginas internas de Chrome, Chrome Web Store, shadow DOM ni sitios que exigen eventos de hardware de confianza.
- No se admiten `unsafeWindow`, API de cookies, respuestas en streaming ni actualizaciones automáticas de scripts. **Stop** detiene las macros; recarga la página para eliminar temporizadores o escuchas de scripts arbitrarios.

[Privacidad de la extensión](../store/PRIVACY.md) · [Sitio del desarrollador](https://devs-in-exile.pages.dev/) · [Notas de entrada y rendimiento](../docs/PERFORMANCE.md)

## También en Android

[AutoTap Macro en Google Play](https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro) graba y reproduce toques en aplicaciones Android. La extensión y la aplicación usan colecciones y formatos separados, sin sincronización.

## Desarrollo y recursos

El código de la extensión está en `chrome/`; las traducciones, en `i18n/`; el banner y los distintivos, en `docs/assets/`. En `store/` hay cinco capturas de **1280 × 800** y dos imágenes promocionales de **440 × 280 / 1400 × 560**.

```sh
npm install
npm test
npm run test:browser
npm run assets
```

[Compilación, pruebas y paquetes](../docs/DEVELOPMENT.md) · [Informar de un problema](https://github.com/DevsInExile-Studio/AutoTapMacro-extension/issues) · [Contacto](mailto:DevsInExileStudio@outlook.com)
