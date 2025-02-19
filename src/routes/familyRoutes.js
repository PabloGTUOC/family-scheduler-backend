const express = require('express');
const { createFamily, searchFamily, joinFamily } = require('../controllers/familyController');  // ✅ Import Controller

const router = express.Router();

// Create a family
router.post('/create', createFamily);

// Search for a family by ID or name and send it back to front end
router.get('/search', searchFamily);

// Join an existing family
router.post('/join', joinFamily);

module.exports = router;
