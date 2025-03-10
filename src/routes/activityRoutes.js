const express = require('express');
const { createActivity, deleteActivity} = require('../controllers/activityController');

const router = express.Router();

// ✅ Create a new activity
router.post('/create_activity', createActivity);
router.post('/delete_activity', deleteActivity);

module.exports = router;
