const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const readline = require('readline-sync');
const { connectToDb } = require('./db');

// --- Configuration ---
const ERP_BASE_DIR = 'f:\\Projects\\ENGG Analysis\\ERP Report';
const CONFIG_FILE = 'f:\\Projects\\ENGG Analysis\\Uploader_Config.xlsx';
const DEFAULT_S_URL = 'https://i.ibb.co/8g6L82cK/Not-Available.png';

// Global cache for manual subject mappings to avoid repeated prompts for the same test
const manualMappingCache = {};

const normalizeId = (id) => String(id || '').trim().replace(/[^0-9]/g, '');

const KARNATAKA_PREFIXES = [
    'BEN/', 'BAN/', 'SAR/', 'BLR/', 'HUB/', 'DAV/', 'MYS/', 'TUM/',
    'BEL/', 'BAL/', 'MANG/', 'MNG/', 'MAN/'
];

function standardizeSubject(sub) {
    if (!sub) return '--';
    const s = String(sub).trim().toUpperCase();
    if (s.includes('MATH') || s === 'MAT') return 'MATHS';
    if (s.includes('PHY')) return 'PHYSICS';
    if (s.includes('CHE')) return 'CHEMISTRY';
    return s;
}

function normalizeCampus(branch) {
    let name = String(branch || '').trim().toUpperCase();
    for (const prefix of KARNATAKA_PREFIXES) {
        if (name.startsWith(prefix)) {
            name = name.substring(prefix.length).trim();
            break;
        }
    }
    // Remove common prefixes like "PU COLLEGE " or "SECONDARY SCHOOL "
    name = name.replace(/^PU COLLEGE\s+/, '').replace(/^SECONDARY SCHOOL\s+/, '').trim();
    return name;
}

async function processErp() {
    let pool;
    try {
        const modeArg = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1]?.toUpperCase() || 'BOTH';
        console.log(`Extraction Mode: ${modeArg}`);

        pool = await connectToDb();
        console.log("Connected to TiDB (ERP Extraction)");

        // 1. Load Uploader Config (Top IDs and All IDs Mapping)
        let topIds = new Set();
        let generalIds = new Set();
        const allowedCampuses = new Set();

        if (fs.existsSync(CONFIG_FILE)) {
            const wb = XLSX.readFile(CONFIG_FILE);

            const loadFromIdsSheet = (sheetName) => {
                const ws = wb.Sheets[sheetName];
                if (!ws) return;
                const data = XLSX.utils.sheet_to_json(ws);
                console.log(`[CONFIG] Reading IDS from sheet: ${sheetName}...`);
                data.forEach(row => {
                    const id = row.OMR_ID || row.STUD_ID || row.ADM_NO || Object.values(row)[0];
                    const cat = String(row.Category || 'TOP').toUpperCase().trim();
                    if (id) {
                        const nid = normalizeId(id);
                        if (cat.includes('TOP')) topIds.add(nid);
                        else generalIds.add(nid);
                    }
                });
            };

            if (wb.SheetNames.includes('IDS')) {
                loadFromIdsSheet('IDS');
            } else {
                // Legacy fallback
                const loadLegacy = (s, set) => {
                    if (wb.Sheets[s]) XLSX.utils.sheet_to_json(wb.Sheets[s]).forEach(r => {
                        const id = r.OMR_ID || r.STUD_ID || r.ADM_NO;
                        if (id) set.add(normalizeId(id));
                    });
                };
                loadLegacy('Top_Students', topIds);
                loadLegacy('All_Students', generalIds);
            }

            // Campus filter
            const cpName = wb.SheetNames.find(n => n.includes('Allowed') || n.includes('Campus'));
            if (cpName) {
                XLSX.utils.sheet_to_json(wb.Sheets[cpName]).forEach(r => {
                    const c = r.CAMPUS_NAME || r.CAMPUS || Object.values(r)[0];
                    if (c) allowedCampuses.add(String(c).trim().toUpperCase());
                });
            }
        }
        console.log(`[CONFIG] Final Counts -> TOP: ${topIds.size}, ALL: ${generalIds.size}, Campuses: ${allowedCampuses.size}`);

        const files = fs.readdirSync(ERP_BASE_DIR);
        const marksFiles = files.filter(f => {
            const up = f.toUpperCase();
            const isExcel = f.endsWith('.xlsx') && !f.startsWith('~$');
            const isConfig = up.includes('CONFIG') || up.includes('IDS');
            const isQError = up.includes('STUD_QERROR');
            const isMarks = up.includes('MARKS') || up.includes('ANALYSIS') || up.includes('MACRO') || up.includes('BEN_');
            return isExcel && !isConfig && !isQError && isMarks;
        });

        console.log(`[FILES] Found ${marksFiles.length} Analysis files to process: ${marksFiles.join(', ')}`);

        for (const marksFile of marksFiles) {
            console.log(`\nProcessing Analysis File: ${marksFile}`);
            const fullMarksPath = path.join(ERP_BASE_DIR, marksFile);

            // Extract Paper 1 and Paper 2 results mapping
            const marksData = parseMarksFile(fullMarksPath);
            if (!marksData) continue;

            const { testInfo } = marksData;
            console.log(`Test: ${testInfo.test}, Date: ${testInfo.date}, Batch: ${testInfo.batch}`);

            // NEW: Check if this file itself contains the STUD_ERQ sheets (Macro Mode)
            const wb = XLSX.readFile(fullMarksPath);
            const sheetNames = wb.SheetNames.map(n => n.toUpperCase());
            const hasInternalP1 = sheetNames.some(n => n.includes('STUD_ERQ_P1') || (n.includes('STUD_ERQ') && n.includes('P1')));
            const hasInternalP2 = sheetNames.some(n => n.includes('STUD_ERQ_P2') || (n.includes('STUD_ERQ') && n.includes('P2')));

            const datePrefix = testInfo.date; // e.g. 28-Sep-25

            if (hasInternalP1) {
                console.log("  [MACRO] Found internal P1 Error sheet.");
                await processPaper(pool, 'P1', fullMarksPath, marksData, topIds, generalIds, allowedCampuses, modeArg);
            } else {
                const p1File = files.find(f => f.includes(datePrefix) && f.includes('(P1)') && f.includes('_Stud_QError_Analysis') && f.endsWith('.xlsx'));
                if (p1File) {
                    await processPaper(pool, 'P1', path.join(ERP_BASE_DIR, p1File), marksData, topIds, generalIds, allowedCampuses, modeArg);
                } else {
                    console.warn(`  [WARN] P1 QError file not found for date ${datePrefix}`);
                }
            }

            if (hasInternalP2) {
                console.log("  [MACRO] Found internal P2 Error sheet.");
                await processPaper(pool, 'P2', fullMarksPath, marksData, topIds, generalIds, allowedCampuses, modeArg);
            } else {
                const p2File = files.find(f => f.includes(datePrefix) && f.includes('(P2)') && f.includes('_Stud_QError_Analysis') && f.endsWith('.xlsx'));
                if (p2File) {
                    await processPaper(pool, 'P2', path.join(ERP_BASE_DIR, p2File), marksData, topIds, generalIds, allowedCampuses, modeArg);
                } else {
                    console.warn(`  [WARN] P2 QError file not found for date ${datePrefix}`);
                }
            }
        }

    } catch (err) {
        console.error("ERP Extraction Fatal Error:", err);
    } finally {
        process.exit(0);
    }
}

/**
 * Parses the main marks analysis file to map StudID -> Performance Metrics
 */
function parseMarksFile(filePath) {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    let headerRowIdx = -1;
    for (let i = 0; i < 20; i++) {
        if (data[i] && data[i].some(c => String(c || '').trim().toUpperCase() === 'TOT')) {
            headerRowIdx = i;
            break;
        }
    }
    if (headerRowIdx === -1) {
        console.warn(`Could not find 'TOT' header in ${filePath}`);
        return null;
    }

    const r8 = data[headerRowIdx];
    const r9 = data[headerRowIdx + 1] || [];
    const r10 = data[headerRowIdx + 2] || [];

    const findCol = (regex) => {
        // Search base rows usually 5-10
        for (let r = Math.max(0, headerRowIdx - 5); r <= headerRowIdx + 2; r++) {
            const row = data[r];
            if (!row) continue;
            const idx = row.findIndex(c => regex.test(String(c || '').trim().replace(/[\._\s]/g, '')));
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const baseCols = {
        STUD_ID: findCol(/ADMNO|STUDID|STUDENTID|OMRID/i),
        NAME: findCol(/NameoftheStudent|StudentName/i),
        CAMPUS: findCol(/^Campus/i)
    };

    const blocks = [];
    for (let c = 0; c < r8.length; c++) {
        if (String(r8[c]).trim().toUpperCase() === 'TOT') {
            const label = String(r9[c] || '').trim().toUpperCase().replace(/\s+/g, '');
            if (label === 'P1' || label === 'P2') {
                blocks.push({ label, startCol: c });
            }
        }
    }

    const marksMap = { P1: {}, P2: {} };

    for (const block of blocks) {
        const nextBlockCol = blocks.find(nb => nb.startCol > block.startCol)?.startCol || r8.length;

        const findRel = (start, terms) => {
            const safeStart = Math.max(0, start);
            for (let k = safeStart; k < safeStart + 15 && k < nextBlockCol; k++) {
                const combined = [r8[k], r9[k], r10[k]].map(v => String(v || '').trim().toUpperCase());
                if (terms.some(t => combined.some(h => h === t || h.includes(t)))) return k;
            }
            return -1;
        };

        const bMap = {
            TOT: block.startCol,
            TOT_P: findRel(block.startCol + 1, ['%', 'PER']),
            AIR: findRel(block.startCol + 1, ['AIR', 'RANK']),
            MAT: findRel(block.startCol, ['MAT', 'MATHEMATICS']),
            PHY: findRel(block.startCol, ['PHY', 'PHYSICS']),
            CHE: findRel(block.startCol, ['CHE', 'CHEM', 'CHEMISTRY'])
        };

        bMap.MAT_R = findRel(bMap.MAT, ['RANK']);
        bMap.MAT_P = findRel(bMap.MAT, ['%', 'PER']);
        bMap.PHY_R = findRel(bMap.PHY, ['RANK']);
        bMap.PHY_P = findRel(bMap.PHY, ['%', 'PER']);
        bMap.CHE_R = findRel(bMap.CHE, ['RANK']);
        bMap.CHE_P = findRel(bMap.CHE, ['%', 'PER']);

        console.log(`    [DEBUG] Map for ${block.label} -> TOT:${bMap.TOT}, MAT:${bMap.MAT}, PHY:${bMap.PHY}, CHE:${bMap.CHE}`);

        for (let i = headerRowIdx + 2; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[baseCols.STUD_ID]) continue;
            const studId = String(row[baseCols.STUD_ID]).trim();
            if (isNaN(parseInt(studId))) continue;

            marksMap[block.label][studId] = {
                Student_Name: String(row[baseCols.NAME] || '').trim(),
                Branch: String(row[baseCols.CAMPUS] || '').trim(),
                TOT: String(row[bMap.TOT] || ''),
                TOT_P: String(row[bMap.TOT_P] || ''),
                AIR: String(row[bMap.AIR] || ''),
                MAT: String(row[bMap.MAT] || ''),
                MAT_R: String(row[bMap.MAT_R] || ''),
                MAT_P: String(row[bMap.MAT_P] || ''),
                PHY: String(row[bMap.PHY] || ''),
                PHY_R: String(row[bMap.PHY_R] || ''),
                PHY_P: String(row[bMap.PHY_P] || ''),
                CHE: String(row[bMap.CHE] || ''),
                CHE_R: String(row[bMap.CHE_R] || ''),
                CHE_P: String(row[bMap.CHE_P] || '')
            };
        }
    }

    const rowHeader = (data[3] && data[3][0]) ? String(data[3][0]) : "";
    return { marks: marksMap, testInfo: parseFilenameInfo(filePath, rowHeader) };
}

function parseFilenameInfo(filePath, sourceText) {
    const filename = path.basename(filePath);
    // Prioritize text from Excel Row 3 if available, otherwise use filename
    const text = sourceText || filename;

    // e.g. 28-Sep-25_Sr.Super-60_Nucleus_XL-500_Jee-Adv_RPTA-12_All India Marks_Analysis.xlsx
    const parts = text.split('_');
    const dateStr = parts[0];

    // Test extraction: Finds patterns like RPTA-12, CTA-09, GTA-01, WTM-05, etc.
    const testPart = parts.find(p => /^[A-Z]{3,4}-[0-9]+/i.test(p)) || parts.find(p => /RPTA|CTA|WTA|GTA|GTM|WTM/i.test(p)) || "Test";
    const testType = testPart.split('-')[0]; // RPTA

    // Batch extraction: Pattern -> Sr/Jr.Super-60([FirstLetter]_[Adv/Mains])
    let batchNameRaw = "Batch";
    const baseMatch = text.match(/(?:Sr|Jr)\.[^(_]*/i);
    let prefix = baseMatch ? baseMatch[0].trim() : (parts[1] || "Batch");

    // Find the word in parentheses (like Nucleus or Sterling)
    const parenMatch = text.match(/\(([^)]+)\)/);
    const firstLetter = parenMatch ? parenMatch[1].trim().charAt(0).toUpperCase() : "N"; // Default to N for Nucleus

    // Detect Adv or Mains
    const isAdv = text.toUpperCase().includes('ADV');
    const isMains = text.toUpperCase().includes('MAIN');
    const typeLabel = isAdv ? 'Adv' : (isMains ? 'Mains' : '');

    // Pattern fix: Jr.Super-60 -> Jr.Super60
    // prefix = prefix.replace(/-60$/, '60').replace(/-120$/, '120');

    const batch = `${prefix}(${firstLetter}${typeLabel ? '_' + typeLabel : ''})`;

    return { date: dateStr, batch, test: testPart, testType, batchRaw: prefix, firstLetter };
}

/**
 * Processes a specific Paper (P1 or P2) QError file
 */
async function processPaper(pool, label, qErrorPath, marksData, topIds, generalIds, allowedCampuses, mode) {
    console.log(`  Processing ${label} QError Extraction (Mode: ${mode})...`);
    const wb = XLSX.readFile(qErrorPath);

    const { testInfo } = marksData;

    // Choose the correct sheet: 
    // Case 1: Internal sheets like STUD_ERQ_P1 / STUD_ERQ_P2
    // Case 2: Standard 'STUD_ERQ'
    const targetSheetName = wb.SheetNames.find(n => {
        const un = n.toUpperCase();
        return un.includes('STUD_ERQ') && un.includes(label.toUpperCase());
    }) || wb.SheetNames.find(n => n.toUpperCase().includes('STUD_ERQ')) || wb.SheetNames[0];

    console.log(`    [DEBUG] Using sheet: ${targetSheetName} in ${path.basename(qErrorPath)}`);
    const ws = wb.Sheets[targetSheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const headers = data[1] || []; // Row 2
    const qCols = [];
    for (let c = 4; c < headers.length; c++) {
        const h = String(headers[c] || '').trim();
        if (/^Q\d+/i.test(h)) {
            const num = h.replace(/Q/i, '');
            qCols.push({ col: c, qNo: String(parseInt(num, 10)) });
        }
    }
    console.log(`    [DEBUG] Detected ${qCols.length} Question columns in ${label}.`);

    // Identify PICS subfolder for this specific paper (P1/P2)
    const picsSubDir = findPicsSubFolder(ERP_BASE_DIR, label, testInfo.batchRaw);
    console.log(`    [DEBUG] Looking for metadata in: ${picsSubDir}`);

    let metaData = loadZeroReport(picsSubDir);
    const keys = loadKeys(path.join(picsSubDir, 'K.xlsx'));

    // --- INTERACTIVE FALLBACK IF ZERO REPORT MISSING OR INCOMPLETE ---
    const cacheKey = `${testInfo.date}_${testInfo.test}_${label}`;
    let manualMapping = manualMappingCache[cacheKey] || null;

    const metaCount = Object.keys(metaData.meta).length;
    // Ask if meta is missing (0) OR clearly incomplete (e.g. < 5 entries when paper is large)
    const isIncomplete = metaCount > 0 && metaCount < 5 && qCols.length > 10;

    if (!manualMapping && (metaCount === 0 || isIncomplete)) {
        if (isIncomplete) {
            console.log(`\n[!] ZERO REPORT for ${testInfo.test} (${label}) seems INCOMPLETE (Only ${metaCount} topics found).`);
        } else {
            console.log(`\n[!] ZERO REPORT MISSING for ${testInfo.test} (${label})`);
        }

        console.log(`[!] Available Questions: 1 to ${qCols.length}`);
        const setManual = readline.keyInYNStrict("Would you like to manually set Subject Ranges for this test?");

        if (setManual) {
            manualMapping = {};
            const subjects = ['MATHS', 'PHYSICS', 'CHEMISTRY'];
            for (const sub of subjects) {
                console.log(`\nConfiguring range for: ${sub}`);
                const start = parseInt(readline.question(`  Start QNo: `));
                const end = parseInt(readline.question(`  End QNo: `));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let q = start; q <= end; q++) manualMapping[q] = sub;
                }
            }
            // Save to cache
            manualMappingCache[cacheKey] = manualMapping;
        } else {
            // Store empty object to not ask again for this test if user said No
            manualMappingCache[cacheKey] = {};
        }
    } else if (manualMapping && Object.keys(manualMapping).length > 0) {
        console.log(`    [INFO] Using cached subject mapping for ${testInfo.test} (${label})`);
    }

    console.log(`    [DEBUG] Metadata Loaded -> Keys: ${Object.keys(keys).length}, Errors Info: ${Object.keys(metaData).length}`);

    // Load ImgBB Mapping if it exists
    let urlMapping = {};
    const mappingPath = path.join(__dirname, 'url_mapping.json');
    if (fs.existsSync(mappingPath)) {
        try {
            urlMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
            console.log(`  [+] Loaded ImgBB URL mapping for ${label}.`);
        } catch (e) {
            console.warn("  [!] Error parsing url_mapping.json; using empty defaults.");
        }
    }

    const dbDate = formatDateToSQL(testInfo.date);

    const rowsToUpload = [];

    for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;
        const studId = normalizeId(row[0]);
        // Matching from marks file - ensure we only take the student's entry for the current paper label
        const studentMarks = marksData.marks[label][studId];

        if (!studentMarks) {
            console.debug(`    [Filter] Student ${studId} not found in paper ${label} marks.`);
            continue;
        }

        // --- CAMPUS FILTER ---
        if (allowedCampuses.size > 0) {
            const campusName = String(studentMarks.Branch || "").trim().toUpperCase();
            if (!allowedCampuses.has(campusName)) {
                console.debug(`    [Filter] Student ${studId} skipped due to campus filter: '${campusName}' not in allowed list.`);
                continue;
            }
        }

        // --- TOP/ALL MODE FILTERING ---
        const isTop = topIds.has(studId);
        const isGeneral = generalIds.has(studId);

        let targetType = "";

        if (mode === 'TOP') {
            if (!isTop) {
                console.debug(`    [Filter] Student ${studId} skipped: not in Top_Students config.`);
                continue;
            }
            targetType = "TOP";
        } else if (mode === 'ALL') {
            if (!isGeneral) {
                console.debug(`    [Filter] Student ${studId} skipped: not in All_Students config.`);
                continue;
            }
            targetType = "ALL";
        } else if (mode === 'BOTH') {
            if (isTop) targetType = "TOP";
            else if (isGeneral) targetType = "ALL";
            else {
                console.debug(`    [Filter] Student ${studId} skipped: not in any ID list in BOTH mode.`);
                continue;
            }
        }

        for (const q of qCols) {
            const val = String(row[q.col] || '').trim().toUpperCase();
            if (val === 'W' || val === 'U') {
                const qNo = q.qNo;
                const meta = metaData.meta[qNo] || {};
                let specificTest = metaData.testName;
                if (!specificTest && testInfo.test.includes('&')) {
                    const testParts = testInfo.test.split('&').map(t => t.trim());
                    if (label === 'P1') specificTest = testParts[0];
                    else if (label === 'P2') specificTest = testParts[1] || testParts[0];
                }
                if (!specificTest) specificTest = testInfo.test;

                const qInt = parseInt(qNo);
                let fallbackSubject = '--';
                if (manualMapping && manualMapping[qInt]) {
                    fallbackSubject = manualMapping[qInt];
                } else {
                    const qsPerSub = qCols.length / 3;
                    if (qInt <= qsPerSub) fallbackSubject = 'MATHS';
                    else if (qInt <= qsPerSub * 2) fallbackSubject = 'PHYSICS';
                    else fallbackSubject = 'CHEMISTRY';
                }

                rowsToUpload.push({
                    STUD_ID: parseInt(studId),
                    Student_Name: studentMarks.Student_Name,
                    Branch: normalizeCampus(studentMarks.Branch), // Normalized campus
                    Batch: testInfo.batch, // Re-added Batch
                    Exam_Date: dbDate, // Date
                    Test_Type: specificTest.split('-')[0], // Extract type from local test name
                    Test: specificTest, // Specific test name (e.g. CTA-09 for P2)
                    TOT: studentMarks.TOT,
                    TOT_P: studentMarks.TOT_P,
                    AIR: studentMarks.AIR,
                    MAT: studentMarks.MAT,
                    MAT_R: studentMarks.MAT_R,
                    MAT_P: studentMarks.MAT_P,
                    PHY: studentMarks.PHY,
                    PHY_R: studentMarks.PHY_R,
                    PHY_P: studentMarks.PHY_P,
                    CHE: studentMarks.CHE,
                    CHE_R: studentMarks.CHE_R,
                    CHE_P: studentMarks.CHE_P,
                    Q_No: parseInt(qNo), // int
                    W_U: val, // text
                    Q_URL: (urlMapping.mapping ? urlMapping.mapping[label]?.Q?.[qNo] : (urlMapping[label]?.Q?.[qNo] || '')) || '',
                    S_URL: (urlMapping.mapping ? urlMapping.mapping[label]?.S?.[qNo] : (urlMapping[label]?.S?.[qNo] || DEFAULT_S_URL)) || DEFAULT_S_URL,
                    Key_Value: keys[qNo] || '',
                    Subject: standardizeSubject(meta.Subject || fallbackSubject),
                    Topic: meta.Topic || '--',
                    Sub_Topics: meta.Sub_Topics || '--',
                    Question_Type: meta.Question_Type || '--',
                    Sources: meta.Sources || '--',
                    Original_Replica: meta.Original_Replica || '--',
                    Level: meta.Level || '--',
                    Year: '2025',
                    Top_ALL: targetType,
                    P1_P2: label
                });

                // Correcting URL lookup if new session-aware structure exists
                // The structure is urlMapping[albumName][label][Q/S][qNo]
                // We need to find if any key in urlMapping matches the marks file name pattern
                const albumName = Object.keys(urlMapping).find(k => k.includes(testInfo.firstLetter) && (k.includes('.xlsx') || k.includes('.xls')));
                if (albumName && urlMapping[albumName] && urlMapping[albumName][label]) {
                    const rowEntry = rowsToUpload[rowsToUpload.length - 1];
                    if (urlMapping[albumName][label].Q?.[qNo]) rowEntry.Q_URL = urlMapping[albumName][label].Q[qNo];
                    if (urlMapping[albumName][label].S?.[qNo]) rowEntry.S_URL = urlMapping[albumName][label].S[qNo];
                }
            }
        }
    }

    console.log(`    [DONE] Generated ${rowsToUpload.length} records for ${label}.`);

    if (rowsToUpload.length > 0) {
        await uploadErpRows(pool, rowsToUpload, mode);
    }
}

function findPicsSubFolder(base, label, batchRaw) {
    const picsDir = path.join(base, 'PICS');
    if (!fs.existsSync(picsDir)) return "";

    // 1. Direct check: PICS/P1 or PICS/P2
    const directPath = path.join(picsDir, label);
    if (fs.existsSync(directPath)) return directPath;

    // 2. Fallback: Search for batch-specific folder
    const subs = fs.readdirSync(picsDir);
    const batchFolder = subs.find(f => f.includes(batchRaw) && f.includes("Q.Paper with Key & Sol's")) || subs[0];
    if (!batchFolder) {
        console.warn(`    [WARN] Batch folder for ${batchRaw} not found in PICS.`);
        return path.join(picsDir, subs[0] || "");
    }

    const subPath = path.join(picsDir, batchFolder, label);
    if (fs.existsSync(subPath)) return subPath;

    // Final fallback: Look for a folder matching the label inside the batch folder
    const batchPath = path.join(picsDir, batchFolder);
    const subFolders = fs.readdirSync(batchPath);
    const matched = subFolders.find(f => f.toUpperCase() === label.toUpperCase());

    return matched ? path.join(batchPath, matched) : batchPath;
}

function loadZeroReport(picsSubDir) {
    if (!picsSubDir || !fs.existsSync(picsSubDir)) return { meta: {}, testName: null };
    const files = fs.readdirSync(picsSubDir);
    // Find any file that contains 'ZERO REPORT' (case-insensitive) anywhere in its name
    const zFile = files.find(f => f.toUpperCase().includes('ZERO REPORT') && f.endsWith('.xlsx'));
    if (!zFile) {
        console.warn(`    [WARN] Zero Report not found in ${picsSubDir}`);
        return { meta: {}, testName: null };
    }

    console.log(`    [DEBUG] Loading Zero Report from: ${zFile}`);

    // Extract Test Name from filename (e.g. ..._WTA-11_...). Must start with a letter to avoid date parts.
    let testName = null;
    const match = zFile.match(/_([A-Z][A-Z0-9]{1,3}-[0-9]+)_/i) || zFile.match(/_([A-Z][A-Z0-9]{1,3}-[0-9]+)/i);
    if (match) testName = match[1];

    const wb = XLSX.readFile(path.join(picsSubDir, zFile));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const mapping = {};
    let headerIdx = -1;
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].some(c => String(c).trim().includes('Q.No'))) {
            headerIdx = i;
            break;
        }
    }

    if (headerIdx !== -1) {
        const rows = XLSX.utils.sheet_to_json(ws, { range: headerIdx });
        rows.forEach(r => {
            const qNo = String(r['Q.No'] || '').trim();
            if (!qNo) return;
            mapping[qNo] = {
                Subject: r['Subject'],
                Topic: r['Chapter/ Topic'],
                Sub_Topics: r['Sub-Sub-Topics'],
                Question_Type: r['Question Type\r\n(Straight Objective, More than one Answer Type, Numerical Answer Type, Single Integer Type, Matrix Matching Type, Passage Type)'],
                Sources: r['Source'],
                Original_Replica: r['Original / Replica'],
                Level: r['Code + Level'] || r['Level']
            };
        });
    }
    return { meta: mapping, testName: testName };
}

function loadKeys(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);
    const keys = {};
    data.forEach(r => {
        const qNo = String(r['Q_No'] || '').trim();
        if (qNo) keys[qNo] = String(r['Key'] || '').trim();
    });
    return keys;
}

async function uploadErpRows(pool, rows, mode) {
    const info = rows[0];
    console.log(`  Cleaning and Uploading ${rows.length} records for ${info.Test} (${info.P1_P2}) Mode: ${mode}...`);

    // User requested NOT to delete from TiDB. 
    // Warning: Running this multiple times for the same test/campus will create duplicate rows.
    /*
    let deleteSql = `DELETE FROM ERP_REPORT_ENGG WHERE Test='${esc(info.Test)}' AND Exam_Date='${info.Exam_Date}' AND P1_P2='${info.P1_P2}' AND Branch='${esc(info.Branch)}'`;
    if (mode === 'TOP') deleteSql += " AND Top_ALL = 'TOP'";
    else if (mode === 'ALL') deleteSql += " AND Top_ALL = 'ALL'";
 
    await pool.request().query(deleteSql);
    */
    console.log(`  [INFO] Safe-Inserting ${rows.length} records (Skipping duplicates)...`);

    for (const r of rows) {
        const sql = `
            INSERT INTO ERP_REPORT_ENGG (
                STUD_ID, Student_Name, Branch, Batch, Exam_Date, Test_Type, Test, TOT, TOT_P, AIR,
                MAT, MAT_R, MAT_P, PHY, PHY_R, PHY_P, CHE, CHE_R, CHE_P,
                Q_No, W_U, Q_URL, S_URL, Key_Value, Subject, Topic, Sub_Topics,
                Question_Type, Sources, Original_Replica, Level, Year, Top_ALL, P1_P2
            )
            SELECT 
                ${r.STUD_ID}, '${esc(r.Student_Name)}', '${esc(r.Branch)}', '${esc(r.Batch)}', '${r.Exam_Date}',
                '${esc(r.Test_Type)}', '${esc(r.Test)}', '${esc(r.TOT)}', '${esc(r.TOT_P)}', '${esc(r.AIR)}',
                '${esc(r.MAT)}', '${esc(r.MAT_R)}', '${esc(r.MAT_P)}',
                '${esc(r.PHY)}', '${esc(r.PHY_R)}', '${esc(r.PHY_P)}',
                '${esc(r.CHE)}', '${esc(r.CHE_R)}', '${esc(r.CHE_P)}',
                ${r.Q_No}, '${esc(r.W_U)}', '${r.Q_URL}', '${r.S_URL}',
                '${esc(r.Key_Value)}', '${esc(r.Subject)}', '${esc(r.Topic)}', '${esc(r.Sub_Topics)}',
                '${esc(r.Question_Type)}', '${esc(r.Sources)}', '${esc(r.Original_Replica)}', '${esc(r.Level)}',
                '${r.Year}', '${r.Top_ALL}', '${r.P1_P2}'
            FROM (SELECT 1 as dummy) AS t
            WHERE NOT EXISTS (
                SELECT 1 FROM ERP_REPORT_ENGG 
                WHERE STUD_ID = ${r.STUD_ID} 
                  AND Test = '${esc(r.Test)}' 
                  AND Exam_Date = '${r.Exam_Date}' 
                  AND Q_No = ${r.Q_No}
                  AND P1_P2 = '${r.P1_P2}'
                  AND Top_ALL = '${r.Top_ALL}'
            )
        `;
        await pool.request().query(sql);
    }
}

function esc(str) { return String(str || '').replace(/'/g, "''"); }

function formatDateToSQL(dateStr) {
    const months = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12' };
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    let month = parts[1];
    if (months[month]) month = months[month];
    return `${year}-${month}-${parts[0].padStart(2, '0')}`;
}

processErp();
