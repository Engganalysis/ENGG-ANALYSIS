const fs = require('fs');
const pdf = require('pdf-parse');

async function testPdf() {
    // Correct way to call pdf-parse: it is a function exported directly
    const dataBuffer = fs.readFileSync('f:/Projects/ENGG Analysis/ERP Report/PICS/P2/13-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2020-P2)_CTA-08_Key & Sol\'s.pdf');
    try {
        const data = await pdf(dataBuffer);
        const text = data.text.toUpperCase();

        const subjects = ['PHYSICS', 'CHEMISTRY', 'MATHEMATICS'];
        const found = subjects
            .map(s => ({ name: s, index: text.indexOf(s) }))
            .filter(s => s.index !== -1)
            .sort((a, b) => a.index - b.index);

        console.log("--- FOUND SUBJECTS ---");
        console.log(found);

        if (found.length === 3) {
            const order = found.map(f => f.name.charAt(0)).join('');
            console.log("Order Detected:", order);
        } else {
            console.log("Could not find all subjects. Count:", found.length);
        }
    } catch (e) {
        console.error("PDF Parsing Error:", e);
    }
}
testPdf();
