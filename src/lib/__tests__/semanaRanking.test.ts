import { describe, it, expect } from "vitest";
import {
  diasDeSemanaAR, diasHabilesDeSemanaAR, fechaAR, inicioSemana, mismoMomentoSemanaPrevia,
  sumarDiasHabiles, ultimoDiaHabilAR,
} from "@/lib/semanaRanking";

describe("días hábiles de la vista diaria", () => {
  it("sábado y domingo se llevan al viernes anterior; un día hábil queda igual", () => {
    expect(ultimoDiaHabilAR("2026-09-12")).toBe("2026-09-11"); // sábado
    expect(ultimoDiaHabilAR("2026-09-13")).toBe("2026-09-11"); // domingo
    expect(ultimoDiaHabilAR("2026-09-15")).toBe("2026-09-15"); // martes
  });

  it("la semana es de lunes a viernes, también cuando se pide desde el fin de semana", () => {
    const lunAVie = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
    expect(diasHabilesDeSemanaAR("2026-09-15")).toEqual(lunAVie);
    expect(diasHabilesDeSemanaAR("2026-09-18")).toEqual(lunAVie);
    // El sábado 19 se lleva al viernes 18: sigue siendo esa semana, no la nueva vacía.
    expect(diasHabilesDeSemanaAR("2026-09-19")).toEqual(lunAVie);
  });

  it("moverse de a un día saltea el fin de semana", () => {
    expect(sumarDiasHabiles("2026-09-14", -1)).toBe("2026-09-11"); // lunes -> viernes
    expect(sumarDiasHabiles("2026-09-11", 1)).toBe("2026-09-14");  // viernes -> lunes
    expect(sumarDiasHabiles("2026-09-15", -1)).toBe("2026-09-14");
    expect(sumarDiasHabiles("2026-09-13", 1)).toBe("2026-09-14");  // desde domingo: el lunes
  });
});

describe("mismoMomentoSemanaPrevia", () => {
  it("un martes compara contra la semana pasada hasta el mismo martes a la misma hora", () => {
    // Martes 15/09/2026 13:51 ART
    const ahora = new Date("2026-09-15T16:51:39Z");
    const { desde, hasta } = mismoMomentoSemanaPrevia(ahora);
    expect(desde.toISOString()).toBe("2026-09-05T09:00:00.000Z"); // sábado 06:00 ART de W36
    expect(hasta.toISOString()).toBe("2026-09-08T16:51:39.000Z"); // martes 13:51 ART de W36
  });

  it("dura lo mismo que lo transcurrido de la semana actual", () => {
    const ahora = new Date("2026-09-17T22:10:00Z");
    const { desde, hasta } = mismoMomentoSemanaPrevia(ahora);
    expect(hasta.getTime() - desde.getTime()).toBe(ahora.getTime() - inicioSemana(ahora).getTime());
  });

  it("recién empezada la semana, el tramo previo también arranca en su sábado 06:00", () => {
    const ahora = new Date("2026-09-12T09:00:30Z"); // sábado 06:00:30 ART
    const { desde, hasta } = mismoMomentoSemanaPrevia(ahora);
    expect(desde.toISOString()).toBe("2026-09-05T09:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-09-05T09:00:30.000Z");
  });
});

describe("fechaAR", () => {
  it("usa el día argentino, no el UTC", () => {
    expect(fechaAR(new Date("2026-09-16T02:30:00Z"))).toBe("2026-09-15"); // 23:30 ART
    expect(fechaAR(new Date("2026-09-16T03:00:00Z"))).toBe("2026-09-16"); // 00:00 ART
  });
});

describe("diasDeSemanaAR", () => {
  it("devuelve sábado a viernes de la semana de negocio", () => {
    expect(diasDeSemanaAR("2026-09-15")).toEqual([
      "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
    ]);
  });

  it("un sábado abre su propia semana y un viernes la cierra", () => {
    expect(diasDeSemanaAR("2026-09-12")[0]).toBe("2026-09-12");
    expect(diasDeSemanaAR("2026-09-18")[0]).toBe("2026-09-12");
    expect(diasDeSemanaAR("2026-09-19")[0]).toBe("2026-09-19");
  });
});
