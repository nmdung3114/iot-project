const Device = require('../models/Device');
const ControlHistory = require('../models/ControlHistory');
const mqttService = require('../services/mqttService');

const deviceController = {
  // Control a device
  async controlDevice(req, res) {
    try {
      const { device, action } = req.body;

      if (!device || !action) {
        return res.status(400).json({
          success: false,
          message: 'Device and action are required'
        });
      }

      // Validate action
      const validActions = ['ON', 'OFF', 'TOGGLE'];
      if (!validActions.includes(action.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Use ON, OFF, or TOGGLE'
        });
      }

      // Send MQTT command
      try {
        mqttService.sendControlCommand(device, action.toUpperCase());
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Failed to send command to device'
        });
      }

      // Log to control history
      const historyRecord = await ControlHistory.create({
        deviceId: device,
        device_name: device.toUpperCase(),
        action: action.toUpperCase(),
        source: 'web',
        success: true,
        message: `Device ${device} controlled via web interface`
      });

      res.json({
        success: true,
        message: `Command sent to ${device}: ${action}`,
        data: historyRecord
      });

    } catch (error) {
      console.error('Error controlling device:', error);
      res.status(500).json({
        success: false,
        message: 'Error controlling device'
      });
    }
  },

  // Get all devices
  async getDevices(req, res) {
    try {
      const devices = await Device.find().sort({ createdAt: -1 });
      
      res.json({
        success: true,
        data: devices
      });
    } catch (error) {
      console.error('Error fetching devices:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching devices'
      });
    }
  },

  // Get device status
  async getDeviceStatus(req, res) {
    try {
      const { deviceId } = req.params;
      const device = await Device.findOne({ deviceId });

      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found'
        });
      }

      res.json({
        success: true,
        data: device
      });
    } catch (error) {
      console.error('Error fetching device status:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching device status'
      });
    }
  },

  // ✅ Update device information
  async updateDevice(req, res) {
    try {
      res.json({
        success: true,
        message: 'Update device API is working'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating device'
      });
    }
  },

  // ✅ Get device control history
  async getDeviceHistory(req, res) {
    try {
      res.json({
        success: true,
        message: 'Get device history API is working'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching device history'
      });
    }
  }
};

module.exports = deviceController;
