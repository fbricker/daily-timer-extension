# Daily Standup Timer — Chrome Extension

Floating timer to cap each person's update during daily standups. Works on Linear and any other web page.

The UI auto-detects the browser language: English by default, Spanish if the browser is set to Spanish.

## Installation (developer mode)

1. Unzip this archive into a folder.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top-right corner).
4. Click **Load unpacked**.
5. Select the `daily-timer-extension` folder.

Done. You'll see the green icon in Chrome's extension bar.

## How to use

- **Click the extension icon** to show/hide the timer in the current tab.
- The timer floats above any page (including Linear).
- **Drag from the top bar** to reposition it. The position is saved.
- **Start / Pause**: begin or pause the countdown.
- **Next**: move to the next person and auto-restart.
- **Reset**: restore the initial duration without advancing the person counter.
- **+/−**: adjust duration in 15-second steps (between 0:15 and 10:00).
- **Sound**: double beep when time is almost up, 3-note chord when it ends.
- **Minimize (−)**: collapse to a mini view showing only the time. Click to expand.

## Keyboard shortcuts

To avoid clashing with Linear's shortcuts, all of them use `Alt`:
- `Alt + Space`: start / pause
- `Alt + N`: next person
- `Alt + R`: reset

## Notes

- Duration, sound state, position and minimized state are remembered across sessions.
- The person counter resets when the tab reloads (which is what you want for a new daily).
- Changing the duration while the timer is running doesn't interrupt the current count; it applies on the next turn or reset.
- Sounds require a first click on the start button to let the browser enable audio.

---

# Daily Standup Timer — Extensión de Chrome

Timer flotante para limitar el tiempo de cada update en las dailies. Funciona sobre Linear y cualquier otra página web.

La UI detecta automáticamente el idioma del navegador: inglés por defecto, español si el navegador está configurado en español.

## Instalación (modo desarrollador)

1. Descomprime este archivo en una carpeta.
2. Abre Chrome y ve a `chrome://extensions/`.
3. Activa **Modo de desarrollador** (esquina superior derecha).
4. Haz clic en **Cargar extensión sin empaquetar**.
5. Selecciona la carpeta `daily-timer-extension`.

Listo. Verás el ícono verde en la barra de extensiones de Chrome.

## Cómo usar

- **Clic en el ícono** de la extensión para mostrar/ocultar el timer en la pestaña actual.
- El timer aparece flotando sobre cualquier página (incluyendo Linear).
- **Arrastra desde la barra superior** para reposicionarlo. La posición se guarda.
- **Iniciar / Pausar**: empieza o pausa el conteo.
- **Siguiente**: pasa a la siguiente persona y reinicia automáticamente.
- **Reiniciar**: vuelve a la duración inicial sin avanzar de persona.
- **+/−**: ajusta la duración en intervalos de 15 segundos (entre 0:15 y 10:00).
- **Sonido**: doble beep cuando queda poco tiempo, acorde de 3 notas al terminar.
- **Minimizar (−)**: colapsa a una vista mini que solo muestra el tiempo. Clic para expandir.

## Atajos de teclado

Para no chocar con los atajos de Linear, todos usan `Alt`:
- `Alt + Espacio`: iniciar / pausar
- `Alt + N`: siguiente persona
- `Alt + R`: reiniciar

## Notas

- La duración, el estado del sonido, la posición y si está minimizado se recuerdan entre sesiones.
- El contador de personas se reinicia al recargar la pestaña (es lo que tiene sentido para una nueva daily).
- Si cambias la duración mientras el timer corre, no interrumpe la cuenta actual; aplica al próximo turno o reinicio.
- Los sonidos requieren un primer clic en el botón de iniciar para que el navegador habilite el audio.
