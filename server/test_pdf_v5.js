const fs = require('fs');
const pdf = require('pdf-parse');

async function test() {
    console.log("Keys:", Object.keys(pdf));
    // Since it's a class-based module, let's try common patterns
    try {
        const dataBuffer = fs.readFileSync('f:/Projects/ENGG Analysis/ERP Report/PICS/P2/13-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2020-P2)_CTA-08_Key & Sol\'s.pdf');

        // Option 1: New instance of PDFParse
        if (pdf.PDFParse) {
            console.log("Trying new pdf.PDFParse()...");
            const parser = new pdf.PDFParse();
            const data = await parser.parse(dataBuffer);
            console.log("Success with Option 1! Text length:", data.text.length);
            return;
        }
    } catch (e) {
        console.log("Option 1 failed:", e.message);
    }

    try {
        const dataBuffer = fs.readFileSync('f:/Projects/ENGG Analysis/ERP Report/PICS/P2/13-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2020-P2)_CTA-08_Key & Sol\'s.pdf');
        // Option 2: Static parse method?
        if (pdf.PDFParse && pdf.PDFParse.parse) {
            console.log("Trying pdf.PDFParse.parse()...");
            const data = await pdf.PDFParse.parse(dataBuffer);
            console.log("Success with Option 2!");
            return;
        }
    } catch (e) {
        console.log("Option 2 failed:", e.message);
    }
}
test();
