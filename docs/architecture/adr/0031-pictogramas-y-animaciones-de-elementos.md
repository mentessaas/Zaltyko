# ADR-0031 — Pictogramas y animaciones propios de los elementos

- Estado: **aceptado** el 23-11-2026 por Elvis. Con este ADR no se enciende ninguna bandera ni se aplica nada en ningún entorno: cada paso necesita su permiso.
- Alcance:
  - `src/modules/element-library/`: ficha del elemento.
  - `scripts/element-library/animation/`: motor, escenarios, validador y guías.
  - `src/modules/element-library/data/<edición>/animaciones/`: datos de cada elemento.
- Relacionados:
  - ADR-0029: biblioteca de elementos; §2 pide un ADR propio para pictogramas dibujados desde cero.
  - ADR-0030: vocabulario por país.

## Contexto

- **La ficha solo tiene texto.** Un entrenador entiende antes un elemento cuando lo ve. El ADR-0029 dejó fuera las imágenes de terceros y aplazó a otro ADR los pictogramas propios.
- **Lo que pidió Elvis (23-11-2026).** Aprobó un estilo («Volumen») y pidió animar todos los elementos con física y técnica correctas. También pidió que los dibujos sean «iguales» a los del Código, pero con nuestro estilo.
- **Los dibujos del Código tienen derechos de autor de la FIG.** Calcarlos, aunque cambie el estilo, es obra derivada; lo mismo concluyó la investigación legal para las ilustraciones de la RFEG. Las posturas y la técnica de un elemento, en cambio, son hechos.
- **Hay un prototipo funcionando** en la rama `element-library-animations`. Incluye:
  - un motor con física: parábola del centro de gravedad, conservación del momento angular y apoyos fijos;
  - escenarios a escala real de los ocho aparatos;
  - un validador de articulaciones, velocidades y colisiones;
  - guías técnicas por familia de movimiento, con fuentes de entrenamiento y biomecánica.

## Decisión

1. **Dibujos y animaciones propios, hechos en sala limpia.** Cada elemento pasa por tres sesiones separadas:
   - **Extracción.** Una sesión mira el dibujo oficial y anota solo datos técnicos: fases, forma del cuerpo, ángulos redondeados a 30°, apoyos, sentido del giro y piruetas. No anota coordenadas, composición ni texto.
   - **Animación.** Otra sesión anima sin ver el dibujo. Parte de esos datos, de nuestra ficha y de la guía técnica.
   - **Revisión.** Una tercera sesión compara con el Código y con la técnica correcta. Puntúa de 0 a 1 el parecido de composición del pictograma con el dibujo oficial; con 0,5 o más, se rehace.

   Nada sale de Upgrade Gymnastics ni de GymPro Atlas.
2. **Un archivo de datos por elemento**, no vídeos:
   - **Qué guarda.** `data/<edición>/animaciones/<clave>.json` lleva las posturas clave, los apoyos, los vuelos (altura, giro y pirueta) y los fotogramas del pictograma fijo. Pesa pocos KB.
   - **Quién anima.** La app anima en el navegador con un renderizador SVG en TypeScript, una traslación del motor actual.
   - **Por qué no vídeos.** 1.301 vídeos ocuparían unos 150 MB en el repositorio. Los datos permiten cambiar el estilo sin rehacer nada y respetar «reducir movimiento».
   - **Precisión del formato de la app (24-11-2026).** Los JSON exportados guardan los fotogramas ya calculados por el motor Python: ángulos de segmentos, pelvis y metadatos de apoyo y pirueta, cuantizados para ocupar pocos KB, junto con los índices del pictograma. TypeScript no vuelve a calcular la física; solo dibuja las siluetas Bezier «Volumen», los aparatos y el anillo de pirueta. Así se conserva una sola física y el resultado coincide con el motor.
   - **Formato 2 (27-11-2026).** El motor añadió vista frontal parcial con transición de cámara, brazos abiertos vistos de lado (`spread`), el desplazamiento del salto y la escena de salida de barra; el dibujo TypeScript, que repetía la geometría, se había quedado atrás. Desde el formato 2 cada fotograma lleva las articulaciones ya calculadas por `figure.Pose.joints` (en px, guardadas como diferencia con el fotograma anterior) y unas marcas (vista frontal, tronco arqueado, capa lejana, aparato delante, anillo y total de pirueta, ángulo del tronco), y el aparato viaja como el SVG que dibuja `scenes.py`, pasado a `currentColor`. El navegador solo pinta: no puede volver a separarse del motor. Una prueba compara las siluetas TypeScript con las de Python en ocho elementos (anillas, salto, paralelas, barra fija, barra de equilibrio, asimétricas). Límite por fichero: 40 KB (mediana 9,7 KB, unos 3 KB comprimido).
3. **Pictograma fijo de los mismos datos.** Sin animación, o con «reducir movimiento» activado, la ficha muestra el momento clave en sólido y una o dos fases translúcidas.
4. **Requisitos para entrar al repositorio.** Una animación entra solo si cumple todo esto:
   - el validador no da ningún problema (articulaciones dentro de rango, velocidades por segmento, apoyos que no resbalan, nada que atraviese suelo o aparato);
   - la revisión técnica es correcta;
   - el parecido de composición es menor que 0,5.

   Por tandas, con un registro como el de los textos (ADR-0029 §1.7).
5. **Revisión de las tandas.** Las revisa Elvis o, por la delegación del 23-11-2026, Claude desde una sesión distinta de la que anima.
6. **Bandera propia**, apagada por defecto: `ZALTYKO_ELEMENT_LIBRARY_ANIMATIONS_ENABLED`. Sin ella, la ficha sigue solo con texto.
7. **Atribución.** El pie de la ficha añade que los dibujos y animaciones son de Zaltyko, hechos a partir de la técnica de cada elemento, y que no reproducen los del Código.

## Alternativas descartadas

- **Copiar o calcar los dibujos de la FIG con otro estilo:** es obra derivada, con riesgo legal en un repositorio público.
- **Generar imágenes con IA (Canva, Figma):**
  - la anatomía no es fiable en gimnasia;
  - el estilo cambia de una imagen a otra;
  - consume créditos;
  - no se puede validar la física.
- **Vídeos MP4 por elemento:** son pesados, no se adaptan al tema y no respetan «reducir movimiento».
- **Remotion:** no aporta al dibujo. Solo tendría sentido para montajes con títulos.

## Consecuencias

- **Trabajo:** son unas 26 tandas, cada una con tres sesiones, con un coste de tokens alto.
- **Lo que no se dibuja bien en 2D.** Algunos elementos no se representan del todo bien de perfil:
  - los molinos y desplazamientos de caballo se resuelven con giro sobre eje vertical y escorzo;
  - las piruetas se muestran con un anillo de giro.

  Cada tanda anota sus límites.
- **Mantenimiento:** el renderizador del navegador y el motor de Python deben dar el mismo resultado. Un test compara los dos.
- **Ediciones nuevas del Código:** cada edición necesita sus propias animaciones. Los datos de la edición anterior sirven de punto de partida.

## Decisiones de Elvis

Tomadas el 23-11-2026, al aprobar este ADR («apruebo el ADR-0031, sigue con las tandas»):

1. Datos por elemento animados en el navegador, en lugar de vídeos.
2. La misma revisión delegada que en los textos.
3. En la ficha, animación en bucle por defecto; pictograma fijo con «reducir movimiento». Es el valor por defecto elegido al aprobar; Elvis puede cambiarlo.
