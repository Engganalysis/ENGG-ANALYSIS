const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = 'f:\\Projects\\ENGG Analysis\\ERP Report\\PICS\\P2\\K.xlsx';
if (!fs.existsSync(filePath)) {
    console.log("File not found: " + filePath);
} else {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log("--- K.xlsx Content (First 60 Rows) ---");
    data.slice(0, 60).forEach((row, i) => {
        console.log(`Row ${i}: ${JSON.stringify(row)}`);
    });
}
