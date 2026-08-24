const XLSX = require('xlsx');
const wb = XLSX.readFile('../Nuevos para cargar en carrot.xlsx');
console.log('SHEETS:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  console.log(`\n===== SHEET "${name}" range=${ws['!ref']} =====`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  console.log('TOTAL ROWS:', rows.length);
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    console.log(`R${i}:`, JSON.stringify(rows[i]));
  }
}
