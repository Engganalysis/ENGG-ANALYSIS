const XLSX = require('xlsx');
const path = require('path');

async function debugAllCampuses() {
    // Exact file path provided by user
    const file = "F:\\Projects\\ENGG Analysis\\Result\\Subject_ 13-Sep-25_Jr.C-120_Jee-Main_WTM-12_All_India_Marks_Analysis\\1_06-Sep-25_Jr.C-120_Jee-Main_WTM-11_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames.find(s => s.includes('Main') || s.includes('All-India')) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Sniff for STUD_ID to find header row
    let headerRowIdx = data.findIndex(row => row && row.includes('STUD_ID'));
    if (headerRowIdx === -1) headerRowIdx = 7;

    const headerRow = data[headerRowIdx] || [];
    const campusColIdx = headerRow.findIndex(h => String(h || '').toUpperCase().includes('CAMPUS'));

    console.log(`Analyzing: ${path.basename(file)}`);

    const campusMap = new Map();

    for (let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;
        const campus = String(row[campusColIdx] || '').trim().toUpperCase();
        campusMap.set(campus, (campusMap.get(campus) || 0) + 1);
    }

    // Sort campuses by name and display ALL of them
    console.log("\n--- COMPLETE LIST OF CAMPUSES IN FILE ---");
    const sortedCampuses = Array.from(campusMap.keys()).sort();
    sortedCampuses.forEach(c => {
        console.log(`[${c}] - ${campusMap.get(c)} students`);
    });
}

debugAllCampuses();
