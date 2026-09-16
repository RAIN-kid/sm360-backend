import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest } from '../../middlewares/auth.middleware';
import pool from '../../config/db';

/**
 * @route   POST /api/lga/approve-company
 * @desc    Approves a private waste company to operate within the LGA jurisdiction
 * @access  Protected (LGA_ADMIN only)
 */
export const approveCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Extract the LGA ID from the authenticated user's token
    const lgaId = req.user?.orgId; 
    const { companyId } = req.body;

    // Validate required fields
    if (!companyId) {
      res.status(400).json({ status: 'error', message: 'Tafadhali weka ID ya kampuni (companyId).' });
      return;
    }

    // Security Check: Ensure the target company exists and is a PRIVATE entity
    const companyCheck = await pool.query(
      `SELECT org_type FROM organizations WHERE id = $1`, 
      [companyId]
    );

    if (companyCheck.rowCount === 0 || companyCheck.rows[0].org_type !== 'PRIVATE') {
      res.status(400).json({ status: 'error', message: 'Kampuni haipo au siyo kampuni binafsi ya taka.' });
      return;
    }

    // Insert the junction record to establish the contract
    await pool.query(
      `INSERT INTO lga_contracts (lga_id, company_id) VALUES ($1, $2)`,
      [lgaId, companyId]
    );

    res.status(201).json({ 
      status: 'success', 
      message: 'Mkataba umesainiwa na kampuni imeidhinishwa kikamilifu.' 
    });

  } catch (error: any) {
    console.error('[LGA_CONTRACT_ERROR]:', error.message);
    
    // Handle unique constraint violation (Preventing duplicate contracts)
    if (error.code === '23505') {
       res.status(409).json({ status: 'error', message: 'Kampuni hii tayari ina mkataba unaofanya kazi na Halmashauri yako.' });
       return;
    }

    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};

/**
 * @route   POST /api/lga/properties
 * @desc    Registers a new property with its GIS coordinates for waste collection
 * @access  Protected (LGA_ADMIN or LGA_AGENT)
 */
export const registerProperty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Extract the LGA ID (Works for both Admin and Agent tokens)
    const lgaId = req.user?.orgId; 
    const { streetId, ownerName, phoneNumber, propertyType, totalRooms, longitude, latitude } = req.body;

    // Validate essential property data and coordinates
    if (!ownerName || !phoneNumber || !longitude || !latitude) {
      res.status(400).json({ status: 'error', message: 'Tafadhali jaza Jina, Simu, Longitude na Latitude.' });
      return;
    }

    // Insert property details and convert Long/Lat to PostGIS GEOMETRY Point
    const result = await pool.query(
      `INSERT INTO properties (lga_id, street_id, owner_name, phone_number, property_type, total_rooms, location) 
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)) 
       RETURNING id, owner_name, property_type`,
      [lgaId, streetId, ownerName, phoneNumber, propertyType, totalRooms || 1, longitude, latitude]
    );

    res.status(201).json({ 
      status: 'success', 
      message: 'Jengo amesajiliwa kikamilifu na kuingizwa kwenye Ramani.',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('[LGA_PROPERTY_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu imetokea wakati wa kusajili jengo.' });
  }
};

/**
 * @route   POST /api/lga/agents
 * @desc    Registers a field agent responsible for property mapping and registration
 * @access  Protected (LGA_ADMIN only)
 */
export const registerAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lgaId = req.user?.orgId; 
    const adminId = req.user?.userId; 
    const { fullName, phoneNumber, password } = req.body;

    // Validate agent credentials
    if (!fullName || !phoneNumber || !password) {
      res.status(400).json({ status: 'error', message: 'Tafadhali jaza majina, namba ya simu, na neno la siri.' });
      return;
    }

    // Hash the agent's password securely
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert the agent with the 'LGA_AGENT' role
    const result = await pool.query(
      `INSERT INTO users (full_name, phone_number, password_hash, role_id, organization_id, created_by) 
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = 'LGA_AGENT'), $4, $5) 
       RETURNING id, full_name, phone_number`,
      [fullName, phoneNumber, passwordHash, lgaId, adminId]
    );

    res.status(201).json({ 
      status: 'success', 
      message: 'Wakala amesajiliwa kikamilifu na yupo tayari kwa kazi.',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('[LGA_AGENT_ERROR]:', error.message);
    
    // Handle unique constraint violation for phone numbers
    if (error.code === '23505') {
       res.status(409).json({ status: 'error', message: 'Namba ya simu hii imeshatumika.' });
       return;
    }
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};


/**
 * @route   POST /api/lga/tariffs
 * @desc    LGA Admin anapanga bei ya taka kwa mwezi kulingana na aina ya jengo
 * @access  Protected (LGA_ADMIN only)
 */
export const setTariff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lgaId = req.user?.orgId;
    const { propertyType, monthlyFee } = req.body;

    if (!propertyType || !monthlyFee) {
      res.status(400).json({ status: 'error', message: 'Tafadhali weka aina ya jengo na kiasi cha malipo (monthlyFee).' });
      return;
    }

    // Ingiza au sasisha (Update) kama bei ilishakuwepo (Upsert logic)
    const result = await pool.query(
      `INSERT INTO lga_tariffs (lga_id, property_type, monthly_fee) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (lga_id, property_type) 
       DO UPDATE SET monthly_fee = EXCLUDED.monthly_fee 
       RETURNING id, property_type, monthly_fee`,
      [lgaId, propertyType, monthlyFee]
    );

    res.status(200).json({ 
      status: 'success', 
      message: 'Bei ya taka imepangwa kikamilifu.',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('[LGA_TARIFF_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea wakati wa kupanga bei.' });
  }
};


/**
 * @route   POST /api/lga/generate-bills
 * @desc    Inazalisha ankara (invoices) kwa majengo yote kulingana na bei zilizopangwa
 * @access  Protected (LGA_ADMIN only)
 */
export const generateMonthlyBills = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lgaId = req.user?.orgId;
    
    // Tunatengeneza mwezi wa sasa (Mfano: '09-2026')
    const currentDate = new Date();
    const billingMonth = `${String(currentDate.getMonth() + 1).padStart(2, '0')}-${currentDate.getFullYear()}`;

    // 1. Vuta majengo yote ya hii Halmashauri yaliyounganishwa na bei zake
    const propertiesQuery = await pool.query(
      `SELECT p.id as property_id, t.monthly_fee 
       FROM properties p
       JOIN lga_tariffs t ON p.property_type = t.property_type 
       WHERE p.lga_id = $1 AND t.lga_id = $1`,
      [lgaId]
    );

    const properties = propertiesQuery.rows;

    if (properties.length === 0) {
      res.status(400).json({ 
        status: 'error', 
        message: 'Hakuna majengo yanayoendana na bei zilizopangwa. Tafadhali sajili majengo na bei kwanza.' 
      });
      return;
    }

    // 2. Ingiza Bili kwa mkupuo (Bulk Insert) kwa kutumia Transaction kuepuka makosa
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); // Anza Muamala (Transaction)

      let generatedCount = 0;

      for (const prop of properties) {
        // Ulinzi: Angalia kama jengo hili limeshatengenezewa bili ya mwezi huu kuepuka kurudia
        const checkInvoice = await client.query(
          `SELECT id FROM invoices WHERE property_id = $1 AND billing_month = $2`,
          [prop.property_id, billingMonth]
        );

        if (checkInvoice.rowCount === 0) {
          await client.query(
            `INSERT INTO invoices (property_id, lga_id, amount, billing_month) VALUES ($1, $2, $3, $4)`,
            [prop.property_id, lgaId, prop.monthly_fee, billingMonth]
          );
          generatedCount++;
        }
      }

      await client.query('COMMIT'); // Funga Muamala salama
      
      res.status(201).json({
        status: 'success',
        message: `Bili za mwezi ${billingMonth} zimezalishwa kikamilifu.`,
        data: { invoices_created: generatedCount }
      });

    } catch (err) {
      await client.query('ROLLBACK'); // Kama kuna kosa, futa kila kitu tulichofanya hapa
      throw err;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('[GENERATE_BILLS_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};


/**
 * @route   PUT /api/lga/properties/:id
 * @desc    Edit taarifa za jengo (Super Admin anaweza yote, LGA Admin anaweza ya kwake tu)
 * @access  Protected (SUPER_ADMIN, LGA_ADMIN)
 */
export const updateProperty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // ID ya Jengo linalo-editiwa
    const { ownerName, phoneNumber, totalRooms } = req.body; // Taarifa mpya
    const userRole = req.user?.role;
    const orgId = req.user?.orgId;

    let updateQuery = '';
    let queryParams: any[] = [];

    // 1. LOGIC YA KISASA: Tunachuja uwezo kulingana na Cheo (Role)
    if (userRole === 'SUPER_ADMIN') {
      // GOD MODE: Haulizwi lga_id, ana-edit jengo lolote Tanzania
      updateQuery = `
        UPDATE properties 
        SET owner_name = $1, phone_number = $2, total_rooms = $3 
        WHERE id = $4 
        RETURNING *`;
      queryParams = [ownerName, phoneNumber, totalRooms, id];
    } 
    else if (userRole === 'LGA_ADMIN') {
      // SCOPED MODE: Lazima lga_id iendane na Halmashauri yake
      updateQuery = `
        UPDATE properties 
        SET owner_name = $1, phone_number = $2, total_rooms = $3 
        WHERE id = $4 AND lga_id = $5 
        RETURNING *`;
      queryParams = [ownerName, phoneNumber, totalRooms, id, orgId];
    }

    const result = await pool.query(updateQuery, queryParams);

    // Kama jengo halijapatikana, inawezekana halipo AU LGA Admin anajaribu kuedit jengo la wilaya nyingine
    if (result.rowCount === 0) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Jengo halijapatikana au huruhusiwi kufanya mabadiliko kwenye jengo hili.' 
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: 'Taarifa za jengo zimebadilishwa kikamilifu.',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('[UPDATE_PROPERTY_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};


/**
 * @route   DELETE /api/lga/properties/:id
 * @desc    'Soft Delete' - Kuficha jengo badala ya kulifuta kabisa ili kulinda rekodi za pesa
 * @access  Protected (SUPER_ADMIN, LGA_ADMIN)
 */
export const deleteProperty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const orgId = req.user?.orgId;

    let deleteQuery = '';
    let queryParams: any[] = [];

    // Kama kawaida, Super Admin anafuta kokote, LGA anafuta ya kwake tu
    if (userRole === 'SUPER_ADMIN') {
      deleteQuery = `UPDATE properties SET is_active = FALSE WHERE id = $1 RETURNING id`;
      queryParams = [id];
    } else if (userRole === 'LGA_ADMIN') {
      deleteQuery = `UPDATE properties SET is_active = FALSE WHERE id = $1 AND lga_id = $2 RETURNING id`;
      queryParams = [id, orgId];
    }

    const result = await pool.query(deleteQuery, queryParams);

    if (result.rowCount === 0) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Jengo halijapatikana au huruhusiwi kulifuta.' 
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: 'Jengo limefutwa (Soft Delete) kikamilifu kwenye mfumo. Halitaonekana tena kwenye ruti.'
    });

  } catch (error: any) {
    console.error('[DELETE_PROPERTY_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};


/**
 * @route   GET /api/lga/dashboard
 * @desc    Inavuta takwimu zote kuu kwa ajili ya UI ya Dashboard ya Halmashauri
 * @access  Protected (LGA_ADMIN only)
 */
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lgaId = req.user?.orgId;

    // 1. Jumla ya Majengo Yaliyo Hai (Active)
    const propCount = await pool.query(
      `SELECT COUNT(*) FROM properties WHERE lga_id = $1 AND is_active = TRUE`, 
      [lgaId]
    );
    
    // 2. Jumla ya Mapato Yaliyoingia
    const revenue = await pool.query(
      `SELECT COALESCE(SUM(t.amount_paid), 0) as total_revenue 
       FROM transactions t
       JOIN invoices i ON t.invoice_id = i.id
       WHERE i.lga_id = $1`, 
      [lgaId]
    );

    // 3. Ruti Zilizokamilika (Kupima ufanisi wa Kampuni za Taka)
    const routes = await pool.query(
      `SELECT COUNT(*) as completed_routes
       FROM routes r
       JOIN streets s ON r.street_id = s.id
       WHERE s.lga_id = $1 AND r.status = 'COMPLETED'`, 
      [lgaId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Takwimu za Dashboard zimepatikana kikamilifu.',
      data: {
        total_active_properties: parseInt(propCount.rows[0].count),
        total_revenue_tzs: parseFloat(revenue.rows[0].total_revenue),
        completed_routes: parseInt(routes.rows[0].completed_routes)
      }
    });

  } catch (error: any) {
    console.error('[DASHBOARD_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea kuvuta takwimu.' });
  }
};

