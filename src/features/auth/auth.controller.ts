import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../config/db';

/**
 * @route   POST /api/auth/login
 * @desc    Login kwa Super Admin, LGA Admin, Company Admin, Dereva au Wakala
 * @access  Public
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, password } = req.body;

    // 1. Tafuta mtumiaji na cheo chake (Prepared Statement kuzuia SQL Injection)
    const result = await pool.query(
      `SELECT u.*, r.name as role_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.phone_number = $1`,
      [phoneNumber]
    );

    const user = result.rows[0];

    // 2. Hakiki Mtumiaji na Password (Generic error kuzuia Hackers)
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ status: 'error', message: 'Namba ya simu au neno la siri si sahihi.' });
      return;
    }

    // 3. Tengeneza Ufunguo wa Kielektroniki (JWT) - Unadumu kwa saa 24
    const token = jwt.sign(
      { userId: user.id, role: user.role_name, orgId: user.organization_id },
      process.env.JWT_SECRET || 'super_secret_sm360_key_badili_baadae',
      { expiresIn: '24h' }
    );

    res.status(200).json({
      status: 'success',
      message: 'Umeingia kikamilifu.',
      token,
      data: {
        id: user.id,
        fullName: user.full_name,
        role: user.role_name,
        organizationId: user.organization_id
      }
    });
  } catch (error: any) {
    console.error('[AUTH_LOGIN_ERROR]:', error.message);
    res.status(500).json({ status: 'error', message: 'Hitilafu ya kimtandao imetokea.' });
  }
};

/**
 * @route   POST /api/admin/organizations
 * @desc    Super Admin anasajili Halmashauri (LGA) au Kampuni (PRIVATE) na kumpa Admin wake
 * @access  Protected (Super Admin Only - Tutaweka Middleware baadaye)
 */
export const registerOrganizationAndAdmin = async (req: Request, res: Response): Promise<void> => {
  // Tunatumia client moja kwa ajili ya Transaction (BEGIN na COMMIT)
  const client = await pool.connect();
  
  try {
    const { orgName, orgType, adminName, adminPhone, adminPassword } = req.body;

    // Hakikisha orgType ipo sahihi
    if (!['LGA', 'PRIVATE'].includes(orgType)) {
      res.status(400).json({ status: 'error', message: "Aina ya shirika lazima iwe 'LGA' au 'PRIVATE'" });
      return;
    }

    await client.query('BEGIN'); // 🚀 Washa Transaction (Ulinzi wa Data)

    // Hatua 1: Ingiza Shirika
    const orgResult = await client.query(
      `INSERT INTO organizations (name, org_type) VALUES ($1, $2) RETURNING id`,
      [orgName, orgType]
    );
    const orgId = orgResult.rows[0].id;

    // Hatua 2: Ficha Neno la Siri (High Security Hashing)
    const salt = await bcrypt.genSalt(12); 
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    // Hatua 3: Tambua Cheo Kutokana na aina ya Shirika
    const roleName = orgType === 'LGA' ? 'LGA_ADMIN' : 'COMPANY_ADMIN';

    // Hatua 4: Ingiza Admin wa hilo Shirika
    const userResult = await client.query(
      `INSERT INTO users (full_name, phone_number, password_hash, role_id, organization_id) 
       VALUES (
          $1, $2, $3, 
          (SELECT id FROM roles WHERE name = $4), 
          $5
       ) RETURNING id, full_name, phone_number`,
      [adminName, adminPhone, passwordHash, roleName, orgId]
    );

    await client.query('COMMIT'); // 💾 Data zote zimeingia salama, tunasave!

    res.status(201).json({
      status: 'success',
      message: `${orgType} pamoja na Msimamizi wake vimesajiliwa kikamilifu.`,
      data: {
        organizationId: orgId,
        admin: userResult.rows[0]
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK'); // ❌ Hitilafu imetokea? Futa kila kitu kilichoingia nusu!
    console.error('[AUTH_REGISTER_ORG_ERROR]:', error.message);
    
    // Ulinzi: Check kama namba ya simu imeshatumika
    if (error.code === '23505') {
       res.status(409).json({ status: 'error', message: 'Namba ya simu imeshasajiliwa kwenye mfumo.' });
       return;
    }

    res.status(500).json({ status: 'error', message: 'Hitilafu imetokea kwenye usajili.' });
  } finally {
    client.release(); // Rudisha connection kwenye Pool
  }
};


export const seedSuperAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Tunatengeneza password rahisi ya majaribio
    const plainPassword = 'password123';
    // Tunatumia salt ya 12 kama ulivyofanya kwenye registerOrganizationAndAdmin
    const salt = await bcrypt.genSalt(12); 
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    // 2. Tunaingiza data kwenye PostgreSQL
    // Hapa tunatumia 'phone_number' na tunatafuta 'role_id' ya SUPER_ADMIN kutoka kwenye meza ya roles
    const query = `
      INSERT INTO users (full_name, phone_number, password_hash, role_id) 
      VALUES (
        $1, 
        $2, 
        $3, 
        (SELECT id FROM roles WHERE name = 'SUPER_ADMIN')
      ) 
      RETURNING id, full_name, phone_number
    `;
    
    const values = [
      'Rain James', 
      '0700111222', // Hii ndio itakuwa Username yako ya kulogin
      hashedPassword
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      status: 'success',
      message: 'Super Admin ametengenezwa kikamilifu!',
      credentials: {
        phoneNumber: '0700111222',
        password: plainPassword
      },
      user: result.rows[0]
    });

  } catch (error: any) {
    console.error('[SEED_ADMIN_ERROR]:', error.message);
    
    // Check kama namba hii ishaingizwa (Kuzuia error za duplicate)
    if (error.code === '23505') {
       res.status(409).json({ status: 'error', message: 'Super Admin mwenye namba hii yupo tayari.' });
       return;
    }

    res.status(500).json({ status: 'error', message: 'Imeshindwa kutengeneza Admin' });
  }
};