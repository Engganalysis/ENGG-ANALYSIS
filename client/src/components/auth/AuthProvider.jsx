import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

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

    const value = {
        currentUser,
        userData,
        loading,
        isAdmin: userData?.role === 'admin',
        isCoAdmin: userData?.role === 'co_admin',
        isPrincipal: userData?.role === 'principal',
        isApproved: userData?.isApproved
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
