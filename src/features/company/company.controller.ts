import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest } from '../../middlewares/auth.middleware';
import pool from '../../config/db';

/**
 * @route   POST /api/company/trucks
 * @desc    Company Admin anasajili gari lake jipya
 * @access  Protected (COMPANY_ADMIN only)
 */
export const registerTruck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.orgId; // ID ya Kampuni inatoka moja kwa moja kwenye Token
    const { plateNumber, capacityTons, kmPerLiter } = req.body;

    const result = await pool.query(
      `INSERT INTO trucks (organization_id, plate_number, capacity_tons, km_per_liter) 
       VALUES ($1, $2, $3, $4) RETURNING id, plate_number, capacity_tons, km_per_liter`,
      [orgId, plateNumber, capacityTons, kmPerLiter]
    );

    res.status(201).json({ 
      status: 'success', 
      message: 'Gari limesajiliwa kikamilifu kwenye kampuni yako.',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('[COMPANY_TRUCK_ERROR]:', error.message);
    if (error.code === '23505') {
       res.status(409).json({ status: 'error', message: 'Namba ya gari hili tayari imesajiliwa.' });
       return;
    }
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};

/**
 * @route   POST /api/company/drivers
 * @desc    Company Admin anasajili dereva na kumweka chini ya kampuni yake
 * @access  Protected (COMPANY_ADMIN only)
 */
export const registerDriver = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.orgId;
    const adminId = req.user?.userId; // Kujua Admin yupi alimsajili huyu dereva
    const { fullName, phoneNumber, password } = req.body;

    // Ficha neno la siri la dereva
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Ingiza dereva kwenye meza ya users (Cheo chake ni 'DRIVER')
    const result = await pool.query(
      `INSERT INTO users (full_name, phone_number, password_hash, role_id, organization_id, created_by) 
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = 'DRIVER'), $4, $5) 
       RETURNING id, full_name, phone_number`,
      [fullName, phoneNumber, passwordHash, orgId, adminId]
    );

    res.status(201).json({ 
      status: 'success', 
      message: 'Dereva amesajiliwa kikamilifu na tayari kupangiwa ruti.',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('[COMPANY_DRIVER_ERROR]:', error.message);
    if (error.code === '23505') {
       res.status(409).json({ status: 'error', message: 'Namba ya simu ya dereva imeshatumika.' });
       return;
    }
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};

/**
 * @route   GET /api/company/streets/:streetId/points
 * @desc    Fetches waste collection points for a specific street (Filtered for Data Privacy)
 * @access  Protected (COMPANY_ADMIN or DRIVER)
 */
export const getStreetWastePoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.orgId;
    const { streetId } = req.params;

    // Security Check 1: Ensure the company has an active contract with the LGA that owns this street
    const contractCheck = await pool.query(
      `SELECT lc.id 
       FROM lga_contracts lc
       JOIN streets s ON s.lga_id = lc.lga_id
       WHERE lc.company_id = $1 AND s.id = $2 AND lc.status = 'ACTIVE'`,
      [companyId, streetId]
    );

    if (contractCheck.rowCount === 0) {
      res.status(403).json({ 
        status: 'error', 
        message: 'Njia imezuiwa. Kampuni yako haina mkataba na Halmashauri inayomiliki mtaa huu.' 
      });
      return;
    }

    // Security Check 2: Data Minimization. 
    // Fetch ONLY IDs and Coordinates. Using PostGIS ST_X and ST_Y to decode the GEOMETRY Point.
    // Names and Phone Numbers are strictly excluded.
    const result = await pool.query(
      `SELECT id as property_id, 
              property_type, 
              ST_X(location::geometry) as longitude, 
              ST_Y(location::geometry) as latitude 
       FROM properties 
       WHERE street_id = $1`,
      [streetId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Pointi za taka zimepatikana kikamilifu kwa ajili ya ramani.',
      data: result.rows
    });
  } catch (error: any) {
    console.error('[COMPANY_POINTS_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};

/**
 * @route   POST /api/company/routes
 * @desc    Company Admin assigns a truck and driver to a street (Preps for AI Optimization)
 * @access  Protected (COMPANY_ADMIN only)
 */
export const createRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.orgId;
    const { streetId, truckId, driverId } = req.body;

    if (!streetId || !truckId || !driverId) {
      res.status(400).json({ status: 'error', message: 'Tafadhali chagua Mtaa, Gari, na Dereva.' });
      return;
    }

    // Ulinzi: Hakikisha Kampuni ina mkataba na Halmashauri ya huu mtaa
    const contractCheck = await pool.query(
      `SELECT lc.id 
       FROM lga_contracts lc
       JOIN streets s ON s.lga_id = lc.lga_id
       WHERE lc.company_id = $1 AND s.id = $2 AND lc.status = 'ACTIVE'`,
      [companyId, streetId]
    );

    if (contractCheck.rowCount === 0) {
      res.status(403).json({ 
        status: 'error', 
        message: 'Huruhusiwi kupanga ruti kwenye mtaa huu. Huna mkataba na Halmashauri husika.' 
      });
      return;
    }

    // Ingiza Ruti kwenye Database. Status tunaweka 'PENDING_AI' 
    // Ili kusubiri Python Microservice ifanye mahesabu ya umbali na mafuta
    const result = await pool.query(
      `INSERT INTO routes (company_id, driver_id, truck_id, street_id, status) 
       VALUES ($1, $2, $3, $4, 'PENDING_AI') 
       RETURNING id, street_id, status`,
      [companyId, driverId, truckId, streetId]
    );

    res.status(201).json({
      status: 'success',
      message: 'Ruti imetengenezwa kikamilifu. Inasubiri AI kukokotoa umbali na mafuta (Optimization).',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('[COMPANY_ROUTE_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};


/**
 * @route   PUT /api/company/routes/:routeId/complete
 * @desc    Dereva anathibitisha kuwa amemaliza kuzoa taka kwenye mtaa husika
 * @access  Protected (DRIVER or COMPANY_ADMIN)
 */
export const completeRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { routeId } = req.params;

    // Badili status kuwa COMPLETED. 
    // Tunahakikisha ruti inabadilishwa tu kama ilishapangwa na AI (OPTIMIZED)
    const result = await pool.query(
      `UPDATE routes 
       SET status = 'COMPLETED' 
       WHERE id = $1 AND status = 'OPTIMIZED' 
       RETURNING id, street_id, status`,
      [routeId]
    );

    if (result.rowCount === 0) {
      res.status(400).json({ 
        status: 'error', 
        message: 'Imeshindikana. Ruti haijapatikana au bado haijafanyiwa mahesabu na AI.' 
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: 'Kazi imekamilika! Ruti imefungwa kikamilifu.',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('[COMPLETE_ROUTE_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};

