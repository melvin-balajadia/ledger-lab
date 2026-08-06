require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { requireAuth } = require('./middleware/requireAuth');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

app.use('/api/auth', require('./routes/auth'));

app.use('/api/projects', requireAuth, require('./routes/projects'));
app.use('/api/projects', requireAuth, require('./routes/planningLines'));
app.use('/api/projects', requireAuth, require('./routes/replenishments'));
app.use('/api/projects', requireAuth, require('./routes/purchaseOrders'));
app.use('/api/projects', requireAuth, require('./routes/cashAdvances'));
app.use('/api/projects', requireAuth, require('./routes/additionalPayments'));
app.use('/api/projects', requireAuth, require('./routes/budgetItems'));
app.use('/api/projects', requireAuth, require('./routes/wbs'));
app.use('/api/projects', requireAuth, require('./routes/payroll'));
app.use('/api/projects', requireAuth, require('./routes/workers'));
app.use('/api/projects', requireAuth, require('./routes/alerts'));
app.use('/api/suppliers', requireAuth, require('./routes/suppliers'));
app.use('/api/meta', requireAuth, require('./routes/meta'));
app.use('/api/backup', requireAuth, require('./routes/backup'));

// Production: Express serves the built client (client/dist) as a single process.
// Must come after every /api mount above, or the SPA fallback swallows API requests.
const path = require('path');
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server listening on port ${port}`));
