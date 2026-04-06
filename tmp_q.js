const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
p.registroAcceso.findMany({orderBy:{createdAt:"desc"},take:15,include:{usuario:{select:{nombre:true}}}})
.then(r=>{console.log("Total:",r.length);r.forEach(x=>console.log(x.accion,x.detalle||"--",x.usuario.nombre,x.createdAt));p.$disconnect()})
.catch(e=>{console.error(e);p.$disconnect()});
