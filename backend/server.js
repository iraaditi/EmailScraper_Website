require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Crucial for letting React talk to Express
const { google } = require('googleapis');
const Token = require('./models/Token');
const Email = require('./models/Email');

const app = express();

// Middleware
app.use(express.json());
app.use(cors()); 

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB Atlas!'))
  .catch((error) => console.error('Error connecting to MongoDB:', error.message));

// --- GOOGLE OAUTH SETUP ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:5000/auth/callback' // Must match the Cloud Console exactly
);

// --- API ROUTES ---

// 1. Generate the Google Login URL
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Requests a refresh token so you don't have to log in constantly
    prompt: 'consent', // FORCES Google to show the consent screen so we get a NEW refresh token
    scope: ['https://www.googleapis.com/auth/gmail.readonly'] // The exact permission we are asking for
  });
  res.redirect(url); // Send the user to the Google sign-in page
});

// 2. The Callback Route (Where Google sends the tokens)
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query; 
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Check if a token already exists for you
    let existingToken = await Token.findOne({ user: 'rwc.iraaditi@gmail.com' });
    
    if (existingToken) {
      // Update the existing token in the database
      existingToken.access_token = tokens.access_token;
      existingToken.refresh_token = tokens.refresh_token || existingToken.refresh_token; // Keep old refresh token if Google doesn't send a new one
      existingToken.expiry_date = tokens.expiry_date;
      await existingToken.save();
      console.log("Tokens updated in MongoDB!");
    } else {
      // Create a brand new token entry
      const newToken = new Token({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date
      });
      await newToken.save();
      console.log("Tokens securely saved to MongoDB!");
    }

    // Send the user back to the React frontend instead of showing a blank JSON screen
    res.redirect('http://localhost:5173/'); 
    
  } catch (error) {
    console.error('Error saving tokens:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/emails/search', async (req, res) => {
  try {
    const keyword = req.query.q?.toLowerCase(); 
    if (!keyword) return res.status(400).json({ error: "Keyword required" });

    // --- 1. CHECK CACHE FIRST ---
    const cachedEmails = await Email.find({ keyword: keyword });
    let cacheReturned = false;
    if (cachedEmails.length > 0) {
      console.log(`🚀 Found ${keyword} in MongoDB Cache! Returning immediately.`);
      res.json(cachedEmails);
      cacheReturned = true; // Mark that we already sent a response
    }

    // --- 2. ALWAYS FETCH FRESH EMAILS (Even if cache was hit) ---
    // This allows the cache to update in the background for the next time!
    console.log(`🔍 Refreshing cache with new emails from Gmail API for: ${keyword}`);

    // --- 2. IF NOT IN CACHE, ASK GOOGLE ---
    const tokenDoc = await Token.findOne({ user: 'rwc.iraaditi@gmail.com' });
    if (!tokenDoc) {
      if (!cacheReturned) return res.status(401).json({ error: "Please log in" });
      return; // If we already responded with cache, just quietly abort the background refresh
    }

    let credentialsToSet = {
      access_token: tokenDoc.access_token,
      refresh_token: tokenDoc.refresh_token,
      expiry_date: tokenDoc.expiry_date
    };

    // --- PRO MOVE: AUTOMATIC TOKEN REFRESH ---
    // Check if the token is expired (or will expire in the next 5 minutes)
    const isExpired = !tokenDoc.expiry_date || Date.now() > (tokenDoc.expiry_date - 300000);

    if (isExpired && tokenDoc.refresh_token) {
      console.log('🔄 Access token expired. Refreshing automatically using your refresh_token...');
      
      oauth2Client.setCredentials({ refresh_token: tokenDoc.refresh_token });
      
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Update MongoDB with the fresh tokens
        tokenDoc.access_token = credentials.access_token;
        tokenDoc.expiry_date = credentials.expiry_date;
        if (credentials.refresh_token) {
          tokenDoc.refresh_token = credentials.refresh_token; // Sometimes Google sends a new one
        }
        await tokenDoc.save();
        console.log('✅ Token refreshed and saved to MongoDB!');

        // Update the credentials we will use for the API call
        credentialsToSet = {
          access_token: tokenDoc.access_token,
          refresh_token: tokenDoc.refresh_token,
          expiry_date: tokenDoc.expiry_date
        };
      } catch (refreshErr) {
        console.error("Failed to automatically refresh token:", refreshErr.message);
        if (!cacheReturned) return res.status(401).json({ error: "Session expired. Please click 'Connect Gmail' to log in again." });
        return; // If we already responded with cache, quietly abort
      }
    }

    oauth2Client.setCredentials(credentialsToSet);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.list({ userId: 'me', q: keyword, maxResults: 10 });
    const messages = response.data.messages || [];

    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        });
        
        const headers = msgData.data.payload.headers;
        const details = {
          keyword: keyword,
          gmailId: msg.id,
          subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
          from: headers.find(h => h.name === 'From')?.value || 'Unknown',
          date: headers.find(h => h.name === 'Date')?.value,
          snippet: msgData.data.snippet
        };

        // --- 3. SAVE TO MONGODB (UPSERT) ---
        // 'upsert' means update if exists, insert if not
        return await Email.findOneAndUpdate(
          { gmailId: details.gmailId }, 
          details, 
          { upsert: true, new: true }
        );
      })
    );

    // If we didn't use the cache earlier, send the freshly fetched emails now
    if (!cacheReturned) {
      res.json(emailDetails);
    }

  } catch (error) {
    console.error('Error:', error);
    // Only send the 500 status code if we haven't already sent the cache!
    if (!res.headersSent) {
      res.status(500).json({ error: 'Search failed' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});