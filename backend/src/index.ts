import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { getPrisma } from './db/prisma';
import authRoutes from './routes/auth';
import driversRoutes from './routes/drivers';
import paymentsRoutes from './routes/payments';
import webhooksRoutes from './routes/webhooks';
import qrRoutes from './routes/qr';
import dashboardRoutes from './routes/dashboard';

dotenv.config();

process.on('exit', (code) => {
  console.log(`Process is exiting with code: ${code}`);
});

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:8081', // Expo web
  'http://localhost:19006', // Expo go
  'http://192.168.17.113:8081', // LAN Expo
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// webhook needs raw body for signature verification if real, but for now json is fine
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/auth', authRoutes);
app.use('/drivers', driversRoutes);
app.use('/payments', paymentsRoutes);
app.use('/webhooks', webhooksRoutes);
app.use('/qr', qrRoutes);
app.use('/dashboard', dashboardRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize DB connection then start server
getPrisma().then(() => {
  app.listen(PORT, () => {
    console.log(`PayTaxi backend running on port ${PORT}`);
    // Artificial event loop keep-alive
    setInterval(() => {}, 1000 * 60 * 60);
  });
}).catch((err) => {
  console.error('Failed to connect to database:', err);
  process.exit(1);
});
