import { Router } from 'express';
import { registerTruck, registerDriver, getStreetWastePoints, createRoute, completeRoute } from './company.controller';
import { verifyToken, authorizeRoles } from '../../middlewares/auth.middleware';


const router = Router();

// Zote zinalindwa: Lazima awe ameingia, na lazima awe Admin wa Kampuni
router.post('/trucks', verifyToken, authorizeRoles('COMPANY_ADMIN'), registerTruck);
router.post('/drivers', verifyToken, authorizeRoles('COMPANY_ADMIN'), registerDriver);
// Njia MPYA: Kampuni au Dereva anavuta pointi za ramani (GET Request)
router.get('/streets/:streetId/points', verifyToken, authorizeRoles('COMPANY_ADMIN', 'DRIVER'), getStreetWastePoints);
// Njia MPYA: Admin anapanga Ruti mpya
router.post('/routes', verifyToken, authorizeRoles('COMPANY_ADMIN'), createRoute);
// Dereva anafunga Ruti (Kazi imekamilika)
router.put('/routes/:routeId/complete', verifyToken, authorizeRoles('DRIVER', 'COMPANY_ADMIN'), completeRoute);

export default router;