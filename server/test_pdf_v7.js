const fs = require('fs');
const pdf = require('pdf-parse');

async function test() {
    const filePath = 'f:/Projects/ENGG Analysis/ERP Report/PICS/P2/20-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2024-P2)_CTA-09_Key & Sol\'s.pdf';
    const dataBuffer = fs.readFileSync(filePath);
    try {
        console.log("Trying pdf.PDFParse.parse()...");
        const data = await pdf.PDFParse.parse(dataBuffer);
        console.log("Success! Length:", data.text.length);
        console.log("Snippet:", data.text.substring(0, 100));
    } catch (e) {
        console.log("Failed:", e.message);
    }
}
test();
