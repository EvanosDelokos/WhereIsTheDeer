console.log("Module loaded: main.js");

// Initialize Supabase client ONCE, early in your app (if not already done)
if (!window.supabaseClient) {
  window.supabaseClient = window.supabase.createClient(
    'https://pdskokilsaljhagvwazn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkc2tva2lsc2FsamhhZ3Z3YXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2MTQwOTUsImV4cCI6MjA2OTE5MDA5NX0.ekpHjsXv55MgOvAVJNYdp4wNuGkGhZghMt8DWfzZikE',
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );
}

// Add global auth state listener (if not already present)
window.supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log('🔔 Auth Event:', event);
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    console.log('✅ Session updated. Re-enabling SSS if needed.');
    const modal = document.getElementById('loginModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    const registerModal = document.getElementById('registerModal');
    if (registerModal) {
      registerModal.style.display = 'none';
    }
    const btn = document.getElementById('toolbarLoginBtn');
    if (btn) btn.textContent = '👤 Account';
  } else if (event === 'SIGNED_OUT') {
    console.warn('⚠️ Signed out. Disable SSS.');
    const btn = document.getElementById('toolbarLoginBtn');
    if (btn) btn.textContent = '🔐 Login';
  }
  if (session?.user) {
    console.log('✅ User is logged in:', session.user.email);
    const modal = document.getElementById('loginModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    const registerModal = document.getElementById('registerModal');
    if (registerModal) {
      registerModal.style.display = 'none';
    }
  } else {
    console.log('🚫 No session');
  }
});

// Only load the rest of the app after Supabase is ready
(async () => {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  console.log("✅ Supabase client ready. Session:", session?.user?.email || "none");

  // Dynamically import modules that depend on Supabase
  await import('./sssModule.js'); // Only import, do not call setupSSS
  await import('./mapEngine.js');
  await import('./layerManager.js');
  // Add other module imports as needed
})();

// GPX functionality is now handled directly in map.html
// No more file forwarding needed - using handleGpxFiles() function
console.log("Module loaded: main.js - GPX forwarding removed");

// Initialize SSS module when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded, initializing SSS module...");
  const toolbarLoginBtn = document.getElementById('toolbarLoginBtn');
  if (toolbarLoginBtn && !window.__mainLoginHandlerAttached) {
    window.__mainLoginHandlerAttached = true;

    toolbarLoginBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      // Fast path: cached user
      if (window.__isLoggedIn && window.__sessionUser) {
        window.showAccountPopover?.(window.__sessionUser);
        return;
      }

      // Slow path: poll for session up to 2s
      let session = null;
      for (let i = 0; i < 10; i++) {
        const res = await window.supabaseClient.auth.getSession();
        session = res?.data?.session;
        if (session?.user) break;
        await new Promise(r => setTimeout(r, 5));
      }

      if (session?.user) {
        window.__isLoggedIn = true;
        window.__sessionUser = session.user;
        window.showAccountPopover?.(session.user);
      } else {
        window.openLoginModal?.();
      }
    });
  }
});

// Global auth cache
window.__isLoggedIn = false;
window.__sessionUser = null;

// Prime cache on load
window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
  window.__isLoggedIn = !!session?.user;
  window.__sessionUser = session?.user || null;
});

// Keep it fresh
window.supabaseClient.auth.onAuthStateChange((event, session) => {
  window.__isLoggedIn = !!session?.user;
  window.__sessionUser = session?.user || null;
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    const modal = document.getElementById('loginModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    const registerModal = document.getElementById('registerModal');
    if (registerModal) {
      registerModal.style.display = 'none';
    }
    const btn = document.getElementById('toolbarLoginBtn');
    if (btn) btn.textContent = '👤 Account';
  } else if (event === 'SIGNED_OUT') {
    const btn = document.getElementById('toolbarLoginBtn');
    if (btn) btn.textContent = '🔐 Login';
  }
  if (session?.user) {
    const modal = document.getElementById('loginModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    const registerModal = document.getElementById('registerModal');
    if (registerModal) {
      registerModal.style.display = 'none';
    }
  }
});

// ✅ Single source of truth for account popover
window.showAccountPopover = function(user) {
  // Remove any existing popover first
  document.querySelectorAll('.account-popover').forEach(el => el.remove());

  // Debug: Log all available user data to see what we're working with
  console.log('🔍 User data for popover:', {
    email: user.email,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at
  });

  // Wait a bit for the plan system to load if needed
  const waitForPlan = () => {
    // Enhanced premium detection - check multiple possible locations
    const isPremium = 
      // Check the app's plan system first (this is where your premium status is actually stored)
      window.currentUserPlan === 'premium' ||
      // Check if there's a local currentUserPlan variable (defined in map.html)
      (typeof currentUserPlan !== 'undefined' && currentUserPlan === 'premium') ||
      // Also check if there's a global plan variable
      (typeof window.userPlan !== 'undefined' && window.userPlan === 'premium') ||
      // Check if there's a plan in the global scope
      (typeof window.plan !== 'undefined' && window.plan === 'premium') ||
      // Fallback to Supabase metadata if app plan not available
      user.app_metadata?.subscription_status === 'premium' ||
      user.app_metadata?.role === 'premium' ||
      user.user_metadata?.isPremium === true ||
      user.user_metadata?.subscription === 'premium' ||
      user.user_metadata?.plan === 'premium' ||
      user.user_metadata?.tier === 'premium' ||
      user.email?.includes('premium') || // Fallback check
      false;

    console.log('🔍 Premium detection result:', {
      isPremium,
      appPlan: window.currentUserPlan, // This should show 'premium'
      localPlan: typeof currentUserPlan !== 'undefined' ? currentUserPlan : 'undefined',
      userPlan: window.userPlan,
      plan: window.plan,
      subscription_status: user.app_metadata?.subscription_status,
      role: user.app_metadata?.role,
      isPremium_metadata: user.user_metadata?.isPremium,
      subscription: user.user_metadata?.subscription,
      plan: user.user_metadata?.plan,
      tier: user.user_metadata?.tier
    });

    // If we still can't detect premium, let's check if we can find it in the DOM or other sources
    if (!isPremium) {
      console.log('🔍 Trying to find premium status in other sources...');
      // Check if there are any elements that might indicate premium status
      const premiumElements = document.querySelectorAll('[data-plan="premium"], .premium, [class*="premium"]');
      console.log('🔍 Premium elements found in DOM:', premiumElements.length);
      
      // Check if there's any text indicating premium
      const bodyText = document.body.innerText;
      if (bodyText.includes('Premium') || bodyText.includes('premium')) {
        console.log('🔍 Found "Premium" text in body');
      }
    }

    createPopover(isPremium);
  };

  // If plan is already available, create popover immediately
  if (typeof window.currentUserPlan !== 'undefined' || typeof currentUserPlan !== 'undefined') {
    waitForPlan();
  } else {
    // Wait a bit for the plan to load
    console.log('🔍 Plan not loaded yet, waiting...');
    setTimeout(waitForPlan, 100);
  }

  function createPopover(isPremium) {
    const popover = document.createElement('div');
    popover.className = 'account-popover';
    popover.style.position = 'fixed';
    popover.style.bottom = '64px';
    popover.style.right = '50px';
    popover.style.background = '#fff';
    popover.style.border = '1px solid #e0e0e0';
    popover.style.borderRadius = '12px';
    popover.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    popover.style.padding = '20px';
    popover.style.zIndex = '1000';
    popover.style.minWidth = '280px';
    popover.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    popover.innerHTML = `
      <div style="margin-bottom: 20px;">
        <!-- User Avatar & Status -->
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="width: 48px; height: 48px; background: ${isPremium ? '#ffd700' : '#e0e0e0'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; border: 2px solid ${isPremium ? '#ffb347' : '#ccc'};">
            <span style="font-size: 20px; color: ${isPremium ? '#b8860b' : '#666'};">
              ${isPremium ? '👑' : '👤'}
            </span>
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 16px; color: #333; margin-bottom: 4px;">
              ${user.user_metadata?.full_name || user.email.split('@')[0] || 'User'}
            </div>
            <div style="font-size: 13px; color: #666; margin-bottom: 6px;">
              ${user.email}
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; background: ${isPremium ? '#4CAF50' : '#ff9800'}; border-radius: 50%;"></span>
              <span style="font-size: 12px; font-weight: 500; color: ${isPremium ? '#4CAF50' : '#ff9800'};">
                ${isPremium ? 'Premium Account' : 'Free Account'}
              </span>
            </div>
          </div>
        </div>

        <!-- Account Details -->
        <div style="background: #f8f9fa; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Account Details</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 13px; color: #333;">Member since:</span>
            <span style="font-size: 13px; color: #666; font-weight: 500;">
              ${new Date(user.created_at).toLocaleDateString()}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; color: #333;">Last login:</span>
            <span style="font-size: 13px; color: #666; font-weight: 500;">
              ${new Date(user.last_sign_in_at || user.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: 8px;">
        <button id="signOutBtn" style="flex: 1; padding: 10px 16px; background: #dc3545; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px; transition: background 0.2s;">Sign Out</button>
        <button id="closePopoverBtn" style="padding: 10px 16px; background: #6c757d; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px; transition: background 0.2s;">Close</button>
      </div>
    `;

    document.body.appendChild(popover);

    // Add hover effects
    const signOutBtn = popover.querySelector('#signOutBtn');
    const closeBtn = popover.querySelector('#closePopoverBtn');
    
    signOutBtn.addEventListener('mouseenter', () => signOutBtn.style.background = '#c82333');
    signOutBtn.addEventListener('mouseleave', () => signOutBtn.style.background = '#dc3545');
    
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = '#5a6268');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = '#6c757d');

    // Sign out
    signOutBtn.addEventListener('click', async () => {
      await window.supabaseClient.auth.signOut();
      popover.remove();
      
      // Show signed-out notification with SSS-style styling
      showSignedOutNotification();
    });

    // Close manually
    closeBtn.addEventListener('click', () => {
      popover.remove();
    });
  }
};

// Show signed-out notification with SSS-style styling
function showSignedOutNotification() {
  // Remove any existing notification
  document.querySelectorAll('.signed-out-notification').forEach(el => el.remove());

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'signed-out-notification';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(0,0,0,0.18)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';

  // Create modal box
  const modal = document.createElement('div');
  modal.style.background = '#fff';
  modal.style.borderRadius = '22px';
  modal.style.boxShadow = '0 2px 24px rgba(0,0,0,0.18)';
  modal.style.padding = '38px 32px 32px 32px';
  modal.style.maxWidth = '420px';
  modal.style.width = '90vw';
  modal.style.textAlign = 'center';
  modal.style.border = '3px solid #ffb3b3';
  modal.style.position = 'relative';

  // Lock icon
  const lock = document.createElement('div');
  lock.innerHTML = '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="56" rx="16" fill="#FFF3E0"/><path d="M28 36C29.1046 36 30 35.1046 30 34C30 32.8954 29.1046 32 28 32C26.8954 32 26 32.8954 26 34C26 35.1046 26.8954 36 28 36Z" fill="#FFB300"/><rect x="18" y="26" width="20" height="12" rx="4" fill="#FFE082" stroke="#FFB300" stroke-width="2"/><path d="M22 26V22C22 18.6863 24.6863 16 28 16C31.3137 16 34 18.6863 34 22V26" stroke="#FFB300" stroke-width="2"/></svg>';
  lock.style.marginBottom = '18px';
  modal.appendChild(lock);

  // Title
  const title = document.createElement('div');
  title.textContent = 'Signed Out';
  title.style.fontWeight = 'bold';
  title.style.fontSize = '2em';
  title.style.marginBottom = '10px';
  title.style.color = '#333';
  modal.appendChild(title);

  // Subtitle
  const subtitle = document.createElement('div');
  subtitle.textContent = 'You have been successfully signed out. Premium features are now locked.';
  subtitle.style.fontSize = '1.1em';
  subtitle.style.color = '#666';
  subtitle.style.marginBottom = '22px';
  modal.appendChild(subtitle);

  // Button
  const btn = document.createElement('button');
  btn.textContent = 'Got it';
  btn.id = 'gotItBtn';
  btn.style.background = '#ff7e7e';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.borderRadius = '10px';
  btn.style.padding = '14px 38px';
  btn.style.fontSize = '1.2em';
  btn.style.fontWeight = 'bold';
  btn.style.marginTop = '10px';
  btn.style.cursor = 'pointer';
  btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  btn.addEventListener('click', () => overlay.remove());
  modal.appendChild(btn);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Auto-close after 5 seconds
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.remove();
    }
  }, 5000);
}

// TODO: Any glue code if needed
