import { Request, Response } from 'express';
import pool from '../../config/db';
import bcrypt from 'bcrypt';
import { ClickPesa, WebhookValidator } from 'clickpesa-nodejs-sdk';
import * as dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

const cp = new ClickPesa({
  clientId: process.env.CLICKPESA_CLIENT_ID || 'dummy_client',
  apiKey: process.env.CLICKPESA_API_KEY || 'dummy_key',
  sandbox: false,
});

// ==================== DASHBOARD & ORGANIZATIONS ====================
export const getDashboardMetrics = async (req: Request, res: Response) => {
  try {
    console.log("=== SUPER ADMIN DASHBOARD INAOMBWA ===");

    // 1. Halmashauri (LGA) - ILIKE inasaidia hata kama iliandikwa 'lga', 'Lga' au 'LGA'
    const lgaResult = await pool.query("SELECT COUNT(*) as count FROM organizations WHERE org_type ILIKE 'LGA'");
    const lgasCount = parseInt(lgaResult.rows[0].count || '0');
    console.log(">> LGAs Kwenye DB:", lgasCount);

    // 2. Makampuni Binafsi (PRIVATE)
    const companyResult = await pool.query("SELECT COUNT(*) as count FROM organizations WHERE org_type ILIKE 'PRIVATE'");
    const companiesCount = parseInt(companyResult.rows[0].count || '0');
    console.log(">> Companies Kwenye DB:", companiesCount);

    // 3. Nyumba Zilizosajiliwa (Active Properties)
    const propertiesRes = await pool.query(`SELECT COUNT(*) as count FROM properties`);
    const propertiesCount = parseInt(propertiesRes.rows[0].count || '0');
    console.log(">> Nyumba Kwenye DB:", propertiesCount);

    // 4. Mapato Yetu (10% Platform Fee)
    const revenueRes = await pool.query(`SELECT SUM(sm360_fee) as total_revenue FROM platform_revenues`);
    const totalRevenue = Number(revenueRes.rows[0].total_revenue || 0);
    console.log(">> Mapato Kwenye DB:", totalRevenue);

    // 5. Miamala 5 ya Mwisho (NIMERUDISHA STRICT 'JOIN' KAMA ULIVYOTAKA - HAKUNA MUAMALA HEWA)
    const txQuery = `
      SELECT pr.control_number, pr.sm360_fee, pr.transaction_date, o.name as lga_name
      FROM platform_revenues pr
      JOIN organizations o ON o.id = pr.lga_id
      ORDER BY pr.transaction_date DESC
      LIMIT 5
    `;
    const recentTransactionsRes = await pool.query(txQuery);
    const recentTransactions = recentTransactionsRes.rows;
    console.log(">> Miamala Mwisho:", recentTransactions.length);

    res.status(200).json({ 
      status: 'success', 
      data: { 
        totalRevenue, 
        propertiesCount, 
        companiesCount, 
        lgasCount, 
        recentTransactions 
      } 
    });
  } catch (error: any) { 
    console.error("[DASHBOARD_ERROR]: Backend Imecrash hapa ->", error.message);
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

export const getOrganizations = async (req: Request, res: Response) => {
  try {
    const { type } = req.query; 
    if (!type) return res.status(400).json({ status: 'error', message: 'Aina ya shirika inahitajika.' });
    const query = `SELECT o.id, o.name, MAX(u.full_name) AS admin_name, MAX(u.phone_number) AS admin_phone FROM organizations o LEFT JOIN users u ON u.organization_id = o.id WHERE o.org_type = $1 GROUP BY o.id, o.name ORDER BY o.id DESC`;
    const result = await pool.query(query, [type]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const getOrganizationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = `SELECT o.id, o.name, o.org_type, MAX(u.full_name) AS admin_name, MAX(u.phone_number) AS admin_phone FROM organizations o LEFT JOIN users u ON u.organization_id = o.id WHERE o.id = $1 GROUP BY o.id, o.name, o.org_type`;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Halmashauri haijapatikana.' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};


export const updateCompanyBank = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // ID ya Kampuni
    const { bank_name, bank_account_name, bank_account_number } = req.body;
    
    // HAPA NDIO INA-SAVE AU KU-EDIT DATABASE MOJA KWA MOJA
    const query = `
      UPDATE organizations 
      SET bank_name = $1, bank_account_name = $2, bank_account_number = $3 
      WHERE id = $4 
      RETURNING id, name, bank_name, bank_account_name, bank_account_number
    `;
    const result = await pool.query(query, [bank_name, bank_account_name, bank_account_number, id]);
    
    res.status(200).json({ status: 'success', data: result.rows[0], message: "Bank Details updated" });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ==================== WARDS & STREETS ====================
export const addWard = async (req: Request, res: Response) => {
  try {
    const { name, organization_id } = req.body;
    const result = await pool.query(`INSERT INTO wards (name, organization_id) VALUES ($1, $2) RETURNING *`, [name, organization_id]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const getWards = async (req: Request, res: Response) => {
  try {
    const orgId = req.query.organization_id || req.query.lga_id;
    const result = await pool.query(`SELECT * FROM wards WHERE organization_id = $1 ORDER BY id DESC`, [orgId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const updateWard = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`UPDATE wards SET name = $1 WHERE id = $2 RETURNING *`, [req.body.name, req.params.id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const deleteWard = async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM wards WHERE id = $1 RETURNING *`, [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Imefutwa.' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const addStreet = async (req: Request, res: Response) => {
  try {
    const { name, ward_id, lga_id } = req.body;
    const result = await pool.query(`INSERT INTO streets (name, ward_id, lga_id) VALUES ($1, $2, $3) RETURNING *`, [name, ward_id, lga_id]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const getStreets = async (req: Request, res: Response) => {
  try {
    const lgaId = req.query.lga_id || req.query.organization_id;
    const result = await pool.query(`SELECT s.*, w.name as ward_name FROM streets s JOIN wards w ON s.ward_id = w.id WHERE s.lga_id = $1 ORDER BY s.id DESC`, [lgaId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const updateStreet = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`UPDATE streets SET name = $1, ward_id = $2 WHERE id = $3 RETURNING *`, [req.body.name, req.body.ward_id, req.params.id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const deleteStreet = async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM streets WHERE id = $1`, [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Imefutwa.' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// ==================== PROPERTIES & CLICKPESA ====================
export const addProperty = async (req: Request, res: Response) => {
  try {
    const { lga_id, ward_id, street_id, house_number, owner_name, phone_number, property_category, building_use, total_units, agent_id, collection_point_id, latitude, longitude } = req.body;

    const s_id = (!street_id || street_id === "") ? null : street_id;
    const cp_id = (!collection_point_id || collection_point_id === "") ? null : collection_point_id;
    const property_code = `PROP-${Math.floor(100000 + Math.random() * 900000)}`;
    const initialAmount = property_category === 'Commercial' ? 15000 : 5000;

    let cleanPhone = phone_number.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '255' + cleanPhone.substring(1);
    let control_number = null;

    try {
      if (process.env.CLICKPESA_CLIENT_ID) {
        const cnRes = await cp.billpay.createCustomerControlNumber({
          customerName: owner_name,
          customerPhone: cleanPhone,
          billAmount: initialAmount,
          billDescription: `Ada ya Taka - ${property_category}`,
        });
        control_number = cnRes.billPayNumber;
      }
    } catch (cpError: any) { console.error('[CLICKPESA_ERROR]:', cpError.message); }

    const query = `
      INSERT INTO properties (
        property_code, lga_id, ward_id, street_id, house_number, 
        owner_name, phone_number, property_category, building_use, 
        total_units, agent_id, collection_point_id, latitude, longitude, is_active, control_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, $15) 
      RETURNING *
    `;

    const result = await pool.query(query, [
      property_code, lga_id, ward_id, s_id, house_number || 'N/A',
      owner_name, phone_number, property_category || 'Residential', 
      building_use || 'Single Family', total_units || 1, 
      agent_id || null, cp_id, latitude || null, longitude || null, control_number
    ]);

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getProperties = async (req: Request, res: Response) => {
  try {
    const lgaId = req.query.lga_id || req.query.organization_id;
    const query = `
      SELECT p.*, s.name AS street_name, w.name AS ward_name, u.full_name AS agent_name
      FROM properties p LEFT JOIN streets s ON p.street_id = s.id LEFT JOIN wards w ON p.ward_id = w.id LEFT JOIN users u ON p.agent_id = u.id
      WHERE p.lga_id = $1 ORDER BY p.id DESC
    `;
    const result = await pool.query(query, [lgaId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const updateProperty = async (req: Request, res: Response) => {
  try {
    const { owner_name, phone_number, house_number, property_category, building_use, total_units, street_id, ward_id } = req.body;
    const s_id = (!street_id || street_id === "") ? null : street_id;
    const query = `UPDATE properties SET owner_name=$1, phone_number=$2, house_number=$3, property_category=$4, building_use=$5, total_units=$6, street_id=$7, ward_id=$8 WHERE id = $9 RETURNING *`;
    const result = await pool.query(query, [owner_name, phone_number, house_number, property_category, building_use, total_units, s_id, ward_id, req.params.id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const deleteProperty = async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM properties WHERE id = $1`, [req.params.id]);
    res.status(200).json({ status: 'success' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// ==================== FIELD AGENTS ====================
export const addAgent = async (req: Request, res: Response) => {
  try {
    const { lga_id, street_id, full_name, phone_number, password } = req.body;
    const s_id = (!street_id || street_id === "") ? null : street_id;
    const roleRes = await pool.query("SELECT id FROM roles WHERE name IN ('FIELD_AGENT', 'AGENT') LIMIT 1");
    if (roleRes.rows.length === 0) return res.status(400).json({ status: 'error', message: "Cheo cha FIELD_AGENT hakipo." });
    
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    const result = await pool.query(`INSERT INTO users (full_name, phone_number, password_hash, role_id, organization_id, street_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, full_name`, [full_name, phone_number, password_hash, roleRes.rows[0].id, lga_id, s_id]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const getAgents = async (req: Request, res: Response) => {
  try {
    const query = `SELECT u.id, u.full_name, u.phone_number, s.name as street_name, w.name as ward_name, s.ward_id, u.street_id FROM users u LEFT JOIN streets s ON u.street_id = s.id LEFT JOIN wards w ON s.ward_id = w.id JOIN roles r ON u.role_id = r.id WHERE u.organization_id = $1 AND r.name IN ('FIELD_AGENT', 'AGENT') ORDER BY u.id DESC`;
    const result = await pool.query(query, [req.query.lga_id || req.query.organization_id]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const updateAgent = async (req: Request, res: Response) => {
  try {
    const s_id = (!req.body.street_id || req.body.street_id === "") ? null : req.body.street_id;
    const result = await pool.query(`UPDATE users SET full_name = $1, phone_number = $2, street_id = $3 WHERE id = $4 RETURNING id`, [req.body.full_name, req.body.phone_number, s_id, req.params.id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};
export const deleteAgent = async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.status(200).json({ status: 'success' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const getMyProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId; 
    const query = `SELECT u.id, u.full_name, u.phone_number, u.organization_id AS lga_id, u.street_id, s.ward_id, w.name AS ward_name, s.name AS street_name, o.name AS lga_name FROM users u LEFT JOIN streets s ON u.street_id = s.id LEFT JOIN wards w ON s.ward_id = w.id LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.id = $1`;
    const result = await pool.query(query, [userId]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// ==================== COMPANIES & TRUCKS & DRIVERS ====================
export const addCompany = async (req: Request, res: Response) => {
  try {
    const { name, email, phone_number, lga_id } = req.body;
    if (!name || !email || !phone_number) return res.status(400).json({ status: 'error', message: 'Tafadhali jaza jina, email, na namba ya simu.' });

    const query = `INSERT INTO organizations (name, org_type) VALUES ($1, 'PRIVATE') RETURNING id, name, org_type`;
    const result = await pool.query(query, [name]);
    const newCompanyId = result.rows[0].id;

    const roleQuery = `SELECT id FROM roles WHERE name = 'COMPANY_ADMIN' LIMIT 1`;
    const roleResult = await pool.query(roleQuery);
    if(roleResult.rows.length === 0) return res.status(400).json({ status: 'error', message: 'Cheo cha COMPANY_ADMIN hakipo kwenye database.' });
    
    const role_id = roleResult.rows[0].id;
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash('123456', salt); 
    const userQuery = `INSERT INTO users (full_name, phone_number, password_hash, role_id, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    await pool.query(userQuery, [name + " Admin", phone_number, password_hash, role_id, newCompanyId]);

    res.status(201).json({ status: 'success', data: result.rows[0], message: 'Kampuni imesajiliwa kikamilifu.' });
  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ status: 'error', message: 'Namba hii ya simu inatumiwa na akaunti nyingine.' });
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getCompanies = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT o.id, o.name, true AS is_active,
             MAX(u.phone_number) AS contact_phone,
             (SELECT COUNT(*) FROM trucks t WHERE t.organization_id = o.id) AS trucks_count
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id AND u.role_id = (SELECT id FROM roles WHERE name = 'COMPANY_ADMIN' LIMIT 1)
      WHERE o.org_type = 'PRIVATE'
      GROUP BY o.id, o.name
      ORDER BY o.id DESC
    `;
    const result = await pool.query(query);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const updateCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body; 
    const query = `UPDATE organizations SET name = $1 WHERE id = $2 RETURNING id, name`;
    const result = await pool.query(query, [name, id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const deleteCompany = async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Kampuni imefutwa kikamilifu.' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const addTruck = async (req: Request, res: Response) => {
  try {
    const { organization_id, plate_number, capacity } = req.body;
    const query = `INSERT INTO trucks (organization_id, plate_number, capacity, status) VALUES ($1, $2, $3, 'Active') RETURNING *`;
    const result = await pool.query(query, [organization_id, plate_number, capacity]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const getTrucks = async (req: Request, res: Response) => {
  try {
    const orgId = req.query.organization_id || req.query.company_id;
    const result = await pool.query(`SELECT * FROM trucks WHERE organization_id = $1 ORDER BY id DESC`, [orgId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const updateTruck = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { plate_number, capacity, status } = req.body; 
    const query = `UPDATE trucks SET plate_number = $1, capacity = $2, status = $3 WHERE id = $4 RETURNING *`;
    const result = await pool.query(query, [plate_number, capacity, status || 'Active', id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const deleteTruck = async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM trucks WHERE id = $1`, [req.params.id]);
    res.status(200).json({ status: 'success' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const addDriver = async (req: Request, res: Response) => {
  try {
    const { organization_id, full_name, phone_number, password, truck_id } = req.body;
    const roleRes = await pool.query("SELECT id FROM roles WHERE name IN ('DRIVER', 'COMPANY_DRIVER') LIMIT 1");
    if (roleRes.rows.length === 0) return res.status(400).json({ status: 'error', message: 'Cheo cha DRIVER hakipo kwenye database.' });
    
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    const userQuery = `INSERT INTO users (full_name, phone_number, password_hash, role_id, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    const userResult = await pool.query(userQuery, [full_name, phone_number, password_hash, roleRes.rows[0].id, organization_id]);
    
    if (truck_id) {
      await pool.query(`UPDATE trucks SET driver_id = $1 WHERE id = $2`, [userResult.rows[0].id, truck_id]);
    }
    res.status(201).json({ status: 'success' });
  } catch (error: any) { 
    if (error.code === '23505') return res.status(400).json({ status: 'error', message: 'Namba ya simu imeshatumika kusajili mtu mwingine.' });
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

export const getDrivers = async (req: Request, res: Response) => {
  try {
    const orgId = req.query.organization_id || req.query.company_id;
    const query = `
      SELECT u.id, u.full_name, u.phone_number, t.plate_number, t.id as truck_id 
      FROM users u 
      LEFT JOIN trucks t ON t.driver_id = u.id 
      JOIN roles r ON u.role_id = r.id
      WHERE u.organization_id = $1 AND r.name IN ('DRIVER', 'COMPANY_DRIVER') 
      ORDER BY u.id DESC
    `;
    const result = await pool.query(query, [orgId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const updateDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { full_name, phone_number, truck_id } = req.body;
    await pool.query(`UPDATE users SET full_name = $1, phone_number = $2 WHERE id = $3`, [full_name, phone_number, id]);
    await pool.query(`UPDATE trucks SET driver_id = NULL WHERE driver_id = $1`, [id]);
    if (truck_id) {
      await pool.query(`UPDATE trucks SET driver_id = $1 WHERE id = $2`, [id, truck_id]);
    }
    res.status(200).json({ status: 'success', message: 'Taarifa za dereva zimesasishwa.' });
  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ status: 'error', message: 'Namba hii ya simu inatumiwa na mtu mwingine.' });
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const deleteDriver = async (req: Request, res: Response) => {
  try {
    await pool.query(`UPDATE trucks SET driver_id = NULL WHERE driver_id = $1`, [req.params.id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.status(200).json({ status: 'success' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// ==================== COLLECTION POINTS ====================
export const addCollectionPoint = async (req: Request, res: Response) => {
  try {
    const { ward_id, name, latitude, longitude } = req.body;
    if (!name || !latitude || !longitude) return res.status(400).json({ status: 'error', message: 'Jina na Location (GPS) zinahitajika.' });
    const query = `INSERT INTO collection_points (ward_id, name, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *`;
    const result = await pool.query(query, [ward_id, name, latitude, longitude]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const getCollectionPoints = async (req: Request, res: Response) => {
  try {
    const { ward_id } = req.query;
    let query = `SELECT * FROM collection_points ORDER BY id DESC`;
    let params: any[] = [];
    if (ward_id) {
      query = `SELECT * FROM collection_points WHERE ward_id = $1 ORDER BY id DESC`;
      params = [ward_id];
    }
    const result = await pool.query(query, params);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const updateCollectionPoint = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, latitude, longitude } = req.body;
    const query = `UPDATE collection_points SET name = $1, latitude = $2, longitude = $3 WHERE id = $4 RETURNING *`;
    const result = await pool.query(query, [name, latitude, longitude, id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// ==================== ZONES (KAZI YA LGA) ====================
export const addCompanyZone = async (req: Request, res: Response) => {
  try {
    const { company_id, ward_id, agreed_amount } = req.body;
    // Tumeongeza agreed_amount hapa
    const query = `INSERT INTO company_zones (company_id, ward_id, agreed_amount) VALUES ($1, $2, $3) RETURNING *`;
    const result = await pool.query(query, [company_id, ward_id, agreed_amount || 0]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { 
    if (error.code === '23505') return res.status(400).json({ status: 'error', message: 'Kampuni hii tayari imepewa Kata hii.' });
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

export const getCompanyZones = async (req: Request, res: Response) => {
  try {
    const lgaId = req.query.lga_id || req.query.organization_id; 
    const query = `
      SELECT cz.id, cz.company_id, cz.ward_id, cz.agreed_amount, c.name as company_name, w.name as ward_name
      FROM company_zones cz
      JOIN organizations c ON c.id = cz.company_id
      JOIN wards w ON w.id = cz.ward_id
      WHERE w.organization_id = $1 
      ORDER BY cz.id DESC
    `;
    const result = await pool.query(query, [lgaId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { 
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

export const updateCompanyZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { company_id, ward_id, agreed_amount } = req.body;
    const query = `UPDATE company_zones SET company_id = $1, ward_id = $2, agreed_amount = $3 WHERE id = $4 RETURNING *`;
    const result = await pool.query(query, [company_id, ward_id, agreed_amount, id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const deleteCompanyZone = async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM company_zones WHERE id = $1`, [req.params.id]);
    res.status(200).json({ status: 'success' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// ==================== ROUTES & ROUTE POINTS ====================
export const addRoute = async (req: Request, res: Response) => {
  try {
    const { company_id, ward_id, name, truck_id, driver_id, collection_day } = req.body;
    
    const query = `
      INSERT INTO routes (company_id, ward_id, name, truck_id, driver_id, collection_day) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `;
    const result = await pool.query(query, [company_id, ward_id, name, truck_id || null, driver_id || null, collection_day || 'Any']);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { 
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

// HAPA NDIO NIMESAHIHISHA!
// SASA INAVUTA 'last_cleared_date' VIZURI!
export const getCompanyRoutes = async (req: Request, res: Response) => {
  try {
    // TUNAANGALIA KAMA NI COMPANY AU SUPER-ADMIN
    // Endpoints zote zipo humu.
    const filterId = req.query.company_id || req.query.organization_id;
    let query = `
      SELECT r.id, r.company_id, r.ward_id, r.name, r.truck_id, r.driver_id, r.collection_day, r.last_cleared_date, w.name as ward_name 
      FROM routes r 
      JOIN wards w ON w.id = r.ward_id 
    `;
    let params: any[] = [];
    
    // Kama filterId ipo, inamaanisha tunavuta za kampuni moja au organization moja.
    if (filterId) {
       // Super Admin ana lga_id au organization_id. Company ana company_id. 
       // Lakini wote wanatumia column ileile 'company_id' kwenye table 'routes'.
       query += ` WHERE r.company_id = $1 ORDER BY r.id DESC`;
       params = [filterId];
    } else {
       query += ` ORDER BY r.id DESC`;
    }
    
    const result = await pool.query(query, params);
    
    // Ili tuone kwenye Console ya Node.js kama date inakuja
    console.log("ROUTES FETCHED: ", result.rows.length); 

    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const updateRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ward_id, name, truck_id, driver_id, collection_day } = req.body;
    const query = `UPDATE routes SET ward_id=$1, name=$2, truck_id=$3, driver_id=$4, collection_day=$5 WHERE id=$6 RETURNING *`;
    const result = await pool.query(query, [ward_id, name, truck_id || null, driver_id || null, collection_day || 'Any', id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { 
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

// HAPA NDIO NIMESAHIHISHA KUWEKA CURRENT_DATE KUEPUKA MIGONGANO YA TIMEZONES.
export const markRouteAsCleared = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // HATUMII STRING TENA. TUNAIAMBIA POSTGRESQL IWEKE TAREHE YAKE (CURRENT_DATE)
    const query = `UPDATE routes SET last_cleared_date = CURRENT_DATE WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [id]);
    
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { 
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

export const deleteRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM routes WHERE id = $1`, [id]);
    res.status(200).json({ status: 'success' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const getMyAssignedWards = async (req: Request, res: Response) => {
  try {
    const companyId = req.query.company_id || req.query.organization_id;
    const query = `
      SELECT cz.ward_id as id, w.name 
      FROM company_zones cz
      JOIN wards w ON w.id = cz.ward_id
      WHERE cz.company_id = $1
    `;
    const result = await pool.query(query, [companyId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// HIZI NDIO MPYA KWA AJILI YA KUONGEZA VITUO KWENYE RUTI (ROUTE POINTS)
export const addRoutePoint = async (req: Request, res: Response) => {
  try {
    const { route_id, collection_point_id, stop_order } = req.body;
    const query = `INSERT INTO route_points (route_id, collection_point_id, stop_order) VALUES ($1, $2, $3) RETURNING *`;
    const result = await pool.query(query, [route_id, collection_point_id, stop_order || 1]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ status: 'error', message: 'Kituo hiki kimeshaongezwa kwenye ruti hii.' });
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getRoutePoints = async (req: Request, res: Response) => {
  try {
    const { route_id } = req.query;
    const query = `
      SELECT rp.id as route_point_id, rp.stop_order, cp.* 
      FROM route_points rp
      JOIN collection_points cp ON rp.collection_point_id = cp.id
      WHERE rp.route_id = $1
      ORDER BY rp.stop_order ASC
    `;
    const result = await pool.query(query, [route_id]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const deleteRoutePoint = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; 
    await pool.query(`DELETE FROM route_points WHERE id = $1`, [id]);
    res.status(200).json({ status: 'success' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

// ==================== DAILY DISPATCH (KUPANGA KAZI YA LEO) ====================
export const createDailyDispatch = async (req: Request, res: Response) => {
  try {
    const { company_id, route_id, truck_id, driver_id, dispatch_date, estimated_fuel_liters } = req.body;
    const query = `
      INSERT INTO daily_dispatch (company_id, route_id, truck_id, driver_id, dispatch_date, estimated_fuel_liters, status) 
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending') RETURNING *
    `;
    const result = await pool.query(query, [company_id, route_id, truck_id, driver_id, dispatch_date, estimated_fuel_liters || 0]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const getDailyDispatches = async (req: Request, res: Response) => {
  try {
    const company_id = req.query.company_id || req.query.organization_id;
    const query = `
      SELECT dd.*, r.name as route_name, t.plate_number, u.full_name as driver_name, w.name as ward_name
      FROM daily_dispatch dd
      JOIN routes r ON dd.route_id = r.id
      LEFT JOIN trucks t ON dd.truck_id = t.id
      LEFT JOIN users u ON dd.driver_id = u.id
      JOIN wards w ON r.ward_id = w.id
      WHERE dd.company_id = $1
      ORDER BY dd.dispatch_date DESC, dd.id DESC
    `;
    const result = await pool.query(query, [company_id]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};


// ==================== INVOICES, SMS & WEBHOOKS ====================
export const generateMonthlyBills = async (req: Request, res: Response) => {
  try {
    const { lga_id } = req.body;
    const date = new Date();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonth = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;

    const props = await pool.query(`SELECT id, property_category, control_number FROM properties WHERE lga_id = $1`, [lga_id]);
    let generatedCount = 0;

    for (const prop of props.rows) {
      const checkInvoice = await pool.query(`SELECT id FROM invoices WHERE property_id = $1 AND billing_month = $2`, [prop.id, currentMonth]);
      if (checkInvoice.rows.length === 0) {
        const amount = prop.property_category === 'Commercial' ? 15000 : 5000;
        const invoice_no = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

        await pool.query(
          `INSERT INTO invoices (invoice_no, property_id, lga_id, amount, billing_month) VALUES ($1, $2, $3, $4, $5)`,
          [invoice_no, prop.id, lga_id, amount, currentMonth]
        );
        generatedCount++;

        if (prop.control_number && process.env.CLICKPESA_CLIENT_ID) {
          const unpaidRes = await pool.query(`SELECT SUM(amount) as total_debt FROM invoices WHERE property_id = $1 AND status = 'Pending'`, [prop.id]);
          const totalDebt = unpaidRes.rows[0].total_debt || amount;
          try {
            await cp.billpay.updateReference(prop.control_number, { amount: Number(totalDebt), description: `Ada ya Taka` });
          } catch (err) {}
        }
      }
    }
    res.status(200).json({ status: 'success', message: `Ankara ${generatedCount} zimetengenezwa.` });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const lgaId = req.query.lga_id || req.query.organization_id;
    const query = `
      SELECT i.*, p.owner_name, p.property_code, p.control_number, p.phone_number, w.name as ward_name 
      FROM invoices i JOIN properties p ON i.property_id = p.id LEFT JOIN wards w ON p.ward_id = w.id 
      WHERE i.lga_id = $1 ORDER BY i.id DESC
    `;
    const result = await pool.query(query, [lgaId]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const markInvoiceAsPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; const { invoice_ids } = req.body; 
    if (invoice_ids && Array.isArray(invoice_ids)) {
      await pool.query(`UPDATE invoices SET status = 'Paid' WHERE id = ANY($1::int[])`, [invoice_ids]);
      return res.status(200).json({ status: 'success' });
    } else if (id) {
      await pool.query(`UPDATE invoices SET status = 'Paid' WHERE id = $1`, [id]);
      return res.status(200).json({ status: 'success' });
    }
    res.status(400).json({ status: 'error', message: 'ID inahitajika.' });
  } catch (error: any) { res.status(500).json({ status: 'error', message: error.message }); }
};

export const sendWarningSMS = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; 
    const { lga_id, bulk } = req.body; 

    const smsToken = process.env.NEXTSMS_TOKEN;
    const senderId = process.env.NEXTSMS_SENDER_ID || 'TANZANIATIP';

    if (!smsToken) return res.status(400).json({ status: 'error', message: 'Token ya NextSMS haipo kwenye .env faili.' });

    const headers = { 'Authorization': `Bearer ${smsToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

    if (bulk && lga_id) {
      const defaulters = await pool.query(`
        SELECT i.amount, p.phone_number, p.owner_name, p.control_number 
        FROM invoices i JOIN properties p ON i.property_id = p.id 
        WHERE i.status = 'Pending' AND i.lga_id = $1
      `, [lga_id]);

      if (defaulters.rows.length === 0) return res.status(400).json({ status: 'error', message: 'Hakuna wadaiwa wa kutumiwa SMS.' });

      const messages = defaulters.rows.map((d: any) => {
        let phone = d.phone_number.replace(/\D/g, '');
        if (phone.startsWith('0')) phone = '255' + phone.substring(1);
        return {
          from: senderId, to: phone,
          text: `Ndugu ${d.owner_name}, unakumbushwa kulipia ankara ya taka ya TZS ${d.amount}. Namba ya Malipo: ${d.control_number || 'N/A'}. Tafadhali lipia kuepuka faini.`
        };
      });

      try {
        await axios.post('https://messaging-service.co.tz/api/sms/v2/text/multi', { messages }, { headers });
        return res.status(200).json({ status: 'success', message: `SMS za onyo zimetumwa kikamilifu.` });
      } catch (err: any) {
        return res.status(400).json({ status: 'error', message: `NextSMS wamekataa (Bulk): ${err.message}` });
      }

    } else if (id) {
      const defaulter = await pool.query(`
        SELECT i.amount, p.phone_number, p.owner_name, p.control_number 
        FROM invoices i JOIN properties p ON i.property_id = p.id 
        WHERE i.id = $1
      `, [id]);

      if (defaulter.rows.length > 0) {
        const d = defaulter.rows[0];
        let phone = d.phone_number.replace(/\D/g, '');
        if (phone.startsWith('0')) phone = '255' + phone.substring(1);

        try {
          await axios.post('https://messaging-service.co.tz/api/sms/v2/text/single', {
            from: senderId, to: phone,
            text: `Ndugu ${d.owner_name}, ankara yako ya taka ya TZS ${d.amount} haijalipwa. Namba yako ya Malipo: ${d.control_number || 'N/A'}. Tafadhali lipia mapema.`
          }, { headers });
          return res.status(200).json({ status: 'success', message: `SMS ya onyo imetumwa kikamilifu.` });
        } catch (err: any) {
          return res.status(400).json({ status: 'error', message: `NextSMS wamekataa (Single): ${err.message}` });
        }
      }
      return res.status(404).json({ status: 'error', message: 'Mdaiwa hajapatikana kwenye database.' });
    }

    res.status(400).json({ status: 'error', message: 'Taarifa hazijakamilika.' });
  } catch (error: any) { 
    res.status(500).json({ status: 'error', message: error.message }); 
  }
};

export const triggerPayout = async (req: Request, res: Response) => {
  try {
    const { company_id, amount } = req.body;
    
    // Vuta lga_id kutoka kwa mtu aliyelogin (Token)
    // Hakikisha jina la variable linaendana na jinsi mlivyo-set JWT yenu
    const lgaId = (req as any).user?.organization_id || (req as any).user?.lga_id || (req as any).user?.id; 
    
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    // 1. Vuta taarifa za Benki za Kampuni kutoka Database
    const companyRes = await pool.query(`SELECT * FROM organizations WHERE id = $1`, [company_id]);
    const company = companyRes.rows[0];

    if (!company || !company.bank_account_number) {
      return res.status(400).json({ status: 'error', message: 'Kampuni haina Namba ya Benki iliyosajiliwa.' });
    }

    // Tengeneza Namba ya Utambulisho wa Muamala wetu
    const reference = `PAY-${Math.floor(100000 + Math.random() * 900000)}`;

    // 2. AMURU CLICKPESA KUTUMA PESA (DISBURSEMENT SDK)
    try {
      // Kumbuka: Format ya 'payouts' au 'disbursements' inategemea SDK.
      // ClickPesa mara nyingi inatumia format hii kwa Bank Transfers
      await (cp.payouts as any).create({
        amount: Number(amount),
        currency: 'TZS',
        reference: reference,
        description: `Malipo ya Mkataba - ${currentMonth}`,
        destination: {
          type: 'BANK_ACCOUNT',
          bankAccountName: company.bank_account_name,
          bankAccountNumber: company.bank_account_number,
          bankName: company.bank_name
        }
      });
    } catch (cpError: any) {
      console.error('[CLICKPESA DISBURSEMENT ERROR]:', cpError.response?.data || cpError.message);
      return res.status(500).json({ status: 'error', message: 'ClickPesa imekataa muamala, angalia Salio au Taarifa za Benki.' });
    }

    // 3. SAVE KWENYE DATABASE YAKUONESHA MALIPO YANAENDELEA (PROCESSING)
    // Webhook yetu tuliyoitengeneza ndiyo itakuja kubadili kuwa 'Paid'
    const insertQuery = `
      INSERT INTO payouts (company_id, lga_id, amount, billing_month, status, clickpesa_reference) 
      VALUES ($1, $2, $3, $4, 'Processing', $5) 
      RETURNING *
    `;
    const payoutResult = await pool.query(insertQuery, [company_id, lgaId, amount, currentMonth, reference]);

    res.status(200).json({ 
      status: 'success', 
      message: 'Malipo yameidhinishwa na yanachakatwa (Processing).',
      data: payoutResult.rows[0] 
    });

  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

export const clickpesaWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-clickpesa-signature'] as string;
    const checksumKey = process.env.CLICKPESA_CHECKSUM_KEY;

    if (checksumKey) {
      const isValid = WebhookValidator.verify({ payload, signature, checksumKey });
      if (!isValid) return res.status(401).json({ error: 'Invalid signature' });
    }

    // ==========================================
    // 1. PESA INAYOINGIA (WANANCHI KULIPA BILI)
    // ==========================================
    // ==========================================
    // 1. PESA INAYOINGIA (WANANCHI KULIPA BILI)
    // ==========================================
    if (payload.event === "PAYMENT RECEIVED" && payload.data.status === "SUCCESS") {
      const amountPaid = Number(payload.data.collectedAmount);
      const controlNumber = payload.data.orderReference || payload.data.paymentReference; 

      // 1. Tafuta nani amelipa (Property & LGA)
      const propertyRes = await pool.query(`SELECT id, phone_number, owner_name, organization_id FROM properties WHERE control_number = $1`, [controlNumber]);
      
      if (propertyRes.rows.length > 0) {
        const prop = propertyRes.rows[0];
        const lgaId = prop.organization_id; // LGA anayemiliki hili eneo

        // 2. KATA ASILIMIA 10 YETU (SM360)
        const sm360Fee = amountPaid * 0.10;
        const lgaAmount = amountPaid - sm360Fee;

        // 3. Save Kwenye Table ya Mapato Yetu (Platform Revenues)
        await pool.query(
          `INSERT INTO platform_revenues (lga_id, control_number, total_collected, sm360_fee, lga_amount) VALUES ($1, $2, $3, $4, $5)`,
          [lgaId, controlNumber, amountPaid, sm360Fee, lgaAmount]
        );

        // 4. Update Invoices kama kawaida
        const invoicesRes = await pool.query(`SELECT id, amount FROM invoices WHERE property_id = $1 AND status = 'Pending' ORDER BY id ASC`, [prop.id]);
        let remainingAmount = amountPaid;

        for (const invoice of invoicesRes.rows) {
          if (remainingAmount <= 0) break;
          if (remainingAmount >= Number(invoice.amount)) {
            await pool.query(`UPDATE invoices SET status = 'Paid' WHERE id = $1`, [invoice.id]);
            remainingAmount -= Number(invoice.amount);
          } else { break; }
        }

        // 5. Tuma SMS ya Pongezi kama kawaida
        const smsToken = process.env.NEXTSMS_TOKEN;
        const senderId = process.env.NEXTSMS_SENDER_ID || 'TANZANIATIP';
        
        if (smsToken) {
          let phone = prop.phone_number.replace(/\D/g, '');
          if (phone.startsWith('0')) phone = '255' + phone.substring(1);

          try {
            await axios.post('https://messaging-service.co.tz/api/sms/v2/text/single', {
              from: senderId, to: phone,
              text: `Asante ${prop.owner_name}. Tumepokea malipo yako ya TZS ${amountPaid} kwa ajili ya ankara ya taka. Mfumo wa SM360 inakujali!`
            }, {
              headers: { 'Authorization': `Bearer ${smsToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
            });
          } catch (smsErr: any) { console.log("SMS Error:", smsErr.message); }
        }
      }
    }
    // ==========================================
    // 2. PESA INAYOTOKA (PAYOUT KWA MAKAMPUNI)
    // ==========================================
    else if (payload.event === "PAYOUT INITIATED" || payload.event === "PAYOUT SUCCESSFUL") {
      const amountPaidOut = payload.data.amount;
      const transactionId = payload.data.transactionId || payload.data.receiptNumber;
      const payoutReference = payload.data.reference; // Hii ndio namba ya utambulisho wa Payout yetu

      // Hapa tuta-update Database yetu ya Payouts kuiambia malipo yamekamilika
      // Mfano: UPDATE company_payouts SET status = 'Completed', transaction_id = $1 WHERE reference = $2
      console.log(`[CLICKPESA PAYOUT]: Malipo ya TZS ${amountPaidOut} yamekamilika. Ref: ${payoutReference}, Muamala: ${transactionId}`);
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    res.status(500).json({ received: false, error: error.message });
  }
};


export const getPlatformRevenues = async (req: Request, res: Response) => {
  try {
    // Tunavuta data zote za mapato na kuunganisha (JOIN) na jina la LGA husika
    const query = `
      SELECT pr.*, o.name as lga_name 
      FROM platform_revenues pr 
      JOIN organizations o ON o.id = pr.lga_id 
      ORDER BY pr.transaction_date DESC
    `;
    
    const result = await pool.query(query);
    
    res.status(200).json({ 
      status: 'success', 
      data: result.rows 
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};