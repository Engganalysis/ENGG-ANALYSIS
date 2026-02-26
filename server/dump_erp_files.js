const XLSX = require('xlsx');
const path = require('path');

const base = 'f:\\Projects\\ENGG Analysis\\ERP Report\\';
const files = [
    '5. 28-Sep-25_Sr.Super-60_Nucleus_XL-500_Jee Adv(P1)_Stud_QError_Analysis.xlsx',
    'PICS\\28-09-2025_Sr.S60_Nu_XL-500_BT_Jee-Adv(2023-P1)_RPTA-12_Q.Paper with Key & Sol\'s\\K.xlsx',
    'PICS\\28-09-2025_Sr.S60_Nu_XL-500_BT_Jee-Adv(2023-P1)_RPTA-12_Q.Paper with Key & Sol\'s\\28-09-2025_Sr.S60_Nu_XL-500_BT_Jee-Adv(2023-P1)_RPTA-12_Zero Report.xlsx'
];

files.forEach(f => {
    const fullPath = path.join(base, f);
    console.log(`\n--- Reading ${f} ---`);
    try {
        const wb = XLSX.readFile(fullPath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const numRows = f.includes('Zero Report') ? 35 : 5;
        console.log(`Rows 1-${numRows}:`);
        data.slice(0, numRows).forEach((row, i) => {
            console.log(`Row ${i + 1}: ${JSON.stringify(row)}`);
        });
    } catch (e) {
        console.error(`Error reading ${f}: ${e.message}`);
    }
});
