/**
 * El identificador TH que le corresponde a un técnico, propio o heredado de su
 * coordinador.
 *
 * Por qué existe: los técnicos a cargo de un coordinador trabajan bajo el TH de él.
 * Gustavo Vinti y Sergio Avola están a cargo de Ariel Maioli (TH09), y todo lo que
 * hacen se reporta como TH09 — que es lo que espera el cliente en la columna DNI de
 * los cronogramas.
 *
 * Se calcula en vez de guardarse, por dos razones:
 *
 *  - Si se copiara, cambiar el TH del coordinador obligaría a acordarse de actualizar
 *    a mano el de cada técnico a cargo, y tarde o temprano quedan desincronizados.
 *  - Guardar el mismo número en varios usuarios choca con la regla de unicidad de
 *    `thNumero` (ver api/usuarios), que existe para que un TH identifique a una sola
 *    persona. Heredarlo respeta esa regla: el número sigue perteneciendo al
 *    coordinador, los demás lo usan.
 *
 * Ojo con lo que NO hace: compartir el TH no une a los técnicos en el ranking ni en la
 * facturación. Ahí cada uno cuenta por separado, porque agrupan por nombre y no por TH.
 * Si además se quisiera que sumen como un solo equipo, eso se define en EQUIPOS
 * (utils/equipoUtils), que es otra cosa.
 */

export interface ConTh {
  thNumero?: number | null;
  coordinadorId?: string | null;
}

/**
 * `thNumero` propio si lo tiene; si no, el de su coordinador.
 *
 * @param usuario       el técnico
 * @param thPorUsuario  mapa `userId -> thNumero` con al menos los coordinadores
 */
export function thEfectivo(usuario: ConTh, thPorUsuario: Map<string, number | null>): number | null {
  if (usuario.thNumero != null) return usuario.thNumero;
  if (!usuario.coordinadorId) return null;
  return thPorUsuario.get(usuario.coordinadorId) ?? null;
}

/** true si el TH que muestra no es suyo sino de su coordinador. */
export function thEsHeredado(usuario: ConTh, thPorUsuario: Map<string, number | null>): boolean {
  return usuario.thNumero == null && thEfectivo(usuario, thPorUsuario) != null;
}

/** "TH09". Vacío si no tiene ninguno. */
export function formatTh(n: number | null | undefined): string {
  return n == null ? "" : `TH${String(n).padStart(2, "0")}`;
}

/**
 * Mapa `userId -> thNumero` para resolver herencias. Alcanza con los coordinadores,
 * pero se arma con todos para no tener que filtrar en cada llamada.
 */
export function mapaTh(usuarios: Array<{ id: string; thNumero?: number | null }>): Map<string, number | null> {
  return new Map(usuarios.map((u) => [u.id, u.thNumero ?? null]));
}
