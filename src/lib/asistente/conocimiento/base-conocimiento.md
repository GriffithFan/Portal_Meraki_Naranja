# Base de conocimiento THNET — Pisos Tecnológicos

## 1. Propósito del documento

Este documento consolida la información operativa, técnica, administrativa, formativa y de mejora disponible sobre el proyecto **Piso Tecnológico Educar — Red USAP | THNET**.

Está preparado para ser utilizado como fuente de conocimiento de un chatbot de respuestas para:

- Técnicos de campo nuevos y actuales.
- Mesa de ayuda.
- Referentes técnicos y capacitadores.
- Coordinación operativa.
- Personal de planificación, logística y sistemas.

El objetivo operativo principal es ayudar a ejecutar incidencias correctamente, mantener la calidad y reducir a cero los rechazos evitables en auditoría.

> **Idea central:** una incidencia no está terminada únicamente porque el servicio funciona. Está terminada cuando fue verificada, ejecutada de forma segura, probada, documentada y respaldada con evidencia auditable.

---

## 2. Alcance, vigencia y fuentes

### Fecha de consolidación

31/07/2026.

### Fuentes consolidadas

1. Manual de Usuario: Inducción para Técnicos de Campo.
2. Roadmap Operativo THNET — Agosto a inicio de octubre de 2026.
3. Curso de incidencias — Jornada 1: fundamentos y mantenimiento preventivo.
4. Curso de incidencias — Jornada 2: mantenimiento correctivo y cierre.
5. Agenda del curso de incidencias.
6. Captura estadística de no conformes frecuentes sobre 53 predios.
7. LAC de evidencias del predio USAP 821193, con registros de rack, AP, canalizaciones, topología, conectividad y actas.

### Roadmap vigente

Para consultas sobre metas, fechas y escalabilidad se toma como referencia vigente el **Roadmap Operativo THNET — Agosto a inicio de octubre de 2026**. El roadmap anterior de 30 días se considera antecedente histórico y no debe utilizarse para contradecir las metas posteriores de 150+ y 200+.

### Jerarquía sugerida de fuentes

Cuando exista una duda o diferencia entre contenidos, el chatbot debe priorizar en este orden:

1. Procedimiento operativo vigente comunicado oficialmente por THNET o Mesa de Ayuda.
2. Manual de Usuario THNET.
3. Actas y requisitos específicos del proyecto.
4. Esta base de conocimiento consolidada.
5. Material de capacitación y ejemplos del LAC.
6. Roadmap y objetivos de mejora.

### Límites del chatbot

El chatbot debe:

- Responder únicamente con información respaldada por esta base o por una fuente oficial conectada.
- Diferenciar una obligación operativa de una recomendación o meta.
- No inventar números de serie, estados de equipos, credenciales, datos de predios ni autorizaciones.
- No indicar una intervención eléctrica insegura.
- Recomendar detener la tarea y escalar cuando el técnico no esté habilitado, no tenga certeza o encuentre una condición insegura.
- Indicar que Mesa de Ayuda debe confirmar reemplazos, diferencias de inventario, bloqueos de ingreso, fallas de ISP y situaciones fuera del alcance del técnico.

---

# PARTE I — CONTEXTO DEL PROYECTO

## 3. ¿Qué es un Piso Tecnológico?

Un Piso Tecnológico es la infraestructura de red que permite brindar conectividad a una institución educativa. Incluye, entre otros elementos:

- Rack principal y, cuando corresponde, racks secundarios.
- UTM.
- Switch.
- Patch panel.
- Organizadores.
- PDU o regleta de tensión.
- Filtro de tensión.
- Protector Ethernet o RJ45.
- Pletina.
- Térmica y disyuntor.
- Módem o enlace del ISP.
- Access Points o AP.
- Cajas, rosetas, patchcords y cableado UTP.
- Canalizaciones interiores y exteriores.
- Sistemas de gestión y seguimiento, principalmente Carrot.
- Actas y evidencia fotográfica en la app EDUCAR.

El rack funciona como núcleo de la red: concentra, organiza y protege los equipos desde los cuales se distribuye la conectividad al edificio.

## 4. Objetivo del trabajo técnico

El técnico debe lograr que la instalación:

- Funcione.
- Sea segura.
- Quede limpia y ordenada.
- Esté rotulada.
- Coincida con Carrot y las actas.
- Tenga evidencia fotográfica suficiente y legible.
- Cumpla los criterios de auditoría.

## 5. ¿Qué es una incidencia?

En este proyecto, el mantenimiento preventivo y correctivo se gestiona mediante **incidencias**.

Una incidencia es una tarea operativa que requiere verificar, diagnosticar, ejecutar, probar, documentar y cerrar una situación en un predio.

### Incidencia preventiva

Se realiza antes de que exista una falla o para evitar que un problema existente se agrave.

Busca detectar y corregir:

- Suciedad y desorden.
- Falta de rotulado.
- Cables sueltos o mal canalizados.
- Ausencia o falla de protecciones.
- Tapas o precintos faltantes.
- AP mal ubicados.
- Equipos con indicadores anormales.
- Diferencias entre la instalación, Carrot y las actas.
- Evidencia insuficiente.

### Incidencia correctiva

Se realiza cuando existe una falla reportada o detectada.

Puede involucrar:

- Predio sin conectividad.
- UTM, switch o AP offline.
- AP en mesh cuando no corresponde.
- AP negociando a 100 Mbps en lugar de Giga.
- Problemas de alimentación o protección.
- Fallas de cableado, conectores, rosetas o puertos.
- Enlace WAN o ISP caído.
- Equipo dañado que requiere reemplazo.
- Canalización defectuosa.
- Diferencias de inventario o seriales.

---

# PARTE II — FLUJO OPERATIVO DE UNA INCIDENCIA

## 6. Método general obligatorio

Toda incidencia debe seguir el mismo orden:

1. **Verificar**
   - Tarea asignada.
   - Identidad del predio.
   - Estado en Carrot.
   - Alcance de la incidencia.
   - Condiciones de seguridad.

2. **Diagnosticar**
   - Qué ocurre.
   - Dónde ocurre.
   - Si afecta un equipo, un sector o todo el predio.
   - Cuál es la causa probable.

3. **Intervenir**
   - Corregir únicamente según procedimiento y dentro del alcance autorizado.
   - Escalar si la tarea requiere autorización, reemplazo, intervención eléctrica o una decisión fuera del alcance.

4. **Probar**
   - Verificar LEDs.
   - Revisar topología.
   - Confirmar equipos online.
   - Comprobar velocidad de enlace cuando corresponda.
   - Probar navegación y SSID según el alcance.

5. **Documentar**
   - Actualizar Carrot.
   - Completar actas.
   - Registrar altas y bajas.
   - Verificar seriales.
   - Tomar fotografías.
   - Cerrar la incidencia.

> Si se omite un paso, la incidencia puede reabrirse o generar una no conformidad.

## 7. Antes de salir al predio

- Revisar la incidencia asignada.
- Verificar el estado del predio en Carrot.
- Confirmar equipos y antecedentes disponibles.
- Revisar materiales, herramientas y repuestos necesarios.
- Confirmar vehículo y planificación.
- Enviar el predio asignado a Mesa de Ayuda para confirmación y lanzamiento formal de la tarea.
- No trasladar equipos no asignados ni improvisar reemplazos.

## 8. Ingreso y presentación en la institución

1. Presentarse ante la autoridad escolar con credenciales visibles.
2. Corroborar el nombre de la institución.
3. Validar el CUE, Código Único de Establecimiento.
4. Informar de manera breve y cordial qué tareas se realizarán.
5. Consultar la ubicación exacta de equipos, rack y conexiones.
6. Preguntar por intermitencias, microcortes y variaciones eléctricas, incluidos cortes o bajas de tensión en fines de semana.
7. Si hay dudas, trabas o no permiten el ingreso, comunicarse inmediatamente con Mesa de Ayuda THNET.
8. Actualizar el estado en Carrot.

## 9. Seguridad y límites de intervención

- No intervenir instalaciones eléctricas energizadas si no se está habilitado o no existe un procedimiento definido.
- No improvisar puentes, empalmes, fusibles, fuentes ni conexiones provisorias no autorizadas.
- Identificar el equipo y registrar su conexión antes de desconectarlo.
- Mantener herramientas controladas, pasillos despejados y el área de rack ordenada.
- Si la condición es insegura o el técnico no está seguro, debe detenerse y consultar a Mesa de Ayuda.
- Reinicios, restauraciones de fábrica y reemplazos de UTM o switch deben realizarse sólo cuando corresponda al diagnóstico y al procedimiento autorizado.

---

# PARTE III — COMPONENTES Y CRITERIOS TÉCNICOS

## 10. Glosario técnico básico

### Rack

Gabinete metálico que aloja, organiza y protege los equipos de red.

Debe quedar:

- Limpio.
- Ordenado.
- Rotulado.
- Cerrado.
- Sin elementos ajenos.
- Con ventilación sin obstrucciones.

### UTM

Equipo principal de seguridad y salida a Internet. Recibe enlaces WAN y entrega conectividad a la red interna.

### Switch

Distribuye la red por cable a AP y otros dispositivos. Los LEDs de puertos permiten observar enlace y actividad.

### Patch panel

Panel de terminación y organización del cableado estructurado.

### Organizador

Elemento que guía y ordena los patchcords dentro del rack.

### AP — Access Point

Equipo que brinda Wi-Fi. Debe estar:

- En su caja o ubicación correspondiente.
- Rotulado.
- Conectado.
- Alimentado.
- Con LED de funcionamiento.
- Visible y online en la topología.

### PDU

Regleta de distribución eléctrica dentro del rack. Debe ser visible en la evidencia del rack.

### Filtro de tensión

Protege los equipos frente a variaciones eléctricas. El estándar del manual indica testigo azul encendido cuando está operativo.

### Protector Ethernet o RJ45

Protege la línea de datos. Su cable verde debe fijarse a la pletina. Si no hay pletina, debe instalarse según procedimiento.

### Pletina

Elemento conductor utilizado para vincular protecciones y puesta a tierra dentro del rack.

### ISP

Proveedor de servicio de Internet.

### WAN

Interfaz de entrada de conectividad al UTM.

### LAN

Red local interna que sale del UTM hacia el switch y los equipos del predio.

### Serial o S/N

Número de serie único de un equipo. Debe coincidir entre:

- Etiqueta física del equipo.
- Carrot.
- Actas, especialmente Hoja 3.
- Registro de alta o baja cuando existe reemplazo.

### NC — No conforme / No conformidad

Resultado de auditoría que indica que la ejecución, documentación o evidencia no cumple el criterio requerido.

### ABM

Alta, Baja y Modificación de equipos.

### LAC

Conjunto o lote de evidencias del predio utilizado para demostrar ejecución, funcionamiento, documentación y condiciones finales.

---

# PARTE IV — MANTENIMIENTO PREVENTIVO

## 11. Regla de oro del rack

> **Nunca se debe dejar un rack sucio o desordenado, sin importar cómo fue encontrado.**

## 12. Relevamiento visual del rack

Revisar de arriba hacia abajo:

1. Identificación del rack y predio.
2. UTM.
3. Switch.
4. Patch panel.
5. Organizador.
6. PDU.
7. Módem.
8. Protector Ethernet.
9. Filtro de tensión.
10. Pletina.
11. Cableado y patchcords.
12. Ventilación y espacio interno.

### Indicadores LED de referencia

Según el manual:

- UTM: blanco.
- Switch: blanco.
- Filtro de tensión: azul.
- Puertos activos: verde.

Si el estado real no coincide, diagnosticar antes de cerrar.

## 13. Limpieza, orden y rotulado

- Limpiar rack principal y secundarios.
- Ordenar todos los cables.
- No dejar cables tensos, colgando o sueltos.
- No obstruir ventilación.
- Rotular equipos, cajas y AP con su número correspondiente.
- Si falta un rótulo, colocarlo en el momento.
- No dejar elementos ajenos apoyados dentro del rack.

## 14. Protección eléctrica y Ethernet

### Filtro de tensión

- Debe estar instalado cuando corresponda.
- Si el testigo azul está apagado pero el rack tiene tensión, el manual lo considera fuera de servicio y se debe gestionar su reemplazo.
- Si existe DPS/SPD, debe instalarse el filtro de tensión de piso grande dentro del rack, según procedimiento.

### Protector Ethernet

- El rack debe contar con protector RJ45/Ethernet.
- El cable verde se fija a la pletina.
- Si no existe pletina, debe instalarse una según procedimiento.

### Separación de canalizaciones

La conducción de datos y tensión debe ser estrictamente independiente.

## 15. Conexionado WAN

- Conexión LAB / Proyecto PNCE: desde la salida del protector RJ45 al puerto **WAN1** del UTM.
- Conexión propia de la institución: desde la salida del protector RJ45 al puerto **WAN2** del UTM.
- Verificar el tipo de conectividad en el Acta de Conectividad, Hoja 5.
- Aunque el ISP del proyecto esté inactivo, debe quedar conectado a WAN1.

## 16. Módem del ISP

- Debe quedar dentro del rack.
- Ubicación preferida: bandeja superior.
- Si está abajo o fuera, intentar reubicarlo arriba y dentro.
- Si no es posible, dejarlo conectado mediante UTP correctamente canalizado.
- En ese caso, tomar evidencia del módem y del recorrido de su canalización.

## 17. AP y topología

- Revisar LEDs de puertos del switch; deben mostrar enlace activo.
- Consultar en Carrot el estado de AP y la topología.
- Si un AP está offline o funciona mal, revisar alimentación, conexiones, puerto, patchcord, roseta y cableado.
- Si el AP falla, solicitar reemplazo a Mesa de Ayuda.
- Nunca dejar un AP dentro del rack.
- Si se encuentra un AP dentro del rack, tomar evidencia con la app EDUCAR y reportar inmediatamente a Mesa de Ayuda.

## 18. Canalización interior

Debe tener:

- Todas las tapas.
- Precintos cada 1 metro.
- Cable sin dobleces forzados.
- Sin tramos colgando.
- Recorrido firme y prolijo.

## 19. Canalización exterior

Debe utilizar:

- Cable UTP apto para exterior.
- Pitones.
- Tensor.
- Alambre galvanizado.
- Precintos cada 60 cm.
- Sujeción firme.
- Ausencia de contacto con bordes cortantes.

## 20. Rack secundario

Debe contar con:

- Switch.
- Patch panel.
- Organizador.
- Filtro de tensión.
- Pletina.
- Filtro o protector Ethernet.
- Térmica.
- Disyuntor.

Si falta un componente, debe regularizarse según el alcance y procedimiento vigente.

## 21. Racks en altura

Colocar cinta de demarcación en el suelo proyectando la sombra del rack. Esto evita que directivos o docentes ubiquen escritorios o pupitres debajo.

## 22. Checklist preventivo resumido

- [ ] Predio y tarea verificados.
- [ ] Rack limpio, ordenado y cerrado.
- [ ] Equipos rotulados.
- [ ] LEDs normales.
- [ ] PDU visible.
- [ ] Filtro de tensión operativo.
- [ ] Protector Ethernet instalado y vinculado a pletina.
- [ ] Datos y tensión separados.
- [ ] Módem dentro del rack o correctamente canalizado y evidenciado.
- [ ] AP rotulados, correctamente ubicados y online.
- [ ] AP en Giga cuando corresponda.
- [ ] Canalización interior con tapas y precintos cada 1 m.
- [ ] Canalización exterior con elementos adecuados y precintos cada 60 cm.
- [ ] Carrot y topología revisados.
- [ ] Seriales coincidentes.
- [ ] Actas y fotografías completas.

---

# PARTE V — MANTENIMIENTO CORRECTIVO Y DIAGNÓSTICO

## 23. Principio de diagnóstico

No se deben probar cambios al azar. El diagnóstico debe avanzar desde lo simple y verificable hacia lo complejo.

1. Observar el síntoma.
2. Delimitar el alcance.
3. Revisar energía.
4. Revisar conectores y patchcords.
5. Revisar puerto y cableado.
6. Consultar Carrot y topología.
7. Comparar con un equipo o tramo que funciona.
8. Confirmar la causa.
9. Corregir o escalar.
10. Repetir las pruebas.

## 24. Predio completo sin servicio

Comenzar por:

- Energía del rack.
- Estado del filtro de tensión.
- Estado del módem del ISP.
- Cable de WAN.
- LEDs del UTM.
- LEDs del switch.
- Estado general del predio en Carrot.
- Topología.

Si la falla corresponde al ISP, registrar y escalar a Mesa de Ayuda.

## 25. Falla de un sector o AP

1. Identificar el AP afectado.
2. Ubicar su puerto en el switch.
3. Revisar LED del puerto.
4. Revisar patchcord.
5. Revisar roseta y conector.
6. Revisar canalización.
7. Consultar Carrot y topología.
8. Comparar con un AP operativo.
9. Confirmar si la falla es del enlace o del equipo.
10. Solicitar reemplazo si el equipo falla.

## 26. Equipo offline

Un equipo offline puede deberse a:

- Falta de energía.
- Conector flojo.
- Patchcord defectuoso.
- Puerto incorrecto o defectuoso.
- Cableado dañado.
- Equipo dañado.
- Enlace caído.
- Diferencia de configuración o inventario.

Nunca cerrar una incidencia con un equipo offline sin dejar constancia y escalar cuando corresponda.

## 27. AP a 100 Mbps en lugar de Giga

Un AP negociando a 100 Mbps suele indicar un problema físico del enlace.

Causas posibles:

- Conector mal armado.
- Par dañado.
- Patchcord defectuoso.
- Empalme.
- Cable deteriorado o inadecuado.
- Terminación defectuosa en roseta o patch panel.

Acción:

1. Revisar roseta y conectores.
2. Probar otro patchcord.
3. Revisar canalización.
4. Corregir el punto defectuoso.
5. Verificar nuevamente la negociación a Giga.
6. Tomar evidencia antes del cierre.

## 28. Reemplazo de equipos

- Solicitar el reemplazo a Mesa de Ayuda.
- No utilizar equipos no asignados.
- Registrar serial del equipo retirado como **BAJA**.
- Registrar serial del equipo instalado como **ALTA**.
- Rotular el equipo nuevo.
- Confirmar que quede online.
- Actualizar Carrot.
- Actualizar actas.
- Verificar que serial físico, Carrot y actas coincidan.

## 29. Cuándo resolver y cuándo escalar

### Puede resolverse en el predio, según procedimiento

- Conector o patchcord flojo.
- Puerto incorrecto.
- Rotulado faltante.
- Tapas y precintos faltantes.
- Orden y limpieza.
- Reinicio autorizado.
- Corrección de canalización dentro del alcance.

### Debe escalarse a Mesa de Ayuda

- Condición eléctrica insegura.
- Intervención fuera de habilitación.
- Equipo dañado que requiere reemplazo.
- ISP caído o sin servicio.
- Diferencias entre Carrot, actas y equipos.
- Extravío de equipos.
- Bloqueo de ingreso.
- Situación no contemplada o sin certeza técnica.

---

# PARTE VI — CARROT Y SEGUIMIENTO

## 30. Uso operativo de Carrot

### Antes de la visita

- Verificar estado real del predio.
- Revisar tarea e incidencia.
- Consultar topología y equipos.
- Enviar el predio a Mesa de Ayuda para confirmación y lanzamiento.

### Durante la tarea

- Actualizar el estado del técnico.
- Contrastar sistema con instalación física.
- Informar diferencias antes de retirarse.

### Al cerrar

- Verificar equipos online.
- Verificar topología.
- Confirmar seriales.
- Registrar producción y resultado.
- Completar el estado final.

## 31. Información existente en Carrot

- Predios realizados por técnico.
- Conformes.
- No conformes.
- Producción diaria.
- Producción semanal.
- Producción mensual.
- Producción total.

## 32. Indicadores recomendados

### Porcentaje de conformidad

**Conformes ÷ Predios realizados × 100**

### Promedio semanal por técnico

Permite identificar técnicos:

- Sobre el objetivo.
- Cerca del objetivo.
- Por debajo del objetivo.

### Estado visual

- 🟢 En objetivo.
- 🟡 En desarrollo.
- 🔴 Requiere intervención.

### Tendencia

- ↑ Está mejorando.
- → Se mantiene.
- ↓ Está empeorando.

Carrot debe ser simple y útil. No debe convertirse en una carga administrativa manual excesiva.

---

# PARTE VII — ACTAS Y DOCUMENTACIÓN

## 33. Requisitos generales de todas las actas

- Completar todos los campos.
- Usar letra manuscrita clara y legible.
- Mantener el mismo color de tinta y tipo de letra.
- Incluir firma y aclaración del técnico.
- Incluir firma y aclaración de la autoridad educativa.
- Incluir sello oval de la institución.
- No utilizar corrector líquido.

## 34. Hoja 1 — Relevamiento de Red Local

Completar:

- Fecha.
- Nombre de la autoridad.
- Teléfono de contacto.
- Nombre del técnico.
- Sello.
- Existencia de equipos, marcando Sí o No.
- Cantidades de UTM, switch, AP y Z3.

## 35. Hoja 2 — ABM

Registrar:

- Tipo de equipo: AP, UTM, switch u otro.
- Acción: Alta o Baja.
- S/N correcto.
- Ubicación actual.
- Ubicación destino o estado.

### Valores de referencia

- Equipo nuevo: ubicación actual **Dinatech**.
- Equipo retirado por falla: destino **Dinatech**.
- Equipo no localizado: estado **EXTRAVIADO**, cuando corresponda y esté confirmado.

## 36. Hoja 3 — Detalle de Red Local

Requisitos críticos:

- Doble firma.
- Sello de la institución.
- Seriales de equipos.
- En reemplazos:
  - Serial nuevo seguido de **(ALTA)**.
  - Serial anterior seguido de **(BAJA)**.
- Marcar la tarea realizada.
- Marcar el ámbito correspondiente.

## 37. Hoja 5 — Conectividad

Registrar el tipo y estado de conexión:

- Proyecto PNCE.
- Conexión propia.
- Módem 4G.
- Aclaraciones necesarias.

Ejemplo de aclaración: se utilizó conexión temporal para validar equipos ante microcortes.

## 38. Hoja 6 — Detalle de Tareas Realizadas

Describir brevemente las acciones ejecutadas.

Ejemplos:

- Se realizó limpieza y emprolijado del rack.
- Se instaló filtro Ethernet.
- Se reemplazó un AP por mal funcionamiento.
- Se corrigió canalización.
- Se verificó conectividad y equipos online.

## 39. Regla de consistencia documental

El serial debe ser el mismo en:

- Equipo físico.
- Carrot.
- Hoja 2, si existe ABM.
- Hoja 3.
- Descripción de evidencia cuando se exige serial.

Una inconsistencia de serial puede generar rechazo aunque el equipo funcione.

---

# PARTE VIII — EVIDENCIA FOTOGRÁFICA

## 40. Principio general

Las fotografías son la validación final del trabajo. Deben ser:

- Frontales.
- Nítidas.
- Bien iluminadas.
- Correctamente orientadas.
- Legibles.
- Suficientes.
- Con contexto.
- Coherentes con las actas y Carrot.

Utilizar el ícono **+** de la app EDUCAR para agregar todas las fotografías necesarias.

Una foto debe responder:

1. **Qué** se está mostrando.
2. **Dónde** está instalado.
3. **En qué estado** quedó.

## 41. Evidencia del rack

Debe verse:

- Rack limpio.
- Rack rotulado.
- Cableado emprolijado.
- PDU visible.
- LEDs de equipos.
- Interior con puerta abierta.
- Exterior con puerta cerrada cuando corresponda.

Si la PDU no se ve en la toma general, agregar otra foto desde un ángulo que permita demostrar que está dentro del rack.

## 42. Protector Ethernet y filtro de tensión

Para cada protección:

1. Foto general del rack mostrando ubicación.
2. Foto cercana con serial legible.
3. Escribir manualmente el serial en la descripción de la foto cercana cuando corresponda.

## 43. AP y canalización

Fotografiar como mínimo:

- **40% de los AP** del predio.
- **40% de la canalización** del predio.
- Siempre redondear hacia arriba.

### Evidencia mínima por AP

1. Caja abierta, mostrando cableado prolijo y AP rotulado.
2. LED azul encendido, demostrando funcionamiento.
3. Primer plano con número de serie legible.
4. Parte de la canalización relacionada.

### Aclaraciones necesarias

Indicar en descripción y actas cuando:

- El cable entra por detrás.
- Ingresa por bandeja de datos.
- Ingresa por caño de PVC.
- Existen precintos blancos o pintados que podrían no verse en la foto.

## 44. Evidencia de funcionamiento

Según el alcance, puede incluir:

- Topología del predio.
- AP online.
- AP conectados en Giga.
- Cobertura o irradiación con MAC.
- Navegación por los SSID requeridos.
- Estado del módem.
- LEDs de UTM, switch, filtro y AP.

## 45. Errores fotográficos que generan rechazo

- Foto faltante.
- Cronograma incompleto.
- Foto oscura.
- Foto movida.
- Foto invertida.
- Foto demasiado lejana.
- Serial ilegible.
- Falta de contexto.
- PDU no visible.
- AP sin evidencia de funcionamiento.
- Canalización no evidenciada.
- Descripción ausente o insuficiente.

---

# PARTE IX — NO CONFORMES FRECUENTES

## 46. Estadística analizada

La captura disponible analiza **53 predios**. Un mismo predio puede tener más de una causa de rechazo, por lo que los porcentajes no deben sumarse como categorías excluyentes.

| Causa de no conformidad | Predios | Porcentaje sobre 53 |
|---|---:|---:|
| Evidencias faltantes / recargar cronograma completo | 17 | 32% |
| Piso, switch o AP quedó offline o en mesh | 10 | 19% |
| Rack/gabinete sin limpieza, foto oscura/invertida o sin rotular | 9 | 17% |
| Actas incompletas, serial no coincide o inconsistencias | 9 | 17% |
| AP a 100 Mbps, debe quedar en Giga | 8 | 15% |
| Protector Ethernet o de tensión faltante o mal instalado | 7 | 13% |
| Canalización insuficiente, sin precintar o sin croquis | 7 | 13% |
| PDU sin evidenciar | 6 | 11% |
| ABM/administrativo: equipos extraviados o serial por regularizar | 6 | 11% |
| Enlace, WAN2 o módem del ISP no corresponde al proyecto | 5 | 9% |
| Predio no visitado, lejano o no permiten ingresar | 4 | 8% |
| AP dejado dentro del rack o mal ubicado | 3 | 6% |
| Migración de red, unificación o retiro de equipos de baja | 2 | 4% |

## 47. Interpretación de los NC

La mayoría de los rechazos se relaciona con:

- Evidencia faltante o deficiente.
- Equipos que no fueron probados antes de cerrar.
- Falta de orden, limpieza o rotulado.
- Actas y seriales inconsistentes.

Esto significa que una parte importante de los rechazos puede evitarse mediante un buen control final.

## 48. Prevención de los principales NC

### Evidencia faltante

- Revisar el listado requerido antes de retirarse.
- Abrir las fotos en pantalla y confirmar nitidez.
- Agregar tomas de contexto y detalle.

### Equipos offline o en mesh

- Revisar topología.
- Confirmar LEDs.
- Probar enlace.
- No cerrar con equipos offline sin escalar.

### Rack deficiente

- Limpiar.
- Ordenar.
- Rotular.
- Tomar fotos claras y correctamente orientadas.

### Actas y seriales

- Comparar equipo, Carrot y actas.
- Confirmar firmas y sellos.
- Registrar alta y baja.

### AP a 100 Mbps

- Revisar conectores, patchcord, roseta y cable.
- Corregir enlace.
- Confirmar Giga.

### Protecciones

- Confirmar presencia, instalación y conexión a pletina.
- Fotografiar ubicación y serial.

### Canalización

- Colocar tapas y precintos.
- Cumplir distancias.
- Generar croquis o aclaración cuando corresponda.

### PDU

- Hacerla visible en la evidencia.
- Agregar otra toma si no aparece en la foto general.

---

# PARTE X — CIERRE DE LA INCIDENCIA

## 49. Checklist obligatorio antes de retirarse

### Funcionamiento

- [ ] UTM y switch en estado esperado.
- [ ] Puertos activos.
- [ ] AP online.
- [ ] AP en Giga cuando corresponde.
- [ ] Navegación y SSID probados según alcance.
- [ ] Módem y WAN conectados correctamente.

### Instalación

- [ ] Rack limpio y ordenado.
- [ ] Equipos rotulados.
- [ ] AP fuera del rack y correctamente ubicados.
- [ ] PDU visible.
- [ ] Protecciones instaladas.
- [ ] Datos y tensión separados.
- [ ] Canalización completa.

### Sistema

- [ ] Carrot actualizado.
- [ ] Topología revisada.
- [ ] Equipos online.
- [ ] Seriales correctos.

### Actas

- [ ] Campos completos.
- [ ] Firma y aclaración del técnico.
- [ ] Firma y aclaración de la autoridad.
- [ ] Sello oval.
- [ ] Doble firma y sello en Hoja 3.
- [ ] Alta y baja registradas si hubo reemplazo.

### Fotos

- [ ] Frente del predio.
- [ ] Rack abierto.
- [ ] Rack cerrado.
- [ ] Módem.
- [ ] Protector Ethernet.
- [ ] Filtro de tensión.
- [ ] AP y canalización, mínimo 40%.
- [ ] Seriales legibles.
- [ ] Topología y Giga cuando corresponda.
- [ ] Cobertura y navegación cuando corresponda.
- [ ] Actas.

> Si un punto queda pendiente, la incidencia puede reabrirse o el predio puede ser rechazado.

---

# PARTE XI — LAC DE REFERENCIA, PREDIO USAP 821193

## 50. Contenido del LAC disponible

El LAC del predio USAP **821193** contiene ejemplos de:

1. Frente del predio, portada geolocalizada.
2. Rack limpio, rotulado y cableado emprolijado, puerta abierta, dos fotografías.
3. Rack limpio, puerta cerrada.
4. Módem del ISP dentro del rack.
5. Protector Ethernet.
6. Filtro de tensión.
7. AP: instalación, canalización y rotulado, caja cerrada.
8. AP: funcionamiento y roseta, caja abierta, tres fotografías.
9. Gabinete secundario.
10. Canalizaciones, tres fotografías.
11. Topología.
12. AP conectados en Giga.
13. Cobertura o irradiación con MAC.
14. Navegación Wi-Fi por SSID, dos fotografías.
15. Evidencias adicionales.
16. Acta de Relevamiento de Red Local.
17. Acta de Detalle de Red Local.
18. Acta de Conectividad.

## 51. Uso correcto del LAC como referencia

El LAC sirve como ejemplo visual de categorías de evidencia. No debe asumirse que:

- Todos los predios tienen exactamente la misma cantidad de equipos.
- Todas las incidencias requieren exactamente las mismas fotos.
- El estado de ese predio representa el estado actual de otro predio.
- Los seriales del LAC pueden reutilizarse en otra documentación.

---

# PARTE XII — CAPACITACIÓN Y HABILITACIÓN

## 52. Estructura del curso

### Jornada 1 — 4 horas

- 09:00 a 11:00: Módulo 1.
- 11:00 a 11:20: intervalo.
- 11:20 a 13:20: Módulo 2.

#### Módulo 1

- Proyecto.
- Rol del técnico.
- Seguridad.
- Componentes.
- Flujo de incidencias.

#### Módulo 2

- Mantenimiento preventivo.
- Rack.
- Energía y protecciones.
- AP.
- Canalización.
- Carrot.
- Evidencia.
- Prácticas supervisadas.

### Jornada 2 — 4 horas

- 09:00 a 11:00: Módulo 3.
- 11:00 a 11:20: intervalo.
- 11:20 a 13:20: Módulo 4.

#### Módulo 3

- Mantenimiento correctivo.
- Diagnóstico.
- Fallas de red y energía.
- AP offline.
- Enlaces.
- Reemplazos.
- Criterios de escalamiento.

#### Módulo 4

- Actas.
- Seriales.
- Evidencia.
- NC frecuentes.
- Cierre.
- Prácticas supervisadas.

### Día 3 — Evaluación

- 09:00 a 12:00.
- Evaluación teórica.
- Evaluación práctica.
- Evaluación documental.
- Devolución individual.

## 53. Prácticas supervisadas

### Jornada 1

- Inspección guiada de rack, protecciones y AP.
- Armado del paquete fotográfico.
- Checklist preventivo.
- Detección de desvíos.

### Jornada 2

- Simulación de equipo offline o enlace caído.
- Diagnóstico.
- Decisión de corregir o escalar.
- Cierre documentado.
- Auditoría entre grupos.

La corrección debe realizarse en el momento: se marca el error, se explica la causa y se repite el procedimiento.

## 54. Evaluación

- Teórica: 30%.
- Práctica: 60%.
- Documentación: 10%.
- Aprobación: 70% total.
- Los puntos críticos de seguridad y evidencia son obligatorios.

## 55. Curva de productividad del técnico nuevo

La meta aplica después de completar satisfactoriamente la capacitación y quedar habilitado para trabajar de forma autónoma.

- Primera semana productiva: **6+ conformidades**.
- Segunda semana productiva: **7+ conformidades**.
- Tercera semana en adelante: mantener **7+** con buena calidad.

No debe confundirse la fecha de ingreso con el inicio de la primera semana productiva.

---

# PARTE XIII — ROADMAP OPERATIVO Y ESCALABILIDAD

## 56. Situación de partida del roadmap

Datos aproximados de planificación:

- 13 técnicos activos.
- 80 conformidades semanales.
- 2 técnicos principales: alrededor de 35 conformidades.
- 11 técnicos restantes: alrededor de 45 conformidades.
- Promedio de esos 11 técnicos: aproximadamente 4,1.
- Incorporación prevista: aproximadamente 2 técnicos por semana.
- Objetivo de incorporación correcta durante agosto: 6 técnicos nuevos.

Estos datos son una línea base del plan de 2026, no necesariamente el estado actual en tiempo real.

## 57. Metas del roadmap

- Fin de agosto o inicio de septiembre: **150+ conformidades semanales**.
- Fin de septiembre o inicio de octubre: **200+ conformidades semanales**.

### Capacidad teórica para 150+

- 2 técnicos principales: ~35.
- 11 técnicos actuales a 7+: ~77.
- 6 técnicos nuevos a 7+: ~42.
- Total teórico: ~154 conformidades semanales.

Las metas dependen de disponibilidad de predios, planificación y condiciones operativas.

### Cronograma por etapa

| Etapa | Período | Objetivo principal |
|---|---|---|
| Preparación | 28/07 al 31/07 | Clasificar técnicos, recopilar NC, preparar recapacitación, logística, manual, onboarding, planificación e indicadores de Carrot |
| Semana 1 | 03/08 al 07/08 | Implementar mejoras, intervenir técnicos clasificados e iniciar incorporación |
| Semana 2 | 10/08 al 14/08 | Acelerar productividad del equipo actual e iniciar primera semana productiva de técnicos habilitados |
| Semana 3 | 17/08 al 21/08 | Consolidar mejoras, llevar nuevos técnicos hacia 7+ y continuar incorporación |
| Semana 4 | 24/08 al 28/08 | Acercarse a la capacidad de 150+ e identificar el componente limitante |
| Semana 5 | 31/08 al 04/09 | Validar que 150+ sea una capacidad real, sostenible y repetible |
| Septiembre | 07/09 al 30/09 | Mantener incorporación y capacitación acelerada para escalar hacia 200+ |
| Cierre | 28/09 al 02/10 | Alcanzar o acercarse consistentemente a 200+ conformidades semanales |

### Foco por semana

**Preparación:** definir clasificación de técnicos; revisar problemas; clasificar NC; preparar recapacitación; revisar vehículos, stock, materiales y herramientas; terminar manual inicial; preparar onboarding; revisar cronogramas; definir seguimiento de nuevos técnicos e indicadores mínimos.

**Semana 1:** recapacitar según NC; corregir problemas técnicos; resolver bloqueos logísticos; ajustar planificación; comparar métodos de técnicos productivos; iniciar onboarding; realizar acompañamiento y validación de campo.

**Semana 2:** revisar quién mejoró, quién permanece estancado, qué bloqueo fue resuelto y qué técnico necesita una segunda intervención. Los nuevos técnicos habilitados buscan 6+ en su primera semana productiva.

**Semana 3:** llevar a 7+ a quienes completaron su primera semana; continuar recapacitación; corregir NC recurrentes; ajustar logística y distribución de predios. Enzo se concentra en casos que requieren intervención para no convertirse en cuello de botella.

**Semana 4:** identificar si la limitación para 150+ está en técnicos actuales, técnicos nuevos, logística, cantidad de predios, planificación, calidad o NC.

**Semana 5:** revisar producción total, promedio por técnico, porcentaje de conformidad, NC, técnicos nuevos, técnicos en 7+ y problemas recurrentes.

**Septiembre:** continuar incorporando aproximadamente 2 técnicos por semana y mantener el ciclo Capacitación → Práctica → Habilitación → 6+ → 7+, sin abandonar registro de técnicos, reingenierías, NC, cronogramas, mesa de ayuda, stock, vehículos y planificación.

## 58. Principios del roadmap

1. Primero ordenar, después acelerar.
2. Productividad y calidad crecen juntas.
3. La producción baja debe analizarse por causa.
4. Los técnicos nuevos deben salir preparados para producir.
5. No agregar burocracia innecesaria.
6. El crecimiento debe ser repetible y escalable.

## 59. Clasificación de causas de baja productividad

### A. Problema técnico

Falta de conocimientos o habilidades.

Acciones:

- Recapacitación.
- Acompañamiento con Enzo.
- Práctica supervisada.
- Evaluación.

### B. Problema de productividad

Conoce el trabajo, pero utiliza un método ineficiente.

Acciones:

- Analizar método.
- Comparar con técnicos productivos.
- Eliminar pérdidas de tiempo.
- Definir objetivos progresivos.

### C. Problema logístico

Falta de vehículo, herramientas, stock o materiales.

Responsable principal: Leonel.

El técnico no debe ser penalizado por un bloqueo logístico ajeno.

### D. Problema de planificación

La asignación, distancia o cronograma no permite producir.

Responsables: Fernando + Ulises.

### E. Problema de calidad

Produce, pero genera demasiadas NC.

Acciones:

- Clasificar NC.
- Detectar patrones.
- Recapacitar.
- Acompañar.
- Verificar mejora.

### F. Problema de rendimiento individual

Tiene conocimiento, recursos, planificación y capacitación, pero mantiene baja producción sin causa operativa.

Acción: evaluación individual con Fernando.

## 60. Sistema de 5 estrellas

### ★ 1 — Técnico en desarrollo

Puede ejecutar tareas, pero necesita seguimiento frecuente.

### ★★ 2 — Técnico habilitado

Puede trabajar de forma autónoma en trabajos estándar.

### ★★★ 3 — Técnico productivo

Alcanza aproximadamente 7+ conformidades semanales con calidad aceptable.

### ★★★★ 4 — Técnico consolidado

Mantiene productividad y calidad de forma consistente y resuelve situaciones habituales con autonomía.

### ★★★★★ 5 — Técnico referente

Tiene alta productividad, calidad y autonomía. Puede resolver casos complejos, apoyar a otros y capacitar.

La estrella no reemplaza los KPI.

## 61. Responsabilidades generales

| Persona | Responsabilidad principal |
|---|---|
| Fernando | Dirección, planificación, cronogramas, prioridades y decisiones |
| Leonel | Vehículos, stock, logística, materiales, recursos e instructivos |
| Damián | Mesa de ayuda y apoyo en el manual operativo |
| Enzo | Formación, acompañamiento y validación técnica de campo |
| Ulises | Sistemas, automatización, métricas, análisis y apoyo a planificación |

## 62. Reunión semanal de seguimiento

Debe responder:

1. ¿Cuántas conformidades se realizaron?
2. ¿Cuál fue el porcentaje de conformidad?
3. ¿Quién está por debajo del objetivo y por qué?
4. ¿Qué problema debe resolverse esa semana?
5. ¿Se avanza hacia 150 y luego 200?

Debe terminar con:

- Problema.
- Responsable.
- Acción.
- Fecha.

### Decisiones operativas previstas en el roadmap

- Confirmar inicio operativo del plan.
- Confirmar meta de 150+ para fin de agosto o inicio de septiembre.
- Confirmar meta de 200+ para fin de septiembre o inicio de octubre.
- Confirmar estándar de 6+ en primera semana productiva y 7+ desde la segunda.
- Confirmar clasificación de técnicos por causa.
- Confirmar sistema de 5 estrellas.
- Confirmar responsabilidades.
- Confirmar a Leonel + Damián como responsables del manual operativo.
- Definir mejoras logísticas prioritarias.
- Definir recapacitaciones basadas en NC.
- Definir indicadores mínimos adicionales de Carrot.
- Definir metodología de seguimiento semanal.
- Evaluar jornadas de sábado para capacitación o retiro de materiales sin asumirlas como parte fija del plan hasta su confirmación.

---

# PARTE XIV — PREGUNTAS FRECUENTES PARA EL CHATBOT

## 63. FAQ operativa

### ¿Qué hago antes de ir a un predio?

Revisá la incidencia y el estado del predio en Carrot, confirmá la tarea con Mesa de Ayuda, verificá materiales, herramientas y equipos asignados, y revisá antecedentes y topología.

### ¿Qué hago si no me dejan entrar?

No discutas ni improvises. Comunicate inmediatamente con Mesa de Ayuda THNET y registrá la situación.

### ¿Qué datos valido al ingresar?

Nombre de la institución, CUE, autoridad, ubicación de equipos, rack, tipo de conectividad y antecedentes de microcortes o problemas eléctricos.

### ¿Puedo dejar el rack como lo encontré?

No. La regla de oro indica que nunca debe quedar sucio o desordenado.

### ¿Qué LEDs debo observar?

Como referencia del manual: UTM y switch en blanco, filtro de tensión en azul y puertos activos en verde. Si no coincide, se debe diagnosticar.

### ¿Qué hago si el filtro de tensión está apagado?

Si el rack tiene tensión y el testigo azul del filtro está apagado, el manual lo considera fuera de servicio. Debe gestionarse su reemplazo según procedimiento.

### ¿Dónde se conecta PNCE?

A WAN1 del UTM, desde la salida del protector RJ45.

### ¿Dónde se conecta la conexión propia de la escuela?

A WAN2 del UTM, verificando el tipo de conexión en la Hoja 5.

### ¿Qué pasa si PNCE está inactivo?

Debe quedar igualmente conectado a WAN1 y la situación debe documentarse y escalarse cuando corresponda.

### ¿Dónde debe estar el módem?

Dentro del rack, preferentemente en la bandeja superior. Si no puede reubicarse, debe quedar conectado mediante UTP canalizado y con evidencia de posición y recorrido.

### ¿Puede quedar un AP dentro del rack?

No. Está expresamente prohibido. Si se encuentra uno, se toma evidencia en EDUCAR y se reporta a Mesa de Ayuda.

### ¿Qué hago si un AP está offline?

Revisá energía, puerto, LED, patchcord, roseta, cableado, canalización y estado en Carrot. Si el equipo falla, solicitá reemplazo a Mesa de Ayuda.

### ¿Qué hago si un AP queda a 100 Mbps?

Revisá el enlace físico: conectores, roseta, patchcord, pares y cableado. Corregí el punto defectuoso y verificá que negocie en Giga antes de cerrar.

### ¿Cada cuánto van los precintos interiores?

Cada 1 metro.

### ¿Cada cuánto van los precintos exteriores?

Cada 60 cm.

### ¿Qué debe tener un rack secundario?

Switch, patch panel, organizador, filtro de tensión, pletina, protector Ethernet, térmica y disyuntor.

### ¿Qué hago con un rack instalado en altura?

Colocá cinta de demarcación en el suelo proyectando su sombra para evitar que ubiquen muebles debajo.

### ¿Puedo reemplazar un equipo por mi cuenta?

No con un equipo no asignado. El reemplazo se gestiona con Mesa de Ayuda y debe registrarse como alta y baja, actualizar Carrot y verificar seriales.

### ¿Qué firmas necesita la Hoja 3?

Doble firma y sello de la institución, además de los datos y seriales requeridos.

### ¿Puedo usar corrector líquido en un acta?

No.

### ¿Cómo registro un reemplazo en Hoja 3?

Serial nuevo seguido de **(ALTA)** y serial anterior seguido de **(BAJA)**.

### ¿Cuántos AP debo fotografiar?

Como mínimo 40% de los AP, redondeando hacia arriba.

### ¿Cuánta canalización debo fotografiar?

Como mínimo 40%, redondeando hacia arriba.

### ¿Qué fotos necesita un AP?

Caja abierta con cableado y rotulado, LED azul de funcionamiento y primer plano del serial legible, además de canalización relacionada.

### ¿Qué fotos necesita el protector Ethernet o filtro de tensión?

Foto general de ubicación y primer plano del serial. Cuando corresponde, el serial debe escribirse en la descripción de la foto.

### ¿Qué debe verse en la foto del rack?

Limpieza, rotulado, cableado ordenado, PDU, LEDs y contexto suficiente. Agregá otra toma si algún elemento no es visible.

### ¿Por qué rechazan más los predios?

La causa más frecuente del análisis fue evidencia faltante o cronograma incompleto: 17 de 53 predios, 32%. Luego equipos offline o en mesh: 10, 19%.

### ¿Qué hago si una foto salió oscura o movida?

Repetila antes de retirarte. La evidencia debe ser nítida, legible, bien orientada y suficiente.

### ¿Cuándo está cerrada una incidencia?

Cuando el servicio fue probado, la instalación quedó segura y ordenada, Carrot está actualizado, las actas están completas, los seriales coinciden y la evidencia está cargada.

### ¿Qué hago si Carrot no coincide con el equipo físico?

No cierres sin informar. Verificá el serial, documentá la diferencia y escalá a Mesa de Ayuda.

### ¿Qué hago si encuentro una condición eléctrica insegura?

Detené la intervención y escalá. No trabajes energizado ni improvises soluciones.

### ¿Cuál es la meta productiva de un técnico nuevo?

Después de capacitación y habilitación: 6+ conformidades en la primera semana productiva y 7+ desde la segunda, manteniendo calidad.

### ¿Habilitado y consolidado significan lo mismo?

No. Habilitado puede trabajar de forma autónoma en tareas estándar. Consolidado mantiene productividad y calidad de forma consistente.

---

# PARTE XV — REGLAS DE RESPUESTA DEL CHATBOT

## 64. Estilo de respuesta recomendado

El chatbot debe:

- Responder en español claro y directo.
- Priorizar pasos accionables.
- Usar listas numeradas para procedimientos.
- Señalar advertencias de seguridad antes de instrucciones técnicas.
- Indicar qué evidencia y documentación se necesita.
- Mencionar Mesa de Ayuda cuando la situación requiere autorización o escalamiento.
- Distinguir entre “debe”, “se recomienda” y “objetivo del roadmap”.

## 65. Plantilla de respuesta operativa

Para consultas sobre una incidencia, responder preferentemente con:

1. **Qué verificar.**
2. **Qué acción realizar.**
3. **Cuándo escalar.**
4. **Cómo probar.**
5. **Qué registrar en Carrot y actas.**
6. **Qué fotos tomar.**

## 66. Respuesta ante falta de información

Si la base no contiene la respuesta exacta:

> “No tengo un procedimiento confirmado para esa situación. No realices una intervención no autorizada. Consultá a Mesa de Ayuda THNET e informá el predio, la incidencia, el equipo afectado, el estado observado y la evidencia disponible.”

## 67. Respuesta ante riesgo

> “Detené la tarea y asegurá el área. No intervengas una instalación energizada ni improvises una solución. Escalá a Mesa de Ayuda o al referente técnico.”

## 68. Datos que el chatbot debe solicitar cuando correspondan

- ID del predio.
- CUE.
- Número de incidencia.
- Equipo afectado.
- Serial.
- Estado en Carrot.
- LEDs observados.
- Alcance: equipo, sector o predio completo.
- Cambios realizados.
- Fotos disponibles.
- Mensaje de error.
- Tipo de conectividad.

No debe solicitar contraseñas, tokens ni secretos.

---

# PARTE XVI — RESUMEN EJECUTIVO

## 69. Principios que concentran toda la base

1. Verificar antes de intervenir.
2. Priorizar seguridad.
3. Diagnosticar la causa, no sólo el síntoma.
4. Corregir dentro del procedimiento y escalar lo que excede el alcance.
5. Probar antes de cerrar.
6. Mantener rack, AP y canalizaciones limpios, ordenados y rotulados.
7. Hacer coincidir equipo físico, Carrot, actas y seriales.
8. Tomar evidencia completa, nítida y contextual.
9. No cerrar con equipos offline ni puntos pendientes sin registrar.
10. Productividad y calidad deben crecer juntas.

> **Flujo final:** Incorporar → Capacitar → Habilitar → Verificar → Diagnosticar → Intervenir → Probar → Documentar → Medir → Corregir → Escalar.
