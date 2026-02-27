import React, { useState, useEffect, useRef } from 'react';
import LoadingTimer from './LoadingTimer';
import FilterBar from './FilterBar';
import { API_URL, buildQueryParams, formatDate } from '../utils/apiHelper';
import { useAuth } from './auth/AuthProvider';
import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import Select from 'react-select';
import { logActivity } from '../utils/activityLogger';

// Subject Sorting Order
const SUBJECT_ORDER = {
    "MATHEMATICS": 1,
    "PHYSICS": 2,
    "CHEMISTRY": 3
};

const getSubjectOrder = (subject) => {
    const s = String(subject).toUpperCase();
    return SUBJECT_ORDER[s] || 99;
};

const ErrorReport = ({ filters, setFilters }) => {
    const { userData, isAdmin } = useAuth();
    // Use props filters
    const [subjectFilter, setSubjectFilter] = useState('ALL');
    const [showSubjects, setShowSubjects] = useState(false);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [pdfProgress, setPdfProgress] = useState('');
    const [zoom, setZoom] = useState(1);
    const reportRef = useRef(null);

    // Subject Options
    const subjectOptions = [
        { value: 'ALL', label: 'All Subjects' },
        { value: 'MATHEMATICS', label: 'Mathematics' },
        { value: 'PHYSICS', label: 'Physics' },
        { value: 'CHEMISTRY', label: 'Chemistry' }
    ];

    // Clear Report Data when filters change to avoid mismatch
    useEffect(() => {
        setReportData([]);
        setShowSubjects(false);
    }, [filters]);

    // Handle View Report Button Click
    const handleViewReport = async () => {
        if (filters.test.length === 0 && filters.studentSearch.length === 0) {
            alert("Please select at least one Test or Student.");
            return;
        }

        setLoading(true);
        try {
            const params = buildQueryParams(filters);
            const res = await fetch(`${API_URL}/api/erp/report?${params.toString()}`);
            const data = await res.json();
            setShowSubjects(true);

            // Group Data
            const grouped = {};
            data.forEach(row => {
                const studKey = `${row.STUD_ID}_${row.Student_Name}`;
                if (!grouped[studKey]) {
                    grouped[studKey] = {
                        info: {
                            name: row.Student_Name,
                            id: row.STUD_ID,
                            branch: row.Branch,
                            stream: row.Batch
                        },
                        tests: {}
                    };
                }
                const testKey = row.Test;
                if (!grouped[studKey].tests[testKey]) {
                    grouped[studKey].tests[testKey] = {
                        meta: {
                            testName: row.Test,
                            date: row.Exam_Date,
                            tot: row.TOT,
                            air: row.AIR,
                            mat: row.MAT,
                            m_rank: row.MAT_R,
                            phy: row.PHY,
                            p_rank: row.PHY_R,
                            chem: row.CHE,
                            c_rank: row.CHE_R
                        },
                        questions: []
                    };
                }
                grouped[studKey].tests[testKey].questions.push(row);
            });

            // Process & Sort
            const processed = Object.values(grouped).map(student => {
                let testsArr = Object.values(student.tests);

                // Sort Tests: Latest First, then WTA/WTM priority
                testsArr.sort((a, b) => {
                    const d1 = new Date(a.meta.date);
                    const d2 = new Date(b.meta.date);
                    if (d2 - d1 !== 0) return d2 - d1;

                    const nameA = String(a.meta.testName).toUpperCase();
                    const nameB = String(b.meta.testName).toUpperCase();

                    const isA_Priority = nameA.startsWith('WTA') || nameA.startsWith('WTM');
                    const isB_Priority = nameB.startsWith('WTA') || nameB.startsWith('WTM');

                    if (isA_Priority && !isB_Priority) return -1;
                    if (!isA_Priority && isB_Priority) return 1;

                    return nameA.localeCompare(nameB);
                });

                // Sort Questions by Subject then QNo
                testsArr = testsArr.map(t => {
                    t.questions.sort((a, b) => {
                        const subOrder = getSubjectOrder(a.Subject) - getSubjectOrder(b.Subject);
                        if (subOrder !== 0) return subOrder;

                        const qNoA = parseInt(a.Q_No) || 0;
                        const qNoB = parseInt(b.Q_No) || 0;
                        return qNoA - qNoB;
                    });
                    return t;
                });

                return { ...student, tests: testsArr };
            });

            setReportData(processed);

            // Log activity
            logActivity(userData, 'Generated Error Report', {
                studentCount: processed.length,
                subject: subjectFilter
            });

        } catch (err) {
            console.error("Error fetching report:", err);
            alert("Failed to fetch report data.");
        } finally {
            setLoading(false);
        }
    };

    // Apply Subject Filter
    const getFilteredQuestions = (questions) => {
        if (subjectFilter === 'ALL') return questions;
        return questions.filter(q => q.Subject && q.Subject.toUpperCase() === subjectFilter);
    };

    // Helper: Load Image
    const loadImage = (src) => {
        if (!src) return Promise.resolve(null);
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => {
                resolve(null);
            };
        });
    };

    // Helper: Load Font
    const loadFont = async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to load font: ${url}`);
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            console.error("Font load error:", err);
            return null;
        }
    };

    // --- PDF GENERATION CORE (Single Student) ---
    const createStudentPDF = async (student, fonts, logoImg) => {
        const { impactFont, bookmanFont, bookmanBoldFont } = fonts;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;
        const contentWidth = pageWidth - (margin * 2);

        // Register Fonts
        if (impactFont) {
            doc.addFileToVFS("unicode.impact.ttf", impactFont);
            doc.addFont("unicode.impact.ttf", "Impact", "normal");
        }
        if (bookmanFont) {
            doc.addFileToVFS("bookman-old-style.ttf", bookmanFont);
            doc.addFont("bookman-old-style.ttf", "Bookman", "normal");
        }
        if (bookmanBoldFont) {
            doc.addFileToVFS("BOOKOSB.TTF", bookmanBoldFont);
            doc.addFont("BOOKOSB.TTF", "Bookman", "bold");
        }

        // --- Helper: Draw Main Header ---
        const drawMainHeader = (doc) => {
            let y = 15;

            const part1 = "Sri Chaitanya";
            const part2 = " Educational Institutions";

            // Font Prep for Measurements
            doc.setFontSize(26);
            if (impactFont) doc.setFont("Impact", "normal");
            else doc.setFont("helvetica", "bold");
            const w1 = doc.getTextWidth(part1);

            if (bookmanFont) doc.setFont("Bookman", "normal");
            else doc.setFont("helvetica", "normal");
            const w2 = doc.getTextWidth(part2);

            // LOGO Logic
            let logoW = 0;
            const logoH = 12; // 12mm height for logo
            if (logoImg) {
                const asp = logoImg.width / logoImg.height;
                logoW = logoH * asp;
            }

            const gap = logoImg ? 4 : 0;
            const totalWidth = logoW + gap + w1 + w2;

            const startX = (pageWidth - totalWidth) / 2;
            let currentX = startX;

            // Draw Logo
            if (logoImg) {
                // Slightly adjust Y to center vertically with text (text baseline is at y, image is top-left)
                // Text size 26pt is roughly 9mm height. Logo is 12mm.
                // We draw logo slightly higher to align centers visually
                try {
                    doc.addImage(logoImg, 'PNG', currentX, y - 9, logoW, logoH);
                } catch (e) { }
                currentX += logoW + gap;
            }

            // Draw Part 1
            if (impactFont) doc.setFont("Impact", "normal");
            else doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 112, 192);
            doc.text(part1, currentX, y);

            // Draw Part 2
            if (bookmanFont) doc.setFont("Bookman", "normal");
            else doc.setFont("helvetica", "normal");
            doc.setTextColor(0, 112, 192);
            doc.text(part2, currentX + w1, y);

            y += 8;

            if (bookmanBoldFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.text("Central Office, Bangalore", pageWidth / 2, y, { align: 'center' });

            return y + 8;
        };

        // --- Helper: Smart Wrap Text ---
        // Wraps text such that the first line starts at 'indent' and fills 'width - indent',
        // and subsequent lines start at 0 and fill 'width'.
        const getSmartWrappedLines = (doc, text, width, firstLineIndent) => {
            if (!text) return [];
            const words = text.split(' ');
            const lines = [];
            let currentLine = "";
            let isFirstLine = true;

            // Helper to get available width for current line
            const getAvailWidth = () => isFirstLine ? (width - firstLineIndent) : width;

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const widthIfAdded = doc.getTextWidth(currentLine + (currentLine ? " " : "") + word);

                if (widthIfAdded <= getAvailWidth()) {
                    currentLine += (currentLine ? " " : "") + word;
                } else {
                    // Current line is full
                    // Check if the first line was empty (meaning the first word didn't even fit the indent space)
                    if (currentLine === "" && isFirstLine) {
                        // Push empty line placeholder to occupy the visual "Label" line
                        lines.push({ text: "", xOffset: firstLineIndent });
                        isFirstLine = false;
                        currentLine = word; // Start word on next line
                    } else {
                        // Regular wrap
                        if (currentLine) {
                            lines.push({ text: currentLine, xOffset: isFirstLine ? firstLineIndent : 0 });
                        }
                        isFirstLine = false;
                        currentLine = word;
                    }
                }
            }
            if (currentLine) {
                lines.push({ text: currentLine, xOffset: isFirstLine ? firstLineIndent : 0 });
            }

            return lines;
        };

        // --- START PAGE 1 ---
        const headerBottom = drawMainHeader(doc);
        let yPos = headerBottom + 1;

        // Student Info
        doc.setLineWidth(0.3);
        doc.setDrawColor(0);
        doc.setFillColor(255, 248, 220);
        doc.rect(margin, yPos, contentWidth, 8, 'FD');

        if (bookmanBoldFont) doc.setFont("Bookman", "bold");
        else doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(0);

        const leftCenter = margin + (contentWidth / 4);
        doc.text(student.info.name || '', leftCenter, yPos + 5.5, { align: 'center' });

        const rightCenter = margin + (contentWidth * 0.75);
        doc.text(student.info.branch || '', rightCenter, yPos + 5.5, { align: 'center' });

        doc.line(pageWidth / 2, yPos, pageWidth / 2, yPos + 8);
        yPos += 8;

        // Iterate Tests
        for (const test of student.tests) {
            // Check space
            // Test Title Header
            if (yPos + 15 > pageHeight - margin) {
                doc.addPage();
                yPos = 15;
            }
            doc.setFontSize(14);
            doc.setTextColor(0);
            if (bookmanBoldFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bold");
            const testTitle = `${formatDate(test.meta.date)}_${student.info.stream}_${test.meta.testName}_Error Analysis`;
            doc.text(testTitle, pageWidth / 2, yPos + 6, { align: 'center' });
            yPos += 12;

            // Score Table
            if (yPos + 20 > pageHeight - margin) {
                doc.addPage();
                yPos = 15;
            }
            const colDefs = [
                { name: "Test", w: 26, bg: [255, 255, 255] },
                { name: "Date", w: 26, bg: [255, 255, 255] },
                { name: "TOT", w: 15, bg: [255, 255, 204] },
                { name: "AIR", w: 15, bg: [255, 255, 255] },
                { name: "MAT", w: 18, bg: [253, 233, 217] },
                { name: "Rank", w: 18, bg: [253, 233, 217] },
                { name: "PHY", w: 18, bg: [235, 241, 222] },
                { name: "Rank", w: 18, bg: [235, 241, 222] },
                { name: "CHEM", w: 18, bg: [242, 220, 219] },
                { name: "Rank", w: 18, bg: [242, 220, 219] }
            ];

            const values = [
                test.meta.testName, formatDate(test.meta.date),
                test.meta.tot, test.meta.air,
                test.meta.mat, test.meta.m_rank,
                test.meta.phy, test.meta.p_rank,
                test.meta.chem, test.meta.c_rank
            ];

            let currentX = margin;
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);

            colDefs.forEach((col) => {
                doc.setFillColor(...col.bg);
                doc.rect(currentX, yPos, col.w, 6, 'FD');
                doc.text(col.name, currentX + (col.w / 2), yPos + 4, { align: 'center' });
                currentX += col.w;
            });
            yPos += 6;

            currentX = margin;
            doc.setFontSize(10);
            doc.setTextColor(128, 0, 0);

            colDefs.forEach((col, i) => {
                doc.setFillColor(...col.bg);
                doc.rect(currentX, yPos, col.w, 6, 'FD');
                doc.text(String(values[i] || '-'), currentX + (col.w / 2), yPos + 4, { align: 'center' });
                currentX += col.w;
            });
            yPos += 8;

            // FILTER QUESTIONS BEFORE LOOP
            const filteredQs = getFilteredQuestions(test.questions);

            for (let i = 0; i < filteredQs.length; i++) {
                const q = filteredQs[i];
                const qImg = await loadImage(q.Q_URL);
                const sImg = await loadImage(q.S_URL);

                // Adjusted Widths - Merged Key/Perc, More space for Subs
                const wStat = 15; // W/U
                const wQ = 11;    // Q No
                const wSubj = 30; // Subject
                const wDetails = 22; // Key

                const remainingW = contentWidth - wStat - wQ - wSubj - wDetails;
                const wTopic = remainingW / 2;
                const wSub = remainingW / 2;

                const imgAreaW = contentWidth; // Full width
                const halfImgW = imgAreaW / 2;

                if (bookmanBoldFont) doc.setFont("Bookman", "bold");
                else doc.setFont("helvetica", "bold");
                doc.setFontSize(9);

                // --- Calculate Heights with Smart Wrap ---
                const topicLabel = "Topic: ";
                const topicVal = q.Topic || '';
                const topicLabelW = doc.getTextWidth(topicLabel);
                const topicLines = getSmartWrappedLines(doc, topicVal, wTopic - 2, topicLabelW);

                const subLabel = "Sub Topic: ";
                const subVal = q.Sub_Topics || '';
                const subLabelW = doc.getTextWidth(subLabel);
                const subLines = getSmartWrappedLines(doc, subVal, wSub - 2, subLabelW);

                // Key Calc
                const keyLabel = "Key: ";
                const keyVal = q.Key_Value || '';
                const keyLabelW = doc.getTextWidth(keyLabel);
                const detailsLines = getSmartWrappedLines(doc, keyVal, wDetails - 2, keyLabelW);
                const detailsH = Math.max(2, detailsLines.length) * 4;

                // Proportional Row 2 Header Widths
                const wType = contentWidth * 0.45;  // 45% for Type (long)
                const wSrc = contentWidth * 0.15;   // 15%
                const wOR = contentWidth * 0.20;    // 20%
                const wLvl = contentWidth * 0.20;   // 20%

                const typeLines = getSmartWrappedLines(doc, q.Question_Type || '--', wType - 2, doc.getTextWidth("Type: "));
                const sourceLines = getSmartWrappedLines(doc, q.Sources || '--', wSrc - 2, doc.getTextWidth("Src: "));
                const orLines = getSmartWrappedLines(doc, q.Original_Replica || '--', wOR - 2, doc.getTextWidth("O/R: "));
                const levelLines = getSmartWrappedLines(doc, q.Level || '--', wLvl - 2, doc.getTextWidth("Lvl: "));

                const maxHeaderLines1 = Math.max(2, topicLines.length, subLines.length, detailsLines.length);
                const maxHeaderLines2 = Math.max(2, typeLines.length, sourceLines.length, orLines.length, levelLines.length);
                const lineHeight = 4;
                const headerH1 = Math.max(9, (maxHeaderLines1 * lineHeight) + 3);
                const headerH2 = Math.max(9, (maxHeaderLines2 * lineHeight) + 3);
                const headerH = headerH1 + headerH2;

                const imgTargetW = contentWidth - 4;
                let qH = 0; if (qImg) qH = (qImg.height / qImg.width) * imgTargetW;
                let sH = 0; if (sImg) sH = (sImg.height / sImg.width) * imgTargetW;

                const FOOTER_SPACE = 15;
                const SAFE_PAGE_H = pageHeight - FOOTER_SPACE;

                // Pre-scale massive images that exceed a full page
                const MAX_IMG_H = SAFE_PAGE_H - 10 - headerH;
                if ((qH + sH) > MAX_IMG_H) {
                    const scale = MAX_IMG_H / (qH + sH);
                    qH *= scale;
                    sH *= scale;
                }

                const spacing = (i === 0 && yPos < 100) ? 2 : (i > 0 ? 5 : 0);
                let currentY = yPos + spacing;

                // --- AGGRESSIVE SPACE OPTIMIZATION ---
                // Try to fit Header + Q Image on current page
                let qAreaH = qH + 2;
                let totalNeededQ = headerH + qAreaH;
                let availQ = SAFE_PAGE_H - currentY;

                if (totalNeededQ > availQ) {
                    // Can we shrink Q to fit? Only if we have at least 50mm space
                    if (availQ > 50) {
                        const targetQH = availQ - headerH - 5;
                        const scale = targetQH / qH;
                        if (scale >= 0.6) { // Readability check
                            qH = targetQH;
                            qAreaH = qH + 2;
                        } else {
                            doc.addPage();
                            currentY = 15;
                        }
                    } else {
                        doc.addPage();
                        currentY = 15;
                    }
                }
                yPos = currentY;

                doc.setFillColor(128, 0, 0);
                doc.rect(margin, yPos, contentWidth, headerH, 'F');
                doc.setDrawColor(0);
                doc.rect(margin, yPos, contentWidth, headerH, 'D'); // Header border

                doc.setTextColor(255);

                let cx = margin;
                const ty = yPos + 4.5;

                // W/U
                doc.text(String(q.W_U || ''), cx + (wStat / 2), ty, { align: 'center' });
                doc.setDrawColor(255);
                doc.line(cx + wStat, yPos, cx + wStat, yPos + headerH1);
                cx += wStat;

                // Q No
                doc.text(String(q.Q_No), cx + (wQ / 2), ty, { align: 'center' });
                doc.line(cx + wQ, yPos, cx + wQ, yPos + headerH1);
                cx += wQ;

                // Subject Renderer
                doc.setTextColor(255, 255, 0); // Yellow
                doc.text("Sub:", cx + 1, ty);
                doc.setTextColor(255, 255, 255); // White
                doc.text(String(q.Subject || '--'), cx + 1 + doc.getTextWidth("Sub:"), ty);
                doc.setDrawColor(255);
                doc.line(cx + wSubj, yPos, cx + wSubj, yPos + headerH1);
                cx += wSubj;

                // Topic Renderer
                doc.setTextColor(255, 255, 0); // Yellow
                doc.text(topicLabel, cx + 1, ty);
                doc.setTextColor(255, 255, 255); // White
                topicLines.forEach((line, idx) => {
                    const ly = ty + (idx * lineHeight);
                    doc.text(line.text, cx + 1 + line.xOffset, ly);
                });
                doc.setDrawColor(255);
                doc.line(cx + wTopic, yPos, cx + wTopic, yPos + headerH1);
                cx += wTopic;

                // Sub Topic Renderer
                doc.setTextColor(255, 255, 0); // Yellow
                doc.text(subLabel, cx + 1, ty);
                doc.setTextColor(255, 255, 255); // White
                subLines.forEach((line, idx) => {
                    const ly = ty + (idx * lineHeight);
                    doc.text(line.text, cx + 1 + line.xOffset, ly);
                });
                doc.setDrawColor(255);
                doc.line(cx + wSub, yPos, cx + wSub, yPos + headerH1);
                cx += wSub;

                // Details Column (Key)
                doc.setTextColor(255, 255, 0);
                doc.text(keyLabel, cx + 2, ty);
                doc.setTextColor(255, 255, 255);
                detailsLines.forEach((line, idx) => {
                    const ly = ty + (idx * lineHeight);
                    doc.text(line.text, cx + 2 + line.xOffset, ly);
                });

                // --- NEW HEADER ROW 2 ---
                const yPos2 = yPos + headerH1;
                doc.setDrawColor(255);
                doc.line(margin, yPos2, margin + contentWidth, yPos2);

                let cx2 = margin; // Start from margin
                const ty2 = yPos2 + 4.5;

                const renderSubCol = (label, lines, x, y) => {
                    doc.setTextColor(255, 255, 0);
                    doc.text(label, x + 1, y);
                    doc.setTextColor(255, 255, 255);
                    lines.forEach((line, idx) => {
                        const ly = y + (idx * lineHeight);
                        doc.text(line.text, x + 1 + line.xOffset, ly);
                    });
                };

                renderSubCol("Type: ", typeLines, cx2, ty2);
                doc.line(cx2 + wType, yPos2, cx2 + wType, yPos2 + headerH2);
                cx2 += wType;

                renderSubCol("Src: ", sourceLines, cx2, ty2);
                doc.line(cx2 + wSrc, yPos2, cx2 + wSrc, yPos2 + headerH2);
                cx2 += wSrc;

                renderSubCol("O/R: ", orLines, cx2, ty2);
                doc.line(cx2 + wOR, yPos2, cx2 + wOR, yPos2 + headerH2);
                cx2 += wOR;

                renderSubCol("Lvl: ", levelLines, cx2, ty2);

                const ibx = margin;
                const iby = yPos + headerH;

                const drwImg = (img, x, y, w, h) => {
                    if (!img) return;
                    try { doc.addImage(img, 'PNG', x + 2, y + 1, w, h); } catch (e) { }
                };

                // Draw Q Image Area
                qAreaH = qH + 2;
                if (qImg) {
                    drwImg(qImg, ibx, iby, imgTargetW, qH);
                } else {
                    doc.setTextColor(150); doc.setFontSize(8);
                    doc.text("No Q Image", ibx + 10, iby + 10);
                }
                doc.setDrawColor(0);
                doc.rect(margin, iby, contentWidth, qAreaH); // Border for Q

                // Check Solution Image Fit
                let nextY = iby + qAreaH;
                if (sImg) {
                    let sAreaH = sH + 2;
                    let availS = SAFE_PAGE_H - nextY;

                    if (sAreaH > availS) {
                        // Can we shrink S to fit? 
                        if (availS > 45) {
                            const targetSH = availS - 5;
                            const scale = targetSH / sH;
                            if (scale >= 0.6) {
                                sH = targetSH;
                                sAreaH = sH + 2;
                            } else {
                                doc.addPage();
                                nextY = 15;
                            }
                        } else {
                            doc.addPage();
                            nextY = 15;
                        }
                    }

                    // Final drawing positioning check
                    if (nextY === 15) {
                        doc.setFontSize(8); doc.setTextColor(150);
                        doc.text(`Q${q.Q_No} Solution (contd.)`, margin, nextY - 2);
                        drwImg(sImg, ibx, nextY, imgTargetW, sH);
                        doc.setDrawColor(0);
                        doc.rect(margin, nextY, contentWidth, sH + 2);
                        yPos = nextY + sH + 4;
                    } else {
                        drwImg(sImg, ibx, nextY, imgTargetW, sH);
                        doc.setDrawColor(0);
                        doc.rect(margin, nextY, contentWidth, sH + 2);
                        yPos = nextY + sH + 4;
                    }
                } else {
                    yPos = nextY + 2;
                }
            }
        }

        const totalPages = doc.internal.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(0);
        if (bookmanFont) doc.setFont("Bookman", "normal");

        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.text(`Page ${p} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
        }

        return doc;
    };

    const generatePDF = async () => {
        if (reportData.length === 0) return;
        setGeneratingPdf(true);
        setPdfProgress('Loading Resources...');

        try {
            const [impactFont, bookmanFont, bookmanBoldFont] = await Promise.all([
                loadFont('/fonts/unicode.impact.ttf'),
                loadFont('/fonts/bookman-old-style.ttf'),
                loadFont('/fonts/BOOKOSB.TTF')
            ]);
            const logoImg = await loadImage('/logo.png');

            const fonts = { impactFont, bookmanFont, bookmanBoldFont };

            if (reportData.length === 1) {
                const doc = await createStudentPDF(reportData[0], fonts, logoImg);
                doc.save(`${reportData[0].info.name}_${reportData[0].info.branch}.pdf`);
                logActivity(userData, 'Downloaded Error PDF', { student: reportData[0].info.name });
            } else {
                const zip = new JSZip();

                for (let i = 0; i < reportData.length; i++) {
                    const student = reportData[i];
                    setPdfProgress(`Generating PDF for ${student.info.name} (${i + 1}/${reportData.length})...`);
                    const doc = await createStudentPDF(student, fonts, logoImg);
                    const blob = doc.output('blob');
                    zip.file(`${student.info.name}_${student.info.branch}.pdf`, blob);
                }

                setPdfProgress('Compressing...');
                const zipContent = await zip.generateAsync({ type: 'blob' });
                saveAs(zipContent, `Error_Reports_${subjectFilter}.zip`);
                logActivity(userData, 'Downloaded Bulk Error Reports', { count: reportData.length, subject: subjectFilter });
            }

        } catch (err) {
            console.error("PDF/ZIP Error", err);
            alert("Error: " + err.message);
        } finally {
            setGeneratingPdf(false);
            setPdfProgress('');
        }
    };

    return (
        <div style={{ padding: '20px', backgroundColor: '#808080', fontFamily: '"Bookman Old Style", "Times New Roman", serif', minHeight: '100vh', boxSizing: 'border-box', overflow: 'auto' }}>
            <div className="no-print" style={{ maxWidth: '210mm', margin: '0 auto 20px auto', backgroundColor: 'white', padding: '15px', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', fontFamily: 'Arial, sans-serif' }}>
                {/* Removed FilterBar from here as it is now in App.jsx */}

                {/* SUBJECT FILTER & ACTION BUTTONS */}
                <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>

                    {showSubjects && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>Filter Subject:</span>
                            {subjectOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setSubjectFilter(opt.value)}
                                    style={{
                                        backgroundColor: subjectFilter === opt.value ? '#155724' : '#28a745',
                                        color: 'white',
                                        border: '1px solid #c3e6cb',
                                        padding: '5px 15px',
                                        borderRadius: '20px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f8f9fa', padding: '5px 10px', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '13px', marginRight: '5px' }}>Zoom:</span>
                        <button onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.5))} style={{ padding: '2px 8px', cursor: 'pointer' }}>-</button>
                        <span style={{ minWidth: '45px', textAlign: 'center', fontWeight: 'bold' }}>{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(prev => Math.min(prev + 0.1, 2))} style={{ padding: '2px 8px', cursor: 'pointer' }}>+</button>
                        <button onClick={() => setZoom(1)} style={{ padding: '2px 8px', cursor: 'pointer', marginLeft: '5px', fontSize: '12px' }}>Reset</button>
                    </div>

                    {/* View Report Button */}
                    <button
                        onClick={handleViewReport}
                        disabled={loading}
                        style={{
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                    >
                        {loading ? 'Loading...' : 'View Report'}
                    </button>

                    {/* Download Button - Only visible if data is loaded */}
                    {reportData.length > 0 && (
                        <button
                            onClick={generatePDF}
                            disabled={generatingPdf}
                            style={{
                                backgroundColor: '#0070c0',
                                color: 'white',
                                border: 'none',
                                padding: '10px 20px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                marginLeft: 'auto'
                            }}
                        >
                            {generatingPdf ? pdfProgress || 'Generating...' : `⬇ Download ${reportData.length > 1 ? 'All (ZIP)' : 'PDF'}`}
                        </button>
                    )}
                </div>

                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: '#333' }}>
                        {reportData.length > 0 ? `${reportData.length} Student(s) Loaded` : 'No report loaded. Select filters and click "View Report".'}
                    </span>
                </div>
            </div>

            <LoadingTimer isLoading={loading} />

            {!loading && reportData.slice(0, 20).map((student, sIdx) => {

                // Filter questions for rendering

                return (
                    <div key={sIdx} style={{
                        width: '210mm',
                        minHeight: '297mm',
                        margin: '0 auto 40px auto',
                        backgroundColor: 'white',
                        padding: '10mm',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                        boxSizing: 'border-box',
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top center',
                        marginBottom: `${(zoom - 1) * 287 + 20}mm` // Correctly pushes next page down
                    }}>

                        {/* Header */}
                        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                            <div style={{ color: '#0070c0', marginBottom: '5px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                                <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '26px' }}>Sri Chaitanya</span>
                                <span style={{ fontFamily: '"Bookman Old Style", serif', fontSize: '26px', marginLeft: '5px' }}> Educational Institutions</span>
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '4px', fontFamily: '"Bookman Old Style", serif' }}>
                                A.P, TELANGANA, KARNATAKA, TAMILNADU, MAHARASHTRA, DELHI, RANCHI
                            </div>
                            <div style={{ fontFamily: '"Bookman Old Style", serif', fontStyle: 'italic', fontSize: '18px', margin: '2px 0' }}>
                                A right Choice for the Real Aspirant
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px', fontFamily: '"Bookman Old Style", serif' }}>
                                Central Office, Bangalore
                            </div>
                        </div>

                        {/* STUDENT INFO HEADER -- Updated to Bookman font */}
                        <div style={{ width: '100%', border: '1px solid black', display: 'flex', backgroundColor: '#fff8dc', marginBottom: '20px', fontSize: '12px', fontWeight: 'bold', fontFamily: '"Bookman Old Style", serif' }}>
                            <div style={{ flex: 1, padding: '8px', textAlign: 'center', textTransform: 'uppercase', borderRight: '1px solid black' }}>
                                {student.info.name}
                            </div>
                            <div style={{ flex: 1, padding: '8px', textAlign: 'center', textTransform: 'uppercase' }}>
                                {student.info.branch}
                            </div>
                        </div>

                        {student.tests.map((test, tIdx) => {
                            const renderQs = getFilteredQuestions(test.questions);
                            if (renderQs.length === 0) return null; // Skip test if no qs match subject

                            return (
                                <div key={tIdx} style={{ marginBottom: '30px' }}>
                                    <h2 style={{ textAlign: 'center', color: '#000', fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
                                        {formatDate(test.meta.date)}_{student.info.stream}_{test.meta.testName}_Error Analysis
                                    </h2>
                                    {/* Score Table */}
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', marginBottom: '15px', fontSize: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                                            <colgroup>
                                                <col style={{ width: '13.15%' }} />
                                                <col style={{ width: '13.15%' }} />
                                                <col style={{ width: '9%' }} />
                                                <col style={{ width: '9%' }} />
                                                <col style={{ width: '9%' }} />
                                                <col style={{ width: '9%' }} />
                                                <col style={{ width: '9%' }} />
                                                <col style={{ width: '9%' }} />
                                                <col style={{ width: '9%' }} />
                                                <col style={{ width: '9%' }} />
                                            </colgroup>
                                            <thead>
                                                <tr style={{ height: '24px' }}>
                                                    <td style={{ border: '1px solid black', backgroundColor: 'white' }}>Test</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: 'white' }}>Date</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#ffffcc' }}>TOT</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: 'white' }}>AIR</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#fde9d9' }}>MAT</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#fde9d9' }}>Rank</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#ebf1de' }}>PHY</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#ebf1de' }}>Rank</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#f2dcdb' }}>CHEM</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#f2dcdb' }}>Rank</td>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr style={{ color: '#800000', height: '24px' }}>
                                                    <td style={{ border: '1px solid black', backgroundColor: 'white' }}>{test.meta.testName}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: 'white' }}>{formatDate(test.meta.date)}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#ffffcc' }}>{test.meta.tot}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: 'white' }}>{test.meta.air}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#fde9d9' }}>{test.meta.mat}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#fde9d9' }}>{test.meta.m_rank}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#ebf1de' }}>{test.meta.phy}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#ebf1de' }}>{test.meta.p_rank}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#f2dcdb' }}>{test.meta.chem}</td>
                                                    <td style={{ border: '1px solid black', backgroundColor: '#f2dcdb' }}>{test.meta.c_rank}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Questions */}
                                    {renderQs.map((q, qIdx) => (
                                        <table key={qIdx} style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', marginBottom: '10px', backgroundColor: 'white' }}>
                                            <colgroup>
                                                <col style={{ width: '15mm' }} />
                                                <col style={{ width: '11mm' }} />
                                                <col style={{ width: '30mm' }} />
                                                <col style={{ width: '57mm' }} />
                                                <col style={{ width: '57mm' }} />
                                                <col style={{ width: '22mm' }} />
                                            </colgroup>
                                            <thead>
                                                <tr style={{ backgroundColor: '#800000', color: 'white', fontSize: '11px', fontWeight: 'bold' }}>
                                                    <td style={{ border: '1px solid black', borderRight: '1px solid white', textAlign: 'center', height: '28px' }}>{q.W_U}</td>
                                                    <td style={{ border: '1px solid black', borderRight: '1px solid white', textAlign: 'center' }}>{q.Q_No}</td>

                                                    <td style={{ border: '1px solid black', borderRight: '1px solid white', padding: '4px', verticalAlign: 'top' }}>
                                                        <span style={{ color: '#FFFF00' }}>Sub: </span>
                                                        <span style={{ color: 'white', marginLeft: '5px' }}>{q.Subject}</span>
                                                    </td>

                                                    <td style={{ border: '1px solid black', borderRight: '1px solid white', padding: '4px', verticalAlign: 'top', wordWrap: 'break-word' }}>
                                                        <span style={{ color: '#FFFF00' }}>Topic: </span>
                                                        <span style={{ color: 'white', marginLeft: '5px' }}>{q.Topic}</span>
                                                    </td>
                                                    <td style={{ border: '1px solid black', borderRight: '1px solid white', padding: '4px', verticalAlign: 'top', wordWrap: 'break-word' }}>
                                                        <span style={{ color: '#FFFF00' }}>Sub Topic: </span>
                                                        <span style={{ color: 'white', marginLeft: '5px' }}>{q.Sub_Topics}</span>
                                                    </td>

                                                    <td style={{ border: '1px solid black', textAlign: 'left', padding: '2px 4px', verticalAlign: 'top' }}>
                                                        <div>
                                                            <span style={{ color: '#FFFF00' }}>Key: </span>
                                                            <span style={{ color: 'white', marginLeft: '5px' }}>{q.Key_Value}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                <tr style={{ backgroundColor: '#800000', color: 'white', fontSize: '11px', fontWeight: 'bold' }}>
                                                    <td colSpan="3" style={{ border: '1px solid black', borderRight: '1px solid white', borderTop: '1px solid white', padding: '4px' }}>
                                                        <span style={{ color: '#FFFF00' }}>Type: </span>
                                                        <span style={{ color: 'white', marginLeft: '5px' }}>{q.Question_Type || '--'}</span>
                                                    </td>
                                                    <td style={{ border: '1px solid black', borderRight: '1px solid white', padding: '4px', borderTop: '1px solid white' }}>
                                                        <span style={{ color: '#FFFF00' }}>Sources: </span>
                                                        <span style={{ color: 'white', marginLeft: '5px' }}>{q.Sources || '--'}</span>
                                                    </td>
                                                    <td style={{ border: '1px solid black', borderRight: '1px solid white', padding: '4px', borderTop: '1px solid white' }}>
                                                        <span style={{ color: '#FFFF00' }}>O/R: </span>
                                                        <span style={{ color: 'white', marginLeft: '5px' }}>{q.Original_Replica || '--'}</span>
                                                    </td>
                                                    <td style={{ border: '1px solid black', padding: '4px', borderTop: '1px solid white' }}>
                                                        <span style={{ color: '#FFFF00' }}>Level: </span>
                                                        <span style={{ color: 'white', marginLeft: '5px' }}>{q.Level || '--'}</span>
                                                    </td>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    {/* Removed vertical blue sidebar td */}
                                                    <td colSpan="6" style={{ padding: 0, border: '1px solid black' }}>
                                                        <div style={{ borderBottom: '1px solid black' }}>
                                                            <div style={{ padding: '4px', fontSize: '10px', fontWeight: 'bold', color: '#666' }}>Q.{q.Q_No}</div>
                                                            <div style={{ textAlign: 'center', paddingBottom: '10px' }}>
                                                                {q.Q_URL ? (
                                                                    <img src={q.Q_URL} style={{ width: '100%', height: 'auto', display: 'block', margin: '0 auto' }} alt="Q" />
                                                                ) : (
                                                                    <div style={{ padding: '20px', fontStyle: 'italic', color: '#ccc', fontSize: '12px' }}>No Image</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div style={{ padding: '4px', fontSize: '10px', fontWeight: 'bold', color: '#666' }}>Sol</div>
                                                            <div style={{ textAlign: 'center', paddingBottom: '10px' }}>
                                                                {q.S_URL ? (
                                                                    <img src={q.S_URL} style={{ width: '100%', height: 'auto', display: 'block', margin: '0 auto' }} alt="S" />
                                                                ) : (
                                                                    <div style={{ padding: '20px', fontStyle: 'italic', color: '#ccc', fontSize: '12px' }}>No Solution</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                );
            })}

            {!loading && reportData.length > 20 && (
                <div style={{ textAlign: 'center', margin: '20px auto', maxWidth: '800px', padding: '15px', backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '8px', color: '#856404' }}>
                    <strong>Showing first 20 students only.</strong><br />
                    {reportData.length - 20} more students are hidden for better performance.<br />
                    Please use the filters to narrow down your search or download the PDF/ZIP to view all reports.
                </div>
            )}
        </div>
    );
};

export default ErrorReport;
