# WhereIsTheDeer Secure Backend API

This backend provides secure API endpoints for premium features with Supabase authentication.

## Environment Variables

Create a `.env` file in the `witd-api` directory with the following variables:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Server Configuration
PORT=3000
```

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
```

## API Endpoints

### Public Endpoints (No Authentication Required)
- `GET /zones` - Get hunting zones data
- `GET /search` - Search addresses
- `GET /health` - Health check

### Premium Endpoints (Require Authentication + Premium Plan)
- `POST /upload-gpx` - Upload GPX files
- `POST /save-journal` - Save journal entries
- `GET /journal-entries` - Get user's journal entries
- `POST /draw-track` - Save drawn tracks
- `POST /save-pins` - Save custom pins
- `GET /user-profile` - Get user profile

## Security Features

✅ **Token Verification**: All premium endpoints verify Supabase JWT tokens
✅ **Plan Validation**: Users must have 'premium' plan in profiles table
✅ **User Isolation**: Each user can only access their own data
✅ **Comprehensive Logging**: All authentication attempts are logged

## Frontend Integration

The frontend should send the Supabase access token in the Authorization header:

```javascript
const session = await supabase.auth.getSession();
const token = session?.data?.session?.access_token;

fetch('/upload-gpx', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});
``` 