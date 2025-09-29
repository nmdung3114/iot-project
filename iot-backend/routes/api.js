const express = require('express');
const router = express.Router();

// Endpoint kiểm tra trạng thái server
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server đang chạy',
    timestamp: new Date().toISOString(),
    status: 'OK'
  });
});

// Endpoint lấy thông tin hệ thống
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

module.exports = router;
