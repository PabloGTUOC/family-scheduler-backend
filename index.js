const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./src/routes/authRoutes');
const familyRoutes = require('./src/routes/familyRoutes');
const logoutRoutes = require('./src/routes/logoutRoutes');
const { updateUnitsDue } = require('./src/jobs/updateUnitsJob');
const app = express();
const port = 3000;

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Jobs

// Routes
app.use('/auth', authRoutes);
app.use('/family', familyRoutes);
app.use('/user', logoutRoutes);

app.get('/', (req, res) => {
    res.send('Welcome to Family Scheduler Backend!');
});

// Start the Server
app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});
