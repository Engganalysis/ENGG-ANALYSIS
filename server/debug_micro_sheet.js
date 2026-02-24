const XLSX = require('xlsx');
const path = require('path');

async function debugExcel() {
    const file = "f:\\Projects\\ENGG Analysis\\Result\\Subject_ 21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis\\1_21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    const sheetName = "Main(Micro)";
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    console.log("--- METADATA SNIFFER ---");
    for (let i = 0; i < 30; i++) {
        const row = data[i];
        if (row && row.length > 0) {
            const line = row.join('|').substring(0, 100);
            console.log(`Row ${i + 1}: ${line}`);
            if (line.includes('STUD_ID')) console.log(`  ^^^ FOUND STUD_ID AT ROW ${i + 1}`);
        }
    }
}

debugExcel();
