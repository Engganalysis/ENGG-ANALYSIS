const fs = require('fs');
const pdf = require('pdf-parse');

async function test() {
    const filePath = 'f:/Projects/ENGG Analysis/ERP Report/PICS/P2/20-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2024-P2)_CTA-09_Key & Sol\'s.pdf';
    console.log("Checking file:", filePath);
    if (!fs.existsSync(filePath)) {
        console.log("File does not exist!");
        return;
    }

    try {
        const dataBuffer = fs.readFileSync(filePath);
        if (pdf.PDFParse) {
            console.log("Trying new pdf.PDFParse()...");
            const parser = new pdf.PDFParse();
            // Try different methods on the instance
            console.log("Methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(parser)));
            const data = await parser.parse(dataBuffer);
            console.log("Success! Text snippet:", data.text.substring(0, 100));
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
