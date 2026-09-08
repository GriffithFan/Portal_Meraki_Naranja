/**
 * De dónde se lee el motivo de un rechazo, y de dónde no.
 *
 * El primer test es el que importa: `Predio.incidencias` guarda el CÓDIGO de la
 * incidencia ("NI-000129814"), y tres de las cuatro copias que existían de esta lógica lo
 * devolvían como si fuera el motivo. Para cualquier predio con código —casi todos— el
 * análisis de no conformidades venía reportando códigos, y el clasificador los mandaba a
 * "Otros motivos" porque un código no matchea ninguna palabra. Nadie se enteró porque no
 * falla: sale un número, sólo que no significa nada.
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORIA_OTROS,
  CATEGORIA_SIN_DETALLE,
  clasificarMotivo,
  motivoNoConformidad,
  palabrasClave,
  terminosFrecuentes,
} from "@/lib/noConformidades";

const comentario = (contenido: string, autor = "Técnico 01", fecha = "2026-09-01T10:00:00Z") => ({
  contenido,
  createdAt: fecha,
  usuario: { nombre: autor },
});

describe("motivoNoConformidad", () => {
  it("toma el ÚLTIMO comentario, que es donde queda el motivo", () => {
    const r = motivoNoConformidad({
      comentarios: [comentario("Falta la foto del rack"), comentario("Instalado")],
    });
    expect(r.motivo).toBe("Falta la foto del rack");
    expect(r.fuente).toBe("comentario");
    expect(r.autor).toBe("Técnico 01");
    // La fecha sale siempre en dd/mm/aaaa, venga del texto del portal o del createdAt
    // del comentario: quien lee el informe no tiene por qué distinguir de dónde vino.
    expect(r.fecha).toBe("01/09/2026");
  });

  it("NUNCA usa el código de incidencia como motivo", () => {
    // El bug que este módulo corrige: un código no explica nada, y colarlo acá dejaba el
    // análisis lleno de "NI-000129814" clasificados como "Otros motivos".
    const r = motivoNoConformidad({
      // @ts-expect-error — a propósito: el tipo no acepta `incidencias`, y aunque llegue
      // por un objeto más ancho, no se lee.
      incidencias: "NI-000129814",
      notas: "",
      comentarios: [],
    });
    expect(r.motivo).toBe("");
    expect(r.fuente).toBeNull();
  });

  it("NUNCA usa la descripción: es la orden de trabajo, no el motivo", () => {
    // Verificado en producción: los 66 NO CONFORME tienen `descripcion` llena y dice casi
    // lo mismo en todos ("Se solicita asistir al Predio a normalizar el Piso..."). Es lo
    // que se PIDIÓ, no por qué rebotó. Sumarla llenaría el análisis de palabras de la
    // orden de trabajo en vez del rechazo.
    const r = motivoNoConformidad({
      // @ts-expect-error — a propósito: el tipo no la acepta y aunque llegue, no se lee.
      descripcion: "Se solicita asistir al Predio a normalizar el Piso con equipos offline",
      notas: "",
      comentarios: [],
    });
    expect(r.motivo).toBe("");
  });

  it("cae a la nota del técnico cuando no hay comentarios", () => {
    const r = motivoNoConformidad({ notasTecnico: "Quedó sin patchera", comentarios: [] });
    expect(r.motivo).toBe("Quedó sin patchera");
    expect(r.fuente).toBe("nota-tecnico");
  });

  // ── La forma real que llega del portal (verificada contra producción) ──
  it("saca el encabezado y se queda con el ÚLTIMO rechazo", () => {
    const r = motivoNoConformidad({
      notas: [
        "Comentarios de incidencia NI-000164063:",
        "• 01/09/2026 — Por favor adjuntar actas legibles. AK",
        "• 08/09/2026 — 7.2 Por favor verificar S/N del acta.",
      ].join("\n"),
    });
    expect(r.motivo).toBe("7.2 Por favor verificar S/N del acta.");
    expect(r.fecha).toBe("08/09/2026");
    expect(r.rebotes).toBe(2);
    expect(r.entradas[0].texto).toBe("Por favor adjuntar actas legibles. AK");
  });

  it("cuenta los rebotes, que es cuántas veces volvió el mismo predio", () => {
    const tres = motivoNoConformidad({
      notas: "• 01/01/2026 — uno\n• 02/01/2026 — dos\n• 03/01/2026 — tres",
    });
    expect(tres.rebotes).toBe(3);
    expect(tres.motivo).toBe("tres");
  });

  it("un texto escrito a mano, sin el formato del portal, no se pierde", () => {
    const r = motivoNoConformidad({ notas: "rebotó porque faltaba el protector" });
    expect(r.motivo).toBe("rebotó porque faltaba el protector");
    expect(r.rebotes).toBe(1);
    expect(r.fecha).toBeNull();
  });

  it("junta la continuación de un rechazo cortado en varias líneas", () => {
    const r = motivoNoConformidad({
      notas: "• 08/09/2026 — Por favor verificar el rack\ny también el modem",
    });
    expect(r.motivo).toBe("Por favor verificar el rack y también el modem");
    expect(r.rebotes).toBe(1);
  });

  it("extrae el punto de checklist que citó quien auditó", () => {
    const r = motivoNoConformidad({ notas: "• 03/09/2026 — 2.1 no se observa el Z3 conectado, 4.2 falta" });
    expect(r.puntos).toEqual(["2.1", "4.2"]);
  });

  it("cae a la nota general como último recurso", () => {
    const r = motivoNoConformidad({ notas: "Rebotó por actas" });
    expect(r.motivo).toBe("Rebotó por actas");
    expect(r.fuente).toBe("nota");
  });

  it("prefiere el comentario a las notas cuando hay de las dos", () => {
    const r = motivoNoConformidad({
      notas: "una nota vieja",
      notasTecnico: "otra nota vieja",
      comentarios: [comentario("el motivo de verdad")],
    });
    expect(r.motivo).toBe("el motivo de verdad");
  });

  it("dice que no hay motivo en vez de inventar uno", () => {
    for (const p of [{}, { notas: "   ", comentarios: [] }, { comentarios: null }]) {
      expect(motivoNoConformidad(p).motivo).toBe("");
    }
  });

  it("no se rompe con un comentario sin autor ni fecha", () => {
    const r = motivoNoConformidad({ comentarios: [{ contenido: "algo" }] });
    expect(r.motivo).toBe("algo");
    expect(r.autor).toBeNull();
    expect(r.fecha).toBeNull();
  });
});

describe("clasificarMotivo", () => {
  it("agrupa lo que escriben los técnicos", () => {
    const casos: Array<[string, string]> = [
      ["Falta la foto del frente", "Evidencias (faltan o no se ven)"],
      ["Las imágenes están borrosas", "Evidencias (faltan o no se ven)"],
      ["El acta no está firmada", "Actas y documentación"],
      ["Coordenadas GPS mal cargadas", "GPS y ubicación"],
      ["Faltó el rotulado del switch", "Rotulado y datos técnicos"],
      ["Cableado mal hecho en el rack", "Instalación física (rack, canalizado, equipos)"],
      ["No había nadie, escuela cerrada", "Acceso y visita"],
      // Calibrados sobre lo que de verdad escriben (muestra de producción, 09/2026):
      ["Por favor evidenciar protector de tension de forma clara", "Evidencias (faltan o no se ven)"],
      ["Por favor verificar AP Q2PD-V9V6-4QE3 en 10Mbit", "Enlace y conectividad"],
      ["Verificar AP Q2PD-P9V6-LR7B se encuentra OFF LINE", "Enlace y conectividad"],
      ["Por favor realizar la limpieza correcta del rack", "Instalación física (rack, canalizado, equipos)"],
      ["7.2 Acta incompleta falta serial de SWITCH", "Actas y documentación"],
    ];
    for (const [texto, esperado] of casos) {
      expect(clasificarMotivo(texto)).toBe(esperado);
    }
  });

  it("distingue 'nadie escribió nada' de 'escribieron algo que no encaja'", () => {
    // Son dos problemas distintos: el primero es de proceso, el segundo de calibración.
    // Mezclarlos escondería cuál de los dos se está mirando.
    expect(clasificarMotivo("")).toBe(CATEGORIA_SIN_DETALLE);
    expect(clasificarMotivo("   ")).toBe(CATEGORIA_SIN_DETALLE);
    expect(clasificarMotivo("el cliente pidió otra cosa")).toBe(CATEGORIA_OTROS);
  });

  it("un código de incidencia no es ninguna categoría conocida", () => {
    // Si esto empieza a aparecer mucho, alguien volvió a meter `incidencias` como motivo.
    expect(clasificarMotivo("NI-000129814")).toBe(CATEGORIA_OTROS);
  });

  it("ignora acentos y mayúsculas", () => {
    expect(clasificarMotivo("FALTÓ LA UBICACIÓN")).toBe("GPS y ubicación");
  });

  it("respeta el orden: una foto que falta es evidencia, aunque nombre el rack", () => {
    expect(clasificarMotivo("falta la foto del rack")).toBe("Evidencias (faltan o no se ven)");
  });
});

describe("palabrasClave y terminosFrecuentes", () => {
  it("descarta palabras vacías, números sueltos y palabras cortas", () => {
    expect(palabrasClave("falta la foto del rack 123")).toEqual(["foto", "rack"]);
  });

  it("cuenta en cuántos motivos aparece cada término, no cuántas veces en total", () => {
    // Un comentario largo que insiste con una palabra no la instala como problema general.
    const t = terminosFrecuentes(["foto foto foto rack", "falta foto"]);
    expect(t.find((x) => x.termino === "foto")?.veces).toBe(2);
    expect(t.find((x) => x.termino === "rack")?.veces).toBe(1);
  });

  it("ordena por frecuencia y corta en el límite pedido", () => {
    const t = terminosFrecuentes(["foto acta", "foto gps", "foto"], 2);
    expect(t).toHaveLength(2);
    expect(t[0].termino).toBe("foto");
    expect(t[0].veces).toBe(3);
  });

  it("devuelve una lista vacía cuando no hay motivos", () => {
    expect(terminosFrecuentes([])).toEqual([]);
    expect(terminosFrecuentes(["", "   "])).toEqual([]);
  });
});
