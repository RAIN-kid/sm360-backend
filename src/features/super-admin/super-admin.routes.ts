import { Router } from 'express';
import { 
  getDashboardMetrics, getOrganizations, getOrganizationById,
  addWard, getWards, updateWard, deleteWard,
  addStreet, getStreets, updateStreet, deleteStreet,
  addProperty, getProperties, updateProperty, deleteProperty,
  addAgent, getAgents, updateAgent, deleteAgent,
  addCompany, getCompanies, updateCompany, deleteCompany,
  addTruck, getTrucks, updateTruck, deleteTruck,
  addDriver, getDrivers, updateDriver, deleteDriver,
  getMyProfile, generateMonthlyBills, getInvoices, markInvoiceAsPaid, sendWarningSMS,
  clickpesaWebhook, addCollectionPoint, getCollectionPoints, updateCollectionPoint, 
  addCompanyZone, getCompanyZones, deleteCompanyZone, 
  addRoute, getCompanyRoutes, deleteRoute, getMyAssignedWards,
  addRoutePoint, getRoutePoints, deleteRoutePoint, updateCompanyZone,
  createDailyDispatch, getDailyDispatches, updateRoute, markRouteAsCleared, updateCompanyBank,
  triggerPayout,  getPlatformRevenues
} from './super-admin.controller';
import { registerOrganizationAndAdmin } from '../auth/auth.controller'; 
import { verifyToken, authorizeRoles } from '../../middlewares/auth.middleware';

const router = Router();

// ================= 1. DASHBOARD & PROFILE =================
router.get('/dashboard-metrics', verifyToken, getDashboardMetrics);
router.get('/my-profile', verifyToken, getMyProfile); 

// ================= 2. ORGANIZATIONS (LGA) =================
router.get('/organizations', verifyToken, getOrganizations);
router.post('/organizations', verifyToken, authorizeRoles('SUPER_ADMIN'), registerOrganizationAndAdmin);
router.get('/organizations/:id', verifyToken, getOrganizationById);

// ================= 3. WARDS (KATA) =================
router.post('/wards', verifyToken, addWard);
router.get('/wards', verifyToken, getWards);
router.put('/wards/:id', verifyToken, updateWard);
router.delete('/wards/:id', verifyToken, deleteWard);

// ================= 4. STREETS (MITAA) =================
router.post('/streets', verifyToken, addStreet);
router.get('/streets', verifyToken, getStreets);
router.put('/streets/:id', verifyToken, updateStreet);
router.delete('/streets/:id', verifyToken, deleteStreet);

// ================= 5. PROPERTIES (NYUMBA) =================
router.post('/properties', verifyToken, addProperty); 
router.get('/properties', verifyToken, getProperties);
router.put('/properties/:id', verifyToken, updateProperty);
router.delete('/properties/:id', verifyToken, deleteProperty);

// ================= 6. FIELD AGENTS =================
router.post('/agents', verifyToken, addAgent);
router.get('/agents', verifyToken, getAgents); 
router.put('/agents/:id', verifyToken, updateAgent);
router.delete('/agents/:id', verifyToken, deleteAgent);

// ================= 7. WASTE COMPANIES =================
router.post('/companies', verifyToken, authorizeRoles('SUPER_ADMIN'), addCompany);
router.get('/companies', verifyToken, getCompanies);
router.put('/companies/:id', verifyToken, authorizeRoles('SUPER_ADMIN'), updateCompany);
router.delete('/companies/:id', verifyToken, authorizeRoles('SUPER_ADMIN'), deleteCompany);

// ================= 8. TRUCKS (FLEET) =================
router.post('/trucks', verifyToken, addTruck);
router.get('/trucks', verifyToken, getTrucks);
router.put('/trucks/:id', verifyToken, updateTruck);
router.delete('/trucks/:id', verifyToken, deleteTruck);

// ================= 9. DRIVERS =================
router.post('/drivers', verifyToken, addDriver);
router.get('/drivers', verifyToken, getDrivers);
router.put('/drivers/:id', verifyToken, updateDriver);
router.delete('/drivers/:id', verifyToken, deleteDriver);

// ================= 10. ZONES (LGA CONTRACTS) =================
router.post('/company-zones', verifyToken, addCompanyZone);
router.get('/company-zones', verifyToken, getCompanyZones);
router.delete('/company-zones/:id', verifyToken, deleteCompanyZone);
router.put('/company-zones/:id', verifyToken, updateCompanyZone);

// ================= 11. ROUTES (COMPANY ROUTES) =================
router.post('/routes', verifyToken, addRoute); 
router.get('/routes', verifyToken, getCompanyRoutes); 
router.delete('/routes/:id', verifyToken, deleteRoute); 
router.put('/routes/:id', verifyToken, updateRoute);
router.get('/my-assigned-wards', verifyToken, getMyAssignedWards);
router.put('/routes/:id/clear', verifyToken, markRouteAsCleared);

// ================= 12. COLLECTION POINTS (VITUO) =================
router.post('/collection-points', verifyToken, addCollectionPoint);
router.get('/collection-points', verifyToken, getCollectionPoints);
router.put('/collection-points/:id', verifyToken, updateCollectionPoint);

// ================= 13. ROUTE POINTS (KUPANGA VITUO KWENYE RUTI) =================
router.post('/route-points', verifyToken, addRoutePoint);
router.get('/route-points', verifyToken, getRoutePoints);
router.delete('/route-points/:id', verifyToken, deleteRoutePoint);

// ================= 14. DAILY DISPATCH (KUPANGIA KAZI MAGARI) =================
router.post('/dispatch', verifyToken, createDailyDispatch);
router.get('/dispatch', verifyToken, getDailyDispatches);

// ================= 15. INVOICES & REVENUE =================
router.post('/invoices/generate', verifyToken, generateMonthlyBills);
router.get('/invoices', verifyToken, getInvoices);
router.put('/invoices/pay/:id?', verifyToken, markInvoiceAsPaid);
router.post('/invoices/warning/:id?', verifyToken, sendWarningSMS);

// ================= 16. WEBHOOK (IPOKELEWE NA CLICKPESA) =================
// Haina verifyToken kwa sababu inagongwa na ClickPesa direct
router.post('/webhooks/clickpesa', clickpesaWebhook);
router.put('/organizations/:id/bank', verifyToken, updateCompanyBank);
router.post('/payouts/trigger', verifyToken, triggerPayout);
router.get('/platform-revenues', verifyToken, getPlatformRevenues);

export default router;