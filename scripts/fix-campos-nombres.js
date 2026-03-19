const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const campos = await p.campoPersonalizado.findMany({ orderBy: { orden: "asc" } });
  console.log("Campos actuales:");
  campos.forEach(c => console.log(`  ${c.clave} → "${c.nombre}" [activo=${c.activo}]`));

  // Mapa de clave → nombre bonito
  const fixes = {
    nombre: "Nombre",
    codigo_postal: "Código Postal",
    caracteristica_telefonica: "Característica Telefónica",
    nro_telefono: "Nro. Teléfono",
    email: "Email",
  };

  for (const [clave, nuevoNombre] of Object.entries(fixes)) {
    const campo = campos.find(c => c.clave === clave);
    if (campo && campo.nombre !== nuevoNombre) {
      await p.campoPersonalizado.update({ where: { clave }, data: { nombre: nuevoNombre } });
      console.log(`  Actualizado: ${clave} → "${nuevoNombre}"`);
    }
  }

  console.log("Listo.");
}

main().catch(console.error).finally(() => p.$disconnect());
