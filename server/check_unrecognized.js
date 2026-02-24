const XLSX = require('xlsx');
const path = require('path');

function isKarnatakaCampus(name) {
    if (!name) return false;
    const upper = name.toUpperCase();
    const keywords = ['BEN/', 'HUB/', 'MAN/', 'MYS/', 'TUM/', 'BAL/', 'KAR/', 'MANG/', 'BEL/', 'BAN/', 'SAR/', 'DAV/'];
    return keywords.some(k => upper.includes(k));
}

async function checkMiscellaneous() {
    const file = "F:\\Projects\\ENGG Analysis\\Result\\Subject_ 13-Sep-25_Jr.C-120_Jee-Main_WTM-12_All_India_Marks_Analysis\\1_06-Sep-25_Jr.C-120_Jee-Main_WTM-11_All_India_Marks_Analysis.xlsx";
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames.find(s => s.includes('Main') || s.includes('All-India')) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    let headerRowIdx = data.findIndex(row => row && row.includes('STUD_ID'));
    if (headerRowIdx === -1) headerRowIdx = 7;
    const headerRow = data[headerRowIdx] || [];
    const campusColIdx = headerRow.findIndex(h => String(h || '').toUpperCase().includes('CAMPUS'));

    const others = new Set();
    const knownNonKarnataka = ['HYD/', 'VIS/', 'VIJ/', 'TIR/', 'CHE/', 'KUR/', 'SAL/', 'NEL/', 'ONG/', 'PUN/', 'TRI/', 'GUN/', 'HOS/', 'KAD/', 'KAK/', 'COI/', 'ERO/', 'CHA/'];

    for (let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;
        const campus = String(row[campusColIdx] || '').trim().toUpperCase();

        if (!isKarnatakaCampus(campus)) {
            const prefix = campus.split('/')[0] + '/';
            if (!knownNonKarnataka.includes(prefix)) {
                others.add(campus);
            }
        }
    }

    console.log("--- POTENTIAL UNRECOGNIZED KARNATAKA CAMPUSES? ---");
    Array.from(others).forEach(c => console.log(c));
}

checkMiscellaneous();
