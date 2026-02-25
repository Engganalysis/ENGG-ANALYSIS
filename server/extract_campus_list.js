const XLSX = require('xlsx');
const path = require('path');

async function extractCampusNames() {
    const file = "f:\\Projects\\ENGG Analysis\\Result\\Subject_ 21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis\\1_21-Jun-25_Jr.C-120_Jee-Main_WTM-03_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames.find(s => s.includes('Main') || s.includes('All-India')) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    let headerRowIdx = -1;
    for (let i = 0; i < 20; i++) {
        if (data[i] && data[i].includes('STUD_ID')) {
            headerRowIdx = i;
            break;
        }
    }

    if (headerRowIdx === -1) return;

    const headers = data[headerRowIdx];
    const campusColIdx = headers.findIndex(h => /CAMPUS/i.test(h));
    if (campusColIdx === -1) return;

    const campusNames = new Set();
    for (let i = headerRowIdx + 2; i < data.length; i++) {
        const row = data[i];
        if (row && row[campusColIdx]) {
            campusNames.add(String(row[campusColIdx]).trim().toUpperCase());
        }
    }

    const sortedCampuses = Array.from(campusNames).sort();

    const KARNATAKA_PREFIXES = [
        'BEN/', 'BAN/', 'SAR/', 'BLR/', 'HUB/', 'DAV/', 'MYS/', 'TUM/',
        'BEL/', 'BAL/', 'MANG/', 'MNG/', 'MAN/'
    ];

    console.log("--- CLEANED KARNATAKA / BANGALORE BRANCHES ---");
    const campusSet = new Set();
    sortedCampuses.forEach(name => {
        const upper = name.toUpperCase().trim();
        const matchedPrefix = KARNATAKA_PREFIXES.find(p => upper.startsWith(p));

        if (matchedPrefix) {
            let branch = upper.substring(matchedPrefix.length).trim();
            // Clean metadata
            branch = branch.replace(/PU COLLEGE\s+/i, '');
            branch = branch.replace(/PUC\s+/i, '');
            branch = branch.replace(/MARTHAHALLY/i, 'MARTHAHALLI');

            campusSet.add(branch || matchedPrefix.replace('/', ''));
        }
    });

    Array.from(campusSet).sort().forEach(c => console.log(c));
}

extractCampusNames();
