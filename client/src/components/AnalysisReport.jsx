import React, { useState, useEffect } from 'react';
import { buildQueryParams, formatDate, API_URL } from '../utils/apiHelper';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from './Modal';
import LoadingTimer from './LoadingTimer';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';


const AnalysisReport = ({ filters }) => {
    const [examStats, setExamStats] = useState([]);
    const [studentMarks, setStudentMarks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [meritSortConfig, setMeritSortConfig] = useState({ key: 'tot', direction: 'desc' });
    const [statsSortConfig, setStatsSortConfig] = useState({ key: 'DATE', direction: 'desc' });
    const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    useEffect(() => {
        const controller = new AbortController();
        const fetchData = async () => {
            setLoading(true);
            setExamStats([]); // Clear old data immediately
            setStudentMarks([]); // Clear old data immediately

            try {
                const queryParams = buildQueryParams(filters).toString();
                // Fetch Table 1: Exam Stats
                const statsRes = await fetch(`${API_URL}/api/exam-stats?${queryParams}`, { signal: controller.signal });
                const statsData = await statsRes.json();
                if (!controller.signal.aborted) {
                    setExamStats(statsData && Array.isArray(statsData) ? statsData : []);
                }

                // Fetch Table 2: Student Marks
                const marksRes = await fetch(`${API_URL}/api/analysis-report?${queryParams}`, { signal: controller.signal });
                const marksData = await marksRes.json();

                if (!controller.signal.aborted) {
                    setStudentMarks(marksData && marksData.students ? marksData.students : []);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error("Failed to fetch reports:", error);
                    setExamStats([]);
                    setStudentMarks([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        // Debounce only the network call, but show loading immediately?
        // User wants "till full data loading only show the table from the database". 
        // Showing loading immediately is safer to avoid confusion.
        const timeoutId = setTimeout(() => {
            fetchData();
        }, 500);

        return () => {
            controller.abort();
            clearTimeout(timeoutId);
        };
    }, [filters]);

    const calculateTotals = () => {
        if (!studentMarks || studentMarks.length === 0) return null;
        const count = studentMarks.length;
        const sum = (field) => studentMarks.reduce((acc, curr) => acc + (Number(curr[field]) || 0), 0);
        return {
            tot: Math.round(sum('tot') / count),
            air: Math.round(sum('air') / count),
            mat: Math.round(sum('mat') / count),
            m_rank: Math.round(sum('m_rank') / count),
            phy: Math.round(sum('phy') / count),
            p_rank: Math.round(sum('p_rank') / count),
            che: Math.round(sum('che') / count),
            c_rank: Math.round(sum('c_rank') / count),
        };
    };

    const calculateStatsSummary = () => {
        if (!studentMarks || studentMarks.length === 0 || !examStats || examStats.length === 0) return null;

        // Count how many students met thresholds based on their AVERAGE performance across the selection
        const countIf = (predicate) => studentMarks.filter(predicate).length;

        // For non-threshold fields (Attn, Max_T, Max_B, etc.), we take the maximum from the individual exam stats in this selection
        // or we could take average. Looking at the user request "same way if we select multiple exams... take the count of that T>700... want to display at bottom"
        // This implies the threshold columns should be counts of students in the CURRENT selection.

        // CORRECTION: If only one exam is selected, the "Average" row should exactly match that single exam's stats.
        if (examStats.length === 1) {
            return examStats[0];
        }

        return {
            Attn: studentMarks.length,
            Max_T: Math.max(...examStats.map(s => Number(s.Max_T) || 0)),
            Official_Max_T: Math.round(examStats.reduce((acc, s) => acc + (Number(s.Official_Max_T) || 0), 0) / examStats.length),
            T_250: countIf(s => Number(s.tot) >= 250),
            T_200: countIf(s => Number(s.tot) >= 200),
            T_180: countIf(s => Number(s.tot) >= 180),
            T_150: countIf(s => Number(s.tot) >= 150),
            T_120: countIf(s => Number(s.tot) >= 120),
            T_100: countIf(s => Number(s.tot) >= 100),
            T_80: countIf(s => Number(s.tot) >= 80),
            Max_M: Math.max(...examStats.map(s => Number(s.Max_M) || 0)),
            Official_Max_M: Math.round(examStats.reduce((acc, s) => acc + (Number(s.Official_Max_M) || 0), 0) / examStats.length),
            M_80: countIf(s => Number(s.mat) >= 80),
            M_70: countIf(s => Number(s.mat) >= 70),
            Max_P: Math.max(...examStats.map(s => Number(s.Max_P) || 0)),
            Official_Max_P: Math.round(examStats.reduce((acc, s) => acc + (Number(s.Official_Max_P) || 0), 0) / examStats.length),
            P_80: countIf(s => Number(s.phy) >= 80),
            P_70: countIf(s => Number(s.phy) >= 70),
            Max_C: Math.max(...examStats.map(s => Number(s.Max_C) || 0)),
            Official_Max_C: Math.round(examStats.reduce((acc, s) => acc + (Number(s.Official_Max_C) || 0), 0) / examStats.length),
            C_80: countIf(s => Number(s.che) >= 80),
            C_70: countIf(s => Number(s.che) >= 70)
        };
    };

    const totals = calculateTotals();
    const statsSummary = calculateStatsSummary();

    const sortData = (data, key, direction) => {
        if (!key) return data;
        const sorted = [...data].sort((a, b) => {
            let aVal, bVal;

            if (key === 'avg') {
                aVal = (Number(a.mat) + Number(a.phy) + Number(a.che)) / 3;
                bVal = (Number(b.mat) + Number(b.phy) + Number(b.che)) / 3;
            } else {
                aVal = a[key] ?? '';
                bVal = b[key] ?? '';
            }

            // Handle numeric conversion for marks/ranks
            const isNumeric = (val) => typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && !isNaN(val));

            const parseDateVal = (dateStr) => {
                if (!dateStr) return new Date(0);
                if (dateStr instanceof Date) return dateStr;
                const dmyPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/;
                const match = String(dateStr).match(dmyPattern);
                if (match) {
                    let yearStr = match[3];
                    if (yearStr.length === 2) yearStr = '20' + yearStr;
                    return new Date(yearStr, match[2] - 1, match[1]);
                }
                const d = new Date(dateStr);
                return isNaN(d.getTime()) ? new Date(0) : d;
            };

            if (key === 'DATE') {
                aVal = parseDateVal(aVal).getTime();
                bVal = parseDateVal(bVal).getTime();
            } else if (isNumeric(aVal) && isNumeric(bVal)) {
                aVal = Number(aVal);
                bVal = Number(bVal);
            } else {
                // String comparison
                return direction === 'asc'
                    ? String(aVal).localeCompare(String(bVal))
                    : String(bVal).localeCompare(String(aVal));
            }

            if (aVal === bVal) return 0;
            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    };

    const requestSort = (configSetter, key) => {
        configSetter(prev => {
            // Default direction based on column type
            const isNumericCol = ['tot', 'air', 'mat', 'm_rank', 'phy', 'p_rank', 'che', 'c_rank', 'STUD_ID'].includes(key);
            const isDateCol = key === 'DATE';
            const defaultDir = (isNumericCol || isDateCol) ? 'desc' : 'asc';

            return {
                key,
                direction: prev.key === key
                    ? (prev.direction === 'desc' ? 'asc' : 'desc')
                    : defaultDir
            };
        });
    };

    const sortedExamStats = sortData(examStats, statsSortConfig.key, statsSortConfig.direction);
    const sortedStudentMarks = sortData(studentMarks, meritSortConfig.key, meritSortConfig.direction);

    const SortIcon = ({ config, columnKey }) => {
        if (config.key !== columnKey) return <span style={{ opacity: 0.2, marginLeft: '4px', fontSize: '0.8rem' }}>⇅</span>;
        return <span style={{ marginLeft: '4px', fontSize: '0.8rem', fontWeight: 'bold', color: '#6366f1' }}>{config.direction === 'desc' ? '↓' : '↑'}</span>;
    };

    const loadImage = (src) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
        });
    };

    const downloadPDF = async () => {
        try {
            const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

            // Helper to load font
            const loadFont = async (url) => {
                console.log(`[PDF] Attempting to load font from: ${url}`);
                try {
                    const res = await fetch(url);
                    if (!res.ok) {
                        console.error(`[PDF] Failed to fetch font: ${res.statusText}`);
                        throw new Error(`Failed to load font: ${url}`);
                    }
                    const blob = await res.blob();
                    console.log(`[PDF] Font loaded successfully. Size: ${blob.size}`);
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(blob);
                    });
                } catch (err) {
                    console.error("[PDF] Font loading error:", err);
                    return null;
                }
            };

            const [logoImg, impactFont] = await Promise.all([
                loadImage('/logo.png'),
                loadFont('/fonts/unicode.impact.ttf')
            ]);

            // Add Font
            if (impactFont) {
                doc.addFileToVFS("unicode.impact.ttf", impactFont);
                doc.addFont("unicode.impact.ttf", "Impact", "normal");
            }

            const pageWidth = doc.internal.pageSize.getWidth();

            // 1. Draw Header Background (Pastel Plain)
            const headerHeight = 62;
            doc.setFillColor(240, 249, 255); // Light Pastel Blue (#F0F9FF)
            doc.rect(0, 0, pageWidth, headerHeight, 'F');

            // Subtle bottom border for the header
            doc.setDrawColor(200, 220, 240);
            doc.setLineWidth(0.2);
            doc.line(0, headerHeight, pageWidth, headerHeight);

            let currentY = 10;

            // --- HEADER LAYOUT ---
            const logoH = 22;
            let logoW = 22;
            if (logoImg) {
                const aspect = logoImg.width / logoImg.height;
                logoW = logoH * aspect;
                const logoX = (pageWidth - logoW) / 2;
                doc.addImage(logoImg, 'PNG', logoX, currentY, logoW, logoH, undefined, 'FAST');
                currentY += logoH + 2;
            }

            const part1 = "Sri Chaitanya";
            const part2 = " Educational Institutions";
            doc.setFontSize(34);

            if (impactFont) doc.setFont("Impact", "normal");
            else doc.setFont("helvetica", "bold");
            const w1 = doc.getTextWidth(part1);

            doc.setFont("helvetica", "normal");
            const w2 = doc.getTextWidth(part2);

            const totalTitleWidth = w1 + w2;
            const titleStartX = (pageWidth - totalTitleWidth) / 2;

            if (impactFont) doc.setFont("Impact", "normal");
            else doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 80, 160); // Darker blue for contrast
            doc.text(part1, titleStartX, currentY + 10);

            doc.setFont("helvetica", "normal");
            doc.setTextColor(20, 60, 120);
            doc.text(part2, titleStartX + w1, currentY + 10);

            currentY += 22;

            const testDate = examStats.length > 0 ? formatDate(examStats[0].DATE) : formatDate(new Date());
            const stream = (filters.stream && filters.stream.length > 0) ? filters.stream.join(',') : 'SR_ELITE';
            const testName = examStats.length > 0 ? examStats[0].Test : 'GRAND TEST';
            const fullPattern = `${testDate}_${stream}_${testName}_All India Marks Analysis`.replace(/\//g, '-');

            doc.setFont("helvetica", "bolditalic");
            doc.setFontSize(16);
            doc.setTextColor(110, 0, 50); // Deep Maroon
            doc.text(fullPattern, pageWidth / 2, currentY, { align: 'center', maxWidth: pageWidth - 20 });

            currentY += 10;

            // 4. Data Tables
            const tableColumn = [
                { content: "STUD ID", rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                { content: "NAME OF THE STUDENT", rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: "CAMPUS NAME", rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                { content: `Total\n(${Math.round(studentMarks[0]?.max_tot || 300)})`, rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [255, 255, 204] } },
                { content: "AIR", rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [255, 255, 153] } },
                { content: `Mathematics\n(${Math.round(studentMarks[0]?.max_mat || 100)})`, colSpan: 2, styles: { halign: 'center', fillColor: [253, 233, 217] } },
                { content: `Physics\n(${Math.round(studentMarks[0]?.max_phy || 100)})`, colSpan: 2, styles: { halign: 'center', fillColor: [235, 241, 222] } },
                { content: `Chemistry\n(${Math.round(studentMarks[0]?.max_che || 100)})`, colSpan: 2, styles: { halign: 'center', fillColor: [242, 220, 219] } }
            ];

            const subHeader = [
                { content: "MAT", styles: { halign: 'center', textColor: [0, 0, 0], fillColor: [253, 233, 217] } },
                { content: "RANK", styles: { halign: 'center', textColor: [0, 0, 0], fillColor: [253, 233, 217] } },
                { content: "PHY", styles: { halign: 'center', textColor: [0, 0, 0], fillColor: [235, 241, 222] } },
                { content: "RANK", styles: { halign: 'center', textColor: [0, 0, 0], fillColor: [235, 241, 222] } },
                { content: "CHEM", styles: { halign: 'center', textColor: [0, 0, 0], fillColor: [242, 220, 219] } },
                { content: "RANK", styles: { halign: 'center', textColor: [0, 0, 0], fillColor: [242, 220, 219] } }
            ];

            const body = studentMarks.map(row => [
                row.STUD_ID || '',
                (row.name || '').toUpperCase(),
                (row.campus || '').toUpperCase(),
                Math.round(row.tot || 0),
                Math.round(row.air) || '-',
                Math.round(row.mat || 0),
                Math.round(row.m_rank || 0),
                Math.round(row.phy || 0),
                Math.round(row.p_rank || 0),
                Math.round(row.che || 0),
                Math.round(row.c_rank || 0)
            ]);

            autoTable(doc, {
                head: [tableColumn, subHeader],
                body: body,
                startY: currentY,
                theme: 'grid',
                styles: {
                    fontSize: 11, // Body font size
                    cellPadding: 0.8, // Slightly more compact to save rows
                    halign: 'center',
                    valign: 'middle',
                    lineColor: [173, 216, 230], // Standard LightBlue #ADD8E6
                    lineWidth: 0.15,
                    textColor: [0, 0, 0], // Default black
                    font: "helvetica",
                    fontStyle: 'bold'
                },
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 0, 0], // Pure Black headers
                    fontStyle: 'bold',
                    lineWidth: 0.2, // Slightly thicker border for headers
                    fontSize: 10, // Header font size 10pt as requested
                    cellPadding: 0.8 // Compact headers
                },
                columnStyles: {
                    0: { cellWidth: 20, fillColor: [255, 255, 255] }, // STUD ID
                    1: { halign: 'left', cellWidth: 60, fillColor: [255, 255, 255] }, // NAME
                    2: { halign: 'left', cellWidth: 50, fillColor: [255, 255, 255] }, // CAMPUS
                    3: { cellWidth: 20, fillColor: [255, 255, 204] }, // Total
                    4: { cellWidth: 20, fillColor: [255, 255, 255], textColor: [0, 0, 0] }, // AIR
                    5: { cellWidth: 20, fillColor: [253, 233, 217] }, // MAT Marks
                    6: { cellWidth: 15, fillColor: [255, 255, 255] }, // MAT Rank
                    7: { cellWidth: 20, fillColor: [235, 241, 222] }, // Physics Marks
                    8: { cellWidth: 15, fillColor: [255, 255, 255] }, // Physics Rank
                    9: { cellWidth: 20, fillColor: [242, 220, 219] }, // Chem Marks
                    10: { cellWidth: 15, fillColor: [255, 255, 255] }  // Chem Rank
                },
                margin: { left: 9, right: 9, top: 15, bottom: 15 },
                tableWidth: 'auto', // Let it take full width between margins
                rowPageBreak: 'avoid', // Prevent rows from splitting across pages (Corrected placement)
                didDrawPage: (data) => {
                    // Page watermark removed for pastel plain design
                },
                didParseCell: (data) => {
                    // Reduce font size for first 3 columns to 10pt as requested
                    if (data.section === 'body' && (data.column.index === 0 || data.column.index === 1 || data.column.index === 2)) {
                        data.cell.styles.fontSize = 10;
                    }
                }
            });

            doc.save(`${fullPattern}.pdf`);
        } catch (error) {
            console.error("PDF Export Error:", error);
            setModal({
                isOpen: true,
                type: 'danger',
                title: 'PDF Export Failed',
                message: 'Failed to generate PDF. Check console for details.',
                onClose: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    };

    const downloadExcel = async () => {
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Analysis Report');

            // 1. Add Title (Merged Row 1)
            // Excel Export - split lines? Excel merges are tricky for multi-color in one cell.
            // We'll keep it one cell but change color to main Blue #0070C0
            worksheet.addRow(['SRI CHAITANYA EDUCATIONAL INSTITUTIONS']);
            worksheet.mergeCells('A1:O1');
            const titleCell = worksheet.getCell('A1');
            titleCell.font = { name: 'Impact', size: 28, bold: true, color: { argb: 'FF0070C0' } }; // Increased Size
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(1).height = 40; // Adjusted height for larger font

            // 2. Add Subtitle (Pattern Row 2)
            const testDate = examStats.length > 0 ? formatDate(examStats[0].DATE) : formatDate(new Date());
            const stream = (filters.stream && filters.stream.length > 0) ? filters.stream.join(',') : 'SR_ELITE';
            const testName = examStats.length > 0 ? examStats[0].Test : 'GRAND TEST';
            const fullPattern = `${testDate}_${stream}_${testName}_All India Marks Analysis`.replace(/\//g, '-');

            worksheet.addRow([fullPattern]);
            worksheet.mergeCells('A2:O2');
            const subTitleCell = worksheet.getCell('A2');
            subTitleCell.font = { size: 14, bold: true, italic: true, color: { argb: 'FF800040' } };
            subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(2).height = 20; // Reduced height to tighten space

            // Empty spacer row
            worksheet.addRow([]);

            // 3. Multi-level Headers (Rows 4 & 5)
            const headerRow4Values = [
                'STUD ID', 'NAME OF THE STUDENT', 'CAMPUS NAME',
                `Total (${Math.round(studentMarks[0]?.max_tot || 300)})`,
                'AIR',
                `Mathematics (${Math.round(studentMarks[0]?.max_mat || 100)})`, '',
                `Physics (${Math.round(studentMarks[0]?.max_phy || 100)})`, '',
                `Chemistry (${Math.round(studentMarks[0]?.max_che || 100)})`, '',
                'EXAMS'
            ];
            worksheet.addRow(headerRow4Values);
            worksheet.mergeCells('F4:G4');
            worksheet.mergeCells('H4:I4');
            worksheet.mergeCells('J4:K4');
            // Merge single column headers vertically
            ['A', 'B', 'C', 'D', 'E', 'L'].forEach(col => {
                worksheet.mergeCells(`${col}4:${col}5`);
            });

            const headerRow5Values = [
                '', '', '', '', '',
                'MAT', 'RANK', 'PHY', 'RANK', 'CHEM', 'RANK', ''
            ];
            worksheet.addRow(headerRow5Values);

            // Style headers
            [4, 5].forEach(rowNum => {
                const row = worksheet.getRow(rowNum);
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
                    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                        left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                        bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                        right: { style: 'thin', color: { argb: 'FFFFFFFF' } }
                    };
                });
            });

            // Set column widths
            worksheet.columns = [
                { width: 15 }, { width: 35 }, { width: 25 }, { width: 12 }, { width: 12 },
                { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
                { width: 12 }, { width: 12 }
            ];

            // 4. Add Data Rows
            studentMarks.forEach(student => {
                const rowData = [
                    student.STUD_ID,
                    (student.name || '').toUpperCase(),
                    (student.campus || '').toUpperCase(),
                    Number(student.tot || 0).toFixed(1),
                    Math.round(student.air) || '-',
                    Number(student.mat || 0).toFixed(1),
                    Number(student.m_rank || 0).toFixed(1),
                    Number(student.phy || 0).toFixed(1),
                    Number(student.p_rank || 0).toFixed(1),
                    Number(student.che || 0).toFixed(1),
                    Number(student.c_rank || 0).toFixed(1),
                    student.t_app
                ];
                const row = worksheet.addRow(rowData);

                row.eachCell((cell, colNumber) => {
                    cell.alignment = { horizontal: colNumber <= 3 ? 'left' : 'center', vertical: 'middle' };
                    cell.font = { size: 10, bold: colNumber === 4 || colNumber === 10 };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFADD8E6' } },
                        left: { style: 'thin', color: { argb: 'FFADD8E6' } },
                        bottom: { style: 'thin', color: { argb: 'FFADD8E6' } },
                        right: { style: 'thin', color: { argb: 'FFADD8E6' } }
                    };

                    // Background Colors matching PDF
                    if (colNumber === 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }; // Yellow
                    if (colNumber === 6 || colNumber === 7) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9D9' } }; // Orange
                    if (colNumber === 8 || colNumber === 9) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF1DE' } }; // Green pale
                    if (colNumber === 10 || colNumber === 11) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2DCDB' } }; // Pink pale
                });
            });

            // 5. Add Totals Row
            if (totals) {
                const totalRowData = [
                    'Campus Selection Average', '', '',
                    totals.tot, totals.air, totals.mat, totals.m_rank,
                    totals.phy, totals.p_rank, totals.che, totals.c_rank, ''
                ];
                const totalRow = worksheet.addRow(totalRowData);
                worksheet.mergeCells(`A${totalRow.number}:C${totalRow.number}`);

                totalRow.eachCell(cell => {
                    cell.font = { bold: true, size: 10 };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                });
            }

            // Write buffer and save
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `${fullPattern}.xlsx`);

        } catch (error) {
            console.error("Excel Export Error:", error);
            setModal({
                isOpen: true,
                type: 'danger',
                title: 'Excel Export Failed',
                message: 'Failed to generate Excel file. Check console for details.',
                onClose: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    };

    const noData = !loading && examStats.length === 0 && studentMarks.length === 0;

    return (
        <div className="analysis-report-container">
            <LoadingTimer isLoading={loading} />
            <div className="report-actions-top">
                <h3 className="section-title">Report Statistics</h3>
                <div className="flex gap-3 items-center">
                    <button className="btn-primary" onClick={downloadExcel} style={{ backgroundColor: '#1e40af' }}>
                        Generate Excel
                    </button>
                    <button className="btn-primary" onClick={downloadPDF} style={{ backgroundColor: '#10b981' }}>
                        Generate PDF
                    </button>
                </div>
            </div>

            {noData ? (
                <div className="report-section" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No data found for the selected filters. Please try adjusting your selection.
                </div>
            ) : (
                <>
                    {/* Table 1: Exam Statistics */}
                    <div className="report-section">
                        <div className="report-header">
                            <span>📊</span> Exam Performance Statistics
                        </div>
                        <div className="table-responsive">
                            <table className="analysis-table">
                                <thead>
                                    <tr style={{ cursor: 'pointer' }}>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'DATE')}>Date <SortIcon config={statsSortConfig} columnKey="DATE" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Test')} style={{ whiteSpace: 'nowrap' }}>Test Name <SortIcon config={statsSortConfig} columnKey="Test" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Attn')} style={{ color: 'var(--accent)' }}>Attn <SortIcon config={statsSortConfig} columnKey="Attn" /></th>
                                        <th title="Official Max Total">Tot_M</th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_T')} title="Achieved Top Score">Top_T <SortIcon config={statsSortConfig} columnKey="Max_T" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_250')}>T&gt;250 <SortIcon config={statsSortConfig} columnKey="T_250" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_200')}>T&gt;200 <SortIcon config={statsSortConfig} columnKey="T_200" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_180')}>T&gt;180 <SortIcon config={statsSortConfig} columnKey="T_180" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_150')}>T&gt;150 <SortIcon config={statsSortConfig} columnKey="T_150" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_120')}>T&gt;120 <SortIcon config={statsSortConfig} columnKey="T_120" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_100')}>T&gt;100 <SortIcon config={statsSortConfig} columnKey="T_100" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_80')}>T&gt;80 <SortIcon config={statsSortConfig} columnKey="T_80" /></th>
                                        <th title="Official Max Math">M_Max</th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_M')}>Top_M <SortIcon config={statsSortConfig} columnKey="Max_M" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'M_80')}>M&gt;80 <SortIcon config={statsSortConfig} columnKey="M_80" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'M_70')}>M&gt;70 <SortIcon config={statsSortConfig} columnKey="M_70" /></th>
                                        <th title="Official Max Physics">P_Max</th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_P')}>Top_P <SortIcon config={statsSortConfig} columnKey="Max_P" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'P_80')}>P&gt;80 <SortIcon config={statsSortConfig} columnKey="P_80" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'P_70')}>P&gt;70 <SortIcon config={statsSortConfig} columnKey="P_70" /></th>
                                        <th title="Official Max Chemistry">C_Max</th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_C')}>Top_C <SortIcon config={statsSortConfig} columnKey="Max_C" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'C_80')}>C&gt;80 <SortIcon config={statsSortConfig} columnKey="C_80" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'C_70')}>C&gt;70 <SortIcon config={statsSortConfig} columnKey="C_70" /></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="21" className="text-center py-4" style={{ color: '#64748b' }}>Loading statistics...</td></tr>
                                    ) : (
                                        sortedExamStats.map((row, i) => (
                                            <tr key={i}>
                                                <td className="text-left">{formatDate(row.DATE)}</td>
                                                <td className="text-left" style={{ whiteSpace: 'nowrap' }}>{row.Test}</td>
                                                <td style={{ fontWeight: '700' }}>{row.Attn}</td>
                                                <td style={{ color: '#0369a1', fontWeight: 'bold' }}>{row.Official_Max_T}</td>
                                                <td>{row.Max_T}</td>
                                                <td>{row.T_250}</td>
                                                <td>{row.T_200}</td>
                                                <td>{row.T_180}</td>
                                                <td>{row.T_150}</td>
                                                <td>{row.T_120}</td>
                                                <td>{row.T_100}</td>
                                                <td>{row.T_80}</td>
                                                <td style={{ color: '#0369a1', fontWeight: 'bold' }}>{row.Official_Max_M}</td>
                                                <td>{row.Max_M}</td>
                                                <td>{row.M_80}</td>
                                                <td>{row.M_70}</td>
                                                <td style={{ color: '#0369a1', fontWeight: 'bold' }}>{row.Official_Max_P}</td>
                                                <td>{row.Max_P}</td>
                                                <td>{row.P_80}</td>
                                                <td>{row.P_70}</td>
                                                <td style={{ color: '#0369a1', fontWeight: 'bold' }}>{row.Official_Max_C}</td>
                                                <td>{row.Max_C}</td>
                                                <td>{row.C_80}</td>
                                                <td>{row.C_70}</td>
                                            </tr>
                                        ))
                                    )}
                                    {!loading && statsSummary && (
                                        <tr className="total-row" style={{ backgroundColor: '#FFF2CC', color: 'black', fontWeight: 'bold' }}>
                                            <td colSpan="2" className="text-left">Average Count</td>
                                            <td style={{ fontWeight: '700' }}>{statsSummary.Attn}</td>
                                            <td style={{ color: '#0369a1' }}>{statsSummary.Official_Max_T}</td>
                                            <td>{statsSummary.Max_T}</td>
                                            <td>{statsSummary.T_250}</td>
                                            <td>{statsSummary.T_200}</td>
                                            <td>{statsSummary.T_180}</td>
                                            <td>{statsSummary.T_150}</td>
                                            <td>{statsSummary.T_120}</td>
                                            <td>{statsSummary.T_100}</td>
                                            <td>{statsSummary.T_80}</td>
                                            <td style={{ color: '#0369a1' }}>{statsSummary.Official_Max_M}</td>
                                            <td>{statsSummary.Max_M}</td>
                                            <td>{statsSummary.M_80}</td>
                                            <td>{statsSummary.M_70}</td>
                                            <td style={{ color: '#0369a1' }}>{statsSummary.Official_Max_P}</td>
                                            <td>{statsSummary.Max_P}</td>
                                            <td>{statsSummary.P_80}</td>
                                            <td>{statsSummary.P_70}</td>
                                            <td style={{ color: '#0369a1' }}>{statsSummary.Official_Max_C}</td>
                                            <td>{statsSummary.Max_C}</td>
                                            <td>{statsSummary.C_80}</td>
                                            <td>{statsSummary.C_70}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Table 2: Student Marks */}
                    <div className="report-section">
                        <div className="report-header">
                            <span>👥</span> Student Merit List (Averages)
                        </div>
                        <div className="table-responsive">
                            <table className="analysis-table merit-table">
                                <thead style={{ cursor: 'pointer' }}>
                                    <tr style={{ color: '#000066' }}>
                                        <th className="w-id-col" onClick={() => requestSort(setMeritSortConfig, 'STUD_ID')}>ID <SortIcon config={meritSortConfig} columnKey="STUD_ID" /></th>
                                        <th className="w-name-col" onClick={() => requestSort(setMeritSortConfig, 'name')}>Name <SortIcon config={meritSortConfig} columnKey="name" /></th>
                                        <th className="w-campus-col" onClick={() => requestSort(setMeritSortConfig, 'campus')}>Campus <SortIcon config={meritSortConfig} columnKey="campus" /></th>
                                        <th className="col-yellow w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'tot')}>TOT<br />{Math.round(studentMarks[0]?.max_tot || 300)} <SortIcon config={meritSortConfig} columnKey="tot" /></th>
                                        <th className="col-yellow w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'air')}>AIR <SortIcon config={meritSortConfig} columnKey="air" /></th>
                                        <th className="col-green w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'mat')}>MAT<br />{Math.round(studentMarks[0]?.max_mat || 100)} <SortIcon config={meritSortConfig} columnKey="mat" /></th>
                                        <th className="col-green w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'm_rank')}>RANK <SortIcon config={meritSortConfig} columnKey="m_rank" /></th>
                                        <th className="col-green-pale w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'phy')}>PHY<br />{Math.round(studentMarks[0]?.max_phy || 100)} <SortIcon config={meritSortConfig} columnKey="phy" /></th>
                                        <th className="col-green-pale w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'p_rank')}>RANK <SortIcon config={meritSortConfig} columnKey="p_rank" /></th>
                                        <th className="col-pink-pale w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'che')}>CHE<br />{Math.round(studentMarks[0]?.max_che || 100)} <SortIcon config={meritSortConfig} columnKey="che" /></th>
                                        <th className="col-pink-pale w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'c_rank')}>RANK <SortIcon config={meritSortConfig} columnKey="c_rank" /></th>
                                        <th className="col-exams w-marks-col" onClick={() => requestSort(setMeritSortConfig, 't_app')}>EXAMS <SortIcon config={meritSortConfig} columnKey="t_app" /></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="15" className="text-center py-4" style={{ color: '#64748b' }}>Loading merit list...</td></tr>
                                    ) : (
                                        sortedStudentMarks.map((student, i) => (
                                            <tr key={i}>
                                                <td style={{ color: 'black' }}>{student.STUD_ID}</td>
                                                <td className="text-left" style={{ fontWeight: '700', color: 'black' }}>
                                                    {student.name}
                                                </td>
                                                <td className="text-left" style={{ color: 'black' }}>{student.campus}</td>
                                                <td className="col-yellow" style={{ fontWeight: '800', color: 'black' }}>{Number(student.tot || 0).toFixed(1)}</td>
                                                <td className="col-white" style={{ fontWeight: '700', color: '#6c361e' }}>{Math.round(student.air) || '-'}</td>
                                                <td className="col-green" style={{ color: 'black' }}>{Number(student.mat || 0).toFixed(1)}</td>
                                                <td className="col-white" style={{ color: 'black' }}>{Number(student.m_rank || 0).toFixed(1)}</td>
                                                <td className="col-green-pale" style={{ color: 'black' }}>{Number(student.phy || 0).toFixed(1)}</td>
                                                <td className="col-white" style={{ color: 'black' }}>{Number(student.p_rank || 0).toFixed(1)}</td>
                                                <td className="col-pink-pale" style={{ color: 'black' }}>{Number(student.che || 0).toFixed(1)}</td>
                                                <td className="col-white" style={{ color: 'black' }}>{Number(student.c_rank || 0).toFixed(1)}</td>
                                                <td className="col-exams" style={{ fontWeight: '700', color: 'black' }}>{student.t_app}</td>
                                            </tr>
                                        ))
                                    )}
                                    {!loading && totals && (
                                        <tr className="total-row">
                                            <td colSpan="3" className="text-left" style={{ color: 'black' }}>Campus Selection Average</td>
                                            <td className="col-yellow" style={{ color: 'black' }}>{Number(totals.tot || 0).toFixed(1)}</td>
                                            <td className="col-white" style={{ color: '#6c361e' }}>{Math.round(totals.air) || '-'}</td>
                                            <td className="col-green" style={{ color: 'black' }}>{Number(totals.mat || 0).toFixed(1)}</td>
                                            <td className="col-white" style={{ color: 'black' }}>{Number(totals.m_rank || 0).toFixed(1)}</td>
                                            <td className="col-green-pale" style={{ color: 'black' }}>{Number(totals.phy || 0).toFixed(1)}</td>
                                            <td className="col-white" style={{ color: 'black' }}>{Number(totals.p_rank || 0).toFixed(1)}</td>
                                            <td className="col-pink-pale" style={{ color: 'black' }}>{Number(totals.che || 0).toFixed(1)}</td>
                                            <td className="col-white" style={{ color: 'black' }}>{Number(totals.c_rank || 0).toFixed(1)}</td>
                                            <td className="col-exams"></td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <style>{`
                .analysis-report-container {
                    width: 100%;
                }
                .analysis-table {
                    table-layout: auto;
                    width: 100%;
                }
                .merit-table {
                    font-size: 0.7rem !important;
                    table-layout: fixed !important;
                }
                .merit-table th, .merit-table td {
                    padding: 0.2rem 0.1rem !important;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .w-id-col { width: 45px !important; }
                .w-campus-col { 
                    width: 80px !important; 
                    white-space: normal !important;
                    line-height: 1.1 !important;
                }
                .w-name-col { 
                    width: 70px !important; 
                    text-align: left !important; 
                    white-space: normal !important; 
                    overflow-wrap: break-word !important; 
                    word-break: break-word !important;
                    line-height: 1.1 !important;
                }
                .w-marks-col { width: 33px !important; text-align: center !important; }
                .col-exams { width: 33px !important; text-align: center !important; }
                .total-row, .total-row td {
                    background-color: #FFF2CC !important;
                    color: black !important;
                    font-weight: bold !important;
                }
            `}</style>

            <Modal
                isOpen={modal.isOpen}
                onClose={() => setModal({ ...modal, isOpen: false })}
                title={modal.title}
                message={modal.message}
                type={modal.type}
            />
        </div>
    );
};

export default AnalysisReport;
