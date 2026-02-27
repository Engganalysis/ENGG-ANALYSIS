const XLSX = require('xlsx');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function uploadToImgBB() {
    const ERP_BASE = "F:\\Projects\\ENGG Analysis\\ERP Report";
    const files = fs.readdirSync(ERP_BASE);

    // Broad search for any marks file (same logic as extract_erp)
    const marksFiles = files.filter(f =>
        (f.toUpperCase().includes('ALL INDIA MARKS_ANALYSIS') ||
            f.toUpperCase().includes('ADV.(MACRO)') ||
            !f.toUpperCase().includes('STUD_QERROR'))
        && f.endsWith('.xlsx') && !f.startsWith('~$')
    );

    if (marksFiles.length === 0) {
        console.error("No marks analysis file found in " + ERP_BASE);
        process.exit(1);
    }

    console.log(`[FILES] Found ${marksFiles.length} candidate files for batch detection.`);
    const marksFile = marksFiles[0];

    // --- NEW: Read Batch Info from Excel Content (Row 3) ---
    let sourceText = marksFile;
    try {
        const wb = XLSX.readFile(path.join(ERP_BASE, marksFile));
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data[3] && data[3][0]) {
            sourceText = data[3][0];
            console.log(`[DEBUG] Found batch info in Excel Row 3: ${sourceText}`);
        }
    } catch (e) {
        console.warn("[WARN] Could not read Row 3 from Excel, falling back to filename.");
    }

    // Expected: 29-Jun-25_Jr.Super-60(Nucleus)_Jee Adv_WTA-12 & QAT-02_All India_Marks_Analysis
    const parts = sourceText.split('_');
    const allIndiaIdx = parts.findIndex(p => p.toUpperCase().includes('ALL INDIA'));
    const testName = (allIndiaIdx > 0) ? parts[allIndiaIdx - 1] : "Test";

    // Pattern -> Sr/Jr.Super-60([FirstLetter]_[Adv/Mains])
    const baseMatch = sourceText.match(/(?:Sr|Jr)\.[^(_]*/i);
    const prefix = baseMatch ? baseMatch[0].trim() : (sourceText.split('_')[1] || "Batch");

    const parenMatch = sourceText.match(/\(([^)]+)\)/);
    const firstLetter = parenMatch ? parenMatch[1].trim().charAt(0).toUpperCase() : "N";

    const isAdv = sourceText.toUpperCase().includes('ADV');
    const isMains = sourceText.toUpperCase().includes('MAIN');
    const typeLabel = isAdv ? 'Adv' : (isMains ? 'Mains' : '');

    const ALBUM_NAME = `${prefix}(${firstLetter}${typeLabel ? '_' + typeLabel : ''}) - ${testName}`;

    // Dynamic Pics Folder Detection
    const picsBaseDir = path.join(ERP_BASE, 'PICS');
    let PICS_BASE = picsBaseDir;
    if (!fs.existsSync(path.join(picsBaseDir, 'P1'))) {
        const picsSubs = fs.readdirSync(picsBaseDir);
        const batchFolder = picsSubs.find(f => f.includes(prefix) && f.includes("Q.Paper with Key & Sol's")) || picsSubs[0];
        if (batchFolder) PICS_BASE = path.join(picsBaseDir, batchFolder);
    }

    console.log(`[DYNAMIC] Batch: ${prefix}, Album: ${ALBUM_NAME}`);
    console.log(`[DYNAMIC] Source Folder: ${PICS_BASE}`);

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();

    try {
        const mappingPath = path.join(__dirname, 'url_mapping.json');
        let session = {
            album: ALBUM_NAME,
            test: testName,
            mapping: {
                P1: { Q: {}, S: {} },
                P2: { Q: {}, S: {} }
            }
        };

        if (fs.existsSync(mappingPath)) {
            try {
                const existing = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
                // If it's the SAME album and test, we reuse the mapping. If NEW, we clear it!
                if (existing.album === ALBUM_NAME && (!existing.test || existing.test === testName)) {
                    session = existing;
                    session.test = testName; // Ensure test is set if missing
                    console.log(`[CACHE] Reusing existing mapping for album/test: ${ALBUM_NAME}`);
                } else {
                    console.log(`[NEW] New test/batch detected (${ALBUM_NAME}). Clearing old mapping of (${existing.album || 'Unknown'}).`);
                    // session remains fresh with empty mapping
                }
            } catch (e) {
                console.warn("Could not parse mapping cache, starting fresh.");
            }
        }

        let urlMapping = session.mapping;

        console.log(`\nScanning all folders for uploads...`);
        const papers = ['P1', 'P2'];
        const types = ['Q', 'S'];

        // --- 2. SET INFINITE TIMEOUTS ---
        await page.setDefaultNavigationTimeout(0);
        await page.goto('https://imgbb.com/login', { waitUntil: 'networkidle2' });

        await page.type('#login-subject', 'siri121');
        await page.type('#login-password', '321@Siri#');
        await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log("Login successful.");

        // --- 2. CREATE / FIND ALBUM ---
        console.log(`Checking for album: ${ALBUM_NAME}`);
        await page.goto('https://siri121.imgbb.com/albums', { waitUntil: 'networkidle2' });

        // Find existing album link - Using user-suggested selector '.list-item-desc-title-link'
        let albumUrl = await page.evaluate((name) => {
            const selectors = ['.list-item-desc-title-link', '.album-name', '.name', 'a.name'];
            for (const sel of selectors) {
                const elements = Array.from(document.querySelectorAll(sel));
                const target = elements.find(el => el.innerText && el.innerText.trim().includes(name));
                if (target) {
                    return target.tagName === 'A' ? target.href : target.closest('a')?.href;
                }
            }
            return null;
        }, ALBUM_NAME);

        if (!albumUrl) {
            console.log(`  Album "${ALBUM_NAME}" not found. Creating it...`);
            await page.evaluate(() => {
                const target = Array.from(document.querySelectorAll('span.btn-text, a, button'))
                    .find(s => s.innerText && s.innerText.includes('Create new album'));
                if (target) (target.closest('a, button') || target).click();
            });
            await new Promise(r => setTimeout(r, 3000));
            const nameInputSelector = 'input[placeholder="Album name"], input[name="form-album-name"], input[name="album_name"]';
            await page.waitForSelector(nameInputSelector, { visible: true });
            await page.type(nameInputSelector, ALBUM_NAME);
            await page.evaluate(() => document.querySelector('button[data-action="submit"].btn-input.default')?.click());

            // Wait for ImgBB to finish creating and redirect, then refresh list
            console.log("  Waiting for creation to propagate...");
            await new Promise(r => setTimeout(r, 7000));
            await page.goto('https://siri121.imgbb.com/albums', { waitUntil: 'networkidle2' });

            albumUrl = await page.evaluate((name) => {
                const selectors = ['.list-item-desc-title-link', '.album-name', '.name', 'a.name'];
                for (const sel of selectors) {
                    const elements = Array.from(document.querySelectorAll(sel));
                    const target = elements.find(el => el.innerText && el.innerText.trim().includes(name));
                    if (target) return target.tagName === 'A' ? target.href : target.closest('a')?.href;
                }
                return null;
            }, ALBUM_NAME);
        }

        if (!albumUrl) {
            throw new Error(`Could not find or create album URL for "${ALBUM_NAME}" after retry.`);
        }

        console.log(`  Album URL: ${albumUrl}`);

        for (const paper of papers) {
            for (const type of types) {
                const dir = path.join(PICS_BASE, paper, type);
                if (!fs.existsSync(dir)) {
                    console.log(`[DEBUG] Directory not found: ${dir}`);
                    continue;
                }

                const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
                const missingFiles = files.filter(f => {
                    const qNo = f.replace(/[QS]/i, '').replace('.png', '');
                    return !urlMapping[paper][type][qNo];
                });

                if (missingFiles.length === 0) {
                    console.log(`[INSTANT] All images for ${paper}/${type} are already mapped. Skipping.`);
                    continue;
                }

                console.log(`\n--- Processing Batch: ${paper} (${type}) ---`);
                console.log(`  Uploading ${missingFiles.length} images...`);

                // Always ensure we are inside the album before clicking "Upload images"
                console.log(`  Navigating to album: ${albumUrl}`);
                await page.goto(albumUrl, { waitUntil: 'networkidle2' });

                // 1. Click "Upload images"
                await page.evaluate(() => {
                    const target = Array.from(document.querySelectorAll('span.btn-text, a, button'))
                        .find(s => s.innerText && (s.innerText.includes('Upload images') || s.innerText.includes('UPLOAD')));
                    if (target) (target.closest('a, button') || target).click();
                });

                // 2. Select files for THIS batch only
                const filePaths = missingFiles.map(f => path.join(dir, f));
                await page.waitForSelector('input[type="file"]', { timeout: 60000 });
                const inputUpload = await page.$('input[type="file"]');
                await inputUpload.uploadFile(...filePaths);

                // 3. Click UPLOAD
                console.log("  Waiting for UPLOAD button...");
                await page.waitForSelector('button.btn.btn-big.green[data-action="upload"]', { visible: true, timeout: 60000 });
                await new Promise(r => setTimeout(r, 1500));
                await page.evaluate(() => document.querySelector('button.btn.btn-big.green[data-action="upload"]')?.click());

                // 4. Wait for results
                console.log("  Uploading batch... Please wait.");
                await page.waitForSelector('#uploaded-embed-toggle', { timeout: 600000 });
                await new Promise(r => setTimeout(r, 3000));
                await page.select('#uploaded-embed-toggle', 'direct-links');

                await page.waitForSelector('#uploaded-embed-code-1', { visible: true });
                const allLinksText = await page.$eval('#uploaded-embed-code-1', el => el.value);
                const links = allLinksText.split('\n').map(l => l.trim()).filter(l => l);

                // 5. Map links back to THIS batch
                missingFiles.forEach((file, index) => {
                    const qNo = file.replace(/[QS]/i, '').replace('.png', '');
                    if (links[index]) {
                        urlMapping[paper][type][qNo] = links[index];
                    }
                });

                console.log(`  [+] Successfully mapped ${links.length} links for ${paper}/${type}.`);

                // Optional: Save progress after each batch
                fs.writeFileSync(mappingPath, JSON.stringify(session, null, 2));
            }
        }

        console.log(`\n✅ All batches complete. Final mapping saved to ${mappingPath}`);

    } catch (err) {
        console.error("Upload Error:", err.message);
    } finally {
        await browser.close();
        process.exit(0);
    }
}

uploadToImgBB();
