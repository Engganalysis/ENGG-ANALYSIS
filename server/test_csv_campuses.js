const fs = require('fs');
const csv = require('csv-parser');

const KARNATAKA_PREFIXES = [
    'BEN/', 'BAN/', 'SAR/', 'BLR/', 'HUB/', 'DAV/', 'MYS/', 'TUM/',
    'BEL/', 'BAL/', 'MANG/', 'MNG/', 'MAN/'
];

function cleanCampusName(name) {
    if (!name) return "";
    let upper = name.toUpperCase().trim();
    const matchedPrefix = KARNATAKA_PREFIXES.find(p => upper.startsWith(p));

    let branch = "";
    if (matchedPrefix) {
        branch = upper.substring(matchedPrefix.length).trim();
    } else {
        branch = upper.includes('/') ? upper.split('/')[1] : upper;
    }

    branch = branch.replace(/PU COLLEGE\s+/i, '');
    branch = branch.replace(/PUC\s+/i, '');
    branch = branch.replace(/MARTHAHALLY/i, 'MARTHAHALLI');

    return branch.trim();
}

function isKarnatakaCampus(name) {
    if (!name) return false;
    const upper = name.toUpperCase().trim();
    return KARNATAKA_PREFIXES.some(prefix => upper.startsWith(prefix));
}

const csvFile = 'F:/Project files/ENGG_RESULT.csv';
const results = new Set();
const rawMatched = new Set();

fs.createReadStream(csvFile)
    .pipe(csv())
    .on('data', (row) => {
        const campusKey = Object.keys(row).find(k => k.trim().toUpperCase() === 'CAMPUS_NAME');
        if (campusKey) {
            const raw = String(row[campusKey]).trim();
            if (isKarnatakaCampus(raw)) {
                rawMatched.add(raw);
                results.add(cleanCampusName(raw));
            }
        }
    })
    .on('end', () => {
        console.log("--- RAW MATCHED CAMPUSES IN KARNATAKA/BANGALORE ---");
        Array.from(rawMatched).sort().forEach(c => console.log(c));

        console.log("\n--- CLEANED BRANCH NAMES ---");
        Array.from(results).sort().forEach(c => console.log(c));
    });
