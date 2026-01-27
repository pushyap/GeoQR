/**
 * Location Routes for PostgreSQL
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleCheck');
const { logDeviceActivity } = require('../utils/security');

const router = express.Router();

/**
 * GET /api/locations
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, name, latitude, longitude, radius, is_active, created_at
            FROM locations
            ORDER BY name
        `);

        res.json({
            success: true,
            locations: result.rows
        });

    } catch (error) {
        console.error('Get locations error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch locations'
        });
    }
});

/**
 * POST /api/locations
 */
router.post('/', authenticate, isAdmin, [
    body('name').trim().isLength({ min: 2 }),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('radius').optional().isInt({ min: 10, max: 500 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { name, latitude, longitude, radius = 50 } = req.body;

    try {
        const result = await db.query(
            `INSERT INTO locations (name, latitude, longitude, radius)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, latitude, longitude, radius]
        );

        res.status(201).json({
            success: true,
            location: result.rows[0]
        });

        await logDeviceActivity(null, 'location_created', {
            name: result.rows[0].name,
            id: result.rows[0].id,
            by: req.user.id
        });

    } catch (error) {
        console.error('Create location error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create location'
        });
    }
});

/**
 * PUT /api/locations/:id
 */
router.put('/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { name, latitude, longitude, radius, is_active } = req.body;

        const result = await db.query(
            `UPDATE locations 
             SET name = COALESCE($1, name),
                 latitude = COALESCE($2, latitude),
                 longitude = COALESCE($3, longitude),
                 radius = COALESCE($4, radius),
                 is_active = COALESCE($5, is_active)
             WHERE id = $6 RETURNING *`,
            [name, latitude, longitude, radius, is_active, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Location not found'
            });
        }

        res.json({
            success: true,
            location: result.rows[0]
        });

        await logDeviceActivity(null, 'location_updated', {
            id: req.params.id,
            updates: { name, is_active },
            by: req.user.id
        });

    } catch (error) {
        console.error('Update location error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update location'
        });
    }
});

/**
 * DELETE /api/locations/:id
 */
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    const locationId = req.params.id;
    try {
        // 1. Delete associated data to handle foreign keys
        // Delete tokens and sessions first
        await db.query('DELETE FROM qr_tokens WHERE location_id = $1', [locationId]);
        await db.query('DELETE FROM attendance_logs WHERE location_id = $1', [locationId]);
        await db.query('DELETE FROM sessions WHERE location_id = $1', [locationId]);

        // 2. Clear location from devices before deleting location
        await db.query('UPDATE devices SET location_id = NULL WHERE location_id = $1', [locationId]);

        // 3. Delete the location
        const result = await db.query(
            'DELETE FROM locations WHERE id = $1 RETURNING id, name',
            [locationId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Location not found'
            });
        }

        await logDeviceActivity(null, 'location_deleted', {
            id: locationId,
            name: result.rows[0].name,
            by: req.user.id
        });

        res.json({
            success: true,
            message: `Location '${result.rows[0].name}' and associated data deleted permanently`
        });

    } catch (error) {
        console.error('Delete location error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete location permanently'
        });
    }
});

module.exports = router;
