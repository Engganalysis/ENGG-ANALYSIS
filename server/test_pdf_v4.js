const fs = require('fs');
const pdf = require('pdf-parse');

async function testPdf() {
    const dataBuffer = fs.readFileSync('f:/Projects/ENGG Analysis/ERP Report/PICS/P2/13-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2020-P2)_CTA-08_Key & Sol\'s.pdf');
    try {
        // Many pdf-parse versions require just calling the function
        // If it's the specific 'pdf-parse' package on NPM, it's a function.
        const parse = typeof pdf === 'function' ? pdf : pdf.default;
        const data = await parse(dataBuffer);
        const text = data.text.toUpperCase();

        const subjects = ['PHYSICS', 'CHEMISTRY', 'MATHEMATICS'];
        const found = subjects
            .map(s => ({ name: s, index: text.indexOf(s) }))
            .filter(s => s.index !== -1)
            .sort((a, b) => a.index - b.index);

        if (found.length > 0) {
            const order = found.map(f => f.name.charAt(0)).join('');
            console.log("Order Detected:", order);
        } else {
            console.log("No subjects found.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
testPdf();
