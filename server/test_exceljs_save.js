const ExcelJS = require('F:/Projects/ENGG Analysis/client/node_modules/exceljs');
const path = require('path');
const fs = require('fs');

async function run() {
    try {
        const filePath = path.join(__dirname, '..', 'client', 'public', 'Result Template.xlsx');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Main(Micro)') || workbook.worksheets[0];

        console.log("Original RowCount:", worksheet.rowCount);

        // Save row 10 and 11 styles
        const row10Styles = [];
        const row11Styles = [];
        const row10 = worksheet.getRow(10);
        const row11 = worksheet.getRow(11);
        row10.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            row10Styles[colNumber] = cell.style;
        });
        row11.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            row11Styles[colNumber] = cell.style;
        });

        // Let's splice rows 10 to end
        const originalRowCount = worksheet.rowCount;
        if (originalRowCount >= 10) {
            worksheet.spliceRows(10, originalRowCount - 9);
        }

        // Add 5 mock students
        for (let i = 0; i < 5; i++) {
            const targetRowNum = 10 + i;
            const newRow = worksheet.getRow(targetRowNum);
            newRow.values = [
                '12345' + i, 'Student ' + i, 'SEC-A', 'OFFLINE', 'CAMPUS ' + i,
                200, '66.7', 10, 5, 2, 1,
                80, 8, '80', 70, 15, '70', 50, 20, '50'
            ];
            newRow.height = 20;
            const styles = (i % 2 === 0) ? row10Styles : row11Styles;
            styles.forEach((style, colNumber) => {
                if (style) newRow.getCell(colNumber).style = style;
            });
        }

        // Add totals
        const totalRowNum = 10 + 5;
        const totalRow = worksheet.getRow(totalRowNum);
        totalRow.values = [
            'Campus Selection Average', '', '', '', '',
            '180', '', '15', '', '', '',
            '75', '12', '', '65', '18', '', '40', '22', ''
        ];
        worksheet.mergeCells(`A${totalRowNum}:E${totalRowNum}`);
        totalRow.height = 20;
        row10Styles.forEach((style, colNumber) => {
            if (style) {
                const cell = totalRow.getCell(colNumber);
                cell.style = style;
                cell.font = { ...style.font, bold: true };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFEBF1F5' }
                };
            }
        });

        // Update printArea dynamically
        worksheet.pageSetup.printArea = `A1:T${totalRowNum}`;

        const outPath = path.join(__dirname, '..', 'scratch', 'test_out.xlsx');
        if (!fs.existsSync(path.dirname(outPath))) {
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
        }
        await workbook.xlsx.writeFile(outPath);
        console.log("Successfully wrote test_out.xlsx!");
    } catch (err) {
        console.error("Error during ExcelJS test:", err);
    }
}
run();
