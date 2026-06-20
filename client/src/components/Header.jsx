import React from 'react';
import { auth, db } from '../firebase';
import { useAuth } from './auth/AuthProvider';
import { LogOut, School, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';

const Header = ({ title }) => {
    const { currentUser, userData, isAdmin } = useAuth();
    const navigate = useNavigate();
    const handleLogout = async () => {
        try {
            if (userData?.email) {
                await addDoc(collection(db, "activity_logs"), {
                    email: userData.email,
                    name: userData.name,
                    campus: userData.campus,
                    timestamp: new Date().toISOString(),
                    action: 'Logged Out'
                });
            }
        } catch (err) {
            console.error("Failed to log logout activity:", err);
        }

        sessionStorage.removeItem('dashboard_session_active');
        await auth.signOut();
        navigate('/login');
    };

    return (
        <header className="main-header">
            <div className="header-left-area" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h1>ENGG Results - {title}</h1>
                </div>
            </div>

            <div className="header-right-area">
                <div className="user-profile-compact">
                    <div className="header-user-info">
                        <span className="user-label">
                            {isAdmin ? <Shield size={16} /> : <School size={16} />}
                            <span className="user-name-text">{currentUser?.email || 'User'}</span>
                            <span className="user-role-badge">({isAdmin ? 'System Admin' : (userData?.allowedCampuses?.includes('All') || userData?.campus === 'All' ? 'ALL CAMPUSES' : userData?.campus)})</span>
                        </span>
                    </div>
                    <button className="header-logout-btn" onClick={handleLogout} title="Logout">
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;
