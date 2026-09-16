import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db'; 
import authRoutes from './features/auth/auth.routes';
import lgaRoutes from './features/lga/lga.routes';
import companyRoutes from './features/company/company.routes';
import financeRoutes from './features/finance/finance.routes'; // <-- IMPORT MPYA YA PESA
import superAdminRoutes from './features/super-admin/super-admin.routes';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Essential middlewares
app.use(cors());
app.use(express.json());

// Routes Integration
app.use('/api/auth', authRoutes); 
app.use('/api/lga', lgaRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/finance', financeRoutes); // <-- NJIA MPYA YA MIAMALA IMEWEKWA HAPA
app.use('/api/super-admin', superAdminRoutes);
// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'SM360 Backend is running successfully. 🚀',
  });
});

// Start the server and connect to Database
app.listen(PORT, async () => {
  console.log(`[SERVER] Running on port: ${PORT}`);
  
  // Call the database connection function
  await connectDB(); 
});