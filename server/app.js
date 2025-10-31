const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the 'src/html' directory for the root path
app.use('/', express.static(path.join(__dirname, '../src/html')));

// Serve static files from the 'src' directory
app.use('/assets', express.static(path.join(__dirname, '../src'), {index:false}));
app.use('/images', express.static(path.join(__dirname, '../images'), {index:false}));

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});