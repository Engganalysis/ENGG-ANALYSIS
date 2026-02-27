
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { buildQueryParams, formatDate, API_URL } from '../utils/apiHelper';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { logActivity } from '../utils/activityLogger';

const AverageReport = ({ filters }) => {
    const { userData } = useAuth();
    const [history, setHistory] = useState({ history: [], batchExams: [] });
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
    const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });


    // Reset results when filters change to maintain consistency
    useEffect(() => {
        setHistory({ history: [], batchExams: [] });
        setHasSearched(false);
        setCurrentStudentIndex(0);
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
            setCurrentStudentIndex(0);

            if (data?.history?.length > 0) {
                logActivity(userData, 'Viewed Student History', {
                    studentCount: [...new Set(data.history.map(h => h.STUD_ID))].length
                });
            }
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

    const reconcileHistory = (studentRows, bExams = history.batchExams) => {
        if (!bExams || bExams.length === 0) return studentRows;

        // Ensure we handle students who might have zero rows but are in selection
        // Actually, for history, studentRows will have at least one row if they took any exam.
        const baseInfo = studentRows[0] || {};

        return bExams.map(master => {
            const mDate = formatDate(master.DATE);
            const mName = String(master.Test || '').trim().toUpperCase();

            const match = studentRows.find(r =>
                String(r.Test || '').trim().toUpperCase() === mName &&
                formatDate(r.DATE) === mDate
            );

            if (match) return match;

            return {
                ...master,
                STUD_ID: baseInfo.STUD_ID || 'N/A',
                NAME_OF_THE_STUDENT: baseInfo.NAME_OF_THE_STUDENT || 'N/A',
                CAMPUS_NAME: baseInfo.CAMPUS_NAME || 'N/A',
                isAbsent: true,
                Total: 'AB',
                AIR: 'AB',
                MAT: 'AB',
                PHY: 'AB',
                CHE: 'AB'
            };
        });
    };

    const getNormalizedStream = (data) => {
        const streams = [...new Set(data.map(row => row.Batch?.trim().toUpperCase()).filter(Boolean))];
        if (streams.length === 0) return '';

        // Standardize common engineering batch names if needed
        if (streams.some(s => s.includes('ELITE') || s.includes('AIIMS'))) {
            if (streams.some(s => s.includes('SR'))) return 'SR ELITE';
            if (streams.some(s => s.includes('JR'))) return 'JR ELITE';
        }

        return streams[0];
    };

    const loadImage = (src) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
        });
    };

    const generateStudentPDF = (studentData, logoImg, impactFont, bookmanFont, bookmanBoldFont) => {
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

        // Group studentData by Batch (Stream)
        const streams = [...new Set(studentData.map(r => r.Batch).filter(Boolean))];

        streams.forEach((stream, streamIdx) => {
            if (streamIdx > 0) doc.addPage();

            // Plain Background
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, 210, 297, 'F');

            let currentY = 11;

            // 1. Logo & Institution Name
            if (logoImg) {
                const aspect = logoImg.width / logoImg.height;
                let logoH = 20;
                let logoW = logoH * aspect;
                const logoX = (210 - logoW) / 2;
                doc.addImage(logoImg, 'PNG', logoX, currentY, logoW, logoH, undefined, 'FAST');
                currentY += logoH + 6;
            } else {
                currentY += 10;
            }

            const part1 = "Sri Chaitanya";
            const part2 = " Educational Institutions";
            doc.setFontSize(26);

            if (impactFont) doc.setFont("Impact", "normal");
            else doc.setFont("helvetica", "bold");
            const w1 = doc.getTextWidth(part1);

            if (bookmanFont) doc.setFont("Bookman", "normal");
            else doc.setFont("helvetica", "normal");
            const w2 = doc.getTextWidth(part2);

            const totalWidth = w1 + w2;
            const startX = (210 - totalWidth) / 2;

            if (impactFont) doc.setFont("Impact", "normal");
            else doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 112, 192);
            doc.text(part1, startX, currentY);

            if (bookmanFont) doc.setFont("Bookman", "normal");
            else doc.setFont("helvetica", "normal");
            doc.setTextColor(0, 102, 204);
            doc.text(part2, startX + w1, currentY);

            currentY += 8;

            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bolditalic");
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            const subTitle = "P R O G R E S S   R E P O R T";
            doc.text(subTitle, 105, currentY, { align: 'center' });
            currentY += 6;

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.4);
            doc.line(15, currentY, 195, currentY);
            currentY += 4;

            // 5. Details Header
            const streamRows = studentData.filter(r => r.Batch === stream);
            const student = streamRows[0] || {};

            doc.setFillColor(239, 246, 255);
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.1);
            doc.roundedRect(15, currentY, 180, 20, 1, 1, 'FD');

            if (bookmanFont) doc.setFont("Bookman", "bold");
            else doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);

            const textYStart = currentY + 8;
            const col1X = 20;
            const col2X = 115;

            doc.text("Student Name:", col1X, textYStart);
            doc.text(student.NAME_OF_THE_STUDENT || '', col1X + 30, textYStart, { maxWidth: 62 });

            doc.text("Campus:", col2X, textYStart);
            doc.text(student.CAMPUS_NAME || '', col2X + 22, textYStart, { maxWidth: 58 });

            const row2Y = textYStart + 7;
            doc.text("Student ID:", col1X, row2Y);
            doc.text(student.STUD_ID?.toString() || '', col1X + 30, row2Y);

            doc.text("Stream:", col2X, row2Y);
            doc.text(stream, col2X + 22, row2Y, { maxWidth: 58 });

            currentY += 18;

            const tableColumn = [
                "Test Name",
                "Date",
                `Total\n(${Math.round(student.Max_Tot || 300)})`,
                "AIR",
                `Mat\n(${Math.round(student.Max_Mat || 100)})`,
                `Phy\n(${Math.round(student.Max_Phy || 100)})`,
                `Chem\n(${Math.round(student.Max_Che || 100)})`
            ];

            const tableRows = streamRows.map(row => [
                row.Test,
                formatDate(row.DATE),
                row.isAbsent ? 'AB' : Math.round(row.Total || 0),
                row.isAbsent ? 'AB' : (Math.round(row.AIR) || '-'),
                row.isAbsent ? 'AB' : Math.round(row.MAT || 0),
                row.isAbsent ? 'AB' : Math.round(row.PHY || 0),
                row.isAbsent ? 'AB' : Math.round(row.CHE || 0)
            ]);

            // Average for this stream
            const attempted = streamRows.filter(r => !r.isAbsent);
            const count = attempted.length || 1;
            const avg = (key) => Math.round(attempted.reduce((a, b) => a + (Number(b[key]) || 0), 0) / count);
            const avgAIR = Math.round(attempted.reduce((a, b) => a + (Number(b.AIR) || 0), 0) / count);

            tableRows.push([
                "AVERAGE",
                "",
                avg('Total'),
                avgAIR,
                avg('MAT'),
                avg('PHY'),
                avg('CHE')
            ]);

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: currentY + 10,
                theme: 'grid',
                headStyles: {
                    fillColor: [0, 0, 0],
                    textColor: [255, 255, 255],
                    font: bookmanFont ? "Bookman" : "helvetica",
                    fontStyle: "bold",
                    halign: 'center',
                    valign: 'middle',
                    lineWidth: 0.2,
                    fontSize: 10
                },
                styles: {
                    font: bookmanFont ? "Bookman" : "helvetica",
                    fontSize: 9,
                    cellPadding: 1.2,
                    overflow: 'linebreak',
                    halign: 'center',
                    valign: 'middle',
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1,
                    textColor: [0, 0, 0]
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 70 },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 20, fillColor: [255, 255, 204] },
                    3: { cellWidth: 15 },
                    4: { cellWidth: 15, fillColor: [253, 233, 217] },
                    5: { cellWidth: 15, fillColor: [235, 241, 222] },
                    6: { cellWidth: 15, fillColor: [242, 220, 219] }
                },
                margin: { left: 15, right: 15 },
                didParseCell: (data) => {
                    if (data.row.index === tableRows.length - 1) {
                        if (bookmanFont) {
                            data.cell.styles.font = "Bookman";
                            data.cell.styles.fontStyle = 'bold';
                        } else {
                            data.cell.styles.fontStyle = 'bold';
                        }
                        data.cell.styles.fillColor = [224, 231, 255];
                    } else if (data.cell.raw === 'AB' || (data.cell.text && String(data.cell.text).includes('AB'))) {
                        data.cell.styles.textColor = [255, 0, 0];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });
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

            const [logoImg, impactFont, bookmanFont, bookmanBoldFont] = await Promise.all([
                loadImage('/logo.png'),
                loadFont('/fonts/unicode.impact.ttf'),
                loadFont('/fonts/bookman-old-style.ttf'),
                loadFont('/fonts/BOOKOSB.TTF')
            ]);

            // Group by Student ID
            const historyData = history.history || [];
            const grouped = historyData.reduce((acc, row) => {
                const id = row.STUD_ID || 'Unknown';
                if (!acc[id]) acc[id] = [];
                acc[id].push(row);
                return acc;
            }, {});

            const studentIds = Object.keys(grouped);
            if (studentIds.length === 0) return;

            if (studentIds.length === 1) {
                // Single Download
                const id = studentIds[0];
                const sRows = grouped[id];
                const reconciled = getReconciledGroups(sRows);
                const doc = generateStudentPDF(reconciled, logoImg, impactFont, bookmanFont, bookmanBoldFont);
                const sName = sRows[0].NAME_OF_THE_STUDENT || 'Report';
                doc.save(`${sName}_Progress_Report.pdf`);
                logActivity(userData, 'Downloaded History PDF', { student: sName });
            } else {
                // Bulk Download (ZIP)
                const zip = new JSZip();
                const campusName = grouped[studentIds[0]][0].CAMPUS_NAME || 'Campus';

                studentIds.forEach(id => {
                    const sRows = grouped[id];
                    const reconciled = getReconciledGroups(sRows);
                    const sName = sRows[0].NAME_OF_THE_STUDENT || id;
                    const doc = generateStudentPDF(reconciled, logoImg, impactFont, bookmanFont, bookmanBoldFont);
                    const pdfBlob = doc.output('blob');
                    zip.file(`${sName}_Progress_Report.pdf`, pdfBlob);
                });

                const content = await zip.generateAsync({ type: "blob" });
                saveAs(content, `${campusName}_Progress_Reports.zip`);
                logActivity(userData, 'Downloaded Bulk History Reports', { count: studentIds.length, campus: campusName });
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

    // Unique students logic
    const historyData = history.history || [];
    const uniqueStudentIds = [...new Set(historyData.map(h => h.STUD_ID))];
    const uniqueStudents = uniqueStudentIds.length;

    // Helper to get preview student based on navigation
    const previewStudentId = uniqueStudentIds[currentStudentIndex];
    const previewRowsRaw = previewStudentId
        ? historyData.filter(h => h.STUD_ID?.toString() === previewStudentId.toString())
        : [];

    // Correctly reconcile each batch's data separately
    const getReconciledGroups = (studentRows) => {
        const studentBatches = [...new Set(studentRows.map(r => r.Batch).filter(Boolean))];
        const masterBatches = [...new Set(history.batchExams.map(b => b.Batch).filter(Boolean))];

        // Use either student's own batches or master batches for the selected student
        const allRelevantBatches = [...new Set([...studentBatches, ...masterBatches])];

        const groups = [];
        allRelevantBatches.forEach(batch => {
            const batchStudentRows = studentRows.filter(r => r.Batch === batch);
            const batchMasterExams = history.batchExams.filter(b => b.Batch === batch);

            if (batchStudentRows.length > 0 || batchMasterExams.length > 0) {
                const reconciled = reconcileHistory(batchStudentRows, batchMasterExams);
                // Ensure the reconciled rows carry the correct Batch label if they were empty
                reconciled.forEach(r => { if (!r.Batch) r.Batch = batch; });
                groups.push(...reconciled);
            }
        });
        return groups;
    };

    const previewRows = getReconciledGroups(previewRowsRaw);

    const handleNext = () => {
        setCurrentStudentIndex(prev => (prev + 1) % uniqueStudents);
    };

    const handlePrev = () => {
        setCurrentStudentIndex(prev => (prev - 1 + uniqueStudents) % uniqueStudents);
    };

    return (
        <div className="average-report-container">
            <div className="card">
                <div className="toolbar">
                    <div>
                        <h3 style={{ margin: 0 }}>Detailed Performance</h3>
                        {uniqueStudents > 1 && (
                            <div className="navigation-status" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <button className="nav-btn" onClick={handlePrev} title="Previous Student">
                                    <ChevronLeft size={16} />
                                </button>
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>
                                    Student {currentStudentIndex + 1} of {uniqueStudents}
                                </span>
                                <button className="nav-btn" onClick={handleNext} title="Next Student">
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="button-group" style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn-primary" onClick={fetchData} style={{ backgroundColor: '#6366f1' }}>
                            View Report
                        </button>
                        <button className="btn-primary" onClick={downloadPDF} disabled={historyData.length === 0} style={{ backgroundColor: '#10b981' }}>
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
                ) : historyData.length === 0 ? (
                    <div className="empty-state">
                        <p>No data found for this student with the current filters.</p>
                    </div>
                ) : (
                    <>
                        {previewRows.length > 0 && (() => {
                            const streams = [...new Set(previewRows.map(r => r.Batch).filter(Boolean))];
                            return streams.map((stream, sIdx) => {
                                const streamRows = previewRows.filter(r => r.Batch === stream);
                                const attempted = streamRows.filter(r => !r.isAbsent);
                                const count = attempted.length || 1;

                                return (
                                    <div key={sIdx} className="table-container" style={{ marginBottom: '30px' }}>
                                        <table className="analysis-table merit-style" style={{ fontFamily: 'Bookman, serif' }}>
                                            <thead style={{ fontWeight: 'bold' }}>
                                                <tr className="grouped-header">
                                                    <th colSpan={2} className="header-group-blue">
                                                        <div className="header-label">CAMPUS</div>
                                                        <div className="header-value">{streamRows[0].CAMPUS_NAME}</div>
                                                    </th>
                                                    <th colSpan={1} className="header-group-blue">
                                                        <div className="header-label">STUD ID</div>
                                                        <div className="header-value">{streamRows[0].STUD_ID}</div>
                                                    </th>
                                                    <th colSpan={2} className="header-group-blue">
                                                        <div className="header-label">STREAM</div>
                                                        <div className="header-value">{stream}</div>
                                                    </th>
                                                    <th colSpan={2} className="header-group-blue">
                                                        <div className="header-label">NAME OF THE STUDENT</div>
                                                        <div className="header-value">
                                                            {streamRows[0].NAME_OF_THE_STUDENT}
                                                        </div>
                                                    </th>
                                                </tr>
                                                <tr className="table-main-header">
                                                    <th className="w-test">Test Name</th>
                                                    <th className="w-date">Date</th>
                                                    <th className="w-total col-yellow">TOT<br />{Math.round(streamRows[0]?.Max_Tot || 300)}</th>
                                                    <th className="w-air">AIR</th>
                                                    <th className="w-sub col-orange">MAT<br />{Math.round(streamRows[0]?.Max_Mat || 100)}</th>
                                                    <th className="w-sub col-green-pale">PHY<br />{Math.round(streamRows[0]?.Max_Phy || 100)}</th>
                                                    <th className="w-sub col-pink-pale">CHE<br />{Math.round(streamRows[0]?.Max_Che || 100)}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {streamRows.map((row, idx) => (
                                                    <tr key={idx} style={row.isAbsent ? { color: '#ff0000', fontWeight: 'bold' } : {}}>
                                                        <td style={row.isAbsent ? { color: '#ff0000' } : {}}>{row.Test}</td>
                                                        <td style={row.isAbsent ? { color: '#ff0000' } : {}}>{formatDate(row.DATE)}</td>
                                                        <td className={row.isAbsent ? "font-bold" : "col-yellow font-bold"} style={row.isAbsent ? { color: '#ff0000' } : {}}>
                                                            {row.isAbsent ? 'AB' : Number(row.Total || 0).toFixed(1)}
                                                        </td>
                                                        <td className={row.isAbsent ? "" : "text-brown"} style={row.isAbsent ? { color: '#ff0000' } : {}}>
                                                            {row.isAbsent ? 'AB' : (Math.round(row.AIR) || '-')}
                                                        </td>
                                                        <td className={row.isAbsent ? "" : "col-orange"} style={row.isAbsent ? { color: '#ff0000' } : {}}>
                                                            {row.isAbsent ? 'AB' : Number(row.MAT || 0).toFixed(1)}
                                                        </td>
                                                        <td className={row.isAbsent ? "" : "col-green-pale"} style={row.isAbsent ? { color: '#ff0000' } : {}}>
                                                            {row.isAbsent ? 'AB' : Number(row.PHY || 0).toFixed(1)}
                                                        </td>
                                                        <td className={row.isAbsent ? "" : "col-pink-pale"} style={row.isAbsent ? { color: '#ff0000' } : {}}>
                                                            {row.isAbsent ? 'AB' : Number(row.CHE || 0).toFixed(1)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="total-row">
                                                    <td colSpan={2} className="text-right">AVERAGES</td>
                                                    <td className="col-yellow">{(attempted.reduce((a, b) => a + (Number(b.Total) || 0), 0) / count).toFixed(1)}</td>
                                                    <td>{Math.round(attempted.reduce((a, b) => a + (Number(b.AIR) || 0), 0) / count)}</td>
                                                    <td className="col-orange">{(attempted.reduce((a, b) => a + (Number(b.MAT) || 0), 0) / count).toFixed(1)}</td>
                                                    <td className="col-green-pale">{(attempted.reduce((a, b) => a + (Number(b.PHY) || 0), 0) / count).toFixed(1)}</td>
                                                    <td className="col-pink-pale">{(attempted.reduce((a, b) => a + (Number(b.CHE) || 0), 0) / count).toFixed(1)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            });
                        })()}
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
