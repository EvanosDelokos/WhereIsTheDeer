/*
// 🧠 Smart Scout Suggestion Fetch (Streaming)
// Remove ESM import for Supabase

// Google Login Function (call this on login button click)
export async function loginWithGoogle() {
  const { error } = await window.supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/map.html', // Always redirect to map.html after login
      scopes: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
    }
  });
  if (error) {
    console.error('❌ Google login error:', error.message);
    throw error;
  }
}

// Updated fetchSSSAdvice (with refresh and validation)
export async function fetchSSSAdvice(promptText, onUpdate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let fullText = '';
  try {
    // Force session refresh and validate user
    const { data: user, error: userError } = await window.supabaseClient.auth.getUser();
    if (userError || !user.user) {
      console.error('❌ getUser failed:', userError?.message || 'No user');
      const { error: refreshError } = await window.supabaseClient.auth.refreshSession();
      if (refreshError) throw new Error(`Session refresh failed: ${refreshError.message}`);
    }

    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    console.log('🧪 Session:', session ? 'Found' : 'Not found');
    // Security: Removed token logging
    console.log('⚠️ Session Error:', sessionError || 'None');

    if (sessionError) throw new Error(`Session error: ${sessionError.message}`);
    if (!session?.access_token) throw new Error('Missing access token — login required');

    // Validate token shape
    const tokenParts = session.access_token.split('.');
    if (tokenParts.length !== 3 || session.access_token.startsWith('ya29.')) {
      throw new Error('Invalid token format (Google token detected) — re-login with Supabase OAuth');
    }

    // Decode token for debugging
    try {
      const payload = JSON.parse(atob(tokenParts[1]));
      // Security: Removed token payload logging
    } catch (e) {
      console.warn('⚠️ Failed to decode token:', e.message);
    }

    const res = await fetch('https://api.whereisthedeer.com.au/sss', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ prompt: promptText }),
      signal: controller.signal,
    });

    console.log('📡 Response Status:', res.status, res.statusText);

    if (!res.ok || !res.body) {
      const errorText = await res.text().catch(() => 'No details');
      throw new Error(`Streaming failed: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (line.trim().startsWith('{')) {
          try {
            const json = JSON.parse(line);
            if (json.response) {
              fullText += json.response;
              if (onUpdate) onUpdate(fullText);
            }
          } catch (e) {}
        }
      }
    }
    clearTimeout(timeout);
    return fullText;
  } catch (err) {
    console.error('❌ Failed to fetch SSS:', err.message);
    clearTimeout(timeout);
    throw err;
  }
}

// Auth State Listener (add this once, early in app)
window.supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log('🔔 Auth Event:', event);
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    console.log('✅ Session updated. Re-enabling SSS if needed.');
    setupSSS(); // Re-setup your SSS button/logic
  } else if (event === 'SIGNED_OUT') {
    console.warn('⚠️ Signed out. Disable SSS.');
    // Disable SSS button
  }
});

// Restore SSS modal logic
export function setupSSS() {
  const btn = document.getElementById('sssGenerateBtn');
  if (!btn) return;
  // Remove previous listeners by cloning
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', async () => {
    const planInput = document.getElementById('sssInput');
    const locationInput = document.getElementById('sssLocationInput');
    let output = document.getElementById('sssOutput');
    if (!output) {
      output = document.createElement('div');
      output.id = 'sssOutput';
      output.style.cssText = 'margin:16px 0;text-align:left;white-space:pre-wrap;max-height:40vh;overflow:auto;padding:12px;border:1px solid #e0e0e0;border-radius:6px;background:#f9f9f9;';
      // Insert after the input container
      const modal = document.getElementById('sssModal');
      const inputContainer = modal.querySelector('.modern-popup > div');
      if (inputContainer) inputContainer.appendChild(output);
      else modal.appendChild(output);
    }
    output.textContent = 'Generating advice...';
    newBtn.disabled = true;
    try {
      const prompt = (locationInput?.value ? locationInput.value + '\n' : '') + (planInput?.value || '');
      await fetchSSSAdvice(prompt, (text) => {
        output.textContent = text;
      });
    } catch (err) {
      output.textContent = 'Failed to get advice.';
    } finally {
      newBtn.disabled = false;
    }
  });
}

// Guarded SSS setup: only run after Supabase is ready and session exists
if (window.supabaseClient && window.supabaseClient.auth) {
  window.supabaseClient.auth.getSession().then(({ data: { session }, error }) => {
    if (error) console.error('⚠️ Session get error:', error.message);
    if (session) {
      console.log('✅ Session ready. Enabling SSS.');
      setupSSS();
    } else {
      console.warn('⚠️ No session. Prompt login.');
      // Show login button or modal
    }
  });
}

// Security: Removed debug log that exposed sensitive configuration
*/

// --- SSS Coming Soon Modal Logic (always active) ---
function showSSSComingSoonModal() {
  // Remove any existing modal
  const existing = document.getElementById('sssComingSoonModal');
  if (existing) existing.remove();

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'sssComingSoonModal';
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
  title.textContent = 'Super Scout Suggestions';
  title.style.fontWeight = 'bold';
  title.style.fontSize = '2em';
  title.style.marginBottom = '10px';
  modal.appendChild(title);

  // Subtitle
  const subtitle = document.createElement('div');
  subtitle.textContent = 'Coming soon!';
  subtitle.style.fontSize = '1.1em';
  subtitle.style.color = '#666';
  subtitle.style.marginBottom = '22px';
  modal.appendChild(subtitle);

  // Button
  const btn = document.createElement('button');
  btn.textContent = 'Got it';
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
}

document.addEventListener('DOMContentLoaded', function() {
  // const sssBtn = document.getElementById('toolbarSSSBtn');
  // if (sssBtn) {
  //   sssBtn.addEventListener('click', showSSSComingSoonModal);
  // }
});