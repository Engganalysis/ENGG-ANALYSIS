const XLSX = require('xlsx');
const path = require('path');

async function debugPrecision() {
    const file = "f:\\Projects\\ENGG Analysis\\Result\\Subject_ 21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis\\1_21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    const sheetName = "Main(Micro)";
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const row8 = data[7] || [];
    const row9 = data[8] || [];

    console.log("--- HEADER MAPPING (0-15) ---");
    for (let i = 0; i < 15; i++) {
        const h8 = String(row8[i] || '').trim();
        const h9 = String(row9[i] || '').trim();
        console.log(`Index ${i}: Row8=["${h8}"] Row9=["${h9}"]`);
    }
}

debugPrecision();
