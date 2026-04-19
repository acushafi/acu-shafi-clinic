const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files from the root directory
app.use(express.static(path.join(__dirname)));

const fs = require('fs');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// --- In-Memory Data Store ---
const db = {
    patients: [
        { id: 1, name: 'Test Patient', age: 40, gender: 'Male', contact: '1234567890' }
    ],
    doctors: [
        { id: 'shafi', username: 'shafi', password_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', role: 'admin', status: 'active' } // Hash for '1234'
    ],
    // Other collections will auto-populate as needed
};

// --- Generic API Endpoints ---
let serverOTP = null;

// POST /api/admin/reauth - Validate password logic before OTP flow
app.post('/api/admin/reauth', (req, res) => {
    const { username, password_hash } = req.body;
    const user = (db.doctors || []).find(u => u.username === username);
    if (user && user.password_hash === password_hash) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

// POST /api/admin/generate-otp - Console log basic simulation
app.post('/api/admin/generate-otp', (req, res) => {
    serverOTP = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`\n================ WARNING: ADMIN ACCESS REQUESTED ================`);
    console.log(`>> SIMULATED OTP CODE: ${serverOTP}`);
    console.log(`=================================================================\n`);
    res.json({ success: true, message: 'OTP Generated locally' });
});

// POST /api/admin/verify-otp - Check local verification pool
app.post('/api/admin/verify-otp', (req, res) => {
    const { otp, username } = req.body;
    
    // Only allow strictly shafi
    if (username !== 'shafi') return res.status(403).json({ success: false, error: 'Unauthorized user' });

    if (otp && otp === serverOTP) {
        serverOTP = null; // Consume safely
        res.json({ success: true, otp_token: "trusted-admin-session-" + Date.now() });
    } else {
        res.status(401).json({ success: false, error: 'Invalid OTP' });
    }
});

// POST /api/admin/reset-password - Secure password overwrite restricted safely
app.post('/api/admin/reset-password', (req, res) => {
    const { username, new_password_hash } = req.body;
    
    if (username !== 'shafi') {
        return res.status(403).json({ success: false, error: 'Password reset only allowed for master admin' });
    }

    const doctors = db.doctors || [];
    const idx = doctors.findIndex(u => u.username === username);
    
    if (idx >= 0) {
        doctors[idx].password_hash = new_password_hash;
        res.json({ success: true, message: 'Password updated' });
    } else {
        res.status(404).json({ success: false, error: 'Admin account not found' });
    }
});

// POST /api/login - Authenticate user
app.post('/api/login', (req, res) => {
    const { username, password_hash, password } = req.body;

    if (!username || (!password_hash && !password)) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Handled locally since Web Crypto is blocked on mobile over local network IP (must be hashed dynamically in Node)
    let finalHash = password_hash;
    if (password && !password_hash) {
        finalHash = require('crypto').createHash('sha256').update(password).digest('hex');
    }

    const doctors = db.doctors || [];
    const user = doctors.find(u => u.username === username);

    if (user && user.password_hash === finalHash) {
        // Return a mock token for the frontend
        res.json({ 
            success: true, 
            message: 'Login successful', 
            role: user.role,
            username: user.username,
            userId: user.id,
            token: 'mock-jwt-token-' + user.id
        });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

// GET /api/:collection - Get all records for a collection
app.get('/api/:collection', (req, res, next) => {
    const { collection } = req.params;
    if (collection === 'login') return next(); // Fallthrough to proper error handler if not caught above
    res.json(db[collection] || []);
});

// GET /api/:collection/:id - Get specific record
app.get('/api/:collection/:id', (req, res) => {
    const { collection, id } = req.params;
    const records = db[collection] || [];
    const record = records.find(r => r.id === id);
    if (record) {
        res.json(record);
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

// POST /api/:collection - Create or update a record
app.post('/api/:collection', (req, res, next) => {
    const { collection } = req.params;
    if (collection === 'login') return next(); // Fallthrough instead of hanging
    
    if (!db[collection]) {
        db[collection] = [];
    }

    const newRecord = req.body;
    const existingIndex = db[collection].findIndex(r => r.id === newRecord.id);

    if (existingIndex >= 0) {
        db[collection][existingIndex] = { ...db[collection][existingIndex], ...newRecord };
        res.json(db[collection][existingIndex]);
    } else {
        db[collection].push(newRecord);
        res.status(201).json(newRecord);
    }
});

// DELETE /api/:collection/:id - Delete a record
app.delete('/api/:collection/:id', (req, res) => {
    const { collection, id } = req.params;
    if (!db[collection]) return res.status(404).json({ error: 'Collection not found' });
    
    const index = db[collection].findIndex(r => r.id === id);
    if (index >= 0) {
        db[collection].splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Record not found' });
    }
});

// --- Config Endpoints ---
app.get('/api/config/telegram', (req, res) => {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            res.json({ success: true, config: JSON.parse(data) });
        } else {
            res.json({ success: true, config: {} });
        }
    } catch (err) {
        console.error("Error reading config.json:", err);
        res.status(500).json({ success: false, error: 'Failed to read config' });
    }
});

app.post('/api/config/telegram', (req, res) => {
    try {
        const { bot_token, chat_id } = req.body;
        let currentConfig = {};
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            } catch (e) {}
        }
        
        currentConfig.bot_token = bot_token || currentConfig.bot_token;
        currentConfig.chat_id = chat_id || currentConfig.chat_id;
        
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 4), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error("Error writing to config.json:", err);
        res.status(500).json({ success: false, error: 'Failed to save config' });
    }
});


// --- SPA Fallback Route ---
// For any internal routes (like /dashboard, /patients), serve the main index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Start Server ---
const os = require('os');
const networkInterfaces = os.networkInterfaces();
let localIp = '<your-local-ip>';

for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
        // Find IPv4 address that is not localhost
        if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
        }
    }
    if (localIp !== '<your-local-ip>') break;
}

app.listen(port, '0.0.0.0', () => {
    console.log(`\n--- Server Started Successfully ---`);
    console.log(`Local link: http://localhost:${port}`);
    console.log(`Network link: http://${localIp}:${port}`);
    console.log(`Serving frontend from: ${path.join(__dirname)}`);
    console.log(`-----------------------------------\n`);
});
