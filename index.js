const express = require('express');
const app = express();
const port = 3000;

app.use(express.json()); // Middleware to parse JSON requests

// Define a basic route
app.get('/', (req, res) => {
    res.send('Hello, Family Scheduler Backend!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
