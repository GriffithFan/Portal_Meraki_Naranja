import { describe, it, expect } from "vitest";
import { dayRangeAR } from "@/lib/fechas";

describe("dayRangeAR", () => {
  it("para una fecha dada, el día AR arranca a las 03:00 UTC y dura 24h", () => {
    const { start, end } = dayRangeAR("2026-06-09");
    // 2026-06-09 00:00 AR (UTC-3) = 2026-06-09 03:00 UTC
    expect(start.toISOString()).toBe("2026-06-09T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-10T03:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
  });

  it("ignora formatos inválidos y cae al día actual", () => {
    const r1 = dayRangeAR("no-es-fecha");
    const r2 = dayRangeAR(null);
    const r3 = dayRangeAR(undefined);
    // Todos deben coincidir (día actual) y durar exactamente 24h
    expect(r1.start.toISOString()).toBe(r2.start.toISOString());
    expect(r2.start.toISOString()).toBe(r3.start.toISOString());
    expect(r1.end.getTime() - r1.start.getTime()).toBe(24 * 3600 * 1000);
  });

  it("el inicio del día actual cae a las 03:00:00 UTC", () => {
    const { start } = dayRangeAR();
    expect(start.getUTCHours()).toBe(3);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
  });

  it("un instante justo después del inicio cae dentro del rango del día", () => {
    const { start, end } = dayRangeAR("2026-01-01");
    const dentro = new Date(start.getTime() + 1000);
    expect(dentro >= start && dentro < end).toBe(true);
  });
});
