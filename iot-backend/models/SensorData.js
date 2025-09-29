const mongoose = require('mongoose');

// Schema dữ liệu cảm biến
const sensorDataSchema = new mongoose.Schema({
  deviceId: { 
    type: String, // ID thiết bị gửi dữ liệu
    required: true, 
    ref: 'Device' // Tham chiếu tới collection Device
  },
  timestamp: { 
    type: Date, // Thời gian ghi nhận dữ liệu
    default: Date.now,
    index: true // Tạo index để tối ưu tìm kiếm theo thời gian
  },
  data: {
    temperature: { 
      type: Number, // Nhiệt độ
      min: -50, 
      max: 100 
    },
    humidity: { 
      type: Number, // Độ ẩm
      min: 0, 
      max: 100 
    },
    light: { 
      type: Number, // Độ sáng
      min: 0, 
      max: 2000
    }
  },
  status: {
    type: String, // Trạng thái dữ liệu cảm biến
    enum: ['normal', 'warning', 'danger'], // Chỉ cho phép các giá trị này
    default: 'normal'
  }
}, { 
  timestamps: true // Tự động tạo createdAt và updatedAt
});

// Tạo compound index để tối ưu tìm kiếm
sensorDataSchema.index({ deviceId: 1, timestamp: -1 });
sensorDataSchema.index({ timestamp: -1 });

// Virtual property: tên cảm biến dễ truy cập
sensorDataSchema.virtual('sensor_name').get(function() {
  if (this.data.temperature !== undefined) return 'temperature';
  if (this.data.humidity !== undefined) return 'humidity';
  if (this.data.light !== undefined) return 'light';
  return 'unknown';
});

// Virtual property: giá trị cảm biến
sensorDataSchema.virtual('value').get(function() {
  return this.data.temperature || this.data.humidity || this.data.light;
});

// Virtual property: đơn vị đo
sensorDataSchema.virtual('unit').get(function() {
  if (this.data.temperature !== undefined) return '°C';
  if (this.data.humidity !== undefined) return '%';
  if (this.data.light !== undefined) return 'lux';
  return '';
});

module.exports = mongoose.model('SensorData', sensorDataSchema);
