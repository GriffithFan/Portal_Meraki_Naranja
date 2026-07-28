/**
 * Catálogo de usuarios de Salesforce/Mined con los que se lanzan los predios.
 * Son THNET C01 .. THNET C020 (formato "THNET C0" + N). Verificado: "THNET C08"
 * resuelve en el lookup de Salesforce.
 *
 * Si en algún momento hay más usuarios, se agregan acá y se redeploya.
 */
export const SALESFORCE_USUARIOS: string[] = Array.from({ length: 20 }, (_, i) => `THNET C0${i + 1}`);

export function esUsuarioSalesforceValido(u: string | null | undefined): boolean {
  return !!u && SALESFORCE_USUARIOS.includes(u.trim());
}
