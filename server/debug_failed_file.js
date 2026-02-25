const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

async function debugExcel() {
    const file = "F:\\Projects\\ENGG Analysis\\Result\\Subject_ 15-Jun-25_Jr.C-120_Jee-Adv_WTA-02_All_India_Marks_Analysis\\1_15-Jun-25_Jr.C-120_Jee-Adv_WTA-02_All_India_Marks_Analysis.xlsx";
    let output = "";
    try {
        const workbook = XLSX.readFile(file);
        output += "Sheet Names: " + JSON.stringify(workbook.SheetNames) + "\n";

        workbook.SheetNames.forEach(sheetName => {
            output += `\n--- SHEET: ${sheetName} ---\n`;
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            for (let i = 0; i < 20; i++) {
                if (data[i]) {
                    output += `Row ${i + 1}: ${JSON.stringify(data[i]).substring(0, 500)}\n`;
                } else {
                    output += `Row ${i + 1}: [Empty/Undefined]\n`;
                }
            }
        });
        fs.writeFileSync('debug_final_out.txt', output);
        console.log("Done. Check debug_final_out.txt");
    } catch (err) {
        console.error("Error reading file:", err.message);
    }
}

debugExcel();
