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

export function dedupeUsersByName<T extends { nombre?: string | null }>(users: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const user of users) {
    const name = normalizeAssigneeName(user.nombre);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(user);
  }
  return result;
}