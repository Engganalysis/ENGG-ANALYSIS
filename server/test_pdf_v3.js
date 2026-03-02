const fs = require('fs');
const pdf = require('pdf-parse');

async function testPdf() {
    const parse = pdf.PDFParse || pdf; // Try both
    console.log("Using parse function:", typeof parse);

    const dataBuffer = fs.readFileSync('f:/Projects/ENGG Analysis/ERP Report/PICS/P2/13-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2020-P2)_CTA-08_Key & Sol\'s.pdf');
    try {
        const data = await parse(dataBuffer);
        const text = (data.text || "").toUpperCase();
        console.log("Text length:", text.length);

        const subjects = ['PHYSICS', 'CHEMISTRY', 'MATHEMATICS'];
        const found = subjects
            .map(s => ({ name: s, index: text.indexOf(s) }))
            .filter(s => s.index !== -1)
            .sort((a, b) => a.index - b.index);

        if (found.length > 0) {
            const order = found.map(f => f.name.charAt(0)).join('');
            console.log("Order Detected:", order);
            console.log("Full sequence:", found.map(f => f.name).join(' -> '));
        } else {
            console.log("Keywords not found in extracted text.");
            // Print a snippet to see what's in there
            console.log("Snippet:", text.substring(0, 500));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
testPdf();
