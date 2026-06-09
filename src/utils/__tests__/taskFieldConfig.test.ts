import { describe, it, expect } from "vitest";
import {
  sanitizeTaskFieldConfigs,
  isLegacyEquipoField,
  hasTaskFieldConfig,
  normalizeTaskGroupBy,
  normalizeTaskQuickFilter,
} from "@/utils/taskFieldConfig";

describe("isLegacyEquipoField", () => {
  it("detecta el campo legacy de equipo por id/field/label (con o sin acentos)", () => {
    expect(isLegacyEquipoField({ id: "equipoAsignado" })).toBe(true);
    expect(isLegacyEquipoField({ field: "equipoasignado" })).toBe(true);
    expect(isLegacyEquipoField({ label: "Equipo" })).toBe(true);
    expect(isLegacyEquipoField({ nombre: "equipo" })).toBe(true);
  });
  it("no marca campos normales ni valores nulos", () => {
    expect(isLegacyEquipoField({ id: "provincia" })).toBe(false);
    expect(isLegacyEquipoField(null)).toBe(false);
    expect(isLegacyEquipoField(undefined)).toBe(false);
  });
});

describe("sanitizeTaskFieldConfigs", () => {
  it("devuelve [] para entradas no-array", () => {
    expect(sanitizeTaskFieldConfigs(null)).toEqual([]);
    expect(sanitizeTaskFieldConfigs(undefined)).toEqual([]);
  });
  it("filtra el campo legacy de equipo y conserva el resto", () => {
    const input = [{ id: "provincia" }, { id: "equipoAsignado" }, { id: "estado" }];
    const out = sanitizeTaskFieldConfigs(input);
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.id)).toEqual(["provincia", "estado"]);
  });
  it("hasTaskFieldConfig refleja si queda algún campo válido", () => {
    expect(hasTaskFieldConfig([{ id: "equipoAsignado" }])).toBe(false);
    expect(hasTaskFieldConfig([{ id: "estado" }])).toBe(true);
  });
});

describe("normalizeTaskGroupBy / normalizeTaskQuickFilter", () => {
  it("mapea variantes de 'equipo' a 'asignados' y valida valores", () => {
    expect(normalizeTaskGroupBy("equipo")).toBe("asignados");
    expect(normalizeTaskGroupBy("provincia")).toBe("provincia");
    expect(normalizeTaskGroupBy("inexistente")).toBe("estado");
    expect(normalizeTaskGroupBy(undefined)).toBe("estado");
  });
  it("normaliza quick filters legacy de equipo a 'todos'", () => {
    expect(normalizeTaskQuickFilter("sin-equipo")).toBe("todos");
    expect(normalizeTaskQuickFilter("vencidas")).toBe("vencidas");
    expect(normalizeTaskQuickFilter("xxx")).toBe("todos");
  });
});
