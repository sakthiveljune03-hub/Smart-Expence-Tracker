import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup,
    sendPasswordResetEmail,
    onAuthStateChanged, 
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { auth, googleProvider } from "./firebase-config.js";
import { showToast } from "./toast.js";

// Determine Current Page
const isAuthPage = document.querySelector('.auth-page') !== null;
const isDashboardPage = document.querySelector('.dashboard-page') !== null;

let currentUser = null;

export function getCurrentUser() {
    return currentUser;
}

export function initAuth(onUserLoggedIn) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            if (isAuthPage) {
                window.location.href = 'dashboard.html';
            } else if (isDashboardPage) {
                document.querySelector('.dashboard-page').classList.remove('hidden-until-auth');
                let greetingName = "User";
                if (user.displayName) {
                    greetingName = user.displayName;
                } else if (user.email) {
                    greetingName = user.email.split('@')[0];
                }
                document.getElementById('user-greeting').textContent = `Hello, ${greetingName}`;
                onUserLoggedIn(user);
            }
        } else {
            currentUser = null;
            if (isDashboardPage) {
                window.location.href = 'index.html';
            }
        }
    });

    if (isAuthPage) {
        setupAuthForms();
    }
}

function setupAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    const authSubtitle = document.getElementById('auth-subtitle');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const forgotPasswordLink = document.getElementById('forgot-password');

    // Show/Hide Password Toggle Logic
    document.querySelectorAll('.toggle-password').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.getAttribute('data-target');
            const passwordInput = document.getElementById(targetId);
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                toggle.classList.replace('fa-eye-slash', 'fa-eye');
            } else {
                passwordInput.type = 'password';
                toggle.classList.replace('fa-eye', 'fa-eye-slash');
            }
        });
    });

    // Forgot Password Logic
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            if (!email) {
                showToast("Please enter your email address first.", "warning");
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                showToast("Password reset email sent! Check your inbox.", "success");
            } catch (error) {
                showToast(mapAuthError(error.code), "error");
            }
        });
    }

    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        loginForm.classList.remove('active');
        registerForm.classList.remove('hidden');
        registerForm.classList.add('active');
        authSubtitle.textContent = 'Create an account to start tracking';
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        registerForm.classList.remove('active');
        loginForm.classList.remove('hidden');
        loginForm.classList.add('active');
        authSubtitle.textContent = 'Log in to manage your finances';
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        
        toggleButtonLoader(submitBtn, true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Successfully logged in!", "success");
        } catch (error) {
            showToast(mapAuthError(error.code), "error");
            toggleButtonLoader(submitBtn, false);
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        toggleButtonLoader(submitBtn, true);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName: name });
            showToast("Account created successfully!", "success");
        } catch (error) {
            showToast(mapAuthError(error.code), "error");
            toggleButtonLoader(submitBtn, false);
        }
    });

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', async () => {
            try {
                await signInWithPopup(auth, googleProvider);
                showToast("Logged in with Google!", "success");
            } catch (error) {
                showToast("Google sign-in failed. Please try again.", "error");
            }
        });
    }
}

export async function logoutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        showToast("Logout Error", "error");
    }
}

function toggleButtonLoader(btn, isLoading) {
    const textSpan = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.loader');
    
    if (isLoading) {
        btn.disabled = true;
        textSpan.classList.add('hidden');
        loader.classList.remove('hidden');
    } else {
        btn.disabled = false;
        textSpan.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

function mapAuthError(code) {
    switch(code) {
        case 'auth/invalid-email': return 'Invalid email address.';
        case 'auth/user-disabled': return 'This user account has been disabled.';
        case 'auth/user-not-found': return 'No user found with this email.';
        case 'auth/wrong-password': return 'Incorrect password.';
        case 'auth/email-already-in-use': return 'Email is already in use by another account.';
        case 'auth/weak-password': return 'Password should be at least 6 characters.';
        case 'auth/invalid-credential': return 'Invalid login credentials.';
        default: return 'An error occurred. Please try again.';
    }
}
