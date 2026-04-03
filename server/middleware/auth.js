const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'scg-portal-secret-key-change-in-production';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function requireAppAccess(appId) {
  return (req, res, next) => {
    // Admins bypass app-level checks
    if (req.user.role === 'admin') return next();
    if (req.user.apps && req.user.apps.includes(appId)) return next();
    return res.status(403).json({ error: 'You do not have access to this app.' });
  };
}

// Requires global admin OR app-specific admin permission (e.g. 'pm_admin')
function requireAppAdmin(appId) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (req.user.apps && req.user.apps.includes(`${appId}_admin`)) return next();
    return res.status(403).json({ error: 'Admin access required for this app.' });
  };
}

module.exports = { authenticateToken, requireAdmin, requireAppAccess, requireAppAdmin, JWT_SECRET };
