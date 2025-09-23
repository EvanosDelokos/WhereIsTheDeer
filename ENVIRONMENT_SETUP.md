# Environment Variables Setup for WhereIsTheDeer Frontend

## 1. Create .env file

Create a new file called `.env` in the project root with the following content:

```env
VITE_SUPABASE_URL=https://pdskokilsaljhagvwazn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkc2tva2lsc2FsamhhZ3Z3YXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2MTQwOTUsImV4cCI6MjA2OTE5MDA5NX0.ekpHjsXv55MgOvAVJNYdp4wNuGkGhZghMt8DWfzZikE
VITE_MAPBOX_TOKEN=pk.eyJ1IjoiZXZhbmtva2EiLCJhIjoiY21lNWJmY3F2MHJzOTJrb2h1MWl4eDZpMCJ9.5ZEQqD207yalsIQLX5tpdg
VITE_API_URL=https://api.whereisthedeer.com.au
VITE_ZONES_API_URL=https://zones.whereisthedeer.com.au

# Optional: add staging/production flags
VITE_ENV=production
```

## 2. Create .env.example file

Create a new file called `.env.example` in the project root with dummy values:

```env
VITE_SUPABASE_URL=https://project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-your-anon-key
VITE_MAPBOX_TOKEN=replace-with-your-mapbox-token
VITE_API_URL=https://api.example.com
VITE_ZONES_API_URL=https://zones.example.com
VITE_ENV=development
```

## 3. Update .gitignore

Add the following line to your `.gitignore` file to prevent committing real keys:

```gitignore
# Environment variables
.env
```

## 4. Code Updates

The following files have been updated to use environment variables:

### apiManager.js
- Updated to use `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`
- Added fallback to hardcoded values for development

### mapEngine.js  
- Updated to use `import.meta.env.VITE_MAPBOX_TOKEN`

### speciesLayer.js
- Updated to use `import.meta.env.VITE_ZONES_API_URL`

## 5. Build Tool Configuration

If you're using Vite (recommended), environment variables starting with `VITE_` are automatically available in your frontend code.

If you're using a different build tool, you may need to configure it to inject environment variables:

### Webpack
```js
// webpack.config.js
const webpack = require('webpack');

module.exports = {
  plugins: [
    new webpack.DefinePlugin({
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
      'import.meta.env.VITE_MAPBOX_TOKEN': JSON.stringify(process.env.VITE_MAPBOX_TOKEN),
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL),
      'import.meta.env.VITE_ZONES_API_URL': JSON.stringify(process.env.VITE_ZONES_API_URL),
      'import.meta.env.VITE_ENV': JSON.stringify(process.env.VITE_ENV),
    })
  ]
};
```

### Parcel
Parcel automatically supports environment variables starting with `VITE_`.

## 6. Security Notes

- Never commit `.env` files to version control
- Use different environment variables for development, staging, and production
- Rotate API keys regularly
- Consider using a secrets management service for production deployments

## 7. Deployment

For production deployments, set environment variables in your hosting platform:

### Vercel
```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_MAPBOX_TOKEN
vercel env add VITE_API_URL
vercel env add VITE_ZONES_API_URL
vercel env add VITE_ENV
```

### Netlify
Add environment variables in the Netlify dashboard under Site settings > Environment variables.

### GitHub Pages
Use GitHub Secrets and Actions to inject environment variables during build.

---

**Note**: The actual `.env` file has not been created in this repository for security reasons. Please create it manually using the template above.
