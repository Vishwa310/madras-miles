import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: '7d',
  },

  strava: {
    clientId: process.env.STRAVA_CLIENT_ID || '159567',
    clientSecret: process.env.STRAVA_CLIENT_SECRET || 'ba7475e523ff37a35c06bf1fb191a9affeed21f9',
    redirectUri: process.env.STRAVA_REDIRECT_URI || 'https://madras-walkathon.web.app/auth/callback',
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};
