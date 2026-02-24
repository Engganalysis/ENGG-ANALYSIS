const XLSX = require('xlsx');
const path = require('path');
const { connectToDb } = require('./db');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'Uploader_Config.xlsx');
const RESULT_DIR = path.join(__dirname, '..', 'Result');

async function run() {
    try {
        const pool = await connectToDb();
        console.log("Connected to TiDB.");

        // 1. Load Config
        if (!fs.existsSync(CONFIG_PATH)) {
            console.error("Config file not found: " + CONFIG_PATH);
            process.exit(1);
        }
        const configWb = XLSX.readFile(CONFIG_PATH);
        const topIds = new Set();
        const allowedCampuses = new Set();

        const topSheet = configWb.Sheets['Top_Students'];
        if (topSheet) {
            const data = XLSX.utils.sheet_to_json(topSheet);
            data.forEach(row => {
                const id = row['STUD_ID'] || row['stud_id'] || row['STUD ID'];
                if (id) topIds.add(String(id).trim());
            });
        }

        const campusSheet = configWb.Sheets['Allowed_Campuses'];
        if (campusSheet) {
            const data = XLSX.utils.sheet_to_json(campusSheet);
            data.forEach(row => {
                const name = row['CAMPUS_NAME'] || row['campus_name'] || row['CAMPUS NAME'] || row['CAMPUS'];
                if (name) allowedCampuses.add(String(name).trim().toUpperCase());
            });
        }

        console.log(`Loaded ${topIds.size} Top IDs and ${allowedCampuses.size} Allowed Campuses.`);

        // 2. Scan for Files
        const files = findResultFiles(RESULT_DIR);
        console.log(`Found ${files.length} result files to process.`);

        for (const file of files) {
            console.log(`\nProcessing: ${path.basename(file)}`);
            await processResultFile(file, pool, topIds, allowedCampuses);
        }

        process.exit(0);
    } catch (err) {
        console.error("Fatal Error:", err);
        process.exit(1);
    }
}

function findResultFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(findResultFiles(fullPath));
        } else if (file.endsWith('_All_India_Marks_Analysis.xlsx') && !file.startsWith('~$')) {
            results.push(fullPath);
        }
    });
    return results;
}

function cleanCampusName(name) {
    if (!name) return "";
    let cleaned = name.includes('/') ? name.split('/')[1] : name;
    cleaned = cleaned.replace(/PU COLLEGE\s+/i, '');
    cleaned = cleaned.replace(/PUC\s+/i, '');
    return cleaned.trim();
}

function isKarnatakaCampus(name) {
    if (!name) return false;
    const upper = name.toUpperCase();
    const keywords = ['BEN/', 'HUB/', 'MAN/', 'MYS/', 'TUM/', 'BAL/', 'KAR/', 'MANG/', 'BEL/'];
    return keywords.some(k => upper.includes(k));
}

async function processResultFile(filePath, pool, topIds, allowedCampuses) {
    const wb = XLSX.readFile(filePath);
    // Find the right sheet. Usually the last one or named like Main(Micro) or All-India...
    const sheetName = wb.SheetNames.find(s => s.includes('Main') || s.includes('All-India')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Extraction Logic
    let batch = "";
    let dateStr = "";
    let testName = "";
    let headerRowIdx = -1;

    // Rows 1-15 scan for metadata
    for (let i = 0; i < 20; i++) {
        const row = data[i];
        if (!row) continue;

        row.forEach(cell => {
            if (!cell) return;
            const s = String(cell).trim();

            if (s.includes('Prog Name:') && !batch) {
                const match = s.match(/Prog Name:\s*(.*)/);
                if (match) batch = match[1].trim();
            }
            if (s.includes('Test Date:') && !dateStr) {
                const match = s.match(/Test Date:\s*(.*)/);
                if (match) dateStr = match[1].trim();
            }
            if (s.includes('Test Name:') && !testName) {
                const match = s.match(/Test Name:\s*(.*)/);
                if (match) {
                    const fullTest = match[1].trim();
                    // Add suffix to batch
                    if (fullTest.includes('JEE(Main)')) batch += "(Mains)";
                    else if (fullTest.includes('JEE(Adv)')) batch += "(Adv)";

                    // Extract test part after /
                    if (fullTest.includes('/')) {
                        testName = fullTest.split('/')[1].trim();
                    } else {
                        testName = fullTest;
                    }
                }
            }
        });

        if (row.includes('STUD_ID')) {
            headerRowIdx = i;
        }
    }

    if (!batch) batch = "Unknown Batch";
    if (!testName) testName = "Unknown Test";

    console.log(`  Identified Metadata: Batch=[${batch}], Date=[${dateStr}], Test=[${testName}]`);

    // Convert Date to YYYY-MM-DD for TiDB
    let dbDate = formatDateToSQL(dateStr);

    const headers = data[headerRowIdx].map(h => String(h || '').trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' '));
    const nextRow = data[headerRowIdx + 1] || [];

    // Map Columns
    const findCol = (regex) => headers.findIndex(h => regex.test(h));

    const colMap = {
        STUD_ID: findCol(/STUD_ID|STUD ID/i),
        NAME: findCol(/NAME OF THE STUDENT|STUDENT NAME/i),
        CAMPUS: findCol(/CAMPUS/i),
        TOT: findCol(/TOT/i),
        AIR: findCol(/AIR RANK|AIR/i),
        MAT: findCol(/^MAT /i) === -1 ? findCol(/^MAT$/i) : findCol(/^MAT /i),
        PHY: findCol(/^PHY /i) === -1 ? findCol(/^PHY$/i) : findCol(/^PHY /i),
        CHE: findCol(/^CHE /i) === -1 ? findCol(/^CHE$/i) : findCol(/^CHE /i),
        P1_P2: findCol(/P1|P2|P1\+P2/i),
        BEST3: findCol(/Best of three/i),
        B1000: findCol(/Below 1000 Target/i),
        JMAINS: findCol(/Jee Mains Target/i)
    };

    // Sub-Percent matchers
    const findPercentAfter = (baseIdx) => {
        if (baseIdx === -1) return -1;
        // Search next few columns for %
        for (let i = baseIdx + 1; i < baseIdx + 6 && i < headers.length; i++) {
            if (headers[i].includes('%')) return i;
        }
        return -1;
    };

    const findRankAfter = (baseIdx) => {
        if (baseIdx === -1) return -1;
        for (let i = baseIdx + 1; i < baseIdx + 3 && i < headers.length; i++) {
            if (headers[i].toUpperCase().includes('RANK')) return i;
        }
        return -1;
    };

    colMap.TOT_PER = findPercentAfter(colMap.TOT);
    colMap.MAT_PER = findPercentAfter(colMap.MAT);
    colMap.PHY_PER = findPercentAfter(colMap.PHY);
    colMap.CHE_PER = findPercentAfter(colMap.CHE);

    colMap.MAT_RANK = findRankAfter(colMap.MAT);
    colMap.PHY_RANK = findRankAfter(colMap.PHY);
    colMap.CHE_RANK = findRankAfter(colMap.CHE);

    console.log(`  Header Row: ${headerRowIdx + 1}, Batch: ${batch}, Date: ${dbDate}, Test: ${testName}`);

    const studentsToUpload = [];

    for (let i = headerRowIdx + 2; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[colMap.STUD_ID]) continue;

        const studIdRaw = String(row[colMap.STUD_ID]).trim();
        const campusRaw = String(row[colMap.CAMPUS] || '').trim().toUpperCase();

        // 1. Karnataka/Bangalore Filter Logic
        if (!isKarnatakaCampus(campusRaw)) continue;

        const cleanedCampus = cleanCampusName(campusRaw);

        const student = {
            Test: testName,
            DATE: dbDate,
            STUD_ID: studIdRaw,
            NAME_OF_THE_STUDENT: String(row[colMap.NAME] || '').trim(),
            CAMPUS_NAME: cleanedCampus,
            Total: parseNum(row[colMap.TOT]),
            Total_Per: parseNum(row[colMap.TOT_PER]),
            AIR: parseNum(row[colMap.AIR]),
            MAT: parseNum(row[colMap.MAT]),
            MAT_Per: parseNum(row[colMap.MAT_PER]),
            M_Rank: parseNum(row[colMap.MAT_RANK]),
            PHY: parseNum(row[colMap.PHY]),
            PHY_Per: parseNum(row[colMap.PHY_PER]),
            P_Rank: parseNum(row[colMap.PHY_RANK]),
            CHE: parseNum(row[colMap.CHE]),
            CHE_Per: parseNum(row[colMap.CHE_PER]),
            C_Rank: parseNum(row[colMap.CHE_RANK]),
            Batch: batch,
            Year: '2025',
            Top_ALL: topIds.has(studIdRaw) ? 'TOP' : 'ALL',
            P1_P2: String(row[colMap.P1_P2] || '').trim() || testName.split('-')[0].trim(), // FALLBACK: Prefix of Test Name
            Best_of_three: String(row[colMap.BEST3] || '').trim(),
            Below_1000_Target: String(row[colMap.B1000] || '').trim(),
            Jee_Mains_Target: String(row[colMap.JMAINS] || '').trim()
        };

        studentsToUpload.push(student);
    }

    console.log(`  Found ${studentsToUpload.length} students after filters.`);

    // Upload in Batches
    if (studentsToUpload.length > 0) {
        // Clear old data for same Test + Batch to avoid dups if re-running
        // Or user said "STUD_ID only as TOP", and "extract data from that campus names only"
        // I'll use REPLACE INTO if the table has a primary key, but I'll do manual delete + insert to be safe
        // Actually, just delete existing for this Test, Date, Batch to keep it clean.
        const safeTest = testName.replace(/'/g, "''");
        const safeBatch = batch.replace(/'/g, "''");
        await pool.request().query(`DELETE FROM ENGG_RESULT WHERE Test = '${safeTest}' AND DATE = '${dbDate}' AND Batch = '${safeBatch}'`);

        const BATCH_SIZE = 100;
        for (let i = 0; i < studentsToUpload.length; i += BATCH_SIZE) {
            const batch = studentsToUpload.slice(i, i + BATCH_SIZE);
            const values = batch.map(s => {
                const cols = [
                    s.Test, s.DATE, s.STUD_ID, s.NAME_OF_THE_STUDENT, s.CAMPUS_NAME,
                    s.Total, s.Total_Per, s.AIR, s.MAT, s.MAT_Per, s.M_Rank,
                    s.PHY, s.PHY_Per, s.P_Rank, s.CHE, s.CHE_Per, s.C_Rank,
                    s.Batch, s.Year, s.Top_ALL, s.P1_P2, s.Best_of_three,
                    s.Below_1000_Target, s.Jee_Mains_Target
                ].map(v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
                return `(${cols.join(',')})`;
            }).join(',');

            const sql = `INSERT INTO ENGG_RESULT (
                Test, DATE, STUD_ID, NAME_OF_THE_STUDENT, CAMPUS_NAME,
                Total, Total_Per, AIR, MAT, MAT_Per, M_Rank,
                PHY, PHY_Per, P_Rank, CHE, CHE_Per, C_Rank,
                Batch, Year, Top_ALL, P1_P2, Best_of_three,
                Below_1000_Target, Jee_Mains_Target
            ) VALUES ${values}`;

            await pool.request().query(sql);
        }
        console.log(`  ✅ Uploaded ${studentsToUpload.length} students.`);
    }
}

function parseNum(val) {
    if (val === undefined || val === null || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
}

function formatDateToSQL(s) {
    if (!s) return '2025-01-01';
    // Handle 21-Jun-2025 or 21-Jun-25
    const parts = s.split(/[-/]/);
    if (parts.length === 3) {
        let day = parts[0].padStart(2, '0');
        let monthName = parts[1].toLowerCase();
        let year = parts[2];
        if (year.length === 2) year = '20' + year;

        const months = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        let month = months[monthName.substring(0, 3)] || '01';
        return `${year}-${month}-${day}`;
    }
    return '2025-01-01';
}

run();
