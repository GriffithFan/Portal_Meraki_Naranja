import { PrismaClient, Role, Prioridad } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const demoPassword = process.env.DEMO_PASSWORD || "Demo.Carrot.2026!";

const resetModels = [
  "chatMensajeReaction",
  "chatMensaje",
  "chatConversacion",
  "registroAcceso",
  "notificacion",
  "actividad",
  "comentario",
  "asignacion",
  "predioEtiqueta",
  "etiqueta",
  "equipo",
  "tareaCalendario",
  "acta",
  "instructivo",
  "monitoreoPostCambio",
  "reporteFacturacion",
  "papeleraItem",
  "hospedaje",
  "configuracionVista",
  "campoPersonalizado",
  "permisoSeccionUsuario",
  "permisoEstadoUsuario",
  "permisoEstado",
  "permisoSeccion",
  "accesoEspacio",
  "accesoEspacioRol",
  "delegacion",
  "predio",
  "espacioTrabajo",
  "estadoConfig",
  "user",
] as const;

async function resetDatabase() {
  const client = prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> } | undefined>;
  for (const model of resetModels) {
    await client[model]?.deleteMany().catch(() => undefined);
  }
}

function daysFromNow(days: number, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  console.log("Preparando base demo aislada...");
  await resetDatabase();

  const password = await bcrypt.hash(demoPassword, 12);

  const admin = await prisma.user.create({
    data: { nombre: "Valeria Demo Admin", email: "admin.demo@carrot.local", password, rol: Role.ADMIN, esMesa: true, telefono: "+54 11 4000-1200" },
  });
  const mesa = await prisma.user.create({
    data: { nombre: "Nadia Mesa Demo", email: "mesa.demo@carrot.local", password, rol: Role.MODERADOR, esMesa: true, telefono: "+54 11 4000-1300" },
  });
  const tecnico = await prisma.user.create({
    data: { nombre: "Ariel Tecnico Demo", email: "tecnico.demo@carrot.local", password, rol: Role.TECNICO, telefono: "+54 341 555-0191" },
  });
  const tecnico2 = await prisma.user.create({
    data: { nombre: "Dani Demo", email: "dani.demo@carrot.local", password, rol: Role.TECNICO, telefono: "+54 11 5555-0108" },
  });

  const estados = await Promise.all([
    prisma.estadoConfig.create({ data: { nombre: "CONFORME", clave: "conforme", color: "#22c55e", orden: 0 } }),
    prisma.estadoConfig.create({ data: { nombre: "NO CONFORME", clave: "no_conforme", color: "#ef4444", orden: 1 } }),
    prisma.estadoConfig.create({ data: { nombre: "INSTALADO", clave: "instalado", color: "#f59e0b", orden: 2 } }),
    prisma.estadoConfig.create({ data: { nombre: "PENDIENTE", clave: "pendiente", color: "#8b5cf6", orden: 3 } }),
    prisma.estadoConfig.create({ data: { nombre: "EN PROCESO", clave: "en_proceso", color: "#3b82f6", orden: 4 } }),
  ]);
  const estadoMap = Object.fromEntries(estados.map((estado) => [estado.clave, estado]));

  const espacios = await Promise.all([
    prisma.espacioTrabajo.create({ data: { nombre: "Cronogramas", descripcion: "Instalaciones y visitas programadas", color: "#149bff", icono: "calendar", orden: 1, creadorId: admin.id } }),
    prisma.espacioTrabajo.create({ data: { nombre: "NC", descripcion: "No conformidades LAC-R", color: "#ef4444", icono: "alert", orden: 2, creadorId: admin.id } }),
    prisma.espacioTrabajo.create({ data: { nombre: "OCP", descripcion: "Ordenes de compra y pedidos", color: "#ff7b07", icono: "file", orden: 3, creadorId: admin.id } }),
    prisma.espacioTrabajo.create({ data: { nombre: "Bapro / ATM", descripcion: "Relevamientos bancarios", color: "#8b5cf6", icono: "building", orden: 4, creadorId: admin.id } }),
  ]);
  const [cronogramas, noConformes, ocp, bapro] = espacios;

  for (const espacio of espacios) {
    await prisma.accesoEspacio.createMany({
      data: [admin, mesa, tecnico, tecnico2].map((user) => ({ userId: user.id, espacioId: espacio.id })),
      skipDuplicates: true,
    });
  }

  const predios = await Promise.all([
    prisma.predio.create({
      data: {
        nombre: "EET Demo 27 Conectividad",
        codigo: "DEMO-610759",
        direccion: "Av. Simulada 1842",
        ciudad: "Rosario",
        provincia: "Santa Fe",
        tipo: "Escuela tecnica",
        latitud: -32.9442,
        longitud: -60.6505,
        prioridad: Prioridad.ALTA,
        seccion: "Cronogramas",
        incidencias: "NI-DEMO-10482",
        lacR: "NO",
        cue: "820610759",
        equipoAsignado: "Ariel Tecnico Demo",
        telefono: "0341-555-0100",
        correo: "direccion.demo27@carrot.local",
        merakiNetworkId: "DEMO_111111",
        merakiOrgId: "DEMO_ORG",
        merakiNetworkName: "EET Demo 27 - Meraki",
        espacioId: cronogramas.id,
        estadoId: estadoMap.en_proceso.id,
        creadorId: admin.id,
        fechaProgramada: daysFromNow(0, 15),
        fechaDesde: daysFromNow(-1),
        fechaHasta: daysFromNow(1),
        camposExtra: { demo: true, anchoBanda: "300 Mbps", referente: "Marina Demo" },
      },
    }),
    prisma.predio.create({
      data: { nombre: "Sucursal Demo Bapro Norte", codigo: "DEMO-BAPRO-18", direccion: "Calle Ficticia 455", ciudad: "San Isidro", provincia: "Buenos Aires", tipo: "ATM", prioridad: Prioridad.URGENTE, incidencias: "NI-DEMO-10479", lacR: "NO", equipoAsignado: "Dani Demo", espacioId: bapro.id, estadoId: estadoMap.pendiente.id, creadorId: mesa.id, fechaProgramada: daysFromNow(-1), camposExtra: { atm: "ATM-00018", energia: "Pendiente", backup4g: "Solicitado" } },
    }),
    prisma.predio.create({
      data: { nombre: "EP Demo 904 Ribera", codigo: "DEMO-904221", direccion: "Ribera 904", ciudad: "Parana", provincia: "Entre Rios", tipo: "Primaria", prioridad: Prioridad.MEDIA, incidencias: "NI-DEMO-10471", lacR: "NO", equipoAsignado: "Ariel Tecnico Demo", espacioId: noConformes.id, estadoId: estadoMap.no_conforme.id, creadorId: admin.id, fechaProgramada: daysFromNow(1), camposExtra: { motivoNC: "Falta firma digital", evidencia: "Fotos cargadas" } },
    }),
    prisma.predio.create({
      data: { nombre: "Jardin Demo 12 Sur", codigo: "DEMO-120441", direccion: "Pasaje Sur 12", ciudad: "Santa Fe", provincia: "Santa Fe", tipo: "Jardin", prioridad: Prioridad.MEDIA, incidencias: "NI-DEMO-10463", lacR: "PEDIDO", equipoAsignado: "Dani Demo", espacioId: ocp.id, estadoId: estadoMap.instalado.id, creadorId: mesa.id, fechaProgramada: daysFromNow(3), camposExtra: { oc: "OC-DEMO-8871", proveedor: "Meraki", estadoCompra: "En transito" } },
    }),
  ]);

  await prisma.etiqueta.createMany({
    data: [
      { nombre: "demo ventas", color: "#149bff" },
      { nombre: "lac-r no", color: "#ef4444" },
      { nombre: "meraki", color: "#22c55e" },
      { nombre: "bapro", color: "#8b5cf6" },
    ],
  });

  await prisma.equipo.createMany({
    data: [
      { nombre: "MX68 Demo", numeroSerie: "DEMO-MX68-0001", modelo: "MX68", marca: "Cisco Meraki", estado: "RESERVADO", categoria: "Firewall", ubicacion: "THNET", proveedor: "Meraki", predioId: predios[0].id, asignadoId: tecnico.id, camposExtra: { demo: true, garantia: "2028" } },
      { nombre: "MS120 Rack A", numeroSerie: "DEMO-MS120-01", modelo: "MS120-24P", marca: "Cisco Meraki", estado: "INSTALADO", categoria: "Switch", ubicacion: "Predio", proveedor: "Meraki", predioId: predios[0].id, asignadoId: tecnico.id, camposExtra: { puertoAlerta: 18 } },
      { nombre: "MR46 Aula 1", numeroSerie: "DEMO-0001-0001", modelo: "MR46", marca: "Cisco Meraki", estado: "INSTALADO", categoria: "Access Point", ubicacion: "Aula 1", proveedor: "Meraki", predioId: predios[0].id, asignadoId: tecnico.id },
      { nombre: "MR36 Biblioteca", numeroSerie: "DEMO-0001-0005", modelo: "MR36", marca: "Cisco Meraki", estado: "REVISION", categoria: "Access Point", ubicacion: "Laboratorio", proveedor: "Meraki", asignadoId: tecnico2.id },
      { nombre: "SIM 4G Contingencia", numeroSerie: "SIM-DEMO-0921", modelo: "4G", marca: "Claro", estado: "DISPONIBLE", categoria: "Conectividad", ubicacion: "Mesa tecnica", proveedor: "Claro", asignadoId: mesa.id },
    ],
  });

  await Promise.all(predios.map((predio, index) => prisma.asignacion.create({
    data: { tipo: "TECNICO", notas: "Asignacion ficticia para demo", userId: index % 2 === 0 ? tecnico.id : tecnico2.id, predioId: predio.id },
  })));

  await prisma.tareaCalendario.createMany({
    data: [
      { titulo: "Instalacion Meraki EET Demo 27", descripcion: "Montaje MX68, switch MS120 y APs", fecha: daysFromNow(0, 15), horaInicio: "15:30", horaFin: "18:00", tipo: "TAREA", categoria: "INSTALACION", prioridad: Prioridad.ALTA, color: "#149bff", ubicacion: predios[0].direccion, esAsignada: true, creadorId: mesa.id, asignadoId: tecnico.id, predioId: predios[0].id },
      { titulo: "Relevar ATM Bapro Norte", descripcion: "Validar energia, WAN y backup 4G", fecha: daysFromNow(-1, 10), horaInicio: "10:00", horaFin: "12:00", tipo: "TAREA", categoria: "VISITA", prioridad: Prioridad.URGENTE, color: "#ef4444", ubicacion: predios[1].direccion, esAsignada: true, creadorId: admin.id, asignadoId: tecnico2.id, predioId: predios[1].id },
      { titulo: "Validar LAC-R EP Demo 904", descripcion: "Revisar acta, firma y fotos", fecha: daysFromNow(1, 9), horaInicio: "09:00", horaFin: "10:00", tipo: "RECORDATORIO", categoria: "GENERAL", prioridad: Prioridad.MEDIA, color: "#f59e0b", esAsignada: true, creadorId: mesa.id, asignadoId: tecnico.id, predioId: predios[2].id },
      { titulo: "OC de fuente Jardin Demo 12", descripcion: "Controlar recepcion de repuesto", fecha: daysFromNow(3, 11), horaInicio: "11:00", horaFin: "11:30", tipo: "TAREA", categoria: "MANTENIMIENTO", prioridad: Prioridad.MEDIA, color: "#8b5cf6", creadorId: admin.id, asignadoId: tecnico2.id, predioId: predios[3].id },
    ],
  });

  await prisma.comentario.createMany({
    data: [
      { contenido: "Cable test OK. Puerto 18 queda en observacion por CRC.", userId: tecnico.id, predioId: predios[0].id },
      { contenido: "Se adjunta checklist ficticio de evidencia para demo comercial.", userId: mesa.id, predioId: predios[0].id },
      { contenido: "Pendiente validacion de energia estabilizada para ATM.", userId: tecnico2.id, predioId: predios[1].id },
    ],
  });

  const chat = await prisma.chatConversacion.create({
    data: { asunto: "EET Demo 27 - validacion Meraki", estado: "EN_CURSO", creadorId: tecnico.id, agenteId: mesa.id, leidoPorMesaAt: new Date() },
  });
  const firstMessage = await prisma.chatMensaje.create({ data: { conversacionId: chat.id, autorId: tecnico.id, contenido: "Cable test OK. El MS120 levanto todos los puertos esperados salvo puerto 18." } });
  await prisma.chatMensaje.createMany({
    data: [
      { conversacionId: chat.id, autorId: mesa.id, contenido: "Recibido. Dejo la tarea asociada a NI-DEMO-10482 y espero evidencia del rack.", replyToId: firstMessage.id },
      { conversacionId: chat.id, autorId: tecnico.id, contenido: "Subo fotos ficticias en la demo y cierro validacion cuando vuelva el AP Biblioteca." },
    ],
  });

  await prisma.notificacion.createMany({
    data: [
      { tipo: "ALERTA_MONITOREO", titulo: "AP Biblioteca sin heartbeat", mensaje: "Predio DEMO-610759 reporta AP offline hace 12 minutos", enlace: "/dashboard/aps", entidad: "MERAKI", entidadId: predios[0].id, userId: admin.id },
      { tipo: "TAREA", titulo: "Tarea demo vencida", mensaje: "Relevar ATM Bapro Norte esta vencida", enlace: "/dashboard/tareas", entidad: "PREDIO", entidadId: predios[1].id, userId: mesa.id },
    ],
  });

  await prisma.actividad.createMany({
    data: [
      { accion: "CREAR", descripcion: "Se creo predio demo Meraki", entidad: "PREDIO", entidadId: predios[0].id, userId: admin.id, metadata: { codigo: "DEMO-610759" } },
      { accion: "ASIGNAR", descripcion: "Se asigno tecnico demo", entidad: "PREDIO", entidadId: predios[0].id, userId: mesa.id, metadata: { tecnico: tecnico.nombre } },
      { accion: "CONSULTA_MERAKI", descripcion: "Consulta ficticia de topologia", entidad: "MERAKI", entidadId: "DEMO_111111", userId: tecnico.id, metadata: { demo: true } },
    ],
  });

  await prisma.hospedaje.createMany({
    data: [
      { ubicacion: "Rosario", nombre: "Hotel Demo Centro", tipo: "Hotel", garage: "Si", telefono: "0341-555-9000", provincia: "Santa Fe", notas: "Convenio ficticio demo" },
      { ubicacion: "Parana", nombre: "Apart Demo Ribera", tipo: "Apart", garage: "No", telefono: "0343-555-8100", provincia: "Entre Rios", notas: "Cercano a EP Demo 904" },
    ],
  });

  await prisma.instructivo.create({
    data: { titulo: "Recorrido demo Carrot", descripcion: "Guia breve para mostrar tareas, stock, chat y monitoreo", contenido: "Usar DEMO-610759 en el buscador Meraki para mostrar informacion simulada.", categoria: "Demo", orden: 1, creadoPorId: admin.id },
  });

  const secciones = ["mis-tareas", "tareas", "ranking", "predios", "calendario", "stock", "hospedajes", "importar", "chat", "bandeja", "actividad", "instructivo", "actas", "facturacion", "operacion", "supervisor", "calidad-datos", "diccionario-campos", "kpis", "usuarios", "permisos", "auditoria", "papelera"];
  await prisma.permisoSeccion.createMany({
    data: secciones.flatMap((seccion) => [
      { seccion, rol: Role.ADMIN, ver: true, crear: true, editar: true, eliminar: true, exportar: true },
      { seccion, rol: Role.MODERADOR, ver: true, crear: true, editar: true, eliminar: !["usuarios", "permisos", "auditoria", "papelera"].includes(seccion), exportar: true },
      { seccion, rol: Role.TECNICO, ver: ["mis-tareas", "tareas", "ranking", "predios", "calendario", "chat", "bandeja", "instructivo", "actas", "hospedajes"].includes(seccion), crear: ["tareas", "calendario", "chat"].includes(seccion), editar: ["tareas", "calendario", "chat"].includes(seccion), eliminar: false, exportar: false },
    ]),
    skipDuplicates: true,
  });

  await prisma.configuracionVista.createMany({
    data: [
      { clave: "demo-info", config: { demo: true, base: "Datos ficticios aislados", predio: "DEMO-610759" }, updatedBy: admin.id },
      { clave: "col-config-tareas", config: ["incidencias", "nombre", "estado", "equipoAsignado", "lacR", "fechaProgramada"], updatedBy: admin.id },
    ],
  });

  await prisma.registroAcceso.create({
    data: { userId: admin.id, accion: "SEED_DEMO", detalle: "Base demo inicializada", ip: "127.0.0.1", metadata: { usuarios: 4, predios: predios.length } },
  });

  console.log("Seed demo completado");
  console.log("Credenciales demo:");
  console.log("  admin.demo@carrot.local");
  console.log("  mesa.demo@carrot.local");
  console.log("  tecnico.demo@carrot.local");
  console.log(`Password: ${demoPassword}`);
}

main()
  .catch((error) => {
    console.error("Error en seed demo:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
