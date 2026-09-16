import { Router } from 'express';
import { login, registerOrganizationAndAdmin, seedSuperAdmin, } from './auth.controller';

const router = Router();

router.post('/login', login);
router.post('/register-org', registerOrganizationAndAdmin);
router.post('/seed-admin', seedSuperAdmin);
export default router;