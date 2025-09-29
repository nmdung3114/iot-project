const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

// Lấy lịch sử điều khiển với khả năng lọc dữ liệu
router.get('/control', historyController.getControlHistory);

// Xóa toàn bộ dữ liệu lịch sử điều khiển
router.delete('/control/clear', historyController.clearControlHistory);

// Lấy thống kê dữ liệu lịch sử điều khiển
router.get('/stats', historyController.getHistoryStats);

module.exports = router;
