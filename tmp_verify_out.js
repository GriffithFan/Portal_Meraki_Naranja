const XLSX=require('xlsx');
for(const f of ['IMPORT_PBA_BuenosAires.xlsx','IMPORT_SF_Capital_LaCapital.xlsx','IMPORT_SF2026_Rosario.xlsx']){
  const wb=XLSX.readFile('../'+f);
  const rows=XLSX.utils.sheet_to_json(wb.Sheets['Importar'],{header:1,defval:''});
  console.log('\n### '+f+' ('+(rows.length-1)+' filas) ###');
  console.log('HEADERS:',JSON.stringify(rows[0]));
  console.log('R1:',JSON.stringify(rows[1]));
}
