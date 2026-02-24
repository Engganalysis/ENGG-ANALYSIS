const XLSX = require('xlsx');
const path = require('path');

function isKarnatakaCampus(name) {
    if (!name) return false;
    const upper = name.toUpperCase();
    const keywords = ['BEN/', 'HUB/', 'MAN/', 'MYS/', 'TUM/', 'BAL/', 'KAR/', 'MANG/', 'BEL/'];
    return keywords.some(k => upper.includes(k));
}

async function debugSkippedRows() {
    const file = "F:\\Projects\\ENGG Analysis\\Result\\Subject_ 13-Sep-25_Jr.C-120_Jee-Main_WTM-12_All_India_Marks_Analysis\\1_06-Sep-25_Jr.C-120_Jee-Main_WTM-11_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    // Find sheet containing "Main" or "All-India"
    const sheetName = workbook.SheetNames.find(s => s.includes('Main') || s.includes('All-India')) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    let total = 0;
    let karnataka = 0;
    const campusCounts = {};

    // Header at row 8 (index 7) or sniff for STUD_ID
    let headerRowIdx = data.findIndex(row => row && row.includes('STUD_ID'));
    if (headerRowIdx === -1) headerRowIdx = 7;

    const headerRow = data[headerRowIdx] || [];
    const campusColIdx = headerRow.findIndex(h => String(h || '').toUpperCase().includes('CAMPUS'));

    console.log(`Analyzing file: ${path.basename(file)}`);
    console.log(`Detected Sheet: ${sheetName}`);
    console.log(`Header Row Index: ${headerRowIdx}`);
    console.log(`Campus Column Index: ${campusColIdx}`);

    for (let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;
        total++;
        const campus = String(row[campusColIdx] || '').trim().toUpperCase();
        if (isKarnatakaCampus(campus)) {
            karnataka++;
        } else {
            campusCounts[campus] = (campusCounts[campus] || 0) + 1;
        }
    }

    console.log(`Total Student Rows: ${total}`);
    console.log(`Karnataka Rows Identified: ${karnataka}`);
    console.log("\nSample of NON-Karnataka Campuses found (Top 30):");
    Object.entries(campusCounts)
        .sort((a, b) => b[1] - a[1]) // Sort by count desc
        .slice(0, 30)
        .forEach(([c, count]) => {
            console.log(`- [${c}]: ${count}`);
        });
}

debugSkippedRows();
