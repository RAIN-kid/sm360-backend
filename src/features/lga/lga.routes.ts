import { Router } from 'express';
import { approveCompany, registerProperty, registerAgent, setTariff, generateMonthlyBills, updateProperty, deleteProperty, getDashboardStats } from './lga.controller';
import { verifyToken, authorizeRoles } from '../../middlewares/auth.middleware';

const router = Router();

// Route for LGA Admin to register a field agent
router.post('/agents', verifyToken, authorizeRoles('LGA_ADMIN'), registerAgent);

// Route for LGA Admin to approve and assign a contract to a private waste company
router.post('/approve-company', verifyToken, authorizeRoles('LGA_ADMIN'), approveCompany);

// Route for LGA Admin or Field Agent to register properties with GIS coordinates
router.post('/properties', verifyToken, authorizeRoles('LGA_ADMIN', 'LGA_AGENT'), registerProperty);
// Mkurugenzi anapanga bei za taka
router.post('/tariffs', verifyToken, authorizeRoles('LGA_ADMIN'), setTariff);
// Mkurugenzi anazalisha bili za mwezi (Invoices)
router.post('/generate-bills', verifyToken, authorizeRoles('LGA_ADMIN'), generateMonthlyBills);
// Ku-edit Jengo (Inaruhusu Super Admin na LGA Admin tu)
router.put('/properties/:id', verifyToken, authorizeRoles('SUPER_ADMIN', 'LGA_ADMIN'), updateProperty);
// Kufuta Jengo (Soft Delete)
router.delete('/properties/:id', verifyToken, authorizeRoles('SUPER_ADMIN', 'LGA_ADMIN'), deleteProperty);
// Takwimu za Dashboard ya Halmashauri
router.get('/dashboard', verifyToken, authorizeRoles('LGA_ADMIN'), getDashboardStats);


export default router;