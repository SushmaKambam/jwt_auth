const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const mongoose = require('mongoose');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    console.log('Registration attempt:', { username, email }); // Add logging

    let user = await User.findOne({ email });
    if (user) {
      console.log('User already exists:', email);
      return res.status(400).json({ msg: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ username, email, password: hashedPassword });
    await user.save();
    console.log('User registered successfully:', email);

    return res.status(201).json({ 
      success: true,
      msg: 'Successfully registered!' 
    });
  }  catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      msg: 'Registration failed: ' + error.message 
    });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('Login attempt for email:', email);
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Generate JWT token with additional user info
    const payload = {
      userId: user._id,
      username: user.username,
      email: user.email,
      lastLogin: new Date()
    };

    const timestamp = new Date();
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        email: user.email,
        lastLogin: timestamp,
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiration
      },
      process.env.JWT_SECRET
    );

    res.json({
      success: true,
      msg: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        lastLogin: timestamp
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ msg: 'Server error: ' + error.message });
  }
});

// Generate random CAPTCHA
const generateCaptcha = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let captcha = '';
  for (let i = 0; i < 6; i++) {
    captcha += chars[Math.floor(Math.random() * chars.length)];
  }
  return captcha;
};

// Store CAPTCHA values with timestamp
const captchaStore = new Map();

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    const captcha = generateCaptcha();
    // Store CAPTCHA with 5-minute expiration
    captchaStore.set(email, {
      code: captcha,
      timestamp: Date.now(),
      attempts: 0
    });
    
    res.json({ 
      msg: 'Please enter this verification code',
      captcha: captcha,
      validFor: '5 minutes'
    });
  } catch (error) {
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, captcha, newPassword } = req.body;
  try {
    const storedCaptcha = captchaStore.get(email);
    
    // Validate CAPTCHA
    if (!storedCaptcha) {
      return res.status(400).json({ msg: 'CAPTCHA expired or not requested' });
    }

    // Check expiration (5 minutes)
    if (Date.now() - storedCaptcha.timestamp > 300000) {
      captchaStore.delete(email);
      return res.status(400).json({ msg: 'CAPTCHA expired' });
    }

    // Check attempts
    if (storedCaptcha.attempts >= 3) {
      captchaStore.delete(email);
      return res.status(400).json({ msg: 'Too many attempts. Request new CAPTCHA' });
    }

    // Verify CAPTCHA
    if (storedCaptcha.code !== captcha) {
      storedCaptcha.attempts++;
      return res.status(400).json({ 
        msg: 'Invalid CAPTCHA',
        remainingAttempts: 3 - storedCaptcha.attempts
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    captchaStore.delete(email); // Clear used CAPTCHA
    res.json({ msg: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Protected route (Example)
router.get('/protected', authMiddleware, (req, res) => {
  res.json({ msg: 'This is a protected route', userId: req.user.userId });
});

router.get('/login', (req, res) => {
  res.send('Login page');
});

module.exports = router;
