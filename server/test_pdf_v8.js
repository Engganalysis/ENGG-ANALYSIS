const fs = require('fs');
const pdf = require('pdf-parse');

async function test() {
    const filePath = 'f:/Projects/ENGG Analysis/ERP Report/PICS/P2/20-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2024-P2)_CTA-09_Key & Sol\'s.pdf';
    const dataBuffer = fs.readFileSync(filePath);
    try {
        console.log("Trying new pdf.PDFParse(dataBuffer)...");
        const data = await new pdf.PDFParse(dataBuffer);
        console.log("Success! Length:", data.text.length);
        console.log("Snippet:", data.text.substring(0, 500));
    } catch (e) {
        console.log("Failed:", e.message);
    }
}
test();
