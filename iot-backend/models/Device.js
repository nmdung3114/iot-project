const mongoose = require('mongoose');

// Định nghĩa schema cho thiết bị (Device)
const deviceSchema = new mongoose.Schema({
  deviceId: { 
    type: String, 
    required: true, // Bắt buộc phải có deviceId
    unique: true // deviceId phải là duy nhất
  },
  name: { 
    type: String, 
    default: "ESP8266 Device" // Tên mặc định nếu không nhập
  },
  location: { 
    type: String, 
    default: "Unknown" // Vị trí mặc định nếu không nhập
  },
  type: { 
    type: String, 
    enum: ["sensor", "actuator", "controller"], // Chỉ cho phép các loại thiết bị này
    default: "sensor" // Loại mặc định là sensor
  },
  status: { 
    online: { type: Boolean, default: false }, // Trạng thái online/offline
    lastSeen: { type: Date, default: Date.now } // Thời gian lần cuối thiết bị online
  },
  metadata: { 
    type: Map, 
    of: String // Lưu trữ thông tin bổ sung dưới dạng key-value
  }
}, { 
  timestamps: true // Tự động thêm createdAt và updatedAt
});

// Tạo index để tăng hiệu suất truy vấn
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ status: 1 });

module.exports = mongoose.model('Device', deviceSchema);
