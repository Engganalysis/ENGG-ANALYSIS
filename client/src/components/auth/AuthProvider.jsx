import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { API_URL } from '../../utils/apiHelper';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setLoading(true);
            setCurrentUser(user);
            try {
                if (user) {
                    // CRITICAL: Bypass Firestore check for master admin immediately
                    // This prevents hangs for the main admin if Firestore is slow
                    if (user.email === "yenjarappa.s@varsitymgmt.com") {
                        setUserData({ role: 'admin', campus: 'All', isApproved: true, email: user.email });
                        setLoading(false);
                        return;
                    }

                    // For other users, fetch with a timeout
                    const fetchPromise = getDoc(doc(db, "users", user.uid));
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("Fetch Timeout")), 10000)
                    );

                    const userDoc = await Promise.race([fetchPromise, timeoutPromise]);
                    
                    if (userDoc.exists()) {
                        setUserData(userDoc.data());
                    } else {
                        setUserData(null);
                    }
                } else {
                    setUserData(null);
                }
            } catch (err) {
                console.error("Auth provider fetch error:", err);
                setUserData(null);
            } finally {
                setLoading(false);
            }
        });

        return unsubscribe;
    }, []);

    const [customHeading, setCustomHeading] = useState('');
    const [fileNamesHeading, setFileNamesHeading] = useState('');

    // Fetch custom heading in real-time from Firestore
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "heading"), (docSnap) => {
            if (docSnap.exists()) {
                setCustomHeading(docSnap.data().customHeading || '');
            } else {
                setCustomHeading('');
            }
        }, (err) => {
            console.error("Error fetching custom heading:", err);
        });
        return unsub;
    }, []);

    // Fetch filename heading from API
    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const res = await fetch(`${API_URL}/api/engg-files`);
                if (res.ok) {
                    const files = await res.json();
                    if (files && files.length > 0) {
                        setFileNamesHeading(files.join(' / '));
                    }
                }
            } catch (err) {
                console.error("Error fetching result filenames:", err);
            }
        };
        fetchFiles();
    }, []);

    const updateCustomHeading = async (newHeading) => {
        try {
            await setDoc(doc(db, "settings", "heading"), {
                customHeading: newHeading
            });
            return true;
        } catch (err) {
            console.error("Failed to update custom heading:", err);
            throw err;
        }
    };

    const value = {
        currentUser,
        userData,
        loading,
        isAdmin: userData?.role === 'admin',
        isCoAdmin: userData?.role === 'co_admin',
        isPrincipal: userData?.role === 'principal',
        isApproved: userData?.isApproved,
        customHeading,
        fileNamesHeading,
        currentHeading: customHeading || fileNamesHeading || "Sri Chaitanya Educational Institutions",
        updateCustomHeading
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
