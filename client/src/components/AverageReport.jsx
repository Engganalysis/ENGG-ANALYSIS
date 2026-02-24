
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { buildQueryParams, formatDate, API_URL } from '../utils/apiHelper';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const AverageReport = ({ filters }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });


    // Reset results when filters change to maintain consistency
    useEffect(() => {
        setHistory([]);
        setHasSearched(false);
    }, [filters.campus, filters.stream, filters.testType, filters.test, filters.topAll, filters.studentSearch]);

    const fetchData = async () => {
        if (!filters.studentSearch || filters.studentSearch.length === 0) {
            setModal({
                isOpen: true,
                type: 'info',
                title: 'Select Student',
                message: 'Please select a student from the filters first.',
                onClose: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
            return;
        }

        setLoading(true);
        setHasSearched(true);
        try {
            const params = buildQueryParams(filters);
            const response = await fetch(`${API_URL}/api/history?${params.toString()}`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Status: ${response.status}`);
            }
            const data = await response.json();
            setHistory(data);
        } catch (err) {
            console.error("Fetch Error:", err);
            setModal({
                isOpen: true,
                type: 'danger',
                title: 'Error',
                message: `Failed to load student history: ${err.message}`,
                onClose: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        } finally {
            setLoading(false);
        }
    };

    const loadImage = (src) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
        });
    };

    const generateStudentPDF = (studentData, bgImg, logoImg, impactFont, bookmanFont, bookmanBoldFont) => {
        const doc = new jsPDF('p', 'mm', 'a4');

        // Add Fonts
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

        // Draw background on first page
        if (bgImg) {
            try {
                doc.addImage(bgImg, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
            } catch (e) { }
        }

        // Add event listener for SUBSEQUENT pages to draw background BEFORE content
        doc.internal.events.subscribe('addPage', () => {
            if (bgImg) {
                try {
                    doc.addImage(bgImg, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
                } catch (e) { }
            }
        });

        let currentY = 11; // Reduced top margin

        // 1. Logo & Institution Name - Centered Together
        // Split Title into two lines with custom colors/fonts
        const title1 = "SRI CHAITANYA";
        const title2 = "EDUCATIONAL INSTITUTIONS";

        if (impactFont) {
            doc.setFont("Impact", "normal");
        } else {
            doc.setFont("helvetica", "bold");
        }
        doc.setFontSize(22); // Consistent size as before
        doc.setTextColor(0, 112, 192); // #0070C0

        if (logoImg) {
            const aspect = logoImg.width / logoImg.height;
            let logoH = 20;
            let logoW = logoH * aspect;

            // Draw Logo Centered Top
            const logoX = (210 - logoW) / 2;
            doc.addImage(logoImg, 'PNG', logoX, currentY, logoW, logoH, undefined, 'FAST');
            currentY += logoH + 6;
        } else {
            currentY += 10;
        }

        // Draw Single Line Header: "Sri Chaitanya" (Impact) + " Educational Institutions" (Bookman)
        const part1 = "Sri Chaitanya";
        const part2 = " Educational Institutions";
        doc.setFontSize(26); // Adjusted size to fit A4 Portrait

        // Measure widths
        if (impactFont) doc.setFont("Impact", "normal");
        else doc.setFont("helvetica", "bold");
        const w1 = doc.getTextWidth(part1);

        if (bookmanFont) doc.setFont("Bookman", "normal");
        else doc.setFont("helvetica", "normal");
        const w2 = doc.getTextWidth(part2);

        const totalWidth = w1 + w2;
        const startX = (210 - totalWidth) / 2;

        // Draw Part 1
        if (impactFont) doc.setFont("Impact", "normal");
        else doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 112, 192); // #0070C0
        doc.text(part1, startX, currentY);

        // Draw Part 2
        if (bookmanFont) doc.setFont("Bookman", "normal");
        else doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 102, 204); // #0066CC
        doc.text(part2, startX + w1, currentY);

        currentY += 8;

        // 3. Subtitle
        if (bookmanFont) doc.setFont("Bookman", "bold"); // Changed to bold
        else doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0); // Pure Black
        const subTitle = "P R O G R E S S   R E P O R T";
        doc.text(subTitle, 105, currentY, { align: 'center' });
        currentY += 6; // Reduced gap (was 8)

        // 4. Line
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.4);
        doc.line(15, currentY, 195, currentY);
        currentY += 4; // Further reduced gap below line (was 6)

        // 5. Details Header - Pastel Background
        if (studentData.length > 0) {
            const student = studentData[0];
            doc.setFillColor(239, 246, 255); // Pastel Blue
            doc.setDrawColor(0, 0, 0); // Black border
            doc.setLineWidth(0.1);
            doc.roundedRect(15, currentY, 180, 20, 1, 1, 'FD'); // FD = Fill then Draw

            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);

            const textYStart = currentY + 8;
            const col1X = 20;
            const col2X = 115;

            // Student Name
            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bold");
            doc.text("Student Name:", col1X, textYStart);

            if (bookmanFont) doc.setFont("Bookman", "bold"); // Also bold for values as per "same progress report also Bold"? Or just labels? Usually values are normal. keeping normal for values based on typical reports, but user said "same progress report also Bold". Let's assume headers/labels are bold.
            else doc.setFont("helvetica", "normal");
            doc.text(student.NAME_OF_THE_STUDENT || '', col1X + 30, textYStart);

            // Campus
            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bold");
            doc.text("Campus:", col2X, textYStart);

            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "normal");
            doc.text(student.CAMPUS_NAME || '', col2X + 22, textYStart);

            const row2Y = textYStart + 7;

            // Student ID
            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bold");
            doc.text("Student ID:", col1X, row2Y);

            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "normal");
            doc.text(student.STUD_ID?.toString() || '', col1X + 30, row2Y);
            currentY += 18;
        }

        const tableColumn = ["Test Name", "Date", "Total\n300", "AIR", "Mat\n100", "Phy\n100", "Chem\n100"];
        const tableRows = studentData.map(row => [
            row.Test,
            formatDate(row.DATE),
            Math.round(row.Total || 0),
            Math.round(row.AIR) || '-',
            Math.round(row.MAT || 0),
            Math.round(row.PHY || 0),
            Math.round(row.CHE || 0)
        ]);

        // Average
        if (studentData.length > 0) {
            const avg = (key) => Math.round(studentData.reduce((a, b) => a + (Number(b[key]) || 0), 0) / studentData.length);
            const avgAIR = Math.round(studentData.reduce((a, b) => a + (Number(b.AIR) || 0), 0) / studentData.length);

            tableRows.push([
                "AVERAGE",
                "",
                avg('Total'),
                avgAIR,
                avg('MAT'),
                avg('PHY'),
                avg('CHE')
            ]);
        }

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: currentY + 10, // Start closer to detail header
            theme: 'grid',
            headStyles: {
                fillColor: [0, 0, 0], // Pure Black headers
                textColor: [255, 255, 255],
                font: bookmanFont ? "Bookman" : "helvetica", // Use Bookman
                fontStyle: "bold", // Use Bold
                halign: 'center',
                valign: 'middle',
                lineWidth: 0.2,
                fontSize: 10 // Increased by 1 point (was default or smaller)
            },
            styles: {
                font: bookmanFont ? "Bookman" : "helvetica", // Use Bookman
                fontSize: 9,
                cellPadding: 2.5,
                overflow: 'linebreak',
                halign: 'center',
                valign: 'middle',
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                textColor: [0, 0, 0]
            },
            columnStyles: {
                0: { halign: 'center' } // Centered and auto-fit
            },
            margin: { left: 15, right: 15, bottom: 15 },
            didParseCell: (data) => {
                if (data.row.index === tableRows.length - 1) {
                    // Start of Average Row Styling
                    // Ensure font remains Bookman if loaded
                    if (bookmanFont) {
                        data.cell.styles.font = "Bookman";
                        data.cell.styles.fontStyle = 'bold'; // Changed to bold
                    } else {
                        data.cell.styles.fontStyle = 'bold';
                    }
                    data.cell.styles.fillColor = [224, 231, 255];
                    data.cell.styles.textColor = [0, 0, 0];
                }
            }
        });

        return doc;
    };

    const downloadPDF = async () => {
        try {
            // Helper to load font
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
                    console.error("[PDF] Font loading error:", err);
                    return null;
                }
            };

            const [bgImg, logoImg, impactFont, bookmanFont, bookmanBoldFont] = await Promise.all([
                loadImage('/college-bg.png'),
                loadImage('/logo.png'),
                loadFont('/fonts/unicode.impact.ttf'),
                loadFont('/fonts/bookman-old-style.ttf'),
                loadFont('/fonts/BOOKOSB.TTF')
            ]);

            // Group by Student ID
            const grouped = history.reduce((acc, row) => {
                const id = row.STUD_ID || 'Unknown';
                if (!acc[id]) acc[id] = [];
                acc[id].push(row);
                return acc;
            }, {});

            const studentIds = Object.keys(grouped);
            if (studentIds.length === 0) return;

            if (studentIds.length === 1) {
                // Single Download
                const doc = generateStudentPDF(grouped[studentIds[0]], bgImg, logoImg, impactFont, bookmanFont, bookmanBoldFont);
                const sName = grouped[studentIds[0]][0].NAME_OF_THE_STUDENT || 'Report';
                doc.save(`${sName}_Progress_Report.pdf`);
            } else {
                // Bulk Download (ZIP)
                const zip = new JSZip();
                const campusName = grouped[studentIds[0]][0].CAMPUS_NAME || 'Campus';

                studentIds.forEach(id => {
                    const sRows = grouped[id];
                    const sName = sRows[0].NAME_OF_THE_STUDENT || id;
                    const doc = generateStudentPDF(sRows, bgImg, logoImg, impactFont, bookmanFont, bookmanBoldFont);
                    const pdfBlob = doc.output('blob');
                    zip.file(`${sName}_Progress_Report.pdf`, pdfBlob);
                });

                const content = await zip.generateAsync({ type: "blob" });
                saveAs(content, `${campusName}_Progress_Reports.zip`);
            }

        } catch (err) {
            console.error("PDF Generation Error:", err);
            setModal({
                isOpen: true,
                type: 'danger',
                title: 'PDF Error',
                message: "Failed to generate PDF(s).",
                onClose: () => setModal(prev => ({ ...prev, isOpen: false }))
            });
        }
    };

    // UI: If multiple students, show a summary or just the first student?
    // User requested Bulk Download, implies they might be okay seeing one or just knowing they are selected.
    // For now, let's show the FIRST student's data as a preview if multiple are selected,
    // possibly adding a banner saying "X Students Selected".

    // Helper to get preview student
    const previewStudent = history.length > 0 ? history[0] : null;
    // Actually, if mixed, history[0] is just the first row. We need to find rows for that student.
    const previewRows = previewStudent
        ? history.filter(h => h.STUD_ID?.toString() === previewStudent.STUD_ID?.toString())
        : [];

    // Unique students count
    const uniqueStudents = new Set(history.map(h => h.STUD_ID)).size;

    return (
        <div className="average-report-container">
            <div className="card">
                <div className="toolbar">
                    <div>
                        <h3 style={{ margin: 0 }}>Detailed Performance</h3>
                        {uniqueStudents > 1 && (
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                (Previewing 1 of {uniqueStudents} selected students)
                            </span>
                        )}
                    </div>
                    <div className="button-group" style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn-primary" onClick={fetchData} style={{ backgroundColor: '#6366f1' }}>
                            View Report
                        </button>
                        <button className="btn-primary" onClick={downloadPDF} disabled={history.length === 0} style={{ backgroundColor: '#10b981' }}>
                            {uniqueStudents > 1 ? `Download All (${uniqueStudents})` : 'Download PDF'}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <p>Updating Report History...</p>
                    </div>
                ) : !hasSearched ? (
                    <div className="empty-state">
                        <p>Select a student and click <strong>View Report</strong> to see detailed performance.</p>
                    </div>
                ) : history.length === 0 ? (
                    <div className="empty-state">
                        <p>No data found for this student with the current filters.</p>
                    </div>
                ) : (
                    <>
                        {previewRows.length > 0 && (
                            <div className="table-container">
                                <table className="analysis-table merit-style" style={{ fontFamily: 'Bookman, serif' }}>
                                    <thead style={{ fontWeight: 'bold' }}>
                                        <tr className="grouped-header">
                                            <th colSpan={3} className="header-group-blue">
                                                <div className="header-label">CAMPUS</div>
                                                <div className="header-value">{previewRows[0].CAMPUS_NAME}</div>
                                            </th>
                                            <th colSpan={1} className="header-group-blue">
                                                <div className="header-label">STUD ID</div>
                                                <div className="header-value">{previewRows[0].STUD_ID}</div>
                                            </th>
                                            <th colSpan={5} className="header-group-blue">
                                                <div className="header-label">NAME OF THE STUDENT</div>
                                                <div className="header-value">
                                                    {previewRows[0].NAME_OF_THE_STUDENT}
                                                </div>
                                            </th>

                                        </tr>
                                        <tr className="table-main-header">
                                            <th className="w-test">Test Name</th>
                                            <th className="w-date">Date</th>
                                            <th className="w-total col-yellow">TOT<br />300</th>
                                            <th className="w-air">AIR</th>
                                            <th className="w-sub col-orange">MAT<br />100</th>
                                            <th className="w-sub col-green-pale">PHY<br />100</th>
                                            <th className="w-sub col-pink-pale">CHE<br />100</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewRows.map((row, idx) => (
                                            <tr key={idx}>
                                                <td>{row.Test}</td>
                                                <td>{formatDate(row.DATE)}</td>
                                                <td className="col-yellow font-bold">{Number(row.Total || 0).toFixed(1)}</td>
                                                <td className="text-brown">{Math.round(row.AIR) || '-'}</td>
                                                <td className="col-orange">{Number(row.MAT || 0).toFixed(1)}</td>
                                                <td className="col-green-pale">{Number(row.PHY || 0).toFixed(1)}</td>
                                                <td className="col-pink-pale">{Number(row.CHE || 0).toFixed(1)}</td>
                                            </tr>
                                        ))}
                                        <tr className="total-row">
                                            <td colSpan={2} className="text-right">AVERAGES</td>
                                            <td className="col-yellow">{(previewRows.reduce((a, b) => a + (Number(b.Total) || 0), 0) / previewRows.length).toFixed(1)}</td>
                                            <td>{Math.round(previewRows.reduce((a, b) => a + (Number(b.AIR) || 0), 0) / previewRows.length)}</td>
                                            <td className="col-orange">{(previewRows.reduce((a, b) => a + (Number(b.MAT) || 0), 0) / previewRows.length).toFixed(1)}</td>
                                            <td className="col-green-pale">{(previewRows.reduce((a, b) => a + (Number(b.PHY) || 0), 0) / previewRows.length).toFixed(1)}</td>
                                            <td className="col-pink-pale">{(previewRows.reduce((a, b) => a + (Number(b.CHE) || 0), 0) / previewRows.length).toFixed(1)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

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

export default AverageReport;
