const XLSX = require('xlsx');
const path = require('path');

function isKarnatakaCampus(name) {
    if (!name) return false;
    const upper = name.toUpperCase();
    const keywords = ['BEN/', 'HUB/', 'MAN/', 'MYS/', 'TUM/', 'BAL/', 'KAR/', 'MANG/', 'BEL/'];
    return keywords.some(k => upper.includes(k));
}

async function debugSkippedRows() {
    const file = "f:\\Projects\\ENGG Analysis\\Result\\Subject_ 21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis\\1_21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    const sheetName = "Main(Micro)";
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    let total = 0;
    let karnataka = 0;
    const campusCounts = {};

    // Header at row 8 (index 7)
    const headerRow = data[7] || [];
    const campusColIdx = headerRow.findIndex(h => String(h || '').toUpperCase() === 'CAMPUS');

    for (let i = 9; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        total++;
        const campus = String(row[campusColIdx] || '').trim().toUpperCase();
        if (isKarnatakaCampus(campus)) {
            karnataka++;
        } else {
            campusCounts[campus] = (campusCounts[campus] || 0) + 1;
        }
    }

    console.log(`Total Rows (excluding headers): ${total}`);
    console.log(`Karnataka Rows Identified: ${karnataka}`);
    console.log("\nSample of NON-Karnataka Campuses found (Top 20):");
    Object.entries(campusCounts).slice(0, 20).forEach(([c, count]) => {
        console.log(`- [${c}]: ${count}`);
    });
}

debugSkippedRows();
