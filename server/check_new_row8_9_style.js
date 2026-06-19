const ExcelJS = require('F:/Projects/ENGG Analysis/client/node_modules/exceljs');
const path = require('path');

async function run() {
    const filePath = path.join(__dirname, '..', 'client', 'public', 'Result Template.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Main(Micro)') || workbook.worksheets[0];

    console.log("=== Row 8 and 9 Style Inspection (New Template) ===");
    for (let r = 8; r <= 9; r++) {
        const row = worksheet.getRow(r);
        console.log(`\nRow ${r}:`);
        for (let c = 1; c <= 15; c++) {
            const cell = row.getCell(c);
            const colLetter = String.fromCharCode(64 + c);
            console.log(`  Cell ${colLetter}${r}: value = "${cell.value}"`);
            if (cell.font) {
                console.log(`    Font: name="${cell.font.name}", size=${cell.font.size}, bold=${cell.font.bold}, color=${JSON.stringify(cell.font.color)}`);
            }
            if (cell.fill) {
                console.log(`    Fill: ${JSON.stringify(cell.fill)}`);
            }
            if (cell.border) {
                console.log(`    Border: ${JSON.stringify(cell.border)}`);
            }
        }
    }
}
run();
