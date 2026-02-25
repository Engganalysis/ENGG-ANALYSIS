const chokidar = require('chokidar');
const fs = require('fs');
const csv = require('csv-parser');
const { connectToDb } = require('./db');
const path = require('path');
const CHECKPOINT_FILE = path.join(__dirname, 'upload_checkpoint_engg.json');

// --- CONFIGURATION ---
const WATCH_FOLDER = 'F:/Project files';
// STRICTLY WATCH ONLY ENGINEERING RESULTS
const FILES_TO_WATCH = ['ENGG_RESULT.csv'];
const WATCH_PATHS = FILES_TO_WATCH.map(f => path.join(WATCH_FOLDER, f));

console.log("-----------------------------------------");
console.log("   ENGG RESULT AUTO-UPLOADER             ");
console.log("-----------------------------------------");
console.log(`Watching folder: ${WATCH_FOLDER}`);
console.log(`Files: ${FILES_TO_WATCH.join(', ')}`);

// Debounce to avoid double-uploads on save
let isProcessing = false;

// Initialize Watcher
const watcher = chokidar.watch(WATCH_PATHS, {
    persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

watcher
    .on('add', (path) => processFile(path))
    .on('change', (path) => processFile(path))
    .on('error', error => console.error(`Watcher error: ${error}`));

async function processFile(filePath) {
    if (isProcessing) return;
    isProcessing = true;

    // Determine Table Name from Filename
    const filename = require('path').basename(filePath);

    // STRICTLY ENGG RESULT
    let tableName = '';
    const upperName = filename.toUpperCase();

    if (upperName === 'ENGG_RESULT.CSV') {
        tableName = 'ENGG_RESULT';
    } else {
        // Fallback or ignore
        console.log(`Skipping unknown or incorrect file: ${filename}`);
        isProcessing = false;
        return;
    }

    console.log(`\n📄 Change detected! File: ${filename} -> Table: ${tableName}`);

    // --- Ensure Table Exists for ENGG_RESULT ---
    if (tableName === 'ENGG_RESULT') {
        try {
            const pool = await connectToDb();
            // Check if table exists
            const checkTableSql = `SHOW TABLES LIKE 'ENGG_RESULT'`;
            const tableExists = await pool.request().query(checkTableSql);

            if (!tableExists.recordset || tableExists.recordset.length === 0) {
                console.log("⚠️ Table 'ENGG_RESULT' not found. Creating it...");
                // Note: Schema definition is typically handled in create_tables_manual.js now to avoid duplication,
                // but we keep a fallback here matching the new schema.
                const createTableSql = `
                    CREATE TABLE IF NOT EXISTS ENGG_RESULT (
                        Test VARCHAR(255) NOT NULL,
                        DATE DATE NOT NULL,
                        STUD_ID VARCHAR(255) NOT NULL,
                        NAME_OF_THE_STUDENT VARCHAR(255) NOT NULL,
                        CAMPUS_NAME VARCHAR(255) NOT NULL,
                        Total INT,
                        Total_Per INT,
                        AIR INT,
                        MAT INT,
                        MAT_Per INT,
                        M_Rank INT,
                        PHY INT,
                        PHY_Per INT,
                        P_Rank INT,
                        CHE INT,
                        CHE_Per INT,
                        C_Rank INT,
                        Batch VARCHAR(255),
                        Year VARCHAR(50),
                        Top_ALL VARCHAR(50),
                        P1_P2 VARCHAR(50),
                        Best_of_three VARCHAR(50),
                        Below_1000_Target VARCHAR(50),
                        Jee_Mains_Target VARCHAR(50),
                        Max_Tot INT,
                        Max_Mat INT,
                        Max_Phy INT,
                        Max_Che INT
                    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
                `;
                await pool.request().query(createTableSql);
                console.log("✅ Table 'ENGG_RESULT' created successfully.");
            }
        } catch (err) {
            console.error("❌ Error ensuring table existence:", err.message);
            isProcessing = false;
            return;
        }
    }

    const results = [];

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
            // Filter out empty rows (Excel sometimes exports thousands of empty rows with delimiters)
            const hasData = Object.values(data).some(val => val && String(val).trim().length > 0);
            if (hasData) {
                results.push(data);
            }
        })
        .on('end', async () => {
            console.log(`Parsed ${results.length} rows from CSV.`);
            if (results.length > 0) {
                await uploadToDB(results, tableName, filename);
            } else {
                console.log("⚠️ File is empty. Skipping.");
            }
            isProcessing = false;
        })
        .on('error', (err) => {
            console.error("Error reading CSV:", err.message);
            isProcessing = false;
        });
}

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

function isKarnatakaCampus(name) {
    if (!name) return false;
    const upper = name.toUpperCase().trim();

    // 1. Prefix matches
    if (KARNATAKA_PREFIXES.some(prefix => upper.startsWith(prefix))) return true;

    // 2. Already cleaned city matches
    if (KARNATAKA_CITIES.some(city => upper.includes(city))) return true;

    return false;
}

async function uploadToDB(rows, tableName, filename) {
    let pool;
    try {
        console.log("Connecting to TiDB...");
        pool = await connectToDb();

        const checkpoints = loadCheckpoint();
        let startIndex = 0;

        // --- RESUME LOGIC ---
        // 1. Manual override via Environment Variable
        if (process.env.SKIP_RECORDS) {
            startIndex = parseInt(process.env.SKIP_RECORDS);
            console.log(`\n⏭️  Manual Skip: Starting from record ${startIndex} (via env SKIP_RECORDS)...`);
        }
        // 2. Checkpoint Resume
        else if (checkpoints[filename]) {
            if (checkpoints[filename].totalRows !== rows.length) {
                console.log(`⚠️ Note: CSV row count changed (${checkpoints[filename].totalRows} -> ${rows.length}).`);
            }
            startIndex = checkpoints[filename].lastIndex + 1;
            console.log(`\n🔄 Resuming upload for '${filename}' from row ${startIndex + 1} (skipping ${startIndex} rows)...`);
        } else {
            console.log(`Starting upload of ${rows.length} records...`);
        }

        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;

        // Basic Validation
        const firstRow = rows[0];
        const columns = Object.keys(firstRow).map(c => c.trim());

        if (!columns.includes('STUD_ID')) {
            console.error("❌ ERROR: CSV missing 'STUD_ID' column. Check header names!");
            return;
        }

        const BATCH_SIZE = 50;

        for (let i = startIndex; i < rows.length; i += BATCH_SIZE) {
            const batchRows = rows.slice(i, i + BATCH_SIZE);
            const batchInserts = [];
            const checkConditions = [];
            let safeKeysStr = "";

            for (const row of batchRows) {
                const keys = Object.keys(row);
                if (!safeKeysStr) safeKeysStr = keys.map(k => `\`${k.trim()}\``).join(',');

                const findKeyIndex = (name) => keys.findIndex(k => k.trim().toUpperCase() === name);
                const studIdIndex = findKeyIndex('STUD_ID');
                const testIndex = findKeyIndex('TEST');
                const campusIndex = findKeyIndex('CAMPUS_NAME');

                // --- CAMPUS FILTERING ---
                if (campusIndex !== -1) {
                    const campusRaw = String(row[keys[campusIndex]]).trim();
                    if (!isKarnatakaCampus(campusRaw)) {
                        skipCount++;
                        continue; // Skip non-Karnataka records
                    }
                }

                const values = Object.values(row).map((v, index) => {
                    const key = keys[index];
                    const upperKey = key.toUpperCase().trim();
                    if (v === null || v === undefined) return "NULL";
                    let s = String(v).trim();

                    // 0. Clean CAMPUS_NAME
                    if (upperKey === 'CAMPUS_NAME') {
                        s = cleanCampusName(s);
                    }

                    // 1. Handle Numeric Columns
                    const numericColumns = ['TOTAL', 'TOTAL_PER', 'AIR', 'MAT', 'MAT_PER', 'M_RANK', 'PHY', 'PHY_PER', 'P_RANK', 'CHE', 'CHE_PER', 'C_RANK'];
                    if (numericColumns.includes(upperKey)) {
                        if (s === '' || isNaN(Number(s)) || s === '?') return "NULL";
                    }

                    // 2. Format STUD_ID
                    if (upperKey === 'STUD_ID') {
                        if (/[eE][+-]?\d+$/.test(s) || /^\d+\.\d+$/.test(s)) {
                            try { const n = Number(s); if (!isNaN(n)) s = n.toLocaleString('fullwide', { useGrouping: false }); } catch (e) { }
                        }
                    }

                    // 3. Format DATE
                    if (upperKey === 'DATE' || upperKey === 'EXAM_DATE') {
                        let dateObj = null;
                        if (/^\d{5}(\.\d+)?$/.test(s)) {
                            try { const serial = parseFloat(s); dateObj = new Date(Math.round((serial - 25569) * 86400 * 1000)); } catch (e) { }
                        }
                        else if (s.includes('/') || s.includes('-')) {
                            const sep = s.includes('/') ? '/' : '-';
                            const parts = s.split(sep);
                            if (parts.length === 3) dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                        }

                        if (dateObj && !isNaN(dateObj.getTime())) {
                            const y = dateObj.getFullYear();
                            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const d = String(dateObj.getDate()).padStart(2, '0');
                            s = `${y}-${m}-${d}`;
                        }
                    }

                    s = s.replace(/'/g, "''"); // SQL Escape
                    return `'${s}'`;
                });

                // Duplicate Logic Preparation
                const studIdVal = studIdIndex !== -1 ? values[studIdIndex] : null;
                const testVal = testIndex !== -1 ? values[testIndex] : null;

                if (studIdVal) {
                    let clause = `(STUD_ID = ${studIdVal}`;
                    if (testVal) clause += ` AND Test = ${testVal}`;
                    clause += `)`;
                    checkConditions.push(clause);
                }

                batchInserts.push(`(${values.join(',')})`);
            }

            // 2. Optimized Duplicate Check & Insert
            let dbDuplicates = new Set();
            if (checkConditions.length > 0) {
                // Fetch all matching records for this batch in one go
                const batchCheckSql = `SELECT STUD_ID, Test FROM ${tableName} WHERE ${checkConditions.join(' OR ')}`;
                try {
                    const existing = await pool.request().query(batchCheckSql);
                    if (existing.recordset) {
                        existing.recordset.forEach(r => {
                            // Normalize keys for comparison
                            const sId = String(r.STUD_ID).trim();
                            const test = r.Test ? String(r.Test).trim() : 'NULL';
                            const key = `${sId}|${test}`.toUpperCase();
                            dbDuplicates.add(key);
                        });
                    }
                } catch (checkErr) {
                    console.error("Batch Check Warning:", checkErr.message);
                }
            }

            // 3. Filter and Insert
            let validBatchInserts = [];
            let duplicatesInBatch = 0;

            for (let b = 0; b < batchRows.length; b++) {
                const row = batchRows[b];
                const keys = Object.keys(row);

                const getVal = (name) => {
                    const k = keys.find(key => key.trim().toUpperCase() === name);
                    return k ? row[k] : null;
                };

                const clean = (v) => {
                    if (v === null || v === undefined) return 'NULL';
                    let s = String(v).trim();
                    if (/[eE][+-]?\d+$/.test(s) || /^\d+\.\d+$/.test(s)) {
                        try { const n = Number(s); if (!isNaN(n)) s = n.toLocaleString('fullwide', { useGrouping: false }); } catch (e) { }
                    }
                    return s;
                };

                const sIdRaw = clean(getVal('STUD_ID'));
                const testRaw = clean(getVal('TEST'));
                // Engineering Table uses STUD_ID + TEST combination for uniqueness

                const key = `${sIdRaw}|${testRaw}`.toUpperCase();

                if (dbDuplicates.has(key)) {
                    duplicatesInBatch++;
                    failCount++;
                } else {
                    validBatchInserts.push(batchInserts[b]);
                }
            }

            if (validBatchInserts.length > 0) {
                const sql = `INSERT INTO ${tableName} (${safeKeysStr}) VALUES ${validBatchInserts.join(',')}`;
                try {
                    await pool.request().query(sql);
                    successCount += validBatchInserts.length;
                    process.stdout.write(`B(${successCount}) `); // Batch indicator with running total
                } catch (e) {
                    console.error(`\nBatch Insert Failed: ${e.message}`);
                }
            }

            // Save Checkpoint after every batch
            checkpoints[filename] = { lastIndex: (i + batchRows.length - 1), totalRows: rows.length };
            saveCheckpoint(checkpoints);
        }
        console.log(`\n\n✅ Upload Complete!`);
        console.log(`Success: ${successCount}`);
        console.log(`Skipped: ${skipCount} (Non-Karnataka campuses)`);
        console.log(`Failed:  ${failCount} (Likely duplicates or data errors)`);

        // Clear checkpoint on completion
        if (checkpoints[filename]) {
            delete checkpoints[filename];
            saveCheckpoint(checkpoints);
        }

    } catch (err) {
        console.error("❌ Database Error:", err.message);
    }
}

// --- Checkpoint Helpers ---
function loadCheckpoint() {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
        }
    } catch (e) { return {}; }
    return {};
}

function saveCheckpoint(data) {
    try {
        fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
    } catch (e) { }
}
