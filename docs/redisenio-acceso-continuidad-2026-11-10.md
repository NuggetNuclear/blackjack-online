# Continuidad entre el acceso y la mesa

## Estado actual: recuperación del estilo original

Por petición explícita del usuario se recuperaron los materiales originales del juego a partir de `HEAD`: madera cálida, fieltro verde vivo, suelo rojo, baraja roja y botones amarillos con relieve. El login conserva esa misma mesa, los textos mínimos y todos los flujos corregidos.

Se retiraron Manrope, Phosphor, los controles planos, las pestañas subrayadas y la paleta desaturada de la iteración anterior. Se recuperó el stack tipográfico original, usando pesos 400/700. Para mejorar la lectura, el texto del acceso no usa sombras, las cartas delanteras se presentan sin rotación y sus números rojos usan mayor contraste. El as de la marca mantiene la elección previa del usuario en lugar de recuperar el monograma BJ.

Las siguientes secciones documentan las iteraciones previas y sus comprobaciones; no representan todas el acabado actual.

## Lectura del encargo

Rediseño del acceso de un juego casual de blackjack, con el lenguaje físico y sobrio de su mesa actual. Fundación: React, Tailwind v4 y CSS existentes. Se aplicó `design-taste-frontend` al acceso, conservando la lógica de sesiones y las capacidades del producto.

Variación 4/10, movimiento 2/10, densidad 4/10. Tema oscuro fijo para acompañar el juego. Sin imágenes externas: las cartas son los componentes reales utilizados durante una partida.

## Auditoría visual del código anterior

- La mesa de juego era ovalada y ocupaba la pantalla; el acceso era un rectángulo de madera con dos columnas y un segundo panel oscuro dentro.
- Las cartas del acceso se ampliaban a 1,4 veces su tamaño y funcionaban como ilustración lateral. Su composición se parecía a una portada más que a la mesa.
- Cabecera, marca, selector de idioma y geometría de botones se implementaban por separado, facilitando diferencias entre pantallas.
- Se conservaban textos y funciones aprobados: Blackjack Online, Entrar, Tu nombre, solo, crear sala, unirse, espectador, reglas e idioma. La ruta sigue siendo `/` y las invitaciones conservan `?room=`.

## Cambio implementado

- `TableSurface` comparte el suelo, el borde de madera y el fieltro entre acceso y juego. Las posiciones y los colores de la mesa en juego se extrajeron de su implementación existente.
- El formulario ocupa el centro de la mesa, sin contenedor de portada ni panel elevado adicional. Las cartas conservan su escala del juego y se disponen sobre los controles.
- `CasinoBrand` comparte el as y Blackjack Online entre las cabeceras. El acceso reutiliza `LanguageToggle` y `btn-cartoon`, incluidos el relieve y la respuesta al pulsar.
- La espera reutiliza la misma composición. En pantallas de hasta 768 px el contorno se alarga para mantener campos y acciones sobre el fieltro al desplegar opciones; la página puede desplazarse.
- Los mensajes y la validación existentes se conservaron. No se añadieron eslóganes, avisos promocionales, estadísticas, glows ni animación ambiental.

## Comprobaciones

Contrastes calculados contra el verde más claro de la mesa (`#1D7A38`): texto principal 5,08:1, texto secundario 4,57:1 y borde de campos 3,26:1. El CTA dorado tiene 10,84:1 y los errores sobre su fondo contextual, 10,29:1.

La suite existente verifica flujos, hidratación, espectador y conexiones. La inspección visual en navegador y Lighthouse no se ejecutaron por el bloqueo de Browser Use registrado anteriormente; no se presentan como comprobaciones aprobadas.


## Revisión del acabado tras feedback visual

El usuario rechazó el acabado de la primera versión: exceso de relieve, iconografía y tipografía poco nítidas. Se sustituyó el stack de fuentes del sistema por Manrope variable, cargada localmente con `next/font/local` desde Fontsource. La marca, el selector de idioma y los palos de las cartas usan Phosphor mediante imports individuales. Las caras de las cartas ya no tienen filtro de sombra sobre los símbolos ni marcos gruesos de colores.

Los controles del acceso dejan de heredar `btn-cartoon`: bordes de 1 px, radios de 8 px, pesos tipográficos 400-600 y selector de modo mediante subrayado. El fieltro, la madera y el dorado compartidos se recalibraron a tonos oscuros y poco saturados. Se retiraron el damero del fondo, los perfiles voluminosos de la mesa y el icono de carta construido con caracteres.

Contrastes calculados del acabado final: texto/fieltro 10,61:1; texto secundario/fieltro 6,85:1; bordes/fieltro 3,84:1; placeholder/campo 7,96:1; CTA 8,93:1; palos rojos/papel 5,69:1. Pasaron las 79 pruebas existentes, lint y build (incluida compilación TypeScript). La ruta local devolvió HTTP 200 con la fuente WOFF2 alojada localmente y la marca vectorial. Estos controles no equivalen a una inspección visual automatizada.
