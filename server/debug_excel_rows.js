const XLSX = require('xlsx');
const path = require('path');

async function debugExcel() {
    const file = "f:\\Projects\\ENGG Analysis\\Result\\Subject_ 21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis\\1_21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    console.log("Sheet Names:", workbook.SheetNames);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- SHEET: ${sheetName} ---`);
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        for (let i = 0; i < 30; i++) {
            if (data[i]) console.log(`Row ${i + 1}:`, data[i].slice(0, 15).map(c => String(c).substring(0, 20)));
        }
    });
}

debugExcel();
