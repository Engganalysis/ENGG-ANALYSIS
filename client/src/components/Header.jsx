import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { useAuth } from './auth/AuthProvider';
import { LogOut, School, Shield, Edit2, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';

const Header = ({ title }) => {
    const { currentUser, userData, isAdmin, customHeading, currentHeading, updateCustomHeading } = useAuth();
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');

    useEffect(() => {
        setEditValue(customHeading || '');
    }, [customHeading]);

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

    const handleSaveHeading = async () => {
        try {
            await updateCustomHeading(editValue);
            setIsEditing(false);
        } catch (err) {
            alert("Failed to save custom heading: " + err.message);
        }
    };

    return (
        <header className="main-header">
            <div className="header-left-area" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="Enter custom heading..."
                            className="heading-edit-input"
                            style={{
                                padding: '4px 8px',
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                width: '320px',
                                fontFamily: 'inherit'
                            }}
                        />
                        <button onClick={handleSaveHeading} title="Save" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', display: 'flex', alignItems: 'center', padding: '4px' }}>
                            <Check size={18} />
                        </button>
                        <button onClick={() => { setIsEditing(false); setEditValue(customHeading || ''); }} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', padding: '4px' }}>
                            <X size={18} />
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h1>{currentHeading} - {title}</h1>
                        <button 
                            onClick={() => setIsEditing(true)} 
                            title="Edit Custom Heading"
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                cursor: 'pointer', 
                                color: '#64748b', 
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#3b82f6'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                        >
                            <Edit2 size={15} />
                        </button>
                    </div>
                )}
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
