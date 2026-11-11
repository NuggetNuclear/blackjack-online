# Revisión del código y propuesta de acceso

Fecha: 9 de noviembre de 2026.

## Implementación solicitada

La propuesta fue integrada en el checkout con la paleta final aprobada: verde de mesa, rojo de cartas, madera y acciones doradas. Se conservaron únicamente «Blackjack Online», «Entrar» y «Tu nombre» como textos de cabecera/formulario; se retiraron las frases promocionales y el pie.

Se aplicaron las correcciones de submit por intención, espectador, exclusión/cancelación de conexiones, timeout/cleanup, sincronización conservadora del reloj, rechazo de apuestas tardías, apertura de la primera ventana, saldo cero durante all-in, hidratación de invitaciones, errores accesibles y traducidos, espera/portapapeles, diálogo nativo, resultados por sesión, almacenamiento en memoria y movimiento reducido. Se retiró CSS de acceso obsoleto y se actualizaron reglas/documentación.

Validación de implementación: 61 tests unitarios y 18 regresiones React/transporte con jsdom (79 en total), lint, TypeScript y build de producción. Las dependencias se actualizaron dentro de la versión principal; `npm audit` informa cero vulnerabilidades. Las pruebas de transporte usan conexiones simuladas; no equivalen a validar una sala WebRTC real entre dos navegadores. La ruta local también respondió HTTP 200 con los textos aprobados y sin las frases retiradas. La inspección visual sigue pendiente por el bloqueo de permisos del navegador registrado durante esta tarea.

El resto de este documento conserva el diagnóstico y la propuesta originales como antecedentes; las ubicaciones de línea se refieren a la revisión anterior a la implementación.

## Resultado

La base permite renovar la entrada sin reescribir el motor de blackjack. Recomiendo convertir el lobby actual en una entrada con intención explícita, fondo gris pizarra y una sola acción principal por contexto. Antes de integrar el diseño conviene corregir el envío del formulario, la exclusión entre conexiones simultáneas y la coherencia de los tiempos y del saldo mostrado.

La pantalla denominada «login» no autentica: usa un apodo local. No existen cuentas, contraseñas, recuperación de acceso ni backend de identidad. La propuesta conserva este modelo y explica que se juega con fichas virtuales.

Este trabajo entrega una revisión y una propuesta interactiva. No modifica el código de producción ni aplica correcciones a los cambios locales existentes.

## Alcance y antecedentes

- Revisión estática transversal de `src`: entrada, espera, mesa, componentes, hooks, motor, transporte, validación, persistencia, audio, idioma y utilidades.
- Revisión de configuración, scripts, CI, documentación y pruebas disponibles.
- Se revisó el árbol de trabajo actual, que ya contenía modificaciones y un test de wallet sin seguimiento. Los resultados incluyen ese estado, no solamente `HEAD`.
- En el repositorio y en el historial de chats accesible no apareció un informe previo de auditoría. Sí existe el commit `060ab86` del 20 de julio de 2026: incorpora correcciones de integridad multijugador, motor, validación, tests y documentación. Es evidencia de una revisión anterior, pero no permite reconstruir todas sus conclusiones.
- La aplicación tiene una ruta principal `/`; el flujo lobby/espera/mesa se resuelve con estado de React. Las invitaciones usan `/?room=CODIGO`.

No se verificaron sesiones WebRTC entre dos navegadores, accesibilidad con lector de pantalla, Lighthouse, comportamiento móvil real ni capturas del diseño actual. El control del navegador bloqueó el origen `http://127.0.0.1:3000` por permisos guardados o política administrada, tanto en el navegador integrado como en Edge. No se interpretan esos bloqueos como fallos del proyecto.

Esta es una revisión técnica y de UX basada en el código, no una certificación de seguridad ni un estudio de usuarios.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Correcto, sin diagnósticos de ESLint |
| `npm run typecheck` | Correcto |
| `npm test` | 53 tests aprobados, 19 suites, 0 fallos |
| `npm run build` | Correcto fuera del sandbox; genera `/` y `/_not-found` |
| Primer build dentro del sandbox | Turbopack falló al iniciar el proceso que transforma CSS; el mismo comando pasó fuera del sandbox |

El runner de Node advierte que los tests se reinterpretan como módulos por no declarar el tipo de paquete. No impidió ejecutar las pruebas. El conjunto cubre motor, validadores, wallet e historial; no prueba la interacción del lobby, los hooks ni el ciclo real de conexión.

## Hallazgos priorizados

Las ubicaciones corresponden al código leído en esta revisión. P1 indica corregir antes de integrar el nuevo acceso; P2, corregir en la misma iteración o en una siguiente inmediata; P3, mantenimiento. Los escenarios son reproducciones propuestas a partir del código salvo que se indique una comprobación ejecutada.

### P1: Enter puede iniciar una partida distinta a la elegida

Ubicación: `src/features/blackjack/screens/LobbyScreen.tsx:69`.

`handleSubmit` siempre llama a `onPlaySolo()`. El código de sala vive dentro del mismo formulario, y el botón de unirse es `type="button"`. Por tanto, con apodo y código introducidos, Enter puede enviar el formulario de solo y sacar al usuario del recorrido de invitación.

Solución: modelar la intención como `solo | create | join`, con el rol de invitado independiente. El submit debe ejecutar exactamente la intención visible. Probar Enter desde ambos campos y desde una invitación precargada.

### P1: las operaciones de entrada no tienen exclusión mutua

Ubicaciones: `LobbyScreen.tsx:123`, `LobbyScreen.tsx:131`, `src/features/blackjack/hooks/useRoomConnection.ts:555` y `:587`.

Los botones siguen activos mientras las promesas crean o unen una sala. Cada llamada asigna un `new P2PConnection()` a `p2pRef.current`. Dos clics, o crear sala y luego jugar solo, pueden dejar operaciones competidoras: la que termine más tarde cambia la pantalla o la sala y una conexión anterior puede quedar viva.

Solución: bloqueo inmediato mediante una ref en el coordinador, estado `pendingAction`, botones y campos deshabilitados mientras se conecta, y cancelación/invalidación de respuestas antiguas. Destruir el transporte del intento fallido. Compartir ese estado con el lobby y mostrar «Creando sala…» o «Conectando…» en el botón. El estado de conexión actual no se pasa al lobby.

### P1: el contador visible no representa el plazo del anfitrión

Ubicaciones: `src/features/blackjack/hooks/useRoundCountdown.ts:22`, `:37` y `:42`; `src/features/blackjack/hooks/useDealerProgression.ts:80`.

El host calcula el plazo con `phaseStartedAt`. El contador visible usa `Date.now()` al recibir la fase. Un invitado que entra cuando quedan 3 segundos en apuestas ve aproximadamente 20 segundos y puede creer que aún puede apostar después del reparto. Evitar el desfase entre relojes reiniciando el contador local pierde el tiempo ya transcurrido.

Solución: sincronizar el desplazamiento de reloj o transmitir el plazo restante junto a una referencia temporal del host. Mantener una sola fuente de verdad para aceptar apuestas y presentar el tiempo. Verificar entrada tardía, latencia y relojes con desfase. No basta con restar directamente dos relojes distintos.

### P2: el invitado muestra una recarga de saldo mientras aún hay apuesta activa

Ubicación: `src/features/blackjack/hooks/useRoomConnection.ts:384`; comparar con `:211`.

El peer transforma cualquier `me.balance <= 0` en `100` en cada sync. El host solo lo hace en resultados. Si un invitado apuesta todo, el estado canónico queda en cero mientras la cabecera local muestra y persiste 100 antes de terminar la mano. El host sigue validando las acciones, pero la UI comunica disponibilidad que no existe.

Solución: reflejar el saldo canónico durante la mano y aplicar la recarga únicamente cuando corresponde a las reglas. Unificar la política para host, peer y persistencia. Probar all-in seguido de split, doble, seguro y salida de la sala.

### P2: la espera consume la primera ventana de apuestas

Ubicaciones: `src/features/blackjack/hooks/useDealerProgression.ts:77` y `src/features/blackjack/hooks/useRoomConnection.ts:642`.

Los efectos de apuestas solo comprueban fase y rol de host; no `tableOpen`. Crear la sala ya crea la fase `betting`. Abrir la mesa más tarde solo cambia `tableOpen` y no reinicia `phaseStartedAt`. Si se abre aproximadamente 18 segundos después de crearla, el host puede tener unos 2 segundos para la primera apuesta. Además, puede emitirse un mensaje de «No bets placed» antes de abrir la mesa.

Solución: no ejecutar el ciclo de juego con la mesa cerrada y fijar el inicio de la ventana al abrirla. Es parte del flujo crear → invitar → esperar → abrir.

### P2: controles invisibles siguen formando parte del formulario

Ubicación: `LobbyScreen.tsx:142`; `src/app/globals.css:660`.

La sección para unirse siempre se monta. Se oculta con una fila de altura cero, overflow y opacidad. El input y el botón no se deshabilitan, no llevan `hidden` ni están dentro de un contenedor `inert`. Pueden permanecer en el recorrido de teclado aunque no se vean.

Solución: renderizado condicional o `hidden`/`inert` coherente con la transición. Verificar que Tab solo recorre controles visibles y que abrir la sección no pierde el contexto del apodo.

### P2: el rol espectador no se conserva al solicitar el código

Ubicación: `LobbyScreen.tsx:74`.

Al elegir espectador sin código, únicamente se cambia `mode` a `join`. El botón que aparece llama a `onJoinRoom(false)`, por lo que continuar por esa acción agrega al usuario como jugador. Debe volver a pulsar el enlace de espectador para obtener el rol deseado.

Solución: conservar `joinRole: player | spectator` y cambiar el submit a «Observar sala» cuando corresponda. En la propuesta el rol se elige junto al código.

### P2: errores de campo y de conexión se mezclan

Ubicaciones: `LobbyScreen.tsx:58`, `:64`; `useRoomConnection.ts:556`, `:583` y `:615`.

La asociación del error depende de buscar `/name/i` en un texto en inglés. En modo idle, un fallo al crear una sala se coloca como error del apodo. Además, `EntryInput` solo añade una clase cuando `invalid` es verdadero: no propaga `aria-invalid` ni conecta la descripción del error.

Solución: errores estructurados con código y destino (`nickname`, `roomCode`, `connection`), traducción en la capa de presentación, etiquetas visibles persistentes, `aria-invalid`, `aria-describedby` y foco en el primer campo inválido. Los fallos de red deben ofrecer reintento preservando apodo y código.

Referencia: [W3C WAI, etiquetado de controles](https://www.w3.org/WAI/tutorials/forms/labels/). `aria-label` ya da nombre accesible a los inputs actuales; el problema es que la etiqueta visual desaparece al escribir y falta asociación con el error.

### P2: la invitación cambia el primer render cliente respecto al servidor

Ubicaciones: `useRoomConnection.ts:82` y `LobbyScreen.tsx:43`.

El servidor inicializa el código vacío; el cliente lee `window.location.search` durante la inicialización. En una invitación, `mode` cambia el contenido de «unirse»: el servidor incluye el botón de revelar y el cliente espera el bloque abierto. Existe una divergencia estructural de hidratación deducible del código. La lectura de nombre y viewport también depende del entorno y merece revisarse, aunque no toda diferencia de valor implica por sí sola un error estructural.

Solución: resolver el parámetro de forma compatible con el primer render o hidratar el estado del navegador después de un render inicial estable. No ocultar el problema con `suppressHydrationWarning`.

Referencia: [React, `hydrateRoot`](https://react.dev/reference/react-dom/client/hydrateRoot): servidor y primer render cliente deben producir contenido equivalente. Falta confirmación en consola del navegador.

### P2: la sala de espera rompe la continuidad del idioma y del estado

Ubicación: `src/features/blackjack/screens/WaitingRoomScreen.tsx:57`.

La espera tiene textos en inglés hardcodeados y no usa `useLanguage`, aunque el diccionario ya incluye textos para esta pantalla. Tampoco muestra una explicación para el invitado que espera al anfitrión. La copia al portapapeles no captura rechazos y el menú no implementa navegación de teclado, Escape ni gestión de foco pese a declarar `role="menu"`.

Solución: usar las traducciones existentes, explicar quién puede abrir la mesa, mostrar feedback de conexión y de copia, y preferir dos botones sencillos o un disclosure accesible. Ofrecer seleccionar el código manualmente cuando copiar falla.

### P2: el modal de salida no administra el foco

Ubicación: `src/features/blackjack/components/ConfirmModal.tsx:19`.

La confirmación visual carece de semántica de diálogo, foco inicial, contención de foco, Escape y restitución de foco. Un usuario de teclado puede seguir interactuando con la mesa debajo. La confirmación es especialmente importante cuando se pierde una apuesta al salir.

Solución: diálogo nativo correctamente gestionado o primitiva accesible, nombre y descripción asociados, y pruebas de teclado. Aplicar el patrón también a paneles que declaran `aria-haspopup="dialog"` sin implementar un diálogo.

### P2: los efectos de resultados no se identifican por sesión

Ubicación: `src/features/blackjack/hooks/useResultsEffects.ts:27`.

`lastEffectRound` guarda solo el número de ronda y el hook permanece montado al salir al lobby. Terminar la ronda 1, salir y empezar otra partida que vuelve a la ronda 1 puede omitir los efectos y la escritura de historial de esa nueva ronda. Los timeouts de efectos e historial tampoco se cancelan al cambiar de sesión.

Solución: clave de sesión y ronda o reseteo al salir, y cleanup de callbacks pendientes. No escribir resultados de una sesión anterior después de salir.

### P3: persistencia del apodo sin tolerancia a fallos

Ubicación: `useRoomConnection.ts:78` y `:129`; también `src/shared/i18n/useLanguage.tsx:316`.

El acceso a `localStorage` de nombre, idioma y preferencias no captura excepciones. La wallet sí tiene ese manejo. Un entorno que deniega almacenamiento puede romper el lobby antes de jugar.

Solución: adaptador común de almacenamiento con fallback en memoria. El usuario debe poder jugar aunque no se conserve su preferencia.

### P3: deuda visual y documentación desactualizada

- `globals.css:342` mantiene la familia `login-v2-*` sin referencias en los TSX actuales; convive con `entry-*` y el estilo de mesa. Retirar estilos muertos después de integrar el nuevo alcance.
- `globals.css:29` bloquea el scroll del body, y la entrada usa `min-height: 100vh` sin un alto máximo que garantice el scroll interno. Revisar teclado móvil, pantallas bajas y zoom antes de mantener esa combinación.
- La paleta se reparte entre verde de entrada, dorado, rojo del entorno de mesa y múltiples colores de controles. El refresco debe usar tokens semánticos por superficie y un acento de acción, manteniendo colores semánticos de cartas/resultados. El CTA actual combina `#F7FFFA` con `#32864A`: contraste calculado de 4,44:1, ligeramente inferior al objetivo AA de 4,5:1 para texto normal. La propuesta base alcanza 6,90:1 para la etiqueta principal.
- Los botones pequeños de idioma y espectador y varios controles de mesa necesitan revisar tamaño táctil.
- La animación de cartas usa Web Animations API sin consultar `prefers-reduced-motion`; la regla CSS global no cancela esas animaciones JavaScript.
- `layout.tsx` fija `lang="en"` cuando el idioma por defecto del provider es español. El idioma del documento debe acompañar la selección.
- La UI limita códigos a seis caracteres mientras `ROOM_CODE_PATTERN` acepta de cuatro a ocho. Acordar un único contrato; el generador produce seis.
- README y arquitectura describen contadores basados en tiempo del host, pero el hook actual usa referencias locales. Los docs citan umbral de remezcla 60 donde el motor actual usa 80 y almacenamiento de firma separado donde wallet ya usa un documento atómico.

## Qué conservar

- Separación de motor, validación, transporte, hooks y componentes: permite cambiar la interfaz sin rehacer la lógica de reglas.
- Host como autoridad de acciones y apuestas; identidad vinculada al peer del transporte.
- Baraja retirada y carta oculta enmascarada en broadcasts.
- Validación de apuestas enteras y nombres, guards de fase y tests del motor.
- Persistencia serializada de wallet e historial, incluyendo migración de formatos.
- Invitaciones por URL, apodo recordado, solo sin registro, entrada como espectador, configuración de seguro/rendición y español/inglés.
- Marca textual Blackjack. Tras la revisión de la propuesta, el usuario pidió reemplazar el monograma BJ por una carta y reducir el texto; la vista usa un pequeño as de picas junto al nombre.

Las claves HMAC están distribuidas al cliente y el saldo inicial de un invitado es autodeclarado. Son límites ya documentados del modelo social de fichas virtuales. Cambiar la estética o añadir un formulario de contraseña no convertiría este sistema en un casino con autoridad independiente.

## Dirección de diseño

Lectura: entrada a un juego social y casual, sobria y fácil de entender, con identidad de mesa de cartas y fondo gris pizarra. Se trata de una renovación completa de composición del acceso, conservando capacidades y marca.

- `DESIGN_VARIANCE: 5`: composición de dos columnas en escritorio y una columna en móvil.
- `MOTION_INTENSITY: 3`: feedback de pulsación y transiciones cortas; sin animaciones ambientales.
- `VISUAL_DENSITY: 3`: solo las decisiones relevantes para la intención actual.
- Fundación: React y Tailwind/CSS existentes con tokens propios. No exige añadir una biblioteca para cambiar colores o composición. Si se necesitan diálogos complejos, evaluar una primitiva accesible de manera separada.

### Paleta y jerarquía

| Token | Propuesta | Uso |
| --- | --- | --- |
| Fondo | `#252C35` | Gris pizarra uniforme, sin fieltro verde ni halos |
| Superficie | `#2D3540` | Panel de entrada |
| Campo | `#222932` | Inputs y controles secundarios |
| Texto | `#F1F3F5` | Títulos y contenido principal |
| Texto secundario | `#B5BEC9` | Instrucciones y contexto |
| Acento | `#D0AB53` | Acción principal, selección y marca |
| Texto sobre acento | `#202731` | Etiqueta del CTA |
| Límite de controles | `#788596` | Bordes distinguibles de inputs |

La propuesta tiene tema oscuro fijo por el pedido de fondo pizarra. El dorado se recupera de la identidad actual y se concentra en acciones; la mesa puede conservar el verde como superficie del juego. No se rediseña la mesa en esta fase.

Tipografía sans del stack actual, con jerarquía y tamaños explícitos. No se requiere una descarga externa para que funcione. Si más adelante se elige una fuente de marca, alojarla localmente. Escala de radios: panel 20 px, campos y botones 12 px, carta de marca 5 px. Controles principales de 48-52 px, texto editable mínimo 16 px.

### Composición

Escritorio: cabecera discreta con carta/Blackjack e idioma; título breve a la izquierda, formulario de ancho legible a la derecha. Las cartas funcionan como referencia al juego, no como controles ni como una captura de producto inventada.

Móvil: una columna; desaparece la ilustración de cartas, permanece el contexto breve y se prioriza el formulario. La implementación de producción debe usar `min-height: 100dvh`, scroll de página en el acceso y espacio seguro inferior; probar el teclado abierto, 320 px y zoom al 200%. La vista inline se adapta al contenedor y no usa alto de viewport.

## Flujo propuesto

| Intención | Datos y acción | Destino |
| --- | --- | --- |
| Jugar solo | Apodo → «Jugar solo» | Mesa individual en apuestas |
| Crear sala | Apodo → Con amigos → Crear sala → reglas opcionales → «Crear sala» | Espera con código e invitación; anfitrión abre la mesa |
| Unirse | Apodo → Con amigos → Tengo un código → código → «Unirse a la sala» | Espera o mesa, según estado del anfitrión |
| Observar | Mismo recorrido de unirse + «Entrar solo a observar» → «Observar sala» | Espera o mesa como espectador |
| Invitación | Código validado y precargado → apodo → «Unirse a la sala» | Misma sala de la invitación, sin volver a elegir el modo |

No añadir un paso extra para el recorrido de solo: apodo y CTA siguen visibles desde el inicio. No atribuir preferencia mayoritaria a solo o multijugador sin datos; se conserva solo como entrada predeterminada porque así funciona la pantalla actual. Un enlace de invitación tiene prioridad sobre ese default.

Al unirse, las reglas locales se ocultan porque la autoridad es la sala. Seguro y rendición aparecen en un disclosure con explicación al jugar solo o crear sala. El saldo se comunica como fichas virtuales y se distingue de dinero real. «Rendición» en ajustes describe una regla; «Rendirse» durante una mano sigue siendo una acción.

La vista interactiva permite recorrer las intenciones, validar campos, ver un estado de carga y llegar a una espera simulada. No abre conexiones reales, no almacena el apodo ni cambia la wallet. La revisión visual solicitada por el usuario elimina las explicaciones repetidas y conserva etiquetas, acciones y mensajes de validación. La precarga de invitaciones, el enlace para compartir, el portapapeles, los fallos reales de conexión y el motor no se implementan en esa simulación.

## Estados que debe tener la implementación

- Inicial: apodo recuperado cuando sea posible; sin forzar el teclado móvil al cargar. Enter ejecuta la intención elegida.
- Campo inválido: mensaje junto al campo, foco en el primero inválido y contenido conservado.
- Conexión pendiente: etiqueta específica de acción, `aria-busy`, bloqueo de acciones competidoras y cancelación segura cuando se ofrezca volver.
- Conexión fallida: mensaje localizado por causa, reintentar y editar código; no mostrar el objeto técnico de PeerJS como copy.
- Sala creada: código, copiar enlace/código, lista de jugadores y botón de abrir mesa para host.
- Invitado en espera: quién abrirá la mesa y qué ocurrirá después. No mostrar una pantalla vacía de propósito.
- Anfitrión desconectado: aviso global de cierre con opción de crear otra sala, conservando el apodo.
- Almacenamiento/clipboard no disponibles: continuar jugando y permitir selección manual del código.

## Plan para integrar

1. Corregir los P1 del submit, las conexiones y el contador; incorporar casos de regresión de comportamiento, no tests de clases CSS.
2. Añadir estado de intención/rol, `pendingAction` y errores estructurados. Mantener callbacks del motor y ruta `/`.
3. Implementar la composición en `LobbyScreen`, extraer estilos del acceso y actualizar diccionario ES/EN. Hacer el primer render compatible con invitaciones.
4. Renovar `WaitingRoomScreen` con los mismos tokens y estados de host/invitado/espectador. Iniciar el plazo de apuestas al abrir la mesa.
5. Unificar la política de saldo, claves de sesión para resultados y manejo de almacenamiento. Actualizar documentación y retirar CSS sin referencias.
6. Validar manualmente solo, crear/unirse en dos navegadores, espectador, invitación, desconexión del host, reintento y portapapeles denegado. Verificar teclado, idioma, viewport móvil, zoom y contraste antes de considerar terminada la integración.

### Criterios de aceptación

- Una invitación con código válido lleva a la misma sala al pulsar Enter.
- Crear/unirse/solo no pueden iniciarse en paralelo y los intentos cancelados no alteran el estado después.
- La UI no ofrece más tiempo de apuesta que el que acepta el host.
- El primer plazo de apuestas empieza al abrir la mesa, no al crear la sala.
- El invitado que apuesta todo ve cero fichas disponibles durante su mano.
- Tab no alcanza campos ocultos; cada error está asociado al control correcto.
- Solo y multijugador mantienen las capacidades actuales y funcionan en ES/EN.
- La interfaz es utilizable a 320 px, con teclado móvil y con zoom al 200%.
- Lint, typecheck, tests y build pasan; se añaden pruebas de los comportamientos corregidos.

No se propone añadir cuentas, recuperación de contraseña, OAuth, depósitos ni migración del backend para resolver este rediseño.


## Reintento de QA visual y multijugador (10 de noviembre de 2026)

Se volvió a iniciar el servidor y la aplicación respondió HTTP 200. El control de Edge rechazó el origen exacto `http://127.0.0.1:3000` incluso después de que el usuario mostrara navegación permitida y confirmara una excepción para ese puerto. No se ejecutaron capturas, cambios de viewport ni una partida WebRTC entre navegadores; estos pendientes siguen abiertos. El rechazo corresponde al control de acceso de la herramienta y no demuestra un fallo del proyecto. Se recomienda reiniciar la conexión entre la aplicación de escritorio y la extensión antes de volver a probar.
