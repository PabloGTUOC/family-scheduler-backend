const express = require('express');
const { createActivity } = require('../controllers/activityController');

const router = express.Router();

// ✅ Create a new activity
router.post('/create_activity', createActivity);

module.exports = router;
