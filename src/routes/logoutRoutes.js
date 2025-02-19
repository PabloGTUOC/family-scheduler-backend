const express = require('express');
const { logoutUser } = require('../controllers/logoutController');

const router = express.Router();

// ✅ Use `/user/logout` instead of `/logout`
router.get('/logout', logoutUser);

module.exports = router;

