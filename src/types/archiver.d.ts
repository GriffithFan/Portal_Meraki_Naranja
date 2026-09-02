// `archiver` no publica tipos. Se declara acá en vez de sumar @types/archiver como
// dependencia de desarrollo: el build del VPS no siempre instala devDependencies, y
// una dependencia que rompe el deploy cuesta más que estas cuatro líneas.
declare module "archiver";
