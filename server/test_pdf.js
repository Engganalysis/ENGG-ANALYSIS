const fs = require('fs');
const pdf = require('pdf-parse');
console.log("PDF Library:", typeof pdf, pdf);

async function testPdf() {
    const dataBuffer = fs.readFileSync('f:/Projects/ENGG Analysis/ERP Report/PICS/P2/13-07-2025_Jr.Super60_NUCLEUS BT_Jee-Adv(2020-P2)_CTA-08_Key & Sol\'s.pdf');
    const parse = typeof pdf === 'function' ? pdf : (pdf.default || pdf);
    try {
        const data = await parse(dataBuffer);
        console.log("--- PDF CONTENT ---");
        console.log(data.text.substring(0, 2000));
        console.log("--- END ---");
    } catch (e) {
        console.error("PDF Parse Error:", e);
    }
}
testPdf();
