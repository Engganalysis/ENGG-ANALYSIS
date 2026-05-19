import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import './index.css';

import Header from './components/Header';
import FilterBar from './components/FilterBar';
import AnalysisReport from './components/AnalysisReport';
import AverageReport from './components/AverageReport';
import AverageMarksReport from './components/AverageMarksReport';
import ErrorReport from './components/ErrorReport';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import AdminDashboard from './components/admin/AdminDashboard';
import { AuthProvider, useAuth } from './components/auth/AuthProvider';

import Sidebar from './components/Sidebar';
import UserApprovals from './components/admin/UserApprovals';
import ActivityLogs from './components/admin/ActivityLogs';
import { logActivity } from './utils/activityLogger';

const ProtectedRoute = ({ children, requireAdmin = false }) => {
    const { currentUser, userData, loading, isAdmin } = useAuth();

    // Core loading state from AuthProvider
    const isLoading = loading;

    // Show the Timer if loading
    // Note: We render children hidden or null while loading? 
    // Actually, we should just return the Timer if loading, 
    // but the timer needs to handle the unmount.
    // However, the LoadingTimer component returns null if !isLoading.
    // So we can return <LoadingTimer /> AND the rest?
    // No, if we want to BLOCK the view, we should return the timer.
    // But if we want the timer component to handle the "cutting", 
    // it's cleaner to use it as a conditional return.

    if (isLoading) return (
        <div className="loading-state" style={{ flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
            <div className="spinner"></div>
            <div style={{ fontWeight: 'bold', fontSize: '1.4rem', color: '#1e293b' }}>INITIALIZING SECURITY SESSION...</div>
            <div style={{ fontSize: '1rem', color: '#64748b', maxWidth: '300px' }}>
                We are verifying your credentials and connecting to the secure database.
            </div>
            
            <button 
                onClick={() => {
                    // Force complete the loading state for the specific admin email if they click bypass
                    if (currentUser?.email === "yenjarappa.s@varsitymgmt.com") {
                        window.location.reload(); // Reload will re-trigger the now-faster bypass logic
                    } else {
                        // For others, just try to force it if it's stuck
                        alert("Bypassing connection... If you are not an authorized admin, you may see Restricted Access.");
                        window.location.href = '/'; 
                    }
                }}
                className="btn-secondary-link"
                style={{ marginTop: '20px', color: '#6366f1', textDecoration: 'underline' }}
            >
                Taking too long? Click here to bypass connection wait.
            </button>
        </div>
    );

    // No user -> straight to login
    if (!currentUser) return <Navigate to="/login" replace />;

    // Authorization checks
    if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
    if (!userData?.isApproved && !isAdmin) return <Navigate to="/login" replace />;

    return children;
};

const Dashboard = () => {
    const { userData, isAdmin, isCoAdmin } = useAuth();
    // Initialize from sessionStorage or default to 'analysis'
    const [activePage, setActivePage] = useState(() => {
        const stored = sessionStorage.getItem('dashboard_active_page');
        // Security check: If stored page is admin-only but user is not admin, default to analysis
        if (stored && ['approvals', 'logs'].includes(stored) && !isAdmin) {
            return 'analysis';
        }
        return stored || 'analysis';
    });

    // Ensure non-admins are redirected from admin pages if state changes
    useEffect(() => {
        if (!isAdmin && ['approvals', 'logs'].includes(activePage)) {
            setActivePage('analysis');
        }
    }, [isAdmin, activePage]);

    // Update sessionStorage whenever activePage changes
    useEffect(() => {
        sessionStorage.setItem('dashboard_active_page', activePage);
        // Log page view
        if (!isAdmin && userData) {
            const pageNames = {
                'analysis': 'Analysis Report',
                'averages': 'Average Marks Report',
                'progress': 'Progress Report',
                'errors': 'Error Report',
                'approvals': 'User Approvals',
                'logs': 'Activity Logs'
            };
            logActivity(userData, `Opened ${pageNames[activePage] || activePage} Page`);
        }
    }, [activePage, isAdmin, userData]);

    const userAllowedCampuses = userData?.allowedCampuses || (userData?.campus && userData.campus !== 'All' ? [userData.campus] : []);
    const isRestricted = !isAdmin && userAllowedCampuses.length > 0 && !userAllowedCampuses.includes('All');

    const initialFilters = {
        campus: isRestricted ? userAllowedCampuses : [],
        stream: [],
        testType: [],
        test: [],
        topAll: [],
        studentSearch: []
    };

    // Separate filters for each page to allow independent selections
    const [pageFilters, setPageFilters] = useState(() => {
        const stored = sessionStorage.getItem('dashboard_page_filters');
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { return {}; }
        }
        return {};
    });

    // Persist page filters to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('dashboard_page_filters', JSON.stringify(pageFilters));
    }, [pageFilters]);

    // Current page's filters with fallback to initial filters
    const globalFilters = pageFilters[activePage] || initialFilters;

    const setGlobalFilters = (updater) => {
        setPageFilters(prev => {
            const current = prev[activePage] || initialFilters;
            const next = typeof updater === 'function' ? updater(current) : updater;
            return {
                ...prev,
                [activePage]: next
            };
        });
    };

    const hasLoggedSession = React.useRef(false);

    useEffect(() => {
        // Log "Opened Dashboard" only once per browser session per login
        const sessionKey = 'dashboard_session_active';
        const isSessionActive = sessionStorage.getItem(sessionKey);

        if (!isAdmin && userData?.email && !hasLoggedSession.current && !isSessionActive) {
            hasLoggedSession.current = true;
            sessionStorage.setItem(sessionKey, 'true'); // Mark session as active
            logActivity(userData, 'Logged In/Opened Dashboard');
        }
    }, [userData, isAdmin]);



    const renderPageContent = () => {
        switch (activePage) {
            case 'analysis':
                return (
                    <div className="report-sections">
                        <AnalysisReport filters={globalFilters} />
                    </div>
                );
            case 'averages':
                return (
                    <div className="report-sections">
                        <AverageMarksReport filters={globalFilters} />
                    </div>
                );
            case 'progress':
                return (
                    <div className="report-sections">
                        <AverageReport filters={globalFilters} />
                    </div>
                );
            case 'errors':
                return <ErrorReport filters={globalFilters} setFilters={setGlobalFilters} />;
            case 'approvals':
                return isAdmin ? <UserApprovals /> : <div className="p-4">Access Denied</div>;
            case 'logs':
                return isAdmin ? <ActivityLogs /> : <div className="p-4">Access Denied</div>;
            default:
                return <div>Select a page from the sidebar</div>;
        }
    };

    const showFilterBar = ['analysis', 'averages', 'progress', 'errors'].includes(activePage);

    return (
        <div className="dashboard-root">
            <Sidebar activePage={activePage} setActivePage={setActivePage} />
            <main className="dashboard-main-content">
                <Header title={
                    activePage === 'analysis' ? 'Analysis Report' :
                        activePage === 'averages' ? 'Average Marks Report' :
                            activePage === 'progress' ? 'Progress Report' :
                                activePage === 'errors' ? 'Error Report' :
                                    activePage === 'approvals' ? 'User Approvals' : 'Activity Logs'
                } />
                <div className="content-inner">
                    {showFilterBar && (
                        <FilterBar
                            filters={globalFilters}
                            setFilters={setGlobalFilters}
                            restrictedCampus={isRestricted ? userAllowedCampuses : null}
                            apiEndpoints={
                                activePage === 'errors'
                                    ? { filters: '/api/erp/filters', students: '/api/erp/students' }
                                    : { filters: '/api/filters', students: '/api/studentsByCampus' }
                            }
                        />
                    )}
                    {renderPageContent()}
                </div>
            </main>
        </div>
    );
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
                    <h2>Something went wrong.</h2>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', textAlign: 'left', background: '#fef2f2', padding: '1rem' }}>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

const App = () => {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <Router>
                    <div className="app-container">
                        <Routes>
                            <Route path="/login" element={<LoginRedirect><LoginPage /></LoginRedirect>} />
                            <Route path="/register" element={<RegisterPage />} />
                            <Route path="/" element={
                                <ProtectedRoute>
                                    <Dashboard />
                                </ProtectedRoute>
                            } />
                            {/* Fallback */}
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </div>
                </Router>
            </AuthProvider>
        </ErrorBoundary>
    );
};

// Simple component to prevent logged-in users from seeing the login page
const LoginRedirect = ({ children }) => {
    const { currentUser, userData, loading } = useAuth();
    if (!loading && currentUser && userData?.isApproved) return <Navigate to="/" replace />;
    return children;
};

export default App;
