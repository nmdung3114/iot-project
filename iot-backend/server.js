require('dotenv').config(); // Load biến môi trường từ file .env
const express = require('express');
const cors = require('cors'); // Middleware cho phép cross-origin requests
const helmet = require('helmet'); // Middleware bảo mật HTTP headers
const rateLimit = require('express-rate-limit'); // Middleware giới hạn số request
const http = require('http');
const WebSocket = require('ws'); // WebSocket hỗ trợ real-time communication

const connectDB = require('./config/database'); // Hàm kết nối database
const mqttService = require('./services/mqttService'); // MQTT service
const websocketService = require('./services/websocketService'); // WebSocket service

const apiRoutes = require('./routes/api'); // Routes cho health check và info
const sensorRoutes = require('./routes/sensor'); // Routes cho sensor data
const controlRoutes = require('./routes/control'); // Routes cho điều khiển thiết bị
const historyRoutes = require('./routes/history'); // Routes cho lịch sử điều khiển

const app = express();
const server = http.createServer(app); // Tạo server HTTP

// Kết nối database
connectDB();

// Middleware bảo mật và xử lý request
app.use(helmet()); // Bảo vệ HTTP headers
app.use(cors()); // Cho phép CORS
app.use(express.json({ limit: '10mb' })); // Xử lý JSON body request, giới hạn 10MB

// Cấu hình giới hạn rate limit
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 50, // Tối đa 50 request mỗi IP
  message: { success: false, message: 'Too many requests, try again later.' }
});

const relaxedLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 1000, // Tối đa 1000 request mỗi IP
  message: { success: false, message: 'Too many requests, slow down.' }
});

// Đăng ký routes
app.use('/api/health', apiRoutes); // Không giới hạn rate limit
app.use('/api/sensor', relaxedLimiter, sensorRoutes); // Sensor routes với giới hạn nhẹ
app.use('/api/history', relaxedLimiter, historyRoutes); // History routes với giới hạn nhẹ
app.use('/api/control', strictLimiter, controlRoutes); // Control routes với giới hạn nghiêm ngặt

// Khởi tạo WebSocket server
websocketService.initWebSocket(server);

// Khởi tạo MQTT client
mqttService.initMQTT();

// Middleware xử lý lỗi
app.use((err, req, res, next) => {
  console.error(err.stack); // Log lỗi ra console
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// Middleware xử lý 404 - route không tồn tại
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 3000; // Cổng server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; // Xuất app để dùng ở nơi khác
