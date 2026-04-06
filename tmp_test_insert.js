const{PrismaClient}=require("@prisma/client");
const c=new PrismaClient();

// Primero obtener un userId real
c.user.findFirst({select:{id:true,nombre:true}}).then(user => {
  if (!user) { console.log("No users found"); return c.$disconnect(); }
  console.log("Using user:", user.nombre, user.id);
  
  return c.registroAcceso.create({
    data: {
      userId: user.id,
      accion: "CONSULTA_PREDIO",
      detalle: "Test directo desde script",
      ip: "127.0.0.1",
      metadata: { test: true },
    }
  }).then(r => {
    console.log("INSERT OK:", r.id, r.accion, r.detalle);
    return c.$disconnect();
  });
}).catch(e => {
  console.error("ERROR:", e.message);
  console.error("FULL:", e);
  c.$disconnect();
});
