// Seed hospedajes data
// Run: node scripts/seedHospedajes.mjs

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const HOSPEDAJES = [
  { ubicacion: "Ayacucho", nombre: "Susana Alojamiento", tipo: "CASA", garage: "NO", telefono: "2494350201", provincia: "BUENOS AIRES" },
  { ubicacion: "Azul", nombre: "Hospedaje x Día", tipo: "DEPARTAMENTO", garage: "SI", telefono: "2281314460", provincia: "BUENOS AIRES" },
  { ubicacion: "Balcarce", nombre: "Alojamiento Balcarce", tipo: "CASA", garage: "NO", telefono: "2266444676", provincia: "BUENOS AIRES" },
  { ubicacion: "Chivilcoy", nombre: "Apart Hom", tipo: "CASA", garage: "SI PAGO", telefono: "2346651510", provincia: "BUENOS AIRES" },
  { ubicacion: "Chivilcoy", nombre: "Quinta Chivilcoy", tipo: "QUINTA/CASA", garage: "SI", telefono: "2346576911", provincia: "BUENOS AIRES" },
  { ubicacion: "Lobería", nombre: "H La Casona", tipo: "CASA", garage: "SI", telefono: "2262352594", provincia: "BUENOS AIRES" },
  { ubicacion: "Madariaga", nombre: "Celia", tipo: "CASA", garage: "SI", telefono: "2267667988", provincia: "BUENOS AIRES" },
  { ubicacion: "Madariaga", nombre: "Marta", tipo: "CASA", garage: "NO", telefono: "2267408812", provincia: "BUENOS AIRES" },
  { ubicacion: "Maipú", nombre: "Posada La Luna", tipo: "POSADA", garage: "NO", telefono: "2268516021", provincia: "BUENOS AIRES" },
  { ubicacion: "Mar del Plata", nombre: "Aslana", tipo: "HOSTEL", garage: "SI", telefono: "2235969536", provincia: "BUENOS AIRES" },
  { ubicacion: "Mar del Plata", nombre: "Delfín", tipo: "CASA", garage: "SI", telefono: "1126377987", provincia: "BUENOS AIRES" },
  { ubicacion: "Necochea", nombre: "Alquileres por Día", tipo: "HOTEL", garage: "NO", telefono: "2262362279", provincia: "BUENOS AIRES" },
  { ubicacion: "Saladillo", nombre: "El Balcóncito - Sebastián", tipo: "DEPARTAMENTO", garage: "NO", telefono: "2345419987", provincia: "BUENOS AIRES" },
  { ubicacion: "Tandil", nombre: "Gladis", tipo: "CASA", garage: "SI", telefono: "2494002951", provincia: "BUENOS AIRES" },
  { ubicacion: "Mar del Plata", nombre: "Atlantic Hotel", tipo: "HOTEL", garage: "NO", telefono: "2234949509", provincia: "BUENOS AIRES" },
  { ubicacion: "Villa Valeria", nombre: "Hotel Real del Monte", tipo: "HOTEL", garage: "SI", telefono: "3583640882", provincia: "CÓRDOBA" },
  { ubicacion: "Mina Clavero", nombre: "Silvia Alojamiento", tipo: "DEPARTAMENTO", garage: "SI", telefono: "3513220418", provincia: "CÓRDOBA" },
  { ubicacion: "Paraná", nombre: "Matías - Alquiler por Mes", tipo: "CASA", garage: "NO", telefono: "3434538430", provincia: "ENTRE RÍOS" },
  { ubicacion: "Córdoba Capital", nombre: "Noe Bersano", tipo: "DEPARTAMENTO", garage: "NO", telefono: "3516098082", provincia: "CÓRDOBA" },
  { ubicacion: "Lobería", nombre: "El Ciervo", tipo: "HOTEL", garage: "NO", telefono: "2261443100", provincia: "BUENOS AIRES" },
];

async function main() {
  console.log("Seeding hospedajes...");

  for (const h of HOSPEDAJES) {
    const existing = await prisma.hospedaje.findFirst({
      where: { nombre: h.nombre, ubicacion: h.ubicacion },
    });
    if (!existing) {
      await prisma.hospedaje.create({ data: h });
      console.log(`  + ${h.nombre} (${h.ubicacion})`);
    } else {
      console.log(`  = ${h.nombre} (${h.ubicacion}) ya existe`);
    }
  }

  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
