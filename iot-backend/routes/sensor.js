const express = require('express');
const router = express.Router();
const sensorController = require('../controllers/sensorController');

// Lấy tất cả dữ liệu sensor với phân trang và lọc dữ liệu
router.get('/data', sensorController.getSensorData);

// Lấy dữ liệu sensor mới nhất
router.get('/data/latest', sensorController.getLatestData);

// Lấy thống kê dữ liệu sensor
router.get('/stats', sensorController.getSensorStats);

// Lấy dữ liệu sensor của thiết bị cụ thể
router.get('/data/device/:deviceId', sensorController.getDeviceData);

// Xóa dữ liệu sensor (chức năng dành cho admin)
router.delete('/data/clear', sensorController.clearSensorData);

module.exports = router;
