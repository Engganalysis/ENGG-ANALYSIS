import React, { useState, useEffect } from 'react';
import FilterBar from './FilterBar';
import { API_URL, buildQueryParams } from '../utils/apiHelper';
import { useAuth } from './auth/AuthProvider';
import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import Select from 'react-select';

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

const TOP_STUDENTS = [
    'ABHIRAM M', 'AVANEESH C CHINIWAL', 'AVANTHIKA S RAIKAR',
    'DAYANITHA P', 'HRISHIKESH V SHOLAPURKAR', 'LIKHITH P GOWDA',
    'RAGHURAM M', 'RAVIKIRAN KINI', 'SAGAN J S', 'SRAVYA SRI CHIDELLA',
    'Vaishnavi Das', 'SUCHITA MANNE', 'UNNATHI JONNALA ', 'DHRUV SINGH PHOGAT',
    'B R DHYAN', 'SURYA S'
];

const ErrorTop100 = ({ filters, setFilters }) => {
    const { isAdmin, isCoAdmin } = useAuth();
    // Use props filters instead of local state
    const [subjectFilter, setSubjectFilter] = useState('ALL');
    const [showSubjects, setShowSubjects] = useState(false);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [pdfProgress, setPdfProgress] = useState('');
    const [zoom, setZoom] = useState(1);

    // Subject Options
    const subjectOptions = [
        { value: 'ALL', label: 'All Subjects' },
        { value: 'MATHEMATICS', label: 'Mathematics' },
        { value: 'PHYSICS', label: 'Physics' },
        { value: 'CHEMISTRY', label: 'Chemistry' }
    ];

    // Clear report data when filters change to maintain stability
    useEffect(() => {
        setReportData([]);
        setShowSubjects(false);
    }, [filters]);

    const fetchData = async () => {
        if (filters.test.length === 0) {
            alert("Please select at least one Test.");
            return;
        }

        setLoading(true);
        try {
            // Fetch data for TOP_STUDENTS
            const topFilters = { ...filters, studentNames: TOP_STUDENTS };
            const params = buildQueryParams(topFilters);

            // Fetch error data
            const res = await fetch(`${API_URL}/api/erp/report?${params.toString()}`);
            const errorData = await res.json();

            // Fetch total participants from the list for these tests
            const participantsRes = await fetch(`${API_URL}/api/erp/participants?${params.toString()}`);
            const participantsData = await participantsRes.json();

            // Group by Test then by Question
            const testsGrouped = {};

            errorData.forEach(row => {
                const testKey = row.Test;
                if (!testsGrouped[testKey]) {
                    testsGrouped[testKey] = {
                        testName: row.Test,
                        date: row.Exam_Date,
                        stream: row.Stream,
                        questions: {}
                    };
                }

                const qKey = `${row.Subject}_${row.Q_No}`;
                if (!testsGrouped[testKey].questions[qKey]) {
                    testsGrouped[testKey].questions[qKey] = {
                        qNo: row.Q_No,
                        subject: row.Subject,
                        topic: row.Topic,
                        subTopic: row.Sub_Topic,
                        qUrl: row.Q_URL,
                        sUrl: row.S_URL,
                        keyValue: row.Key_Value,
                        nationalError: row.National_Wide_Error,
                        wrongStudents: []
                    };
                }
                testsGrouped[testKey].questions[qKey].wrongStudents.push({
                    name: row.Student_Name,
                    campus: row.Branch
                });
            });

            // Process into array and sort
            const processed = Object.values(testsGrouped).map(test => {
                const questionsArr = Object.values(test.questions).map(q => {
                    // Group wrong students by campus
                    const byCampus = {};
                    q.wrongStudents.forEach(s => {
                        if (!byCampus[s.campus]) byCampus[s.campus] = [];
                        byCampus[s.campus].push(s.name);
                    });

                    // Total students from list who took this test
                    const totalInList = participantsData[test.testName] || TOP_STUDENTS.length;

                    return {
                        ...q,
                        byCampus,
                        wrongCount: q.wrongStudents.length,
                        totalCount: totalInList
                    };
                });

                // Sort Questions: Largest to Smallest (Descending)
                questionsArr.sort((a, b) => {
                    const valA = parseFloat(a.nationalError) || 0;
                    const valB = parseFloat(b.nationalError) || 0;
                    if (valB !== valA) return valB - valA;

                    // Fallback to Subject then QNo
                    const subOrder = getSubjectOrder(a.subject) - getSubjectOrder(b.subject);
                    if (subOrder !== 0) return subOrder;
                    return (parseInt(a.qNo) || 0) - (parseInt(b.qNo) || 0);
                });

                return { ...test, questions: questionsArr };
            });

            setReportData(processed);
            setShowSubjects(true);
        } catch (err) {
            console.error(err);
            alert("Error fetching report data");
        } finally {
            setLoading(false);
        }
    };

    // Apply Subject Filter
    const getFilteredQuestions = (questions) => {
        if (subjectFilter === 'ALL') return questions;
        return questions.filter(q => q.subject && q.subject.toUpperCase() === subjectFilter);
    };

    // Helper: Load Image
    const loadImage = (src) => {
        if (!src) return Promise.resolve(null);
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
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
            return null;
        }
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

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = 210;
            const pageHeight = 297;
            const margin = 10;
            const contentWidth = pageWidth - (margin * 2);

            if (impactFont) { doc.addFileToVFS("unicode.impact.ttf", impactFont); doc.addFont("unicode.impact.ttf", "Impact", "normal"); }
            if (bookmanFont) { doc.addFileToVFS("bookman-old-style.ttf", bookmanFont); doc.addFont("bookman-old-style.ttf", "Bookman", "normal"); }
            if (bookmanBoldFont) { doc.addFileToVFS("BOOKOSB.TTF", bookmanBoldFont); doc.addFont("BOOKOSB.TTF", "Bookman", "bold"); }

            const drawMainHeader = () => {
                let y = 15;

                const p1 = "Sri Chaitanya";
                const p2 = " Educational Institutions";

                // Calculate total width for centering
                // Part 1: Sri Chaitanya (Size 31)
                doc.setFontSize(31);
                if (impactFont) doc.setFont("Impact", "normal"); else doc.setFont("helvetica", "bold");
                const w1 = doc.getTextWidth(p1);

                // Part 2: Educational Institutions (Size 26)
                doc.setFontSize(26);
                if (bookmanFont) doc.setFont("Bookman", "normal"); else doc.setFont("helvetica", "normal");
                const w2 = doc.getTextWidth(p2);

                const startX = (pageWidth - (w1 + w2)) / 2;

                // Draw Part 1
                doc.setFontSize(31);
                doc.setTextColor(0, 112, 192);
                if (impactFont) doc.setFont("Impact", "normal"); else doc.setFont("helvetica", "bold");
                doc.text(p1, startX, y);

                // Draw Part 2
                doc.setFontSize(26);
                doc.setTextColor(0, 112, 192);
                if (bookmanFont) doc.setFont("Bookman", "normal"); else doc.setFont("helvetica", "normal");
                doc.text(p2, startX + w1, y);

                y += 6;
                doc.setFontSize(9);
                doc.setTextColor(0);
                if (bookmanBoldFont) doc.setFont("Bookman", "bold"); else doc.setFont("helvetica", "bold");
                doc.text("A.P, TELANGANA, KARNATAKA, TAMILNADU, MAHARASHTRA, DELHI, RANCHI", pageWidth / 2, y, { align: 'center' });
                y += 5;
                doc.setFont("times", "italic");
                doc.setFontSize(14);
                doc.text("A right Choice for the Real Aspirant", pageWidth / 2, y, { align: 'center' });
                y += 5;
                if (bookmanBoldFont) doc.setFont("Bookman", "bold"); else doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text("Central Office, Bangalore", pageWidth / 2, y, { align: 'center' });
                return y + 3;
            };

            const drawTestTitle = (test, y) => {
                doc.setFontSize(14);
                doc.setTextColor(0);
                if (bookmanBoldFont) doc.setFont("Bookman", "bold"); else doc.setFont("helvetica", "bold");
                const testTitle = `${test.date}_${test.stream}_${test.testName}_Error Analysis`;
                doc.text(testTitle, pageWidth / 2, y + 6, { align: 'center' });
                return y + 12;
            };

            let isFirstPage = true;

            for (const test of reportData) {
                const filteredQs = getFilteredQuestions(test.questions);
                if (filteredQs.length === 0) continue;

                if (!isFirstPage) {
                    doc.addPage();
                }

                let yPos = isFirstPage ? drawMainHeader() : 10;
                yPos = drawTestTitle(test, yPos);
                isFirstPage = false;

                for (const q of filteredQs) {
                    const qImg = await loadImage(q.qUrl);

                    // Specific Portrait column widths relative to contentWidth (190mm)
                    const wQNo = 8;
                    const wErr = 11;
                    const wTop = 15;
                    const baseImgWidth = 100; // Column Width
                    const imgDrawWidth = 98; // Image Width
                    const wSub = 18;
                    const wStud = contentWidth - (wQNo + wErr + wTop + baseImgWidth + wSub);

                    let qH = 20;
                    if (qImg) qH = (qImg.height / qImg.width) * imgDrawWidth;

                    // Calculate student list height (Single column)
                    let totalLines = 0;
                    totalLines += 2; // Header "Wrong Attempts -Students"
                    Object.entries(q.byCampus).forEach(([campus, names]) => {
                        totalLines += 1; // Campus header
                        totalLines += names.length; // Student names
                    });
                    const studH = totalLines * 4.5 + 5;

                    const maroonH = 7;
                    const marginBot = 15;
                    let rowH = Math.max(qH + 10, studH, 25);

                    // --- Improved Fitting Logic: Prioritize Visibility ---
                    const totalNeeded = rowH + maroonH;
                    const availableSpace = pageHeight - marginBot - yPos;

                    if (totalNeeded > availableSpace) {
                        // Only shrink if we can still maintain a highly visible question (min qH ~40mm)
                        const possibleRowH = availableSpace - maroonH;
                        const possibleQH = possibleRowH - 10;

                        // If we have enough space for a decent-sized question and students fit
                        if (possibleRowH >= 50 && studH <= possibleRowH && possibleQH >= 45) {
                            rowH = possibleRowH;
                            qH = possibleQH;
                        } else {
                            // Otherwise, just move to the next page as requested
                            doc.addPage();
                            yPos = 10;
                            yPos = drawTestTitle(test, yPos);
                            rowH = Math.max(qH + 10, studH, 25);
                        }
                    }

                    // Maroon Topic/Key Bar
                    doc.setFillColor(128, 0, 0);
                    doc.rect(margin, yPos, contentWidth, maroonH, 'F');
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "bold");

                    doc.setTextColor(255, 255, 0);
                    doc.text("Topic : ", margin + 2, yPos + 5);
                    doc.setTextColor(255, 255, 255);
                    doc.text(String(q.topic), margin + 2 + doc.getTextWidth("Topic : "), yPos + 5);

                    const keyLabel = "Key : ";
                    doc.setTextColor(255, 255, 0);
                    const topicWidthOffset = wQNo + wErr + wTop + baseImgWidth;
                    const keyX = margin + topicWidthOffset + 2;
                    doc.text(keyLabel, keyX, yPos + 5);
                    doc.setTextColor(255, 255, 255);
                    doc.text(String(q.keyValue), keyX + doc.getTextWidth(keyLabel), yPos + 5);

                    yPos += maroonH;

                    doc.setDrawColor(0);
                    doc.rect(margin, yPos, contentWidth, rowH);

                    let currX = margin;
                    doc.setFontSize(10);
                    doc.setTextColor(0);
                    doc.text(String(q.qNo), currX + wQNo / 2, yPos + rowH / 2, { align: 'center' });

                    currX += wQNo;
                    doc.line(currX, yPos, currX, yPos + rowH);

                    doc.setTextColor(255, 0, 0);
                    doc.text(`${q.wrongCount}/${q.totalCount}`, currX + wErr / 2, yPos + rowH / 2, { align: 'center' });
                    doc.setTextColor(0);

                    currX += wErr;
                    doc.line(currX, yPos, currX, yPos + rowH);

                    doc.setFontSize(7);
                    doc.setTextColor(0, 0, 150);
                    doc.text("Top 100", currX + wTop / 2, yPos + rowH / 2 - 3, { align: 'center' });
                    doc.text("(%):", currX + wTop / 2, yPos + rowH / 2 + 1, { align: 'center' });
                    doc.setTextColor(255, 0, 0);
                    doc.setFontSize(9);
                    const perc = q.nationalError ? Math.round(parseFloat(q.nationalError) * 100) + '%' : '0%';
                    doc.text(perc, currX + wTop / 2, yPos + rowH / 2 + 6, { align: 'center' });
                    doc.setTextColor(0);

                    currX += wTop;
                    doc.line(currX, yPos, currX, yPos + rowH);

                    if (qImg) {
                        try {
                            const asp = qImg.width / qImg.height;
                            let finalImgW = imgDrawWidth;
                            let finalImgH = qH;
                            if (finalImgH * asp < imgDrawWidth) {
                                finalImgW = finalImgH * asp;
                            }
                            // Center horizontally and vertically within its box
                            doc.addImage(qImg, 'PNG', currX + (baseImgWidth - finalImgW) / 2, yPos + (rowH - finalImgH) / 2, finalImgW, finalImgH);
                        } catch (e) { }
                    }
                    currX += baseImgWidth;
                    doc.line(currX, yPos, currX, yPos + rowH);

                    doc.setFontSize(8);
                    doc.setFont("helvetica", "bold");
                    doc.text(String(q.subject), currX + wSub / 2, yPos + rowH / 2, { align: 'center' });

                    currX += wSub;
                    doc.line(currX, yPos, currX, yPos + rowH);

                    // Wrong Attempts Column - BLUE BACKGROUND
                    doc.setFillColor(79, 129, 189);
                    doc.rect(currX, yPos, wStud, rowH, 'F');

                    let sy = yPos + 5;
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "bold");
                    doc.text("Wrong Attempts -Students", currX + 2, sy);
                    sy += 6;

                    doc.setFontSize(8);
                    Object.entries(q.byCampus).forEach(([campus, names]) => {
                        doc.setTextColor(255, 255, 0);
                        doc.setFont("helvetica", "bold");
                        doc.text(campus, currX + 2, sy);
                        sy += 4.5;

                        doc.setTextColor(255, 255, 255);
                        doc.setFont("helvetica", "normal");
                        names.forEach(name => {
                            // Trim name if it overflows the ~56mm column
                            let trimmedName = name;
                            if (doc.getTextWidth(trimmedName) > wStud - 4) {
                                while (doc.getTextWidth(trimmedName + "...") > wStud - 4 && trimmedName.length > 0) {
                                    trimmedName = trimmedName.slice(0, -1);
                                }
                                trimmedName += "...";
                            }
                            doc.text(trimmedName, currX + 2, sy);
                            sy += 4;
                        });
                        sy += 1;
                    });

                    yPos += rowH;
                }
            }

            const filename = (reportData.length === 1)
                ? `${reportData[0].date}_${reportData[0].stream}_${reportData[0].testName}_Error Analysis.pdf`
                : `Top_100_Error_Report.pdf`;
            doc.save(filename);

        } catch (err) {
            console.error(err);
            alert("Error generating PDF");
        } finally {
            setGeneratingPdf(false);
        }
    };

    if (!isAdmin && !isCoAdmin) return <div style={{ padding: '50px', textAlign: 'center', color: 'white' }}>Access Denied. Admins Only.</div>;

    return (
        <div style={{ padding: '20px', backgroundColor: '#808080', minHeight: '100vh', boxSizing: 'border-box' }}>
            <div className="no-print" style={{ maxWidth: '1200px', margin: '0 auto 20px auto', backgroundColor: 'white', padding: '15px', borderRadius: '5px' }}>
                {/* Removed FilterBar from here as it is now in App.jsx */}

                <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f8f9fa', padding: '5px 10px', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '13px', marginRight: '5px' }}>Zoom:</span>
                        <button onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.5))} style={{ padding: '2px 8px', cursor: 'pointer' }}>-</button>
                        <span style={{ minWidth: '45px', textAlign: 'center', fontWeight: 'bold' }}>{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(prev => Math.min(prev + 0.1, 2))} style={{ padding: '2px 8px', cursor: 'pointer' }}>+</button>
                        <button onClick={() => setZoom(1)} style={{ padding: '2px 8px', cursor: 'pointer', marginLeft: '5px', fontSize: '12px' }}>Reset</button>
                    </div>

                    <button
                        onClick={fetchData}
                        disabled={loading}
                        style={{
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        {loading ? 'Loading...' : 'View Report'}
                    </button>

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
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ flex: 1, textAlign: 'right' }}>
                        {reportData.length > 0 && (
                            <button
                                onClick={generatePDF}
                                disabled={generatingPdf}
                                style={{ backgroundColor: '#0070c0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                {generatingPdf ? 'Generating...' : `⬇ Download PDF Report`}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {loading && <div style={{ textAlign: 'center', color: 'white', fontSize: '20px' }}>Loading Top 100% Error Data...</div>}

            {
                !loading && reportData.map((test, tIdx) => {
                    // Sort questions for current display
                    const sortedQs = [...test.questions].sort((a, b) => {
                        const valA = parseFloat(a.nationalError) || 0;
                        const valB = parseFloat(b.nationalError) || 0;
                        return valB - valA; // Descending
                    });

                    const renderQs = getFilteredQuestions(sortedQs);
                    if (renderQs.length === 0) return null;

                    return (
                        <div key={tIdx} style={{
                            maxWidth: '98%',
                            margin: '0 auto 40px auto',
                            backgroundColor: 'white',
                            padding: '20px',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                            transform: `scale(${zoom})`,
                            transformOrigin: 'top center',
                            marginBottom: `${(100 * zoom) - 100 + 40}px` // Minimal adjustment
                        }}>
                            <h2 style={{ textAlign: 'center', color: '#000', fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
                                {test.date}_{test.stream}_{test.testName}_Error Analysis
                            </h2>

                            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '40px' }} />
                                    <col style={{ width: '60px' }} />
                                    <col style={{ width: '80px' }} />
                                    <col style={{ width: '318px' }} />
                                    <col style={{ width: '100px' }} />
                                    <col style={{ width: 'auto' }} />
                                </colgroup>
                                <tbody>
                                    {renderQs.map((q, qIdx) => (
                                        <React.Fragment key={qIdx}>
                                            <tr style={{ backgroundColor: '#800000', color: 'white', fontWeight: 'bold', fontSize: '13px' }}>
                                                <td colSpan="4" style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>
                                                    <span style={{ color: '#FFFF00' }}>Topic : </span>
                                                    <span style={{ color: 'white' }}>{q.topic}</span>
                                                </td>
                                                <td colSpan="2" style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>
                                                    <span style={{ color: '#FFFF00' }}>Key : </span>
                                                    <span style={{ color: 'white' }}>{q.keyValue}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{q.qNo}</td>
                                                <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold', color: 'red' }}>{q.wrongCount}/{q.totalCount}</td>
                                                <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>
                                                    <div style={{ color: 'blue', fontSize: '11px', fontWeight: 'bold' }}>Top 100(%):</div>
                                                    <div style={{ color: 'red', fontSize: '14px', fontWeight: 'bold' }}>
                                                        {(() => {
                                                            const raw = q.nationalError;
                                                            if (!raw || isNaN(parseFloat(raw))) return '0%';
                                                            const num = parseFloat(raw);
                                                            const isAlreadyPercent = String(raw).includes('%') || num > 1.0;
                                                            return isAlreadyPercent ? Math.round(num) + '%' : Math.round(num * 100) + '%';
                                                        })()}
                                                    </div>
                                                </td>
                                                <td style={{ border: '1px solid black', padding: '10px', textAlign: 'center' }}>
                                                    {q.qUrl && <img src={q.qUrl} alt="Question" style={{ width: '318px', height: 'auto', display: 'block', margin: '0 auto' }} />}
                                                </td>
                                                <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{q.subject}</td>
                                                <td style={{ border: '1px solid black', padding: '8px', verticalAlign: 'top', backgroundColor: '#4F81BD', color: 'white' }}>
                                                    <div style={{ fontSize: '14px', color: 'white', textDecoration: 'underline', marginBottom: '8px', fontWeight: 'bold', textAlign: 'center' }}>Wrong Attempts -Students</div>
                                                    {Object.entries(q.byCampus).map(([campus, names]) => (
                                                        <div key={campus} style={{ marginBottom: '12px' }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#FFFF00', textTransform: 'uppercase', textDecoration: 'underline', marginBottom: '2px' }}>{campus}</div>
                                                            {names.map(name => (
                                                                <div key={name} style={{ fontSize: '13px', color: 'white', marginLeft: '2px', lineHeight: '1.2' }}>{name}</div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })
            }
        </div >
    );
};

export default ErrorTop100;
