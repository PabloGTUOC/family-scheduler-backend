const express = require('express');
const { registerUser } = require('../controllers/authController');

const router = express.Router();

// User Registration
router.post('/register_user', registerUser);

module.exports = router;
