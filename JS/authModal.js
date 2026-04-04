// Auth modal module loaded
console.log("📦 authModal.js script loading...");

/**
 * Google OAuth: native app uses deep-link redirect; web uses current site origin (PKCE callback on map).
 */
async function startGoogleOAuthFlow(mode) {
  const isNativeApp = !!window.Capacitor;
  const redirectTo = isNativeApp ? 'capacitor://localhost' : `${window.location.origin}/map.html`;
  console.log('OAuth environment:', isNativeApp ? 'Capacitor App' : 'Web Browser');
  console.log('Using redirect:', redirectTo);

  const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });

  if (error) {
    console.error('Google login error:', error);
    const prefix = mode === 'register' ? 'Registration failed: ' : 'Login failed: ';
    alert(prefix + error.message);
    return;
  }

  if (!data?.url) return;

  console.log('🟢 OAuth URL received:', data.url);

  if (isNativeApp) {
    const Browser = window.Capacitor?.Plugins?.Browser;
    if (!Browser || typeof Browser.open !== 'function') {
      console.error('❌ Browser plugin not available:', {
        capacitor: !!window.Capacitor,
        plugins: window.Capacitor?.Plugins,
        browser: Browser
      });
      alert("ERROR: Browser plugin not available. Please ensure:\n1. You ran 'npx cap sync android'\n2. You rebuilt the app\n3. You're testing on an Android device");
      return;
    }
    console.log('✅ Browser plugin found, opening URL...');
    await Browser.open({ url: data.url });
    console.log('✅ Browser.open() completed');
  } else {
    window.location.href = data.url;
  }
}

// Auth Modal Management
class AuthModal {
  constructor() {
    // AuthModal constructor called
    
    this.loginModal = document.getElementById('loginModal');
    this.registerModal = document.getElementById('registerModal');
    this.loginForm = document.getElementById('loginForm');
    this.registerForm = document.getElementById('registerForm');
    this.emailInput = document.getElementById('loginEmail');
    this.passwordInput = document.getElementById('loginPassword');
    this.forgotPasswordLink = document.getElementById('forgotPasswordLink');
    this.googleLoginBtn = document.getElementById('googleLoginBtnNew');
    this.googleRegisterBtn = document.getElementById('googleRegisterBtn');
    this.showRegisterLink = document.getElementById('showRegisterLink');
    this.showLoginLink = document.getElementById('showLoginLink');
    this.loginCloseBtn = document.getElementById('loginCloseBtn');
    this.registerCloseBtn = document.getElementById('registerCloseBtn');
    
    // Elements found and initialized
    
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Login form submission
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));
    }

    // Register form submission
    if (this.registerForm) {
      this.registerForm.addEventListener('submit', (e) => this.handleRegisterSubmit(e));
    }

    // Forgot password link
    if (this.forgotPasswordLink) {
      this.forgotPasswordLink.addEventListener('click', (e) => this.handleForgotPassword(e));
    }

    // Google login button
    if (this.googleLoginBtn) {
      this.googleLoginBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        try {
          console.log("🔹 Google login initiated...");
          await startGoogleOAuthFlow('login');
        } catch (err) {
          console.error("🚨 Unexpected login error:", err);
          alert('Google login failed: ' + (err?.message || JSON.stringify(err)));
        }
      });
    }

    // Google register button
    if (this.googleRegisterBtn) {
      this.googleRegisterBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        try {
          console.log("🔹 Google register initiated...");
          await startGoogleOAuthFlow('register');
        } catch (err) {
          console.error("🚨 Unexpected register error:", err);
          alert('Google registration failed: ' + (err?.message || JSON.stringify(err)));
        }
      });
    }

    // Show register modal
    if (this.showRegisterLink) {
      this.showRegisterLink.addEventListener('click', (e) => this.showRegisterModal(e));
    }

    // Show login modal
    if (this.showLoginLink) {
      this.showLoginLink.addEventListener('click', (e) => this.showLoginModal(e));
    }

    // Close button event listeners
    if (this.loginCloseBtn) {
      console.log('🔧 Adding event listener to loginCloseBtn');
      this.loginCloseBtn.addEventListener('click', (e) => {
        console.log('🔘 Login close button clicked');
        this.closeLoginModal();
      });
    } else {
      console.log('❌ loginCloseBtn not found');
    }

    if (this.registerCloseBtn) {
      console.log('🔧 Adding event listener to registerCloseBtn');
      this.registerCloseBtn.addEventListener('click', (e) => {
        console.log('🔘 Register close button clicked');
        this.closeRegisterModal();
      });
    } else {
      console.log('❌ registerCloseBtn not found');
    }

    // Close modals on outside click
    if (this.loginModal) {
      this.loginModal.addEventListener('click', (e) => {
        if (e.target === this.loginModal) {
          this.closeLoginModal();
        }
      });
    }

    if (this.registerModal) {
      this.registerModal.addEventListener('click', (e) => {
        if (e.target === this.registerModal) {
          this.closeRegisterModal();
        }
      });
    }
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email || !password) {
      alert('Please enter both email and password.');
      return;
    }

    try {
      console.log('🔐 Attempting email/password login...');
      
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        console.error('❌ Login error:', error.message);
        alert(`Login failed: ${error.message}`);
        return;
      }

      if (data.user) {
        console.log('✅ Login successful:', data.user.email);
        this.closeLoginModal();
        
        // Optional: Show success message
        alert('Login successful! Welcome back.');
        
        // Reload page to update UI state
        window.location.reload();
      }
    } catch (error) {
      console.error('❌ Unexpected error during login:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  }

  async handleRegisterSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!email || !password || !confirmPassword) {
      alert('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      console.log('🔐 Attempting user registration...');
      
      const { data, error } = await window.supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: window.location.origin + '/map'
        }
      });

      if (error) {
        console.error('❌ Registration error:', error.message);
        alert(`Registration failed: ${error.message}`);
        return;
      }

      if (data.user) {
        console.log('✅ Registration successful:', data.user.email);
        this.closeRegisterModal();
        
        // Show success message
        alert('Registration successful! Please check your email to confirm your account.');
        
        // Reload page to update UI state
        window.location.reload();
      }
    } catch (error) {
      console.error('❌ Unexpected error during registration:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  }

  async handleForgotPassword(e) {
    e.preventDefault();
    
    const email = this.emailInput.value.trim();
    
    if (!email) {
      alert('Please enter your email address first.');
      this.emailInput.focus();
      return;
    }

    try {
      console.log('📧 Sending password reset email...');
      
      const { data, error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/map'
      });

      if (error) {
        console.error('❌ Password reset error:', error.message);
        alert(`Password reset failed: ${error.message}`);
        return;
      }

      console.log('✅ Password reset email sent');
      alert('Password reset email sent! Please check your inbox.');
    } catch (error) {
      console.error('❌ Unexpected error during password reset:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  }

  showLoginModal(e) {
    e.preventDefault();
    this.closeRegisterModal();
    this.openLoginModal();
  }

  showRegisterModal(e) {
    e.preventDefault();
    this.closeLoginModal();
    this.openRegisterModal();
  }

  async openLoginModal() {
    console.log('🔓 AuthModal.openLoginModal() called');
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session && session.user) {
      console.log('🚫 Attempted to open login modal while logged in - aborting');
      this.closeLoginModal();
      return;
    }
    if (this.loginModal) {
      console.log('  - Removing "hidden" class...');
      this.loginModal.classList.remove('hidden');
      console.log('  - Setting display to flex...');
      this.loginModal.style.display = 'flex';
      console.log('  - Modal classes:', this.loginModal.className);
      console.log('  - Modal style.display:', this.loginModal.style.display);
      if (this.emailInput) {
        this.emailInput.focus();
      }
      console.log('✅ Login modal opened successfully');
    } else {
      console.error('❌ ERROR: this.loginModal is null!');
    }
  }

  openRegisterModal() {
    if (this.registerModal) {
      this.registerModal.style.display = 'flex';
      document.getElementById('registerEmail').focus();
      console.log('🔓 Register modal opened');
    }
  }

  closeLoginModal() {
    if (this.loginModal) {
      this.loginModal.classList.add('hidden');
      this.loginModal.style.display = 'none';
      this.loginForm.reset();
      console.log('🔒 Login modal closed');
    }
  }

  closeRegisterModal() {
    if (this.registerModal) {
      this.registerModal.style.display = 'none';
      this.registerForm.reset();
      console.log('🔒 Register modal closed');
    }
  }

  // Public method to check if modal is open
  isOpen() {
    return (this.loginModal && this.loginModal.style.display === 'flex') ||
           (this.registerModal && this.registerModal.style.display === 'flex');
  }

  // Force logout and clear all sessions
  async forceLogout() {
    try {
      console.log("🔓 Force logout initiated...");
      
      // Sign out from Supabase
      const { error } = await window.supabaseClient.auth.signOut();
      if (error) {
        console.error("❌ Logout error:", error.message);
      } else {
        console.log("✅ Supabase logout successful");
      }
      
      // Clear all local storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear cookies (if any)
      document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
      });
      
      console.log("🧹 All local data cleared");
      
      // Reload page to reset state
      window.location.reload();
      
    } catch (err) {
      console.error("🚨 Force logout error:", err);
      // Still reload even if there's an error
      window.location.reload();
    }
  }
}

// Initialize auth modal when DOM is ready
function initializeAuthModal() {
  console.log("🔧 Initializing AuthModal...");
  try {
    // Create global instance
    window.authModal = new AuthModal();
    console.log("✅ AuthModal instance created");
  } catch (err) {
    console.error("❌ Error creating AuthModal:", err);
    return;
  }
  
  // DIAGNOSTIC: Check Capacitor and Browser plugin availability
  console.log("🔍 DIAGNOSTIC: Checking Capacitor environment...");
  console.log("  - window.Capacitor exists:", !!window.Capacitor);
  console.log("  - window.Capacitor.Plugins:", window.Capacitor?.Plugins);
  console.log("  - window.Capacitor.isNativePlatform:", window.Capacitor?.isNativePlatform?.());
  
  // Listen for Browser finished event - when OAuth completes and browser closes
  if (window.Capacitor?.Plugins?.Browser) {
    const Browser = window.Capacitor.Plugins.Browser;
    console.log("✅ Browser plugin found via Capacitor.Plugins");
    console.log("  - Browser object:", Browser);
    console.log("  - Browser.open exists:", typeof Browser.open === 'function');
    
    Browser.addListener('browserFinished', async () => {
      const { data, error } = await window.supabaseClient.auth.getSession();
      console.log("OAuth returned to app, session:", data?.session, "error:", error);
      if (data?.session) {
        // Close login modals
        const loginModal = document.getElementById('loginModal');
        const registerModal = document.getElementById('registerModal');
        if (loginModal) {
          loginModal.classList.add('hidden');
          loginModal.style.display = 'none';
        }
        if (registerModal) {
          registerModal.style.display = 'none';
        }
        // Update login button text
        const btn = document.getElementById('toolbarLoginBtn');
        if (btn) {
          btn.innerHTML = '👤 <span>Account</span>';
          if (typeof forceAccountButtonSizing === 'function') {
            forceAccountButtonSizing();
          }
        }
      }
    });
  } else {
    console.error("❌ Browser plugin not available via window.Capacitor.Plugins");
    console.error("  SOLUTION: Run 'npx cap sync android' and rebuild the app.");
  }
  
  // Handle OAuth deep link callback in Capacitor
  if (window.Capacitor?.Plugins?.App) {
    const App = window.Capacitor.Plugins.App;
    
    // Listen for app opening from deep link (OAuth callback)
    App.addListener('appUrlOpen', async (data) => {
        console.log("🔗 App opened from deep link:", data.url);
        
        // Check if this is our OAuth callback
        if (data.url && data.url.startsWith('capacitor://localhost')) {
          try {
            // Parse URL to get query parameters
            const url = new URL(data.url);
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');
            
            if (error) {
              console.error("❌ OAuth error from callback:", error);
              alert('Login failed: ' + error);
              return;
            }
            
            if (code && state) {
              console.log("🔄 Processing OAuth callback from deep link...");
              // Exchange code for session
              const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.exchangeCodeForSession({
                code: code
              });
              
              if (sessionError) {
                console.error("❌ Session exchange error:", sessionError);
                alert('Session exchange failed: ' + sessionError.message);
                return;
              }
              
              if (sessionData?.session) {
                console.log("✅ OAuth completed, session:", sessionData.session.user.email);
                // Close login modals
                const loginModal = document.getElementById('loginModal');
                const registerModal = document.getElementById('registerModal');
                if (loginModal) {
                  loginModal.classList.add('hidden');
                  loginModal.style.display = 'none';
                }
                if (registerModal) {
                  registerModal.style.display = 'none';
                }
                // Update login button text
                const btn = document.getElementById('toolbarLoginBtn');
                if (btn) {
                  btn.innerHTML = '👤 <span>Account</span>';
                  if (typeof forceAccountButtonSizing === 'function') {
                    forceAccountButtonSizing();
                  }
                }
              }
            }
          } catch (err) {
            console.error("🚨 Error processing OAuth callback:", err);
          }
        }
      });
  } else {
    console.log("⚠️ App plugin not available via window.Capacitor.Plugins");
  }

  // Add global functions for external access
  window.openLoginModal = () => {
    console.log("🔓 window.openLoginModal() called");
    console.log("  - window.authModal exists:", !!window.authModal);
    if (window.authModal) {
      console.log("  - Calling authModal.openLoginModal()...");
      window.authModal.openLoginModal();
    } else {
      console.error("❌ ERROR: window.authModal is not initialized!");
      console.error("  - Attempting to find loginModal element directly...");
      const loginModal = document.getElementById('loginModal');
      if (loginModal) {
        console.log("  - Found loginModal element, showing it directly...");
        loginModal.classList.remove('hidden');
        loginModal.style.display = 'flex';
      } else {
        console.error("  - loginModal element not found!");
      }
    }
  };
  
  window.openRegisterModal = () => {
    if (window.authModal) {
      window.authModal.openRegisterModal();
    }
  };
  
  window.closeLoginModal = () => {
    if (window.authModal) {
      window.authModal.closeLoginModal();
    }
  };
  
  window.closeRegisterModal = () => {
    if (window.authModal) {
      window.authModal.closeRegisterModal();
    }
  };
  
  window.forceLogout = () => {
    if (window.authModal) {
      window.authModal.forceLogout();
    }
  };
  
  console.log('✅ Auth modal initialized');
}

// Try multiple initialization strategies
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAuthModal);
} else {
  // DOM already loaded
  initializeAuthModal();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthModal;
} 