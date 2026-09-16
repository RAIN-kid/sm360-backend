import { Router } from 'express';
import { payInvoice, getSM360Report } from './finance.controller';
import { verifyToken, authorizeRoles } from '../../middlewares/auth.middleware';

const router = Router();

// Njia ya Kulipa (Hii tunaweza kuipa wazi au kwa System Admin)
router.post('/pay', verifyToken, payInvoice);

// Njia ya Super Admin (SM360) Tu! God Mode!
router.get('/sm360-report', verifyToken, authorizeRoles('SUPER_ADMIN'), getSM360Report);

export default router;