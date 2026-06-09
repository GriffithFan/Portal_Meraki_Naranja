import { describe, it, expect } from "vitest";
import {
  resolvePermiso,
  getDefaultPermiso,
  getDefaultPermisoSeccion,
  type PermisoSeccion,
  type PermisoSeccionUsuario,
} from "@/lib/permisos";

const noOverrides = { permisos: [] as PermisoSeccion[], permisosUsuario: [] as PermisoSeccionUsuario[] };

describe("resolvePermiso", () => {
  it("ADMIN puede todo", () => {
    const s = { userId: "a1", rol: "ADMIN" };
    expect(resolvePermiso("permisos", "eliminar", { session: s, ...noOverrides })).toBe(true);
    expect(resolvePermiso("auditoria", "exportar", { session: s, ...noOverrides })).toBe(true);
  });

  it("sesión nula es permisiva (el control real es server-side; el hook solo gatea UI durante la carga)", () => {
    expect(resolvePermiso("tareas", "ver", { session: null, ...noOverrides })).toBe(true);
    expect(resolvePermiso("permisos", "ver", { session: undefined, ...noOverrides })).toBe(true);
  });

  it("monitoreo siempre visible (solo ver) para cualquier rol", () => {
    const tec = { userId: "t1", rol: "TECNICO" };
    expect(resolvePermiso("aps", "ver", { session: tec, ...noOverrides })).toBe(true);
    expect(resolvePermiso("aps", "editar", { session: tec, ...noOverrides })).toBe(false);
  });

  it("TECNICO ve anuncios pero NO asistencia por defecto", () => {
    const tec = { userId: "t1", rol: "TECNICO" };
    expect(resolvePermiso("anuncios", "ver", { session: tec, ...noOverrides })).toBe(true);
    expect(resolvePermiso("asistencia", "ver", { session: tec, ...noOverrides })).toBe(false);
  });

  it("TECNICO no crea en hospedajes por defecto, sí en tareas", () => {
    const tec = { userId: "t1", rol: "TECNICO" };
    expect(resolvePermiso("hospedajes", "crear", { session: tec, ...noOverrides })).toBe(false);
    expect(resolvePermiso("tareas", "editar", { session: tec, ...noOverrides })).toBe(true);
  });

  it("override por usuario tiene prioridad sobre el rol", () => {
    const tec = { userId: "t1", rol: "TECNICO" };
    const permisosUsuario: PermisoSeccionUsuario[] = [
      { seccion: "stock", userId: "t1", ver: true, crear: true, editar: false, eliminar: false, exportar: false },
    ];
    // Por defecto TECNICO no ve stock; el override lo habilita
    expect(resolvePermiso("stock", "ver", { session: tec, permisos: [], permisosUsuario })).toBe(true);
    expect(resolvePermiso("stock", "crear", { session: tec, permisos: [], permisosUsuario })).toBe(true);
    expect(resolvePermiso("stock", "eliminar", { session: tec, permisos: [], permisosUsuario })).toBe(false);
  });

  it("permiso por rol se aplica cuando no hay override de usuario", () => {
    const tec = { userId: "t1", rol: "TECNICO" };
    const permisos: PermisoSeccion[] = [
      { seccion: "stock", rol: "TECNICO", ver: true, crear: false, editar: false, eliminar: false, exportar: false },
    ];
    expect(resolvePermiso("stock", "ver", { session: tec, permisos, permisosUsuario: [] })).toBe(true);
  });
});

describe("getDefaultPermiso / getDefaultPermisoSeccion", () => {
  it("MODERADOR no tiene acceso por defecto a secciones restringidas", () => {
    expect(getDefaultPermiso("permisos", "MODERADOR", "ver")).toBe(false);
    expect(getDefaultPermiso("auditoria", "MODERADOR", "ver")).toBe(false);
    expect(getDefaultPermiso("papelera", "MODERADOR", "eliminar")).toBe(false);
  });

  it("MODERADOR tiene acceso por defecto a secciones normales", () => {
    expect(getDefaultPermiso("tareas", "MODERADOR", "eliminar")).toBe(true);
    const p = getDefaultPermisoSeccion("stock", "MODERADOR");
    expect(p).toMatchObject({ ver: true, crear: true, editar: true, eliminar: true, exportar: true });
  });
});
