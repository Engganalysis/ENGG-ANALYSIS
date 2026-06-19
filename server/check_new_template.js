const ExcelJS = require('F:/Projects/ENGG Analysis/client/node_modules/exceljs');
const path = require('path');

async function run() {
    const filePath = path.join(__dirname, '..', 'client', 'public', 'Result Template.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Main(Micro)') || workbook.worksheets[0];

    console.log("=== Row 8 and Row 9 Cells ===");
    for (let i = 1; i <= 20; i++) {
        const colLetter = String.fromCharCode(64 + i);
        const cell8 = worksheet.getCell(`${colLetter}8`).value;
        const cell9 = worksheet.getCell(`${colLetter}9`).value;
        console.log(`${colLetter}: Row 8 = "${cell8}" | Row 9 = "${cell9}"`);
    }
}
run();
