/**
 * Slash-commands del chat (uso de Mesa de Ayuda): al enviar el comando, el
 * servidor reemplaza el contenido por el texto del comando. El registro se
 * comparte entre el server (expansión) y el composer (autocompletado).
 */
export interface ChatComando {
  nombre: string;       // ej "/auditar"
  descripcion: string;  // se muestra en el autocompletado
  cuerpo: string;       // texto que se envía
}

const CUERPO_AUDITAR = `📋 Checklist antes de enviar el LAC

1) Actas completas: fecha, equipos, firma y sello.
2) Verificar de nuevo por Carrot la velocidad de los AP y el estado de los equipos.
3) Puerto WAN correcto según corresponda (1 o 2).
4) Verificar PDU, Filtro de Ethernet, Filtro de Tensión, Módem, Patchera, Puertos de Switch y UTM. Todos los equipos deben verse desde la foto del rack con la puerta abierta; si alguno no se ve correctamente, adjuntar fotos de cerca para ver puertos, luces de encendido o conexiones bien realizadas.
5) Irradiación MAC.
6) Canalización presintada, o aclarado en el acta en caso de no verse.
7) Cualquier mínimo desperfecto (baja tensión, mal internet, detalles) debe quedar siempre aclarado en las actas.`;

export const CHAT_COMANDOS: ChatComando[] = [
  {
    nombre: "/auditar",
    descripcion: "Checklist de revisión antes de enviar el LAC",
    cuerpo: CUERPO_AUDITAR,
  },
];

/** Si el texto es un slash-command conocido, devuelve su cuerpo; si no, null. */
export function expandirComandoChat(texto: string): string | null {
  const t = (texto || "").trim().toLowerCase();
  if (!t.startsWith("/")) return null;
  const cmd = CHAT_COMANDOS.find((c) => t === c.nombre || t.startsWith(c.nombre + " "));
  return cmd ? cmd.cuerpo : null;
}
