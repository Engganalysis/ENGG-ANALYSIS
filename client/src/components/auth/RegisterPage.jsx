
import React, { useState, useEffect } from 'react';
import { API_URL } from '../../utils/apiHelper';
import { auth, db } from '../../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, School, ArrowRight, Award, TrendingUp, Users } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Toast from '../Toast';
import Modal from '../Modal';

const RegisterPage = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [campus, setCampus] = useState('');
    const [campuses, setCampuses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [toast, setToast] = useState(null);
    const navigate = useNavigate();

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
    };

    const slides = [
        {
            image: "/antoine-dautry-05A-kdOH6Hw-unsplash.jpg",
            quote: "THE ROAD TO SUCCESS IN JEE STARTS WITH CONSISTENT PRACTICE AND CONCEPTUAL CLARITY",
            animClass: "anim-fade",
            stats: [
                { icon: <Users size={20} />, label: "JEE QUALIFIED", value: "85,000+" },
                { icon: <Award size={20} />, label: "JEE ADVANCED RANKS", value: "AIR 1, 2, 3" }
            ]
        },
        {
            image: "/vitaly-gariev-GtsYSWLmqP0-unsplash.jpg",
            quote: "ENGINEERING IS THE ART OF ORGANIZING NATURE FOR THE BENEFIT OF HUMANITY",
            animClass: "anim-zoom",
            stats: [
                { icon: <School size={20} />, label: "LEGACY OF TRUST", value: "38 YEARS" },
                { icon: <TrendingUp size={20} />, label: "IIT/NIT SEATS", value: "25,000+" }
            ]
        },
        {
            image: "/aaron-lefler-Vs6ip7fsld8-unsplash.jpg",
            quote: "RANK IS THE REFLECTION OF YOUR DEDICATION TO MASTERING SCIENCE AND MATHEMATICS",
            animClass: "anim-slide",
            stats: [
                { icon: <Users size={20} />, label: "ASPIRING ENGINEERS", value: "2 LAC PROJECTED" },
                { icon: <Award size={20} />, label: "STATE TOPPERS", value: "150+" }
            ]
        }
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide(prev => (prev + 1) % slides.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchCampuses = async () => {
            const apiUrl = `${API_URL}/api/filters`;
            try {
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error("Backend unreachable");
                const data = await res.json();
                if (data.campuses && data.campuses.length > 0) {
                    setCampuses(data.campuses);
                } else {
                    throw new Error("No campuses found in API response");
                }
            } catch (err) {
                console.warn("Backend unreachable, using fallback campus list:", err);
                // Failover to hardcoded list so the UI still works
                setCampuses([
                    "HYD - MADHAPUR - BOYS",
                    "HYD - MADHAPUR - GIRLS",
                    "HYD - KUKATPALLY - MAIN",
                    "VIJ - BENZ CIRCLE",
                    "VIJ - GANGURU",
                    "VSKP - DWARAKA NAGAR",
                    "BLR - MARATHAHALLI",
                    "BLR - HEBBAL",
                    "CHE - ANNA NAGAR",
                    "DEL - DWARKA"
                ].sort());
                // Optional: Don't show error toast to keep UI clean, or show a mild "Offline Mode" toast
            }
        };
        fetchCampuses();
    }, []);

    const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    const handleModalClose = async () => {
        setModal({ ...modal, isOpen: false });
        // Navigate to login after success modal closes
        if (modal.type === 'success') {
            await signOut(auth); // Sign out only when user acknowledges success
            navigate('/login');
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            showToast("Passwords do not match", "error");
            return;
        }

        // Restrict Gmail addresses
        if (email.toLowerCase().endsWith('@gmail.com')) {
            showToast("Registration with Gmail is not allowed. Please use your official college email ID.", "error");
            return;
        }

        if (!campus) {
            showToast("Please select your campus", "error");
            return;
        }

        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                name,
                email,
                phone,
                campus,
                role: 'principal',
                isApproved: false,
                createdAt: new Date().toISOString()
            });

            // Notify Admin via Email (Non-blocking background request)
            fetch(`${API_URL}/api/notify-registration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, campus, phone, role: 'principal' })
            }).catch(err => console.error("Failed to notify admin:", err));

            // Mark session as active since they are now logged in
            sessionStorage.setItem('ENGG_SESSION_ACTIVE', 'true');

            // Show Success Modal immediately
            setModal({
                isOpen: true,
                type: 'success',
                title: 'Request Sent Successfully!',
                message: 'Your registration request has been submitted. Please wait for the admin to approve your request via WhatsApp.',
                confirmText: 'Back to Login'
            });

        } catch (err) {
            if (err.message.includes("permissions")) {
                showToast("Registration access denied by database rules. Please contact Administrator.", "error");
            } else if (err.code === 'auth/email-already-in-use') {
                showToast("This email is already registered", "error");
            } else if (err.code === 'auth/weak-password') {
                showToast("Password should be at least 6 characters", "error");
            } else {
                showToast(err.message, "error");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="auth-container">
                <div className="auth-card">
                    {/* Left Side: Inspirational Slideshow */}
                    <div className="auth-slides-side">
                        {slides.map((slide, index) => (
                            <div key={index} className={`slide ${currentSlide === index ? 'active' : ''} `}>
                                {slide.image && (
                                    <img src={slide.image} alt="Slide" className="slide-img" />
                                )}
                                <div className={`slide-content ${slide.animClass}`}>
                                    <h3 className="slide-quote">{slide.quote}</h3>
                                    <div className="slide-stats">
                                        {slide.stats.map((stat, sIndex) => (
                                            <div key={sIndex} className="stat-item">
                                                <h4>{stat.value}</h4>
                                                <p>{stat.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Side: Compact Form */}
                    <div className="auth-form-side compact-form">
                        <div className="auth-form-inner">
                            <div className="auth-header">
                                <div className="auth-logo">
                                    <img src="/logo.png" alt="Sri Chaitanya" />
                                </div>
                                <h2>Principal Registration</h2>
                                <p>Request access to your campus dashboard</p>
                            </div>

                            {/* Toast handles errors now */}

                            <form onSubmit={handleRegister}>
                                <div className="form-group">
                                    <label>Full Name</label>
                                    <div className="input-with-icon">
                                        <UserPlus size={16} className="icon" />
                                        <input
                                            type="text"
                                            placeholder="Full Name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>College Email ID</label>
                                    <div className="input-with-icon">
                                        <Mail size={16} className="icon" />
                                        <input
                                            type="email"
                                            placeholder="email@college.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>WhatsApp Number</label>
                                        <div className="input-with-icon">
                                            <div className="icon" style={{ fontSize: '14px', fontWeight: 'bold' }}>+91</div>
                                            <input
                                                type="tel"
                                                placeholder="10 digit mobile number"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                                pattern="[0-9]{10}"
                                                required
                                            />
                                        </div>
                                        <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                                            Used for sending approval notifications via WhatsApp
                                        </small>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Campus Name</label>
                                    <div className="input-with-icon">
                                        <School size={16} className="icon" />
                                        <select
                                            value={campus}
                                            onChange={(e) => setCampus(e.target.value)}
                                            required
                                        >
                                            <option value="">Select your campus</option>
                                            {campuses.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Password</label>
                                    <div className="input-with-icon">
                                        <Lock size={16} className="icon" />
                                        <input
                                            type="password"
                                            placeholder=""
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Confirm Password</label>
                                    <div className="input-with-icon">
                                        <Lock size={16} className="icon" />
                                        <input
                                            type="password"
                                            placeholder=""
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <button type="submit" className="btn-auth" disabled={loading}>
                                    {loading ? "Requesting..." : "Send Request for Approval"}
                                    {!loading && <ArrowRight size={18} />}
                                </button>
                            </form>

                            <div className="auth-footer">
                                Already have an account?
                                <Link to="/login" className="btn-secondary-link">
                                    Login here
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
            </AnimatePresence>

            <Modal
                isOpen={modal.isOpen}
                onClose={handleModalClose}
                title={modal.title}
                message={modal.message}
                type={modal.type}
                confirmText={modal.confirmText}
            />
        </>
    );
};

export default RegisterPage;
