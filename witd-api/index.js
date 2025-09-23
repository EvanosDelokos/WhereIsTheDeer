import express from 'express';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 4568;

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit request size
app.use(express.static('public'));

// 🔒 Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Strict limit for premium endpoints
  message: 'Too many premium requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter); // Apply to all routes

// 🔒 Helmet Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // We handle CSP manually
  crossOriginEmbedderPolicy: false // Allow mapbox embeds
}));

// 🔒 HTTPS Enforcement Middleware
app.use((req, res, next) => {
  // Force HTTPS in production
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.header('host')}${req.url}`);
  }
  next();
});

// 🔒 Security Headers Middleware
app.use((req, res, next) => {
  // Content Security Policy - Strict CSP to prevent XSS
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://api.mapbox.com https://account.mapbox.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' https://*.supabase.co https://api.mapbox.com https://api.whereisthedeer.com.au https://nominatim.openstreetmap.org https://*.openweathermap.org https://zones.whereisthedeer.com.au; " +
    "frame-src 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  
  // HTTP Strict Transport Security - Force HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // X-Content-Type-Options - Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // X-Frame-Options - Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // X-XSS-Protection - Enable XSS filtering
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy - Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy - Control browser features
  res.setHeader('Permissions-Policy', 
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
});

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL || 'https://pdskokilsaljhagvwazn.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// Database setup
const dbPath = '/data/addresses.sqlite';
const zonesPath = '/data/zones.json';

let db;
if (fs.existsSync(dbPath)) {
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, err => {
    if (err) console.error('Failed to open SQLite DB:', err.message);
    else console.log('SQLite DB connected');
  });
} else {
  console.warn('SQLite DB not found — search endpoint will be disabled.');
}

// 🔒 Input validation middleware
function validateInput(req, res, next) {
  // Check for suspicious patterns in request body
  const bodyStr = JSON.stringify(req.body);
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /function\s*\(/i,
    /document\./i,
    /window\./i
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(bodyStr)) {
      console.log("[Security] Suspicious input detected:", pattern);
      return res.status(400).json({ error: 'Invalid input detected' });
    }
  }
  
  next();
}

// ✅ Premium middleware to verify user session + plan
async function requirePremium(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log("[Security] Missing token in request");
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    console.log("[Security] Verifying token for premium access");

    // Enhanced token validation with expiration monitoring
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      // Log specific token errors for security monitoring
      if (authError?.message?.includes('expired') || authError?.message?.includes('invalid')) {
        console.log("[Security] Token expired or invalid:", authError.message);
        return res.status(403).json({ error: 'Token expired or invalid - please login again' });
      }
      console.log("[Security] Authentication failed:", authError?.message || 'Unknown error');
      return res.status(403).json({ error: 'Authentication failed' });
    }

    // Additional token expiration check
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        const currentTime = Math.floor(Date.now() / 1000);
        const expirationTime = payload.exp;
        
        // Check if token expires within next 5 minutes (300 seconds)
        if (expirationTime - currentTime < 300) {
          console.log("[Security] Token expires soon, user should refresh:", user.email);
          // Don't block the request, but log for monitoring
        }
        
        if (expirationTime <= currentTime) {
          console.log("[Security] Token already expired:", user.email);
          return res.status(403).json({ error: 'Token expired - please login again' });
        }
      }
    } catch (tokenParseError) {
      console.log("[Security] Failed to parse token payload:", tokenParseError.message);
      // Continue with Supabase validation as fallback
    }

    console.log("[Security] User authenticated:", user.email);

    // Check user's plan in profiles table
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.log("[Security] Profile lookup error:", profileError.message);
      return res.status(500).json({ error: 'Failed to verify user plan' });
    }

    if (!profile || profile.plan !== 'premium') {
      console.log("[Security] User plan check failed:", profile?.plan || 'no profile');
      return res.status(403).json({ error: 'Premium plan required' });
    }

    console.log("[Security] Premium access granted for:", user.email);
    
    // Attach user to request for downstream use
    req.user = user;
    next();
  } catch (error) {
    console.error("[Security] Premium middleware error:", error);
    return res.status(500).json({ error: 'Authentication service error' });
  }
}

// ✅ Public endpoints (no authentication required)
app.get('/zones', (req, res) => {
  fs.readFile(zonesPath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('zones.json not found');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  });
});

app.get('/search', (req, res) => {
  if (!db) return res.status(500).send('Database not connected');
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).send('lat and lng are required');
  db.get("SELECT * FROM locality LIMIT 1", [], (err, row) => {
    if (err) return res.status(500).send('Query failed');
    res.json(row || {});
  });
});

// ✅ Premium endpoints (require authentication + premium plan)
app.post('/upload-gpx', strictLimiter, validateInput, requirePremium, async (req, res) => {
  try {
    console.log("[Security] GPX upload attempt by premium user:", req.user.email);
    
    const { gpxData, fileName } = req.body;
    if (!gpxData || !fileName) {
      return res.status(400).json({ error: 'GPX data and filename required' });
    }

    // Process GPX upload (implement your logic here)
    // For now, just acknowledge the upload
    res.json({ 
      success: true, 
      message: 'GPX file uploaded successfully',
      fileName: fileName,
      uploadedBy: req.user.email
    });
  } catch (error) {
    console.error('GPX upload error:', error);
    res.status(500).json({ error: 'Failed to upload GPX file' });
  }
});

app.post('/save-journal', strictLimiter, validateInput, requirePremium, async (req, res) => {
  try {
    console.log("[Security] Journal save attempt by premium user:", req.user.email);
    
    const { title, note, coords, time } = req.body;
    if (!note) {
      return res.status(400).json({ error: 'Journal note is required' });
    }

    // Save journal entry to database (implement your logic here)
    // For now, just acknowledge the save
    res.json({ 
      success: true, 
      message: 'Journal entry saved successfully',
      entry: { title, note, coords, time },
      savedBy: req.user.email
    });
  } catch (error) {
    console.error('Journal save error:', error);
    res.status(500).json({ error: 'Failed to save journal entry' });
  }
});

app.get('/journal-entries', strictLimiter, requirePremium, async (req, res) => {
  try {
    console.log("[Security] Journal entries request by premium user:", req.user.email);
    
    // Fetch journal entries for this user (implement your logic here)
    // For now, return empty array
    res.json({ 
      success: true, 
      entries: [],
      requestedBy: req.user.email
    });
  } catch (error) {
    console.error('Journal entries fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

app.post('/draw-track', strictLimiter, validateInput, requirePremium, async (req, res) => {
  try {
    console.log("[Security] Track draw save attempt by premium user:", req.user.email);
    
    const { trackData, trackName } = req.body;
    if (!trackData) {
      return res.status(400).json({ error: 'Track data is required' });
    }

    // Save drawn track (implement your logic here)
    res.json({ 
      success: true, 
      message: 'Track saved successfully',
      trackName: trackName || 'Unnamed Track',
      savedBy: req.user.email
    });
  } catch (error) {
    console.error('Track save error:', error);
    res.status(500).json({ error: 'Failed to save track' });
  }
});

app.post('/save-pins', strictLimiter, validateInput, requirePremium, async (req, res) => {
  try {
    console.log("[Security] Pins save attempt by premium user:", req.user.email);
    
    const { pins } = req.body;
    if (!pins || !Array.isArray(pins)) {
      return res.status(400).json({ error: 'Pins array is required' });
    }

    // Save pins (implement your logic here)
    res.json({ 
      success: true, 
      message: 'Pins saved successfully',
      pinCount: pins.length,
      savedBy: req.user.email
    });
  } catch (error) {
    console.error('Pins save error:', error);
    res.status(500).json({ error: 'Failed to save pins' });
  }
});

app.get('/user-profile', strictLimiter, requirePremium, async (req, res) => {
  try {
    console.log("[Security] Profile request by premium user:", req.user.email);
    
    // Get user profile data
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    res.json({ 
      success: true, 
      profile: {
        id: profile.id,
        email: req.user.email,
        plan: profile.plan,
        created_at: profile.created_at
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    supabase: supabaseUrl ? 'configured' : 'not configured'
  });
});

app.listen(port, () => {
  console.log(`🚀 Secure API listening on port ${port}`);
  console.log(`🔐 Premium features protected with Supabase authentication`);
  console.log(`📊 Supabase URL: ${supabaseUrl}`);
  console.log(`🔑 Service key: ${supabaseServiceKey ? 'configured' : 'missing'}`);
});
