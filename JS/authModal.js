// Auth modal module loaded

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

          // Detect environment automatically
          const origin = window.location.origin;
          const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

          // Pick redirect based on environment
          const redirectUrl = isLocal
            ? `${origin}/map.html`                     // Local dev
            : `https://www.whereisthedeer.com.au/map.html`; // Live site

          console.log("🌐 Using redirect URL:", redirectUrl);

          const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
              queryParams: {
                prompt: 'select_account', // Always show account selector
                access_type: 'offline', // Force fresh token
                include_granted_scopes: 'true' // Ensure fresh permissions
              },
              scopes: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
            }
          });

          if (error) {
            console.error("❌ Google OAuth error:", error.message);
            alert("Login failed: " + error.message);
          } else if (data?.url) {
            console.log("🟢 Redirecting to:", data.url);
            window.location.href = data.url;
          }

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

          // Detect environment automatically
          const origin = window.location.origin;
          const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

          // Pick redirect based on environment
          const redirectUrl = isLocal
            ? `${origin}/map.html`                     // Local dev
            : `https://www.whereisthedeer.com.au/map.html`; // Live site

          console.log("🌐 Using redirect URL:", redirectUrl);

          const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
              queryParams: {
                prompt: 'select_account', // Always show account selector
                access_type: 'offline', // Force fresh token
                include_granted_scopes: 'true' // Ensure fresh permissions
              },
              scopes: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
            }
          });

          if (error) {
            console.error("❌ Google OAuth error:", error.message);
            alert("Registration failed: " + error.message);
          } else if (data?.url) {
            console.log("🟢 Redirecting to:", data.url);
            window.location.href = data.url;
          }

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
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session && session.user) {
      console.log('🚫 Attempted to open login modal while logged in - aborting');
      this.closeLoginModal();
      return;
    }
    if (this.loginModal) {
      this.loginModal.classList.remove('hidden');
      this.loginModal.style.display = 'flex';
      this.emailInput.focus();
      console.log('🔓 Login modal opened');
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
document.addEventListener('DOMContentLoaded', () => {
  // Create global instance
  window.authModal = new AuthModal();
  
  // Add global functions for external access
  window.openLoginModal = () => {
    if (window.authModal) {
      window.authModal.openLoginModal();
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
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthModal;
} 