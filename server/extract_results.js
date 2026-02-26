const XLSX = require('xlsx');
const path = require('path');
const { connectToDb } = require('./db');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'Uploader_Config.xlsx');
const RESULT_DIR = path.join(__dirname, '..', 'Result');
const LOG_PATH = path.join(__dirname, '..', 'Missing_Columns_Log.txt');

async function run() {
    try {
        const pool = await connectToDb();
        console.log("Connected to TiDB.");

        // Clear or initialize log file
        fs.writeFileSync(LOG_PATH, `=== UPLOADER LOG: ${new Date().toLocaleString()} ===\n\n`);

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

        const processedGroups = new Set();
        for (const file of files) {
            console.log(`\nProcessing: ${path.basename(file)}`);
            await processResultFile(file, pool, topIds, allowedCampuses, processedGroups);
        }

        console.log(`\nExecution Finished. Check "${path.basename(LOG_PATH)}" for missing column reports.`);
        process.exit(0);
    } catch (err) {
        console.error("Fatal Error:", err);
        process.exit(1);
    }
}

function findResultFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(findResultFiles(fullPath));
        } else {
            const normalized = file.toUpperCase().replace(/_/g, ' ');
            if (normalized.includes('ALL INDIA MARKS ANALYSIS') && file.endsWith('.xlsx') && !file.startsWith('~$')) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

const KARNATAKA_PREFIXES = [
    'BEN/', 'BAN/', 'SAR/', 'BLR/', 'HUB/', 'DAV/', 'MYS/', 'TUM/',
    'BEL/', 'BAL/', 'MANG/', 'MNG/', 'MAN/'
];

// Fallback for names already cleaned or clearly in major Karnataka cities
const KARNATAKA_CITIES = [
    'BALLARI', 'BALLARI 2', 'BALLARI BOYS', 'BALLARI GIRLS',
    'BANASWADI', 'BANASWADI-SCHOOL', 'BANNERGHATTA ROAD', 'BELAGAVI',
    'DAVANAGERE', 'DAVANAGERE 2', 'DR BS RAO VIDYASOUDHA MYSORE',
    'ECITY NEET BOYS', 'ELECTRONIC CITY', 'ELECTRONIC CITY DS',
    'HEGDENAGAR', 'HORAMAVU', 'HUBLI', 'HUBLI 2',
    'J P NAGAR', 'J P NAGAR-SCHOOL', 'KAGGADASPURA', 'KANAKAPURA ROAD',
    'KORAMANGALA', 'KR PURAM', 'KUDLU', 'MANDYA', 'MANGALORE',
    'MARTHAHALLI', 'MARTHAHALLI C-120', 'MYSORE', 'NAGARBHAVI',
    'PEENYA DASARAHALLI', 'RAJAJI NAGAR', 'RAJAJI NAGAR-SCHOOL',
    'SARJAPURA', 'SESHADRIPURAM', 'TUMKUR', 'UTTARAHALLI',
    'VIDYARANYAPURA', 'YESHWANTHPUR', 'BANGALORE'
];

function cleanCampusName(name) {
    if (!name) return "";
    let upper = name.toUpperCase().trim();

    // Specific case for Marthahalli variants
    if (upper.includes('MARTHAHALLY')) upper = upper.replace('MARTHAHALLY', 'MARTHAHALLI');

    // Check if it starts with any of our allowed prefixes
    const matchedPrefix = KARNATAKA_PREFIXES.find(p => upper.startsWith(p));

    let branch = "";
    if (matchedPrefix) {
        branch = upper.substring(matchedPrefix.length).trim();
    } else {
        branch = upper.includes('/') ? upper.split('/')[1] : upper;
    }

    // Clean the branch name
    branch = branch.replace(/PU COLLEGE\s+/i, '');
    branch = branch.replace(/PUC\s+/i, '');
    branch = branch.replace(/MARTHAHALLY/i, 'MARTHAHALLI');

    return branch.trim();
}

function parseType2Header(header) {
    // Expected: 28-Sep-25_Sr.Super-60_(Nucleus)_Jee Adv_RPTA-12 & CTA-09_All India_Marks_Analysis
    const parts = header.split('_');
    if (parts.length < 4) return null;

    const dateStr = parts[0];
    const allIndiaIdx = parts.findIndex(p => {
        const s = p.toUpperCase().replace(/_/g, ' ');
        return s.includes("ALL INDIA");
    });
    if (allIndiaIdx === -1) return null;

    const testPart = parts[allIndiaIdx - 1];
    const batchPart = parts.slice(1, allIndiaIdx - 1).join('_');

    // Transformation: Sr.Super-60_(Nucleus)_Jee Adv -> Sr.Super-60(N_Adv)
    let transformedBatch = batchPart
        .replace(/_\(Nucleus\)_Jee\s+/i, '(N_')
        .replace(/Jee\s+Adv/i, 'Adv)')
        .replace(/Jee\s+Mains/i, 'Mains)')
        .replace(/Adv$/i, 'Adv)')
        .replace(/Mains$/i, 'Mains)');

    // Ensure trailing paren if we added (N_
    if (transformedBatch.includes('(N_') && !transformedBatch.includes(')')) transformedBatch += ')';

    let testName = testPart;
    let p1Name = testPart, p2Name = "";
    if (testPart.includes('&')) {
        const tParts = testPart.split('&').map(t => t.trim());
        p1Name = tParts[0];
        p2Name = tParts[1];
    }

    return { dateStr, batch: transformedBatch, testName, p1Name, p2Name };
}

function isKarnatakaCampus(name, allowedCampuses) {
    if (!name) return false;
    const upper = name.toUpperCase().trim();

    // 1. Check if explicitly allowed in Uploader_Config.xlsx
    if (allowedCampuses && allowedCampuses.has(upper)) return true;

    // 2. Check by exact prefixes
    if (KARNATAKA_PREFIXES.some(prefix => upper.startsWith(prefix))) return true;

    // 3. Check by known city names (for already cleaned data)
    if (KARNATAKA_CITIES.some(city => upper.includes(city))) return true;

    return false;
}

async function processResultFile(filePath, pool, topIds, allowedCampuses, processedGroups) {
    const wb = XLSX.readFile(filePath);
    // Find the right sheet. Usually the last one or named like Main(Micro) or All-India...
    let sheetName = wb.SheetNames.find(s => s.includes('Main') || s.includes('All-India') || s.includes('Micro') || s.includes('Adv'));

    // If no obvious match, look for a sheet that contains 'STUD_ID' in the first 20 rows
    if (!sheetName) {
        for (const name of wb.SheetNames) {
            const ws = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: "" });
            const found = rows.slice(0, 20).some(row => row.some(cell => String(cell).includes('STUD_ID') || String(cell).includes('STUD ID')));
            if (found) {
                sheetName = name;
                break;
            }
        }
    }

    if (!sheetName) sheetName = wb.SheetNames[0];

    console.log(`  Using Sheet: [${sheetName}]`);
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Discovery: Detect Type 2 Format (Title like All India Marks Analysis in row 4)
    let type2Info = null;
    let type2HeaderRowIdx = -1;
    for (let i = 0; i < 10; i++) {
        const row = data[i];
        if (!row) continue;
        const cell = row.find(c => {
            const s = String(c || '').toUpperCase().replace(/_/g, ' ');
            return s.includes('ALL INDIA') && s.includes('MARKS ANALYSIS');
        });
        if (cell) {
            type2Info = parseType2Header(String(cell));
            type2HeaderRowIdx = i;
            break;
        }
    }

    if (type2Info) {
        await processType2(filePath, data, type2Info, pool, topIds, allowedCampuses, processedGroups);
        return;
    }

    // Rows 1-15 scan for metadata
    for (let i = 0; i < 20; i++) {
        const row = data[i];
        if (!row) continue;

        row.forEach(cell => {
            if (!cell) return;
            const s = String(cell).trim();

            if (s.includes('Prog Name:') && !batch) {
                const match = s.match(/Prog Name:\s*(.*)/);
                if (match) {
                    let extracted = match[1].trim();
                    // Remove "Inc " prefix if present (case-insensitive)
                    if (extracted.toUpperCase().startsWith("INC ")) {
                        extracted = extracted.substring(4).trim();
                    }
                    batch = extracted;
                }
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

        const isHeader = row.some(cell => {
            const s = String(cell || '').trim();
            return s === 'STUD_ID' || s === 'STUD ID' || (s.includes('STUDENT') && s.includes('NAME'));
        });

        if (isHeader) {
            headerRowIdx = i;
            break; // Stop at first header row found
        }
    }

    if (!batch) batch = "Unknown Batch";
    if (!testName) testName = "Unknown Test";

    console.log(`  Identified Metadata: Batch=[${batch}], Date=[${dateStr}], Test=[${testName}]`);

    // Convert Date to YYYY-MM-DD for TiDB
    let dbDate = formatDateToSQL(dateStr);

    // Cross-file deduplication
    const groupKey = `${testName}|${dbDate}|${batch}`;
    if (processedGroups.has(groupKey)) {
        console.log(`  [SKIP] Duplicate data group already processed for: ${groupKey}`);
        return;
    }
    processedGroups.add(groupKey);

    const hRow8 = data[headerRowIdx] || [];
    const hRow9 = data[headerRowIdx + 1] || [];

    // Merge headers from both rows for better context
    const headers = hRow8.map((h, idx) => {
        const p1 = String(h || '').trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' ');
        const p2 = String(hRow9[idx] || '').trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' ');
        return (p1 + ' ' + p2).trim();
    });

    // Map Columns
    const findCol = (regex) => headers.findIndex(h => regex.test(h));

    const colMap = {
        STUD_ID: findCol(/^STUD_ID|^STUD ID/i),
        NAME: findCol(/NAME OF THE STUDENT|STUDENT NAME/i),
        CAMPUS: findCol(/^CAMPUS/i),
        TOT: findCol(/^TOT \d+|^TOT$/i),
        AIR: findCol(/AIR RANK|AIR/i),
        MAT: findCol(/^MAT \d+|^MAT$/i),
        PHY: findCol(/^PHY \d+|^PHY$/i),
        CHE: findCol(/^CHE \d+|^CHE$/i),
        P1_P2: findCol(/P1|P2|P1\+P2/i),
        BEST3: findCol(/Best of three/i),
        B1000: findCol(/Below 1000 Target/i),
        JMAINS: findCol(/Jee Mains Target/i)
    };

    // Use original row 8 for finding "RANK" or "%" labels if specific headers failed
    const row8Headers = hRow8.map(h => String(h || '').trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' '));

    const findPercentAfter = (baseIdx) => {
        if (baseIdx === -1) return -1;
        for (let i = baseIdx + 1; i < baseIdx + 6 && i < headers.length; i++) {
            if (headers[i].includes('%')) return i;
            if (row8Headers[i] === '%') return i;
        }
        return -1;
    };

    const findRankAfter = (baseIdx) => {
        if (baseIdx === -1) return -1;
        for (let i = baseIdx + 1; i < baseIdx + 4 && i < headers.length; i++) {
            if (headers[i].toUpperCase().includes('RANK')) return i;
            if (row8Headers[i].toUpperCase().includes('RANK')) return i;
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

    // EXTRACT MAX MARKS from Row 9 (hRow9) - Verified if it's a Max Marks row
    const firstStudId = String(hRow9[colMap.STUD_ID] || '').trim();
    const isActuallyMaxRow = !firstStudId || isNaN(parseInt(firstStudId)) || parseInt(firstStudId) < 1000;

    let maxMarks = { tot: 300, mat: 100, phy: 100, che: 100 }; // Default Mains
    if (isActuallyMaxRow) {
        maxMarks = {
            tot: parseNum(hRow9[colMap.TOT]) || 300,
            mat: parseNum(hRow9[colMap.MAT]) || 100,
            phy: parseNum(hRow9[colMap.PHY]) || 100,
            che: parseNum(hRow9[colMap.CHE]) || 100
        };
        console.log(`  Extracted Official Max Marks: TOT=${maxMarks.tot}, MAT=${maxMarks.mat}, PHY=${maxMarks.phy}, CHE=${maxMarks.che}`);
    } else {
        // If it's a student, check test name for defaults
        if (testName.startsWith('WTA') || testName.includes('ADV')) {
            maxMarks = { tot: 180, mat: 60, phy: 60, che: 60 };
        }
        console.log(`  Row after header is a Student. Using Default Max Marks for ${testName}: TOT=${maxMarks.tot}`);
    }

    // LOG MISSING COLUMNS
    const missing = Object.keys(colMap).filter(k => colMap[k] === -1);
    // Ignore optional columns in "essential" check for notification
    const essentials = ['STUD_ID', 'NAME', 'CAMPUS', 'TOT', 'MAT', 'PHY', 'CHE'];
    const missingEssentials = missing.filter(k => essentials.includes(k));

    if (missing.length > 0) {
        fs.appendFileSync(LOG_PATH, `FILE: ${path.basename(filePath)}\n`);
        fs.appendFileSync(LOG_PATH, `MISSING COLUMNS: ${missing.join(', ')}\n`);
        fs.appendFileSync(LOG_PATH, `-----------------------------------\n`);
        console.log(`  [WARNING] Missing columns: ${missing.join(', ')}. Check log file.`);
    }

    console.log(`  Header Row: ${headerRowIdx + 1}, Batch: ${batch}, Date: ${dbDate}, Test: ${testName}`);

    const studentsToUpload = [];
    const seenRowsInFile = new Set();
    let duplicateRowsCount = 0;

    for (let i = headerRowIdx + 2; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[colMap.STUD_ID]) continue;

        // 2. Row-level deduplication (Raw data check)
        const rowSig = JSON.stringify(row);
        if (seenRowsInFile.has(rowSig)) {
            duplicateRowsCount++;
            continue;
        }
        seenRowsInFile.add(rowSig);

        const studIdRaw = String(row[colMap.STUD_ID]).trim();
        const campusRaw = String(row[colMap.CAMPUS] || '').trim().toUpperCase();

        // 1. Karnataka/Bangalore Filter Logic
        if (!isKarnatakaCampus(campusRaw, allowedCampuses)) continue;

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
            P1_P2: testName.split('-')[0].trim(), // Always use Test Prefix (WTA, WTM, etc) for Test_Type filter
            Best_of_three: String(row[colMap.BEST3] || '').trim(),
            Below_1000_Target: String(row[colMap.B1000] || '').trim(),
            Jee_Mains_Target: String(row[colMap.JMAINS] || '').trim(),
            Max_Tot: maxMarks.tot,
            Max_Mat: maxMarks.mat,
            Max_Phy: maxMarks.phy,
            Max_Che: maxMarks.che
        };

        studentsToUpload.push(student);
    }

    if (duplicateRowsCount > 0) {
        console.log(`  [INFO] Skipped ${duplicateRowsCount} duplicate rows found within the file.`);
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
                    s.Below_1000_Target, s.Jee_Mains_Target,
                    s.Max_Tot, s.Max_Mat, s.Max_Phy, s.Max_Che
                ].map(v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
                return `(${cols.join(',')})`;
            }).join(',');

            const sql = `INSERT INTO ENGG_RESULT (
                Test, DATE, STUD_ID, NAME_OF_THE_STUDENT, CAMPUS_NAME,
                Total, Total_Per, AIR, MAT, MAT_Per, M_Rank,
                PHY, PHY_Per, P_Rank, CHE, CHE_Per, C_Rank,
                Batch, Year, Top_ALL, P1_P2, Best_of_three,
                Below_1000_Target, Jee_Mains_Target,
                Max_Tot, Max_Mat, Max_Phy, Max_Che
            ) VALUES ${values}`;

            await pool.request().query(sql);
        }
        console.log(`  ✅ Uploaded ${studentsToUpload.length} students.`);
    }
}

async function processType2(filePath, data, info, pool, topIds, allowedCampuses, processedGroups) {
    const { dateStr, batch, testName, p1Name, p2Name } = info;
    const dbDate = formatDateToSQL(dateStr);

    console.log(`  Identified Type 2 Metadata: Batch=[${batch}], Date=[${dbDate}], Test=[${testName}]`);

    // Cross-file deduplication
    const groupKey = `${testName}|${dbDate}|${batch}`;
    if (processedGroups.has(groupKey)) {
        console.log(`  [SKIP] Duplicate data group already processed for: ${groupKey}`);
        return;
    }
    processedGroups.add(groupKey);

    // Find Header Row (where TOT is)
    let headerRowIdx = -1;
    for (let i = 0; i < 20; i++) {
        if (data[i] && data[i].some(c => String(c || '').trim() === 'TOT')) {
            headerRowIdx = i;
            break;
        }
    }
    if (headerRowIdx === -1) {
        console.error("  [ERROR] Could not find TOT header for Type 2");
        return;
    }

    const r8 = data[headerRowIdx];
    const r9 = data[headerRowIdx + 1] || [];
    const r10 = data[headerRowIdx + 2] || []; // New: Third header row or Max Marks
    const r11 = data[headerRowIdx + 3] || [];

    // Base Column Mapping (ADM_NO, Name, Campus)
    const findBase = (regex) => {
        // Search rows 3 to headerRowIdx + 1
        for (let r = 3; r <= headerRowIdx + 1; r++) {
            const row = data[r];
            if (!row) continue;
            // Clean dots and underscores for comparison
            const idx = row.findIndex(c => regex.test(String(c || '').trim().replace(/[\._\s]/g, '')));
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const colMapBase = {
        STUD_ID: findBase(/ADMNO|STUDID|STUDENTID/i),
        NAME: findBase(/NameoftheStudent|StudentName/i),
        CAMPUS: findBase(/^Campus/i)
    };

    // Identify Blocks
    const blocks = [];
    for (let c = 0; c < r8.length; c++) {
        if (String(r8[c]).trim() === 'TOT') {
            const label = String(r9[c] || '').trim().replace(/\s+/g, ''); // P1+P2, P1, P2
            let actualTest = testName;
            if (label === 'P1') actualTest = p1Name;
            else if (label === 'P2') actualTest = p2Name;
            blocks.push({ label, startCol: c, test: actualTest });
        }
    }

    const studentsToUpload = [];

    for (const block of blocks) {
        console.log(`    Mapping Block: ${block.label} (${block.test})`);

        const nextBlockCol = blocks.find(b => b.startCol > block.startCol)?.startCol || r8.length;
        const bMap = {
            TOT: block.startCol,
            TOT_PER: -1, AIR: -1,
            MAT: -1, MAT_PER: -1, MAT_RANK: -1,
            PHY: -1, PHY_PER: -1, PHY_RANK: -1,
            CHE: -1, CHE_PER: -1, CHE_RANK: -1,
            BEST3: -1, B1000: -1, JMAINS: -1
        };

        // Helper to find %, Rank within a sub-range (Searches Row 8, Row 9, AND Row 10)
        const findInSub = (start, searchTerms) => {
            const end = Math.min(start + 15, nextBlockCol);
            for (let k = start; k < end && k < r10.length; k++) {
                const s8 = String(r8[k] || '').trim().toUpperCase();
                const s9 = String(r9[k] || '').trim().toUpperCase();
                const s10 = String(r10[k] || '').trim().toUpperCase();
                for (const term of searchTerms) {
                    if (s8 === term || s9 === term || s10 === term ||
                        s8.includes(term) || s9.includes(term) || s10.includes(term)) return k;
                }
            }
            return -1;
        };

        // Debug: Log headers across 3 rows
        const blockLog = [];
        for (let k = block.startCol; k < nextBlockCol && k < r10.length; k++) {
            blockLog.push(`[${String(r8[k] || '').trim()}|${String(r9[k] || '').trim()}|${String(r10[k] || '').trim()}]`);
        }
        console.log(`      Block [${block.label}] headers (3 rows): ${blockLog.slice(0, 15).join(', ')}...`);

        // 1. Map TOT siblings (Search entire block range for these keywords)
        bMap.TOT_PER = findInSub(block.startCol, ['%', 'PER', 'PERCENTAGE']);
        bMap.AIR = findInSub(block.startCol, ['AIR', 'AIR RANK', 'AIR-RANK', 'AIR_RANK']);
        if (bMap.AIR === -1) bMap.AIR = findInSub(block.startCol + 1, ['RANK']); // Fallback to generic rank

        // 2. Map Subjects
        const findSubjectCol = (terms) => {
            for (let c = block.startCol; c < nextBlockCol; c++) {
                const h8 = String(r8[c] || '').trim().toUpperCase();
                if (terms.some(t => h8 === t)) return c;
            }
            return -1;
        };

        const matCol = findSubjectCol(['MAT', 'MATHEMATICS']);
        if (matCol !== -1) {
            bMap.MAT = matCol;
            bMap.MAT_RANK = findInSub(matCol, ['RANK', 'MAT RANK']);
            bMap.MAT_PER = findInSub(matCol, ['%', 'PER', 'PERCENTAGE']);
        }

        const phyCol = findSubjectCol(['PHY', 'PHYSICS']);
        if (phyCol !== -1) {
            bMap.PHY = phyCol;
            bMap.PHY_RANK = findInSub(phyCol, ['RANK', 'PHY RANK']);
            bMap.PHY_PER = findInSub(phyCol, ['%', 'PER', 'PERCENTAGE']);
        }

        const cheCol = findSubjectCol(['CHE', 'CHEMISTRY']);
        if (cheCol !== -1) {
            bMap.CHE = cheCol;
            bMap.CHE_RANK = findInSub(cheCol, ['RANK', 'CHE RANK']);
            bMap.CHE_PER = findInSub(cheCol, ['%', 'PER', 'PERCENTAGE']);
        }

        // 3. Global target columns
        bMap.BEST3 = r8.findIndex(c => String(c || '').toUpperCase().includes('BEST OF THREE'));
        bMap.B1000 = r8.findIndex(c => String(c || '').toUpperCase().includes('BELOW 1000'));
        bMap.JMAINS = r8.findIndex(c => String(c || '').toUpperCase().includes('MAINS TARGET'));

        console.log(`      Indices: TOT=${bMap.TOT}, %=${bMap.TOT_PER}, AIR=${bMap.AIR}, MAT=${bMap.MAT}, MAT_R=${bMap.MAT_RANK}, PHY=${bMap.PHY}, CHE=${bMap.CHE}`);

        // Max Marks from Row 10 or 11
        // Usually, in this format, Row 10 contains labels like 'Rank' and marks like '116'
        const maxMarks = {
            tot: parseNum(r10[bMap.TOT]) || parseNum(r11[bMap.TOT]) || (batch.includes('Adv') ? 180 : 300),
            mat: parseNum(r10[bMap.MAT]) || parseNum(r11[bMap.MAT]) || (batch.includes('Adv') ? 60 : 100),
            phy: parseNum(r10[bMap.PHY]) || parseNum(r11[bMap.PHY]) || (batch.includes('Adv') ? 60 : 100),
            che: parseNum(r10[bMap.CHE]) || parseNum(r11[bMap.CHE]) || (batch.includes('Adv') ? 60 : 100)
        };

        // Extract student data (Starting from Row headerRowIdx + 3)
        const seenRowsInFile = new Set();
        let duplicateRowsCount = 0;

        for (let i = headerRowIdx + 3; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[colMapBase.STUD_ID]) continue;

            const studIdRaw = String(row[colMapBase.STUD_ID]).trim();
            if (isNaN(parseInt(studIdRaw)) || parseInt(studIdRaw) < 100) continue; // Skip header/max rows

            // Row-level deduplication (Raw data check)
            const rowSig = JSON.stringify(row);
            if (seenRowsInFile.has(rowSig)) {
                duplicateRowsCount++;
                continue;
            }
            seenRowsInFile.add(rowSig);

            const campusRaw = String(row[colMapBase.CAMPUS] || '').trim().toUpperCase();
            if (!isKarnatakaCampus(campusRaw, allowedCampuses)) continue;

            const cleanedCampus = cleanCampusName(campusRaw);

            studentsToUpload.push({
                Test: block.test,
                DATE: dbDate,
                STUD_ID: studIdRaw,
                NAME_OF_THE_STUDENT: String(row[colMapBase.NAME] || '').trim(),
                CAMPUS_NAME: cleanedCampus,
                Total: parseNum(row[bMap.TOT]),
                Total_Per: parseNum(row[bMap.TOT_PER]),
                AIR: parseNum(row[bMap.AIR]),
                MAT: parseNum(row[bMap.MAT]),
                MAT_Per: parseNum(row[bMap.MAT_PER]),
                M_Rank: parseNum(row[bMap.MAT_RANK]),
                PHY: parseNum(row[bMap.PHY]),
                PHY_Per: parseNum(row[bMap.PHY_PER]),
                P_Rank: parseNum(row[bMap.PHY_RANK]),
                CHE: parseNum(row[bMap.CHE]),
                CHE_Per: parseNum(row[bMap.CHE_PER]),
                C_Rank: parseNum(row[bMap.CHE_RANK]),
                Batch: batch,
                Year: dbDate.split('-')[0],
                Top_ALL: topIds.has(studIdRaw) ? 'TOP' : 'ALL',
                P1_P2: block.label,
                Best_of_three: bMap.BEST3 !== -1 ? String(row[bMap.BEST3] || '').trim() : '',
                Below_1000_Target: bMap.B1000 !== -1 ? String(row[bMap.B1000] || '').trim() : '',
                Jee_Mains_Target: bMap.JMAINS !== -1 ? String(row[bMap.JMAINS] || '').trim() : '',
                Max_Tot: maxMarks.tot,
                Max_Mat: maxMarks.mat,
                Max_Phy: maxMarks.phy,
                Max_Che: maxMarks.che
            });
        }
        if (duplicateRowsCount > 0) {
            console.log(`    [INFO] Skipped ${duplicateRowsCount} duplicate student rows in block ${block.label}.`);
        }
    }

    if (studentsToUpload.length > 0) {
        await uploadStudents(studentsToUpload, pool);
    }
}

async function uploadStudents(students, pool) {
    if (students.length === 0) return;

    // Use a unique set of Test + Date + Batch to delete existing
    const uniqueGroups = new Set();
    students.forEach(s => uniqueGroups.add(`${s.Test}|${s.DATE}|${s.Batch}`));

    for (const group of uniqueGroups) {
        const [t, d, b] = group.split('|');
        await pool.request().query(`DELETE FROM ENGG_RESULT WHERE Test = '${t.replace(/'/g, "''")}' AND DATE = '${d}' AND Batch = '${b.replace(/'/g, "''")}'`);
    }

    const BATCH_SIZE = 100;
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
        const batch = students.slice(i, i + BATCH_SIZE);
        const values = batch.map(s => {
            const cols = [
                s.Test, s.DATE, s.STUD_ID, s.NAME_OF_THE_STUDENT, s.CAMPUS_NAME,
                s.Total, s.Total_Per, s.AIR, s.MAT, s.MAT_Per, s.M_Rank,
                s.PHY, s.PHY_Per, s.P_Rank, s.CHE, s.CHE_Per, s.C_Rank,
                s.Batch, s.Year, s.Top_ALL, s.P1_P2, s.Best_of_three,
                s.Below_1000_Target, s.Jee_Mains_Target,
                s.Max_Tot, s.Max_Mat, s.Max_Phy, s.Max_Che
            ].map(v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
            return `(${cols.join(',')})`;
        }).join(',');

        const sql = `INSERT INTO ENGG_RESULT (
            Test, DATE, STUD_ID, NAME_OF_THE_STUDENT, CAMPUS_NAME,
            Total, Total_Per, AIR, MAT, MAT_Per, M_Rank,
            PHY, PHY_Per, P_Rank, CHE, CHE_Per, C_Rank,
            Batch, Year, Top_ALL, P1_P2, Best_of_three,
            Below_1000_Target, Jee_Mains_Target,
            Max_Tot, Max_Mat, Max_Phy, Max_Che
        ) VALUES ${values}`;

        await pool.request().query(sql);
    }
    console.log(`  ✅ Uploaded ${students.length} student records.`);
}

function parseNum(val) {
    if (val === undefined || val === null || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
}

function formatDateToSQL(s) {
    if (!s) return '2025-01-01';
    // Handle 28-Sep-25 or 21-Jun-2025
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
