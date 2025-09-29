const mongoose = require('mongoose');

// Định nghĩa schema cho lịch sử điều khiển (Control History)
const controlHistorySchema = new mongoose.Schema({
  deviceId: { 
    type: String, 
    required: true, // Bắt buộc phải có deviceId
    ref: 'Device' // Tham chiếu tới collection Device
  },
  device_name: {
    type: String,
    required: true // Bắt buộc có tên thiết bị
  },
  action: { 
    type: String, 
    required: true, // Bắt buộc phải có hành động
    enum: ['ON', 'OFF', 'TOGGLE'] // Chỉ cho phép các giá trị này
  },
  source: { 
    type: String, 
    required: true, // Bắt buộc có nguồn hành động
    enum: ['web', 'mqtt', 'api', 'system'] // Nguồn hành động hợp lệ
  },
  timestamp: { 
    type: Date, 
    default: Date.now, // Mặc định là thời điểm hiện tại
    index: true // Tạo chỉ mục để tối ưu truy vấn theo thời gian
  },
  success: { 
    type: Boolean, 
    default: true // Mặc định hành động thành công
  },
  message: { 
    type: String // Thông báo bổ sung (nếu có)
  }
}, { 
  timestamps: true // Tự động thêm createdAt và updatedAt
});

// Tạo index để tăng hiệu suất truy vấn
controlHistorySchema.index({ deviceId: 1, timestamp: -1 });
controlHistorySchema.index({ timestamp: -1 });

module.exports = mongoose.model('ControlHistory', controlHistorySchema);
