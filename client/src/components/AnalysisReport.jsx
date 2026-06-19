import React, { useState, useEffect } from 'react';
import { buildQueryParams, formatDate, API_URL } from '../utils/apiHelper';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from './Modal';
import LoadingTimer from './LoadingTimer';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuth } from './auth/AuthProvider';
import { logActivity } from '../utils/activityLogger';


const AnalysisReport = ({ filters }) => {
    const { userData, currentHeading } = useAuth();
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
                    if (statsData?.length > 0 || marksData?.students?.length > 0) {
                        logActivity(userData, 'Generated Analysis Report', {
                            studentCount: marksData?.students?.length || 0,
                            examCount: statsData?.length || 0
                        });
                    }
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
            tot_per: Math.round(sum('tot_per') / count),
            air: Math.round(sum('air') / count),
            mat: Math.round(sum('mat') / count),
            mat_per: Math.round(sum('mat_per') / count),
            m_rank: Math.round(sum('m_rank') / count),
            phy: Math.round(sum('phy') / count),
            phy_per: Math.round(sum('phy_per') / count),
            p_rank: Math.round(sum('p_rank') / count),
            che: Math.round(sum('che') / count),
            che_per: Math.round(sum('che_per') / count),
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

            // Load Excel Template to read column visibility and headers
            const fetchTemplate = async () => {
                try {
                    const response = await fetch('/Result Template.xlsx');
                    const arrayBuffer = await response.arrayBuffer();
                    const wb = new ExcelJS.Workbook();
                    await wb.xlsx.load(arrayBuffer);
                    const ws = wb.getWorksheet('Main(Micro)') || wb.worksheets[0];
                    return ws;
                } catch (err) {
                    console.error("[PDF] Template loading error:", err);
                    return null;
                }
            };

            const [logoImg, impactFont, worksheet] = await Promise.all([
                loadImage('/logo.png'),
                loadFont('/fonts/unicode.impact.ttf'),
                fetchTemplate()
            ]);

            // Add Font
            if (impactFont) {
                doc.addFileToVFS("unicode.impact.ttf", impactFont);
                doc.addFont("unicode.impact.ttf", "Impact", "normal");
            }

            const pageWidth = doc.internal.pageSize.getWidth();

            // 1. Draw Row 1: Logo + Sri Chaitanya IIT Academy.,India.
            let currentY = 10;
            const logoH = 12;
            let logoW = 12;
            if (logoImg) {
                const aspect = logoImg.width / logoImg.height;
                logoW = logoH * aspect;
            }
            
            // Replicate the exact title rich text colors and fonts
            doc.setFont("Impact", "normal");
            doc.setFontSize(26);
            const textPart1 = "Sri Chaitanya ";
            const part1W = doc.getTextWidth(textPart1);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            const textPart2 = "IIT Academy.,India.";
            const part2W = doc.getTextWidth(textPart2);

            const totalTextW = part1W + part2W;
            const gap = logoImg ? 4 : 0;
            const row1Width = logoW + gap + totalTextW;
            const row1StartX = (pageWidth - row1Width) / 2;

            if (logoImg) {
                doc.addImage(logoImg, 'PNG', row1StartX, currentY, logoW, logoH, undefined, 'FAST');
            }
            
            // Draw Part 1 (Red/brown)
            doc.setFont("Impact", "normal");
            doc.setFontSize(26);
            doc.setTextColor(220, 38, 38); // Deep red
            doc.text(textPart1, row1StartX + logoW + gap, currentY + 9);

            // Draw Part 2 (Deep blue)
            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.setTextColor(0, 112, 192); // Blue
            doc.text(textPart2, row1StartX + logoW + gap + part1W, currentY + 8.5);
            currentY += 14;

            // 2. Draw Row 2: Location list with Wingdings bullets
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(219, 39, 119); // Magenta
            const locText = "• A.P   • T.S   • KARNATAKA   • TAMILNADU   • MAHARASTRA   • DELHI   • RANCHI";
            doc.text(locText, pageWidth / 2, currentY, { align: 'center' });
            currentY += 5;

            // 3. Draw Row 3: ICON Central Office
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(0, 0, 0); // Black
            const iconText = "ICON Central Office - Madhapur - Hyderabad";
            doc.text(iconText, pageWidth / 2, currentY, { align: 'center' });
            currentY += 6;

            // 4. Draw Row 4: Banner ALL INDIA MARKS ANALYSIS (or customHeading)
            const row4Height = 8;
            doc.setFillColor(0, 112, 192); // Blue background for banner
            doc.rect(10, currentY, pageWidth - 20, row4Height, 'F');
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(13);
            doc.setTextColor(255, 255, 255); // White
            const headingText = currentHeading || "ALL INDIA MARKS ANALYSIS";
            doc.text(headingText.toUpperCase(), pageWidth / 2, currentY + 6, { align: 'center' });
            currentY += row4Height + 5;

            // 5. Draw Row 5, 6, 7: Metadata (Prog Name, Test Date, Test Name)
            const testDate = examStats.length > 0 ? formatDate(examStats[0].DATE) : formatDate(new Date());
            const stream = (filters.stream && filters.stream.length > 0) ? filters.stream.join(',') : 'SR_ELITE';
            const testName = examStats.length > 0 ? examStats[0].Test : 'GRAND TEST';
            const progName = studentMarks[0]?.batch || stream;

            const fullPattern = `${testDate}_${stream}_${testName}_All India Marks Analysis`;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0, 112, 192); // Blue text
            
            doc.text(`Prog Name:  ${progName}`, 10, currentY);
            currentY += 5;
            doc.text(`Test Date:   ${testDate}`, 10, currentY);
            currentY += 5;
            doc.text(`Test Name:  ${testName}`, 10, currentY);
            currentY += 8;

            // 6. Inspect columns in the template sheet to determine visibility and headers
            const getCellValueAsString = (cell) => {
                if (!cell || cell.value === null || cell.value === undefined) return '';
                if (typeof cell.value === 'object' && cell.value.richText) {
                    return cell.value.richText.map(rt => rt.text || '').join('');
                }
                return String(cell.value);
            };

            const visibleColumns = [];
            let lastMarksCol = '';
            
            if (worksheet) {
                for (let i = 1; i <= 20; i++) {
                    const colLetter = String.fromCharCode(64 + i);
                    const cell8 = worksheet.getCell(`${colLetter}8`);
                    const cell9 = worksheet.getCell(`${colLetter}9`);
                    const val8 = getCellValueAsString(cell8).trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                    const val9 = getCellValueAsString(cell9).trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                    
                    if (!val8 && !val9) continue;
                    
                    let field = '';
                    const upper8 = val8.toUpperCase();
                    if (upper8 === 'STUD_ID') {
                        field = 'STUD_ID';
                    } else if (upper8 === 'NAME OF THE STUDENT' || upper8 === 'NAME') {
                        field = 'NAME';
                    } else if (upper8 === 'SEC') {
                        field = 'SEC';
                    } else if (upper8 === 'TEST_MODE') {
                        field = 'TEST_MODE';
                    } else if (upper8 === 'CAMPUS NAME' || upper8 === 'CAMPUS') {
                        field = 'CAMPUS';
                    } else if (upper8 === 'TOT') {
                        field = 'TOT';
                        lastMarksCol = 'TOT';
                    } else if (upper8 === 'MAT') {
                        field = 'MAT';
                        lastMarksCol = 'MAT';
                    } else if (upper8 === 'PHY') {
                        field = 'PHY';
                        lastMarksCol = 'PHY';
                    } else if (upper8 === 'CHE') {
                        field = 'CHE';
                        lastMarksCol = 'CHE';
                    } else if (upper8 === '%') {
                        if (lastMarksCol === 'TOT') field = 'TOT_PER';
                        else if (lastMarksCol === 'MAT') field = 'MAT_PER';
                        else if (lastMarksCol === 'PHY') field = 'PHY_PER';
                        else if (lastMarksCol === 'CHE') field = 'CHE_PER';
                    } else if (upper8.includes('AIR') && upper8.includes('RANK')) {
                        field = 'AIR_RANK';
                    } else if (upper8.includes('MAT') && upper8.includes('RANK')) {
                        field = 'MAT_RANK';
                    } else if (upper8.includes('PHY') && upper8.includes('RANK')) {
                        field = 'PHY_RANK';
                    } else if (upper8.includes('CHE') && upper8.includes('RANK')) {
                        field = 'CHE_RANK';
                    } else if (upper8.includes('STATE') && upper8.includes('RANK')) {
                        field = 'STATE_RANK';
                    } else if (upper8.includes('CAMP') && upper8.includes('RANK')) {
                        field = 'CAMP_RANK';
                    } else if (upper8.includes('SEC') && upper8.includes('RANK')) {
                        field = 'SEC_RANK';
                    }
                    
                    visibleColumns.push({
                        colNumber: i,
                        colLetter,
                        val8,
                        val9,
                        field
                    });
                }
            } else {
                // Fallback visible columns list
                const fallbackColumns = [
                    { colNumber: 1, colLetter: 'A', val8: "STUD_ID", val9: "STUD_ID", field: 'STUD_ID' },
                    { colNumber: 2, colLetter: 'B', val8: "NAME OF THE STUDENT", val9: "NAME OF THE STUDENT", field: 'NAME' },
                    { colNumber: 3, colLetter: 'C', val8: "CAMPUS NAME", val9: "CAMPUS NAME", field: 'CAMPUS' },
                    { colNumber: 4, colLetter: 'D', val8: "TOT", val9: "300", field: 'TOT' },
                    { colNumber: 5, colLetter: 'E', val8: "%", val9: "%", field: 'TOT_PER' },
                    { colNumber: 6, colLetter: 'F', val8: "AIR RANK", val9: "AIR RANK", field: 'AIR_RANK' },
                    { colNumber: 7, colLetter: 'G', val8: "MAT", val9: "100", field: 'MAT' },
                    { colNumber: 8, colLetter: 'H', val8: "MAT RANK", val9: "MAT RANK", field: 'MAT_RANK' },
                    { colNumber: 9, colLetter: 'I', val8: "%", val9: "%", field: 'MAT_PER' },
                    { colNumber: 10, colLetter: 'J', val8: "PHY", val9: "100", field: 'PHY' },
                    { colNumber: 11, colLetter: 'K', val8: "PHY RANK", val9: "PHY RANK", field: 'PHY_RANK' },
                    { colNumber: 12, colLetter: 'L', val8: "%", val9: "%", field: 'PHY_PER' },
                    { colNumber: 13, colLetter: 'M', val8: "CHE", val9: "100", field: 'CHE' },
                    { colNumber: 14, colLetter: 'N', val8: "CHE RANK", val9: "CHE RANK", field: 'CHE_RANK' },
                    { colNumber: 15, colLetter: 'O', val8: "%", val9: "%", field: 'CHE_PER' }
                ];
                visibleColumns.push(...fallbackColumns);
            }

            // Build dynamic headers (Row 8 & Row 9)
            const tableColumn = visibleColumns.map(col => col.val8);
            const subHeader = visibleColumns.map(col => col.val9);

            const getStudentFieldValue = (student, field) => {
                switch (field) {
                    case 'STUD_ID': return student.STUD_ID || '';
                    case 'NAME': return (student.name || '').toUpperCase();
                    case 'SEC': return student.sec || '';
                    case 'TEST_MODE': return student.test_mode || '';
                    case 'CAMPUS': return (student.campus || '').toUpperCase();
                    case 'TOT': return Math.round(student.tot || 0);
                    case 'TOT_PER': return student.tot_per !== undefined && student.tot_per !== null ? Number(student.tot_per).toFixed(1) : (student.max_tot ? ((student.tot / student.max_tot) * 100).toFixed(1) : '0.0');
                    case 'AIR_RANK': return Math.round(student.air) || '-';
                    case 'STATE_RANK': return student.state_rank || '';
                    case 'CAMP_RANK': return student.camp_rank || '';
                    case 'SEC_RANK': return student.sec_rank || '';
                    case 'MAT': return Math.round(student.mat || 0);
                    case 'MAT_RANK': return Math.round(student.m_rank || 0);
                    case 'MAT_PER': return student.mat_per !== undefined && student.mat_per !== null ? Number(student.mat_per).toFixed(1) : (student.max_mat ? ((student.mat / student.max_mat) * 100).toFixed(1) : '0.0');
                    case 'PHY': return Math.round(student.phy || 0);
                    case 'PHY_RANK': return Math.round(student.p_rank || 0);
                    case 'PHY_PER': return student.phy_per !== undefined && student.phy_per !== null ? Number(student.phy_per).toFixed(1) : (student.max_phy ? ((student.phy / student.max_phy) * 100).toFixed(1) : '0.0');
                    case 'CHE': return Math.round(student.che || 0);
                    case 'CHE_RANK': return Math.round(student.c_rank || 0);
                    case 'CHE_PER': return student.che_per !== undefined && student.che_per !== null ? Number(student.che_per).toFixed(1) : (student.max_che ? ((student.che / student.max_che) * 100).toFixed(1) : '0.0');
                    default: return '';
                }
            };

            const getTotalsFieldValue = (totalsVal, field) => {
                switch (field) {
                    case 'TOT': return Number(totalsVal.tot || 0).toFixed(1);
                    case 'TOT_PER': return totalsVal.tot_per !== undefined && totalsVal.tot_per !== null ? Number(totalsVal.tot_per).toFixed(1) : '';
                    case 'AIR_RANK': return Math.round(totalsVal.air) || '-';
                    case 'MAT': return Number(totalsVal.mat || 0).toFixed(1);
                    case 'MAT_RANK': return Number(totalsVal.m_rank || 0).toFixed(1);
                    case 'MAT_PER': return totalsVal.mat_per !== undefined && totalsVal.mat_per !== null ? Number(totalsVal.mat_per).toFixed(1) : '';
                    case 'PHY': return Number(totalsVal.phy || 0).toFixed(1);
                    case 'PHY_RANK': return Number(totalsVal.p_rank || 0).toFixed(1);
                    case 'PHY_PER': return totalsVal.phy_per !== undefined && totalsVal.phy_per !== null ? Number(totalsVal.phy_per).toFixed(1) : '';
                    case 'CHE': return Number(totalsVal.che || 0).toFixed(1);
                    case 'CHE_RANK': return Number(totalsVal.c_rank || 0).toFixed(1);
                    case 'CHE_PER': return totalsVal.che_per !== undefined && totalsVal.che_per !== null ? Number(totalsVal.che_per).toFixed(1) : '';
                    default: return '';
                }
            };

            // Map Student Body Data Rows
            const body = studentMarks.map(row => {
                return visibleColumns.map(col => getStudentFieldValue(row, col.field));
            });

            if (totals) {
                const totalRowData = visibleColumns.map((col, colIdx) => {
                    if (colIdx === 0) return 'Campus Selection Average';
                    
                    const fColIdx = visibleColumns.findIndex(c => c.field === 'TOT');
                    if (colIdx < fColIdx) return ''; // Empty cells for merge
                    
                    return getTotalsFieldValue(totals, col.field);
                });
                body.push(totalRowData);
            }

            // Dynamically assign cell widths to fit landscape page nicely
            const usableWidth = 281; // 297mm - 16mm margins (8mm each side)
            let totalWeight = 0;
            visibleColumns.forEach(col => {
                if (col.field === 'STUD_ID') totalWeight += 20;
                else if (col.field === 'NAME') totalWeight += 48;
                else if (col.field === 'CAMPUS') totalWeight += 45;
                else totalWeight += 14;
            });

            const columnStyles = {};
            visibleColumns.forEach((col, idx) => {
                let weight = 14;
                let halign = 'center';
                if (col.field === 'STUD_ID') {
                    weight = 20;
                } else if (col.field === 'NAME') {
                    weight = 48;
                    halign = 'left';
                } else if (col.field === 'CAMPUS') {
                    weight = 45;
                    halign = 'left';
                }
                const cellWidth = (weight / totalWeight) * usableWidth;
                columnStyles[idx] = { halign, cellWidth };
            });

            autoTable(doc, {
                head: [tableColumn, subHeader],
                body: body,
                startY: currentY,
                theme: 'grid',
                styles: {
                    fontSize: 7,
                    cellPadding: 1.2,
                    halign: 'center',
                    valign: 'middle',
                    lineColor: [179, 232, 235], // Template border: #B3E8EB
                    lineWidth: 0.1,
                    textColor: [0, 0, 0],
                    font: "helvetica",
                    fontStyle: 'normal'
                },
                headStyles: {
                    fillColor: [0, 166, 162], // #00A6A2 teal/cyan header from template
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    lineWidth: 0.1,
                    lineColor: [179, 232, 235],
                    fontSize: 7,
                    cellPadding: 1.2
                },
                columnStyles: columnStyles,
                margin: { left: 8, right: 8, top: 10, bottom: 10 },
                tableWidth: 'auto',
                rowPageBreak: 'avoid',
                didParseCell: (data) => {
                    if (data.section === 'body') {
                        const isTotalRow = (totals && data.row.index === body.length - 1);
                        if (isTotalRow) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fillColor = [235, 241, 245];
                            if (data.column.index === 0) {
                                const fColIdx = visibleColumns.findIndex(c => c.field === 'TOT');
                                if (fColIdx > 1) {
                                    data.cell.colSpan = fColIdx;
                                }
                            }
                        } else {
                            const colField = visibleColumns[data.column.index].field;
                            // Marks columns: blue text & light purple/gray fill from template
                            if (['TOT', 'MAT', 'PHY', 'CHE'].includes(colField)) {
                                data.cell.styles.textColor = [0, 51, 204]; // #0033CC
                                data.cell.styles.fillColor = [238, 230, 236]; // #EEE6EC
                                data.cell.styles.fontStyle = 'bold';
                            }
                            // Rank columns: red text
                            else if (['AIR_RANK', 'MAT_RANK', 'PHY_RANK', 'CHE_RANK'].includes(colField)) {
                                data.cell.styles.textColor = [204, 51, 0]; // #CC3300
                                data.cell.styles.fontStyle = 'bold';
                            }
                            // Percentage columns: bold text
                            else if (['TOT_PER', 'MAT_PER', 'PHY_PER', 'CHE_PER'].includes(colField)) {
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.textColor = [0, 0, 0]; // Black
                            }
                        }
                    }
                }
            });

            doc.save(`${fullPattern}.pdf`);
            logActivity(userData, 'Downloaded Analysis PDF', { pattern: fullPattern });
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
            // Load template from public folder
            const response = await fetch('/Result Template.xlsx');
            const arrayBuffer = await response.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);
            
            // Get Main(Micro) sheet
            let worksheet = workbook.getWorksheet('Main(Micro)');
            if (!worksheet) {
                worksheet = workbook.worksheets.find(s => s.name.includes('Main') || s.name.includes('Micro')) || workbook.worksheets[0];
            }
            
            const testDate = examStats.length > 0 ? formatDate(examStats[0].DATE) : formatDate(new Date());
            const stream = (filters.stream && filters.stream.length > 0) ? filters.stream.join(',') : 'SR_ELITE';
            const testName = examStats.length > 0 ? examStats[0].Test : 'GRAND TEST';
            const fullPattern = `${testDate}_${stream}_${testName}_All India Marks Analysis`;
            const progName = studentMarks[0]?.batch || stream;

            // Update Metadata Rows 5, 6, 7
            worksheet.getCell('A5').value = {
                richText: [
                    { text: "Prog Name:  " },
                    { font: { bold: true, size: 13, color: { argb: "FF00B0F0" }, name: "Microsoft Sans Serif", family: 2 }, text: progName }
                ]
            };
            worksheet.getCell('A6').value = {
                richText: [
                    { text: "Test Date:   " },
                    { font: { bold: true, size: 13, color: { argb: "FF00B0F0" }, name: "Microsoft Sans Serif", family: 2 }, text: testDate }
                ]
            };
            worksheet.getCell('A7').value = {
                richText: [
                    { text: "Test Name:  " },
                    { font: { bold: true, size: 13, color: { argb: "FF00B0F0" }, name: "Microsoft Sans Serif", family: 2 }, text: testName }
                ]
            };

            // Save row styles from row 10 and 11
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
            const row10Height = row10.height;
            const row11Height = row11.height;

            // Inspect columns in the template sheet to determine visible columns
            const getCellValueAsString = (cell) => {
                if (!cell || cell.value === null || cell.value === undefined) return '';
                if (typeof cell.value === 'object' && cell.value.richText) {
                    return cell.value.richText.map(rt => rt.text || '').join('');
                }
                return String(cell.value);
            };

            const visibleColumns = [];
            let lastMarksCol = '';
            for (let i = 1; i <= 20; i++) {
                const colLetter = String.fromCharCode(64 + i);
                const cell8 = worksheet.getCell(`${colLetter}8`);
                const cell9 = worksheet.getCell(`${colLetter}9`);
                const val8 = getCellValueAsString(cell8).trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                const val9 = getCellValueAsString(cell9).trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
                
                if (!val8 && !val9) continue;
                
                let field = '';
                const upper8 = val8.toUpperCase();
                if (upper8 === 'STUD_ID') {
                    field = 'STUD_ID';
                } else if (upper8 === 'NAME OF THE STUDENT' || upper8 === 'NAME') {
                    field = 'NAME';
                } else if (upper8 === 'SEC') {
                    field = 'SEC';
                } else if (upper8 === 'TEST_MODE') {
                    field = 'TEST_MODE';
                } else if (upper8 === 'CAMPUS NAME' || upper8 === 'CAMPUS') {
                    field = 'CAMPUS';
                } else if (upper8 === 'TOT') {
                    field = 'TOT';
                    lastMarksCol = 'TOT';
                } else if (upper8 === 'MAT') {
                    field = 'MAT';
                    lastMarksCol = 'MAT';
                } else if (upper8 === 'PHY') {
                    field = 'PHY';
                    lastMarksCol = 'PHY';
                } else if (upper8 === 'CHE') {
                    field = 'CHE';
                    lastMarksCol = 'CHE';
                } else if (upper8 === '%') {
                    if (lastMarksCol === 'TOT') field = 'TOT_PER';
                    else if (lastMarksCol === 'MAT') field = 'MAT_PER';
                    else if (lastMarksCol === 'PHY') field = 'PHY_PER';
                    else if (lastMarksCol === 'CHE') field = 'CHE_PER';
                } else if (upper8.includes('AIR') && upper8.includes('RANK')) {
                    field = 'AIR_RANK';
                } else if (upper8.includes('MAT') && upper8.includes('RANK')) {
                    field = 'MAT_RANK';
                } else if (upper8.includes('PHY') && upper8.includes('RANK')) {
                    field = 'PHY_RANK';
                } else if (upper8.includes('CHE') && upper8.includes('RANK')) {
                    field = 'CHE_RANK';
                } else if (upper8.includes('STATE') && upper8.includes('RANK')) {
                    field = 'STATE_RANK';
                } else if (upper8.includes('CAMP') && upper8.includes('RANK')) {
                    field = 'CAMP_RANK';
                } else if (upper8.includes('SEC') && upper8.includes('RANK')) {
                    field = 'SEC_RANK';
                }
                
                visibleColumns.push({
                    colNumber: i,
                    colLetter,
                    field
                });
            }

            const getStudentFieldValue = (student, field) => {
                switch (field) {
                    case 'STUD_ID': return student.STUD_ID || '';
                    case 'NAME': return (student.name || '').toUpperCase();
                    case 'SEC': return student.sec || '';
                    case 'TEST_MODE': return student.test_mode || '';
                    case 'CAMPUS': return (student.campus || '').toUpperCase();
                    case 'TOT': return Math.round(student.tot || 0);
                    case 'TOT_PER': return student.tot_per !== undefined && student.tot_per !== null ? Number(Number(student.tot_per).toFixed(1)) : (student.max_tot ? Number(Number((student.tot / student.max_tot) * 100).toFixed(1)) : 0.0);
                    case 'AIR_RANK': return Math.round(student.air) || '-';
                    case 'STATE_RANK': return student.state_rank || '';
                    case 'CAMP_RANK': return student.camp_rank || '';
                    case 'SEC_RANK': return student.sec_rank || '';
                    case 'MAT': return Math.round(student.mat || 0);
                    case 'MAT_RANK': return Math.round(student.m_rank || 0);
                    case 'MAT_PER': return student.mat_per !== undefined && student.mat_per !== null ? Number(Number(student.mat_per).toFixed(1)) : (student.max_mat ? Number(Number((student.mat / student.max_mat) * 100).toFixed(1)) : 0.0);
                    case 'PHY': return Math.round(student.phy || 0);
                    case 'PHY_RANK': return Math.round(student.p_rank || 0);
                    case 'PHY_PER': return student.phy_per !== undefined && student.phy_per !== null ? Number(Number(student.phy_per).toFixed(1)) : (student.max_phy ? Number(Number((student.phy / student.max_phy) * 100).toFixed(1)) : 0.0);
                    case 'CHE': return Math.round(student.che || 0);
                    case 'CHE_RANK': return Math.round(student.c_rank || 0);
                    case 'CHE_PER': return student.che_per !== undefined && student.che_per !== null ? Number(Number(student.che_per).toFixed(1)) : (student.max_che ? Number(Number((student.che / student.max_che) * 100).toFixed(1)) : 0.0);
                    default: return '';
                }
            };

            const getTotalsFieldValue = (totalsVal, field) => {
                switch (field) {
                    case 'TOT': return Number(Number(totalsVal.tot || 0).toFixed(1));
                    case 'TOT_PER': return totalsVal.tot_per !== undefined && totalsVal.tot_per !== null ? Number(Number(totalsVal.tot_per).toFixed(1)) : '';
                    case 'AIR_RANK': return Math.round(totalsVal.air) || '-';
                    case 'MAT': return Number(Number(totalsVal.mat || 0).toFixed(1));
                    case 'MAT_RANK': return Number(Number(totalsVal.m_rank || 0).toFixed(1));
                    case 'MAT_PER': return totalsVal.mat_per !== undefined && totalsVal.mat_per !== null ? Number(Number(totalsVal.mat_per).toFixed(1)) : '';
                    case 'PHY': return Number(Number(totalsVal.phy || 0).toFixed(1));
                    case 'PHY_RANK': return Number(Number(totalsVal.p_rank || 0).toFixed(1));
                    case 'PHY_PER': return totalsVal.phy_per !== undefined && totalsVal.phy_per !== null ? Number(Number(totalsVal.phy_per).toFixed(1)) : '';
                    case 'CHE': return Number(Number(totalsVal.che || 0).toFixed(1));
                    case 'CHE_RANK': return Number(Number(totalsVal.c_rank || 0).toFixed(1));
                    case 'CHE_PER': return totalsVal.che_per !== undefined && totalsVal.che_per !== null ? Number(Number(totalsVal.che_per).toFixed(1)) : '';
                    default: return '';
                }
            };

            // Populate Student Data Rows
            studentMarks.forEach((student, index) => {
                const targetRowNum = 10 + index;
                const newRow = worksheet.getRow(targetRowNum);
                
                const rowValues = [];
                visibleColumns.forEach(col => {
                    rowValues[col.colNumber] = getStudentFieldValue(student, col.field);
                });
                newRow.values = rowValues;
                
                // Copy styles (alternating colors)
                const isEven = (index % 2 === 0);
                const templateStyles = isEven ? row10Styles : row11Styles;
                newRow.height = isEven ? row10Height : row11Height;
                
                visibleColumns.forEach(col => {
                    const style = templateStyles[col.colNumber];
                    if (style) {
                        newRow.getCell(col.colNumber).style = style;
                    }
                });
            });

            // Populate Totals Row at the bottom
            if (totals) {
                const totalRowNum = 10 + studentMarks.length;
                const totalRow = worksheet.getRow(totalRowNum);
                
                const totalRowValues = [];
                const fColIdx = visibleColumns.findIndex(c => c.field === 'TOT');
                const fColNum = visibleColumns[fColIdx].colNumber;
                
                visibleColumns.forEach((col, idx) => {
                    if (idx === 0) {
                        totalRowValues[col.colNumber] = 'Campus Selection Average';
                    } else if (col.colNumber < fColNum) {
                        totalRowValues[col.colNumber] = '';
                    } else {
                        totalRowValues[col.colNumber] = getTotalsFieldValue(totals, col.field);
                    }
                });
                totalRow.values = totalRowValues;
                
                // Merge cells from first column to column just before TOT
                const firstColLetter = visibleColumns[0].colLetter;
                const preTotColLetter = String.fromCharCode(64 + fColNum - 1);
                worksheet.mergeCells(`${firstColLetter}${totalRowNum}:${preTotColLetter}${totalRowNum}`);
                
                // Style Totals Row
                totalRow.height = row10Height;
                visibleColumns.forEach(col => {
                    const style = row10Styles[col.colNumber];
                    if (style) {
                        const cell = totalRow.getCell(col.colNumber);
                        cell.style = style;
                        cell.font = { ...style.font, bold: true };
                        // Add light tint background color for totals row
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFEBF1F5' } // Very light slate gray
                        };
                    }
                });
            }

            // Clear remaining template rows (values and styles) instead of splicing
            const originalRowCount = worksheet.rowCount;
            const totalRowNum = 10 + studentMarks.length + (totals ? 1 : 0);
            if (originalRowCount > totalRowNum) {
                for (let r = totalRowNum + 1; r <= originalRowCount; r++) {
                    const row = worksheet.getRow(r);
                    row.values = null;
                    row.height = 15;
                    row.eachCell({ includeEmpty: true }, (cell) => {
                        cell.style = undefined;
                    });
                }
            }

            // Set print area dynamically to cover only the populated rows
            const firstColLetter = visibleColumns[0].colLetter;
            const lastColLetter = visibleColumns[visibleColumns.length - 1].colLetter;
            worksheet.pageSetup.printArea = `${firstColLetter}1:${lastColLetter}${totalRowNum}`;

            // Write buffer and save
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `${fullPattern}.xlsx`);
            logActivity(userData, 'Exported Analysis Excel', { pattern: fullPattern });

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
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_T')}>Max_T <SortIcon config={statsSortConfig} columnKey="Max_T" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_250')}>T&gt;250 <SortIcon config={statsSortConfig} columnKey="T_250" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_200')}>T&gt;200 <SortIcon config={statsSortConfig} columnKey="T_200" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_180')}>T&gt;180 <SortIcon config={statsSortConfig} columnKey="T_180" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_150')}>T&gt;150 <SortIcon config={statsSortConfig} columnKey="T_150" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_120')}>T&gt;120 <SortIcon config={statsSortConfig} columnKey="T_120" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_100')}>T&gt;100 <SortIcon config={statsSortConfig} columnKey="T_100" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'T_80')}>T&gt;80 <SortIcon config={statsSortConfig} columnKey="T_80" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_M')}>Max_M <SortIcon config={statsSortConfig} columnKey="Max_M" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'M_80')}>M&gt;80 <SortIcon config={statsSortConfig} columnKey="M_80" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'M_70')}>M&gt;70 <SortIcon config={statsSortConfig} columnKey="M_70" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_P')}>Max_P <SortIcon config={statsSortConfig} columnKey="Max_P" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'P_80')}>P&gt;80 <SortIcon config={statsSortConfig} columnKey="P_80" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'P_70')}>P&gt;70 <SortIcon config={statsSortConfig} columnKey="P_70" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'Max_C')}>Max_C <SortIcon config={statsSortConfig} columnKey="Max_C" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'C_80')}>C&gt;80 <SortIcon config={statsSortConfig} columnKey="C_80" /></th>
                                        <th onClick={() => requestSort(setStatsSortConfig, 'C_70')}>C&gt;70 <SortIcon config={statsSortConfig} columnKey="C_70" /></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="20" className="text-center py-4" style={{ color: '#64748b' }}>Loading statistics...</td></tr>
                                    ) : (
                                        sortedExamStats.map((row, i) => (
                                            <tr key={i}>
                                                <td className="text-left">{formatDate(row.DATE)}</td>
                                                <td className="text-left" style={{ whiteSpace: 'nowrap' }}>{row.Test}</td>
                                                <td style={{ fontWeight: '700' }}>{row.Attn}</td>
                                                <td>{row.Max_T}</td>
                                                <td>{row.T_250}</td>
                                                <td>{row.T_200}</td>
                                                <td>{row.T_180}</td>
                                                <td>{row.T_150}</td>
                                                <td>{row.T_120}</td>
                                                <td>{row.T_100}</td>
                                                <td>{row.T_80}</td>
                                                <td>{row.Max_M}</td>
                                                <td>{row.M_80}</td>
                                                <td>{row.M_70}</td>
                                                <td>{row.Max_P}</td>
                                                <td>{row.P_80}</td>
                                                <td>{row.P_70}</td>
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
                                            <td>{statsSummary.Max_T}</td>
                                            <td>{statsSummary.T_250}</td>
                                            <td>{statsSummary.T_200}</td>
                                            <td>{statsSummary.T_180}</td>
                                            <td>{statsSummary.T_150}</td>
                                            <td>{statsSummary.T_120}</td>
                                            <td>{statsSummary.T_100}</td>
                                            <td>{statsSummary.T_80}</td>
                                            <td>{statsSummary.Max_M}</td>
                                            <td>{statsSummary.M_80}</td>
                                            <td>{statsSummary.M_70}</td>
                                            <td>{statsSummary.Max_P}</td>
                                            <td>{statsSummary.P_80}</td>
                                            <td>{statsSummary.P_70}</td>
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
                                        <th className="col-yellow w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'tot')}>
                                            TOT{examStats.length === 1 && studentMarks[0]?.max_tot && <><br />{Math.round(studentMarks[0].max_tot)}</>} <SortIcon config={meritSortConfig} columnKey="tot" />
                                        </th>
                                        <th className="col-yellow w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'air')}>AIR <SortIcon config={meritSortConfig} columnKey="air" /></th>
                                        <th className="col-green w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'mat')}>
                                            MAT{examStats.length === 1 && studentMarks[0]?.max_mat && <><br />{Math.round(studentMarks[0].max_mat)}</>} <SortIcon config={meritSortConfig} columnKey="mat" />
                                        </th>
                                        <th className="col-green w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'm_rank')}>RANK <SortIcon config={meritSortConfig} columnKey="m_rank" /></th>
                                        <th className="col-green-pale w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'phy')}>
                                            PHY{examStats.length === 1 && studentMarks[0]?.max_phy && <><br />{Math.round(studentMarks[0].max_phy)}</>} <SortIcon config={meritSortConfig} columnKey="phy" />
                                        </th>
                                        <th className="col-green-pale w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'p_rank')}>RANK <SortIcon config={meritSortConfig} columnKey="p_rank" /></th>
                                        <th className="col-pink-pale w-marks-col" onClick={() => requestSort(setMeritSortConfig, 'che')}>
                                            CHE{examStats.length === 1 && studentMarks[0]?.max_che && <><br />{Math.round(studentMarks[0].max_che)}</>} <SortIcon config={meritSortConfig} columnKey="che" />
                                        </th>
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
