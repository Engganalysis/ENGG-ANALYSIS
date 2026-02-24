const XLSX = require('xlsx');
const path = require('path');

async function listSheets() {
    const file = "f:\\Projects\\ENGG Analysis\\Result\\Subject_ 21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis\\1_21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    console.log("Sheets:", workbook.SheetNames);
    workbook.SheetNames.forEach(name => {
        console.log(`- "${name}" (Length: ${name.length})`);
    });
}

listSheets();
