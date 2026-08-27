/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Compacta la respuesta del mapa con un diccionario.
 *
 * El problema medido: de los 1.264 KB que pesaba el mapa con 2.525 predios, **514 KB
 * (41%) eran unos pocos valores repetidos miles de veces**. Hay 13 estados, 4 provincias,
 * 4 ámbitos, 6 tipos y unos 40 técnicos, pero cada predio se llevaba el texto completo:
 * `{"id":"...","nombre":"SIN ASIGNAR","color":"#94a3b8"}` repetido 2.262 veces.
 *
 * La solución es la de siempre para esto: mandar cada valor UNA vez en un diccionario y
 * que cada predio lleve un número. Escala bien porque el diccionario no crece con la
 * cantidad de predios — con 10.000 sigue teniendo 13 estados.
 *
 * El cliente rehidrata apenas recibe, así que de ahí en adelante los predios tienen
 * exactamente la misma forma que antes: `p.estado.nombre` sigue funcionando y ninguna
 * pantalla que los consuma se entera del cambio.
 */

/** Campos de texto de baja cardinalidad que van al diccionario. */
const CAMPOS_TEXTO = ["provincia", "ambito", "tipo", "lacR", "espacioId"] as const;
type CampoTexto = (typeof CAMPOS_TEXTO)[number];

export interface MapaCompacto {
  /** Diccionarios: cada valor aparece una vez y los predios lo referencian por índice. */
  dic: {
    estados: Array<{ id: string; nombre: string; color: string }>;
    tecnicos: string[];
  } & Record<CampoTexto, string[]>;
  predios: any[];
}

/** Índice de `valor` en `lista`, agregándolo si es nuevo. */
function indice(lista: string[], mapa: Map<string, number>, valor: string): number {
  const ya = mapa.get(valor);
  if (ya !== undefined) return ya;
  const i = lista.length;
  lista.push(valor);
  mapa.set(valor, i);
  return i;
}

/** Arma la respuesta compacta a partir de los predios tal como salen de Prisma. */
export function comprimirMapa(predios: any[]): MapaCompacto {
  const estados: Array<{ id: string; nombre: string; color: string }> = [];
  const estadoIdx = new Map<string, number>();
  const tecnicos: string[] = [];
  const tecnicoIdx = new Map<string, number>();

  const textos = {} as Record<CampoTexto, string[]>;
  const textosIdx = {} as Record<CampoTexto, Map<string, number>>;
  for (const c of CAMPOS_TEXTO) { textos[c] = []; textosIdx[c] = new Map(); }

  const compactados = predios.map((p) => {
    const out: any = {
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      direccion: p.direccion,
      ciudad: p.ciudad,
      nombreInstitucion: p.nombreInstitucion,
      latitud: p.latitud,
      longitud: p.longitud,
      fechaDesde: p.fechaDesde,
      fechaHasta: p.fechaHasta,
    };

    if (p.estado) {
      const clave = p.estado.id;
      let i = estadoIdx.get(clave);
      if (i === undefined) {
        i = estados.length;
        estados.push({ id: p.estado.id, nombre: p.estado.nombre, color: p.estado.color });
        estadoIdx.set(clave, i);
      }
      out.e = i;
    }

    for (const c of CAMPOS_TEXTO) {
      const v = p[c];
      if (v != null && v !== "") out[c[0] + c[1]] = indice(textos[c], textosIdx[c], String(v));
    }

    const nombres = (p.asignaciones || [])
      .map((a: any) => a.usuario?.nombre)
      .filter(Boolean) as string[];
    if (nombres.length) out.t = nombres.map((n) => indice(tecnicos, tecnicoIdx, n));

    return out;
  });

  return { dic: { estados, tecnicos, ...textos }, predios: compactados };
}

/**
 * Deshace la compresión. Devuelve los predios con la MISMA forma de siempre, para que
 * las pantallas que los consumen no tengan que cambiar nada.
 *
 * Acepta también un array suelto: durante un deploy puede quedar una respuesta de la
 * versión anterior en vuelo o cacheada.
 */
export function rehidratarMapa(resp: any): any[] {
  if (Array.isArray(resp)) return resp;
  const dic = resp?.dic;
  const predios = resp?.predios;
  if (!dic || !Array.isArray(predios)) return [];

  return predios.map((p: any) => {
    const out: any = { ...p };
    out.estado = p.e != null ? dic.estados[p.e] ?? null : null;
    delete out.e;

    for (const c of CAMPOS_TEXTO) {
      const clave = c[0] + c[1];
      out[c] = p[clave] != null ? dic[c]?.[p[clave]] ?? null : null;
      delete out[clave];
    }

    out.asignaciones = (p.t || []).map((i: number) => ({ usuario: { nombre: dic.tecnicos[i] ?? null } }));
    delete out.t;
    return out;
  });
}
