const fs = require('fs');
const path = require('path');

const ERP_BASE_DIR = 'f:\\Projects\\ENGG Analysis\\ERP Report';

const files = fs.readdirSync(ERP_BASE_DIR);
const marksFiles = files.filter(f => {
    const up = f.toUpperCase();
    const isExcel = f.endsWith('.xlsx') && !f.startsWith('~$');
    const isConfig = up.includes('CONFIG') || up.includes('IDS');
    const isQError = up.includes('STUD_QERROR');
    const isMarks = up.includes('MARKS') || up.includes('ANALYSIS') || up.includes('MACRO') || up.includes('BEN_');
    return isExcel && !isConfig && !isQError && isMarks;
});

console.log(`Found ${marksFiles.length} marks files:`);
marksFiles.forEach(f => console.log(`- ${f}`));
