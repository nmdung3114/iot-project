const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

// Gửi lệnh điều khiển cho thiết bị
router.post('/device', deviceController.controlDevice);

// Lấy danh sách tất cả thiết bị
router.get('/devices', deviceController.getDevices);

// Lấy trạng thái của một thiết bị
router.get('/device/:deviceId/status', deviceController.getDeviceStatus);

// Cập nhật thông tin thiết bị
router.put('/device/:deviceId', deviceController.updateDevice);

// Lấy lịch sử điều khiển của một thiết bị
router.get('/device/:deviceId/history', deviceController.getDeviceHistory);

module.exports = router;
