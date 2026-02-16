import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Mail, Lock, ArrowRight, ShieldCheck, Award, TrendingUp, Users, School } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Toast from '../Toast';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentSlide, setCurrentSlide] = useState(0);
    const [toast, setToast] = useState(null);
    const navigate = useNavigate();

    const showToast = (message, type = 'error') => {
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

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Master Admin Credentials Check
            const ADMIN_EMAIL = "yenjarappa.s@varsitymgmt.com";
            const ADMIN_PASSWORD = "Neet@123#";

            if (email === ADMIN_EMAIL && password !== ADMIN_PASSWORD) {
                showToast("Invalid admin password.");
                setLoading(false);
                return;
            }

            // Perform Login
            sessionStorage.setItem('ENGG_SESSION_ACTIVE', 'true');
            await signInWithEmailAndPassword(auth, email, password);

            // On success, we navigate to root. 
            // The AuthProvider and ProtectedRoute/LoginRedirect will take over 
            // and show the loading spinner until the profile is ready.
            navigate('/', { replace: true });
        } catch (err) {
            console.error("Login Error:", err);
            sessionStorage.removeItem('ENGG_SESSION_ACTIVE');
            const msg = err.code === 'auth/user-not-found' ? "Account not found." :
                err.code === 'auth/wrong-password' ? "Incorrect password." :
                    "Invalid email or password.";
            showToast(msg);
            setLoading(false);
        }
    };

    return (
        <>
            <div className="auth-container">
                <div className="auth-card">
                    {/* Left Side: Slideshow */}
                    <div className="auth-slides-side">
                        {slides.map((slide, index) => (
                            <div key={index} className={`slide ${currentSlide === index ? 'active' : ''}`}>
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

                    {/* Right Side: Form */}
                    <div className="auth-form-side">
                        <div className="auth-form-inner">
                            <div className="auth-header">
                                <div className="auth-logo">
                                    <img src="/logo.png" alt="Sri Chaitanya" />
                                </div>
                                <h2>Login</h2>
                                <p>Enter your credentials to access the dashboard</p>
                            </div>

                            {/* Toast handles errors now */}

                            <form onSubmit={handleLogin}>
                                <div className="form-group">
                                    <label>Email Address</label>
                                    <div className="input-with-icon">
                                        <Mail size={18} className="icon" />
                                        <input
                                            type="email"
                                            placeholder="name@college.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Password</label>
                                    <div className="input-with-icon">
                                        <Lock size={18} className="icon" />
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <button type="submit" className="btn-auth" disabled={loading}>
                                    {loading ? "Authenticating..." : "Login to Dashboard"}
                                    {!loading && <ArrowRight size={18} />}
                                </button>
                            </form>

                            <div className="auth-footer">
                                New Principal?
                                <Link to="/register" className="btn-secondary-link">
                                    Register here
                                </Link>
                            </div>

                            <div className="admin-hint">
                                <ShieldCheck size={14} /> Admin Access Available
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
        </>
    );
};

export default LoginPage;
