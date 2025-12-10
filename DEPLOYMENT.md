# Deployment Guide

This guide will help you deploy your Fantasy Roguelite game to production.

## Prerequisites

- GitHub account
- Render account (free tier works!)
- Your game repository pushed to GitHub

## Part 1: Deploy Server to Render

### 1. Create Render Account
- Go to [render.com](https://render.com)
- Sign up with your GitHub account

### 2. Create PostgreSQL Database (Optional - for later)
1. Click "New +" → "PostgreSQL"
2. Choose a name (e.g., `fantasy-roguelite-db`)
3. Select free tier
4. Click "Create Database"
5. **Save the "Internal Database URL"** - you'll need this!

### 3. Create Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure the service:
   - **Name**: `fantasy-roguelite-server` (or your choice)
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

4. Add Environment Variables:
   - Click "Advanced"
   - Add:
     - `PORT` = `3000`
     - `DATABASE_URL` = (your PostgreSQL URL from step 2)
     - `SESSION_SECRET` = (any random string)

5. Click "Create Web Service"

6. **Copy your server URL!** It will look like: `https://fantasy-roguelite-server.onrender.com`

## Part 2: Deploy Client to GitHub Pages

### 1. Enable GitHub Pages
1. Go to your GitHub repository
2. Click "Settings" → "Pages"
3. Under "Build and deployment":
   - Source: "GitHub Actions"

### 2. Add Server URL Secret
1. Go to "Settings" → "Secrets and variables" → "Actions"
2. Click "New repository secret"
3. Add:
   - Name: `VITE_SERVER_URL`
   - Value: `wss://fantasy-roguelite-server.onrender.com` (use WSS not HTTP!)

### 3. Deploy
The GitHub Action will automatically run when you push to main branch.

Or manually trigger it:
1. Go to "Actions" tab
2. Click "Deploy to GitHub Pages"
3. Click "Run workflow"

### 4. Access Your Game
Once deployed, your game will be available at:
```
https://yourusername.github.io/your-repo-name/
```

## Part 3: Update Client to Use Production Server

After deploying the server to Render, you need to update the client to connect to it:

1. **Local `.env` for development** (`client/.env`):
   ```
   VITE_SERVER_URL=ws://localhost:3000
   ```

2. **GitHub Secret for production**:
   - Already set in Part 2, Step 2
   - Uses `wss://your-server.onrender.com`

## Testing Production Deployment

1. Open your game URL: `https://yourusername.github.io/your-repo-name/`
2. Open browser console (F12)
3. Check for "Connected to server" message
4. Test with multiple browser tabs/windows to verify multiplayer

## Troubleshooting

### Client can't connect to server
- **Check server is running**: Visit `https://your-server.onrender.com/health`
- **Check URL format**: Should be `wss://` not `ws://` or `https://`
- **Check CORS**: Server allows all origins by default
- **Render free tier**: Server sleeps after 15 minutes of inactivity. First connection may take 30-60 seconds.

### GitHub Pages shows 404
- Make sure GitHub Pages is enabled
- Check the workflow ran successfully (Actions tab)
- May take a few minutes to propagate

### Build fails on GitHub Actions
- Check Node version matches (should be 18+)
- Make sure `VITE_SERVER_URL` secret is set
- Check build logs in Actions tab

## Free Tier Limitations

### Render Free Tier:
- ✅ 750 hours/month (enough for one app)
- ⚠️ Sleeps after 15 min inactivity
- ⚠️ Cold start takes 30-60 seconds
- ✅ PostgreSQL: 1GB storage, 97 hours/month connections

### GitHub Pages:
- ✅ Unlimited bandwidth (soft limit: 100GB/month)
- ✅ Unlimited builds
- ✅ Custom domain support

## Keeping Server Awake (Optional)

To prevent Render free tier from sleeping:

1. Use a service like [UptimeRobot](https://uptimerobot.com)
2. Ping your health endpoint every 10 minutes:
   - URL: `https://your-server.onrender.com/health`
   - Interval: 10 minutes

**Note**: This uses more free tier hours but keeps the game responsive.

## Next Steps

Once deployed:
1. Test multiplayer with friends
2. Monitor server logs in Render dashboard
3. Set up database migrations for player data
4. Add authentication system
5. Implement proper error tracking

---

**Costs**: Both GitHub Pages and Render free tier = **$0/month** for hobby projects!
