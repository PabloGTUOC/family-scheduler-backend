const express = require('express');
const { handleUserAuthentication } = require('../controllers/authController');

const router = express.Router();

// User Registration
router.post('/handle_user', handleUserAuthentication);

module.exports = router;
