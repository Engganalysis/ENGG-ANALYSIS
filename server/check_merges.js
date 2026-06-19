const ExcelJS = require('F:/Projects/ENGG Analysis/client/node_modules/exceljs');
const path = require('path');

async function run() {
    const filePath = path.join(__dirname, '..', 'client', 'public', 'Result Template.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Main(Micro)') || workbook.worksheets[0];

    console.log("=== Merged Cells in Worksheet ===");
    const merges = worksheet.model.merges;
    if (merges) {
        merges.forEach(merge => {
            console.log("  Merge range:", merge);
        });
    } else {
        console.log("No merges found in worksheet model");
    }
}
run();
