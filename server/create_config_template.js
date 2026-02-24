const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'Uploader_Config.xlsx');

const wb = XLSX.utils.book_new();

// Sheet 1: Top Students
const topStudentsData = [
    ['STUD_ID'],
    ['123456'], // Example
];
const wsTop = XLSX.utils.aoa_to_sheet(topStudentsData);
XLSX.utils.book_append_sheet(wb, wsTop, 'Top_Students');

// Sheet 2: Allowed Campuses
const allowedCampusesData = [
    ['CAMPUS_NAME'],
    ['CAMPUS A'], // Example
];
const wsCampuses = XLSX.utils.aoa_to_sheet(allowedCampusesData);
XLSX.utils.book_append_sheet(wb, wsCampuses, 'Allowed_Campuses');

XLSX.writeFile(wb, filePath);
console.log('Created Uploader_Config.xlsx at ' + filePath);
