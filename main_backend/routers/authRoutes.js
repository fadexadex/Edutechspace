import express from 'express';
import { generateToken, login, signup, logout } from '../Controllers/authController.js';
import { errorHandler } from '../middleware/errorHandler.js';

const router = express.Router();

console.log('Registering auth routes...');
router.post('/generate-token', (req, res, next) => {
  console.log('Received request for /api/auth/generate-token');
  generateToken(req, res, next);
});
router.post('/login', login);
router.post('/signup', signup);
router.post('/logout', logout);

router.use(errorHandler);

export default router;  