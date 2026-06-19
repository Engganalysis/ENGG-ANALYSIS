const ExcelJS = require('F:/Projects/ENGG Analysis/client/node_modules/exceljs');
const path = require('path');

async function run() {
    const filePath = path.join(__dirname, '..', 'Result Template.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Main(Micro)') || workbook.worksheets[0];

    console.log("RowCount:", worksheet.rowCount);
    console.log("PhysicalRowCount:", worksheet.actualRowCount);
    console.log("Views:", worksheet.views);
    console.log("PageSetup:", worksheet.pageSetup);
    console.log("AutoFilter:", worksheet.autoFilter);
    
    // Check if there are any rows with data from row 10 to row 100
    for (let r = 10; r <= 30; r++) {
        const row = worksheet.getRow(r);
        let vals = [];
        row.eachCell({ includeEmpty: true }, cell => vals.push(cell.value));
        if (vals.length > 0) {
            console.log(`Row ${r} values:`, vals.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(' | '));
        }
    }
}
run();
