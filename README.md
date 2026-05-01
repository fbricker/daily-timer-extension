# Daily Standup Timer — Extensión de Chrome

Timer flotante para limitar el tiempo de cada update en las dailies. Funciona sobre Linear y cualquier otra página web.

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
