const express     = require('express');
const router      = express.Router();
const pool        = require('../config/db');
const Company     = require('../models/company');
const CompanyUser = require('../models/companyUser');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const validate    = require('../middleware/validate');

// POST /api/companies — authenticated user creates their company
router.post('/', authenticateToken,
  validate({
    legal_name: { required: true, type: 'string' },
    country:    { required: true, type: 'string' },
  }),
  async (req, res, next) => {
    try {
      // One company per user for now
      const existing = await CompanyUser.findByUserId(req.user.user_id);
      if (existing) {
        return res.status(409).json({ error: 'You already have a company', code: 'ALREADY_EXISTS' });
      }

      const { legal_name, brand_name, is_buyer, is_supplier, country,
              state_province, city, pincode, website, description, employee_count } = req.body;

      // Derive is_buyer / is_supplier from role if not explicitly passed
      const role       = req.user.role;
      const buyerFlag  = is_buyer  !== undefined ? is_buyer  : role === 'buyer';
      const supplierFlag = is_supplier !== undefined ? is_supplier : role === 'supplier';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const company = await Company.create({
          legal_name, brand_name, country, state_province, city,
          pincode, website, description, employee_count,
          is_buyer: buyerFlag, is_supplier: supplierFlag,
        });

        await CompanyUser.create({
          user_id:    req.user.user_id,
          company_id: company.id,
        });

        await client.query('COMMIT');
        res.status(201).json({ message: 'Company created', data: company });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { next(err); }
  }
);

// GET /api/companies — admin only
router.get('/', authenticateToken, checkPermission('companies', 'can_read'), async (req, res, next) => {
  try {
    const { page, limit, is_buyer, is_supplier, country, verified_status } = req.query;
    const rows = await Company.listAll({
      page:           parseInt(page)  || 1,
      limit:          parseInt(limit) || 20,
      is_buyer:       is_buyer    === 'true' ? true : is_buyer    === 'false' ? false : undefined,
      is_supplier:    is_supplier === 'true' ? true : is_supplier === 'false' ? false : undefined,
      country,
      verified_status,
    });
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/companies/me — get current user's company
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const membership = await CompanyUser.findByUserId(req.user.user_id);
    if (!membership) {
      return res.status(404).json({ error: 'No company found', code: 'NOT_FOUND' });
    }
    const company = await Company.findById(membership.company_id);
    res.json({ data: company });
  } catch (err) { next(err); }
});

// GET /api/companies/:id
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found', code: 'NOT_FOUND' });
    res.json({ data: company });
  } catch (err) { next(err); }
});

// PATCH /api/companies/:id — must be member of that company
router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const isMember = await CompanyUser.isMember(req.user.user_id, req.params.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Permission denied', code: 'PERM_DENIED' });
    }
    const updated = await Company.update(req.params.id, req.body);
    if (!updated) return res.status(400).json({ error: 'No valid fields to update', code: 'VALIDATION_ERROR' });
    res.json({ message: 'Company updated', data: updated });
  } catch (err) { next(err); }
});

// GET /api/companies/:id/members — must be member of that company
router.get('/:id/members', authenticateToken, async (req, res, next) => {
  try {
    const isMember = await CompanyUser.isMember(req.user.user_id, req.params.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Permission denied', code: 'PERM_DENIED' });
    }
    const members = await CompanyUser.findByCompanyId(req.params.id);
    res.json({ data: members });
  } catch (err) { next(err); }
});

// DELETE /api/companies/:id/members/:memberId — must be member, admin role
router.delete('/:id/members/:memberId', authenticateToken, async (req, res, next) => {
  try {
    const isMember = await CompanyUser.isMember(req.user.user_id, req.params.id);
    if (!isMember || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied', code: 'PERM_DENIED' });
    }
    await CompanyUser.deactivate(req.params.memberId);
    res.json({ message: 'Member removed' });
  } catch (err) { next(err); }
});

module.exports = router;