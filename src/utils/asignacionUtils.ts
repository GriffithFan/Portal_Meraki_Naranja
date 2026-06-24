function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[\s_-]+/g, " ");
}

export function normalizeAssigneeName(name: string | null | undefined): string {
  return norm(name || "");
}

/**
 * Dedupe por ID (no por nombre). Dos usuarios DISTINTOS que comparten nombre
 * (ej. dos "Gustavo") deben mantenerse separados; solo se colapsa el mismo
 * usuario repetido. (Antes deduplicaba por nombre y ocultaba usuarios reales.)
 */
export function dedupeUsersByName<T extends { id?: string | null; nombre?: string | null }>(users: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const user of users) {
    const key = user.id ? `id:${user.id}` : `nombre:${normalizeAssigneeName(user.nombre)}`;
    if (key === "nombre:" || seen.has(key)) continue;
    seen.add(key);
    result.push(user);
  }
  return result;
}

/** Nombres (normalizados) compartidos por 2+ usuarios distintos → hay que distinguirlos. */
export function getDuplicatedAssigneeNames<T extends { id?: string | null; nombre?: string | null }>(users: T[]): Set<string> {
  const idsByName = new Map<string, Set<string>>();
  for (const u of users) {
    const n = normalizeAssigneeName(u.nombre);
    if (!n) continue;
    const ids = idsByName.get(n) || new Set<string>();
    ids.add(u.id || n);
    idsByName.set(n, ids);
  }
  const dup = new Set<string>();
  idsByName.forEach((ids, n) => { if (ids.size > 1) dup.add(n); });
  return dup;
}

/** Etiqueta para mostrar: agrega "· usuario" cuando el nombre está repetido. */
export function assigneeLabel(
  user: { nombre?: string | null; email?: string | null },
  duplicatedNames: Set<string>,
  opts?: { firstNameOnly?: boolean },
): string {
  const full = (user.nombre || "").trim() || "?";
  const base = opts?.firstNameOnly ? full.split(" ")[0] : full;
  if (user.email && duplicatedNames.has(normalizeAssigneeName(full))) {
    return `${base} · ${user.email.split("@")[0]}`;
  }
  return base;
}