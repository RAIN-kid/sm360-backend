import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import pool from '../../config/db';

/**
 * 1. API YA KULIPA BILI (Inaigiza M-Pesa/Tigo Pesa Webhook)
 * @route   POST /api/finance/pay
 */
export const payInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { invoiceId, amount, paymentMethod, referenceNumber } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ingiza Muamala
      await client.query(
        `INSERT INTO transactions (invoice_id, amount_paid, payment_method, reference_number) 
         VALUES ($1, $2, $3, $4)`,
        [invoiceId, amount, paymentMethod, referenceNumber]
      );

      // Badili status ya Bili kuwa PAID
      await client.query(
        `UPDATE invoices SET status = 'PAID' WHERE id = $1`,
        [invoiceId]
      );

      await client.query('COMMIT');
      res.status(200).json({ status: 'success', message: 'Muamala umekamilika. Bili imelipwa.' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: 'Hitilafu kwenye malipo.' });
  }
};

/**
 * 2. API YA SUPER ADMIN (SM360) KUONA MAPATO
 * @route   GET /api/finance/sm360-report
 */
export const getSM360Report = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Vuta jumla ya pesa zote zilizoingia
    const reportQuery = await pool.query(
      `SELECT SUM(amount_paid) as total_revenue, COUNT(id) as total_transactions 
       FROM transactions`
    );

    const totalRevenue = parseFloat(reportQuery.rows[0].total_revenue || '0');
    const sm360Commission = totalRevenue * 0.05; // SM360 inachukua 5% ya pesa zote (Platform Fee)

    res.status(200).json({
      status: 'success',
      message: 'Ripoti ya Mapato ya SM360 (God Mode).',
      data: {
        total_revenue_collected: totalRevenue,
        sm360_commission_5_percent: sm360Commission,
        lga_and_companies_share: totalRevenue - sm360Commission,
        total_transactions: parseInt(reportQuery.rows[0].total_transactions)
      }
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: 'Hitilafu kuvuta ripoti.' });
  }
};