const mqtt = require('mqtt');
const mqttConfig = require('../config/mqtt');
const SensorData = require('../models/SensorData');
const Device = require('../models/Device');
const ControlHistory = require('../models/ControlHistory');
const websocketService = require('./websocketService');

let mqttClient = null;

const mqttService = {
  initMQTT() {
    try {
      mqttClient = mqtt.connect(mqttConfig);

      mqttClient.on('connect', () => {
        console.log('Connected to MQTT broker');
        
        // Subscribe to sensor data topics
        mqttClient.subscribe('iot/sensor/#', (err) => {
          if (!err) console.log('Subscribed to sensor topics');
        });

        // Subscribe to control response topics
        mqttClient.subscribe('iot/control/+/state', (err) => {
          if (!err) console.log('Subscribed to control state topics');
        });
      });

      mqttClient.on('message', async (topic, message) => {
        try {
          const payload = message.toString();
          console.log(`MQTT Message received: ${topic} -> ${payload}`);

          if (topic.startsWith('iot/sensor/')) {
            await this.handleSensorData(topic, payload);
          } else if (topic.startsWith('iot/control/') && topic.endsWith('/state')) {
            await this.handleDeviceState(topic, payload);
          }

        } catch (error) {
          console.error('Error processing MQTT message:', error);
        }
      });

      mqttClient.on('error', (error) => {
        console.error('MQTT Error:', error);
      });

    } catch (error) {
      console.error('Failed to initialize MQTT:', error);
    }
  },

  async handleSensorData(topic, payload) {
    try {
      const sensorType = topic.split('/')[2]; // temp, humidity, light
      const deviceId = 'esp8266_001';

      await Device.findOneAndUpdate(
        { deviceId },
        { $set: { status: { online: true, lastSeen: new Date() } } },
        { upsert: true, new: true }
      );

      const sensorData = {
        deviceId,
        timestamp: new Date(),
        data: {},
        status: 'normal'
      };

      const value = parseFloat(payload);

      switch(sensorType) {
        case 'temp':
          sensorData.data.temperature = value;
          if (value < 10 || value > 40) sensorData.status = 'warning';
          if (value < 0 || value > 50) sensorData.status = 'danger';
          break;
        case 'humidity':
          sensorData.data.humidity = value;
          if (value < 20 || value > 80) sensorData.status = 'warning';
          if (value < 10 || value > 90) sensorData.status = 'danger';
          break;
        case 'light':
          sensorData.data.light = value;
          break;
      }

      const savedData = await SensorData.create(sensorData);
      websocketService.broadcast({
  type: 'sensor_data',
  sensor: sensorType,  // "temp", "humidity", "light"
  value: value,
  timestamp: savedData.timestamp,
  status: savedData.status,
  unit: sensorType === 'temp' ? '°C' : 
        sensorType === 'humidity' ? '%' : 'lux' // THÊM UNIT
});


    } catch (error) {
      console.error('Error handling sensor data:', error);
    }
  },

  async handleDeviceState(topic, payload) {
    try {
      const deviceId = topic.split('/')[2];
      const state = payload.toLowerCase();

      await Device.findOneAndUpdate(
        { deviceId },
        { $set: { status: { online: true, lastSeen: new Date() } } },
        { upsert: true, new: true }
      );

      await ControlHistory.create({
        deviceId,
        device_name: deviceId.toUpperCase(),
        action: state.toUpperCase(),
        source: 'mqtt',
        success: true,
        message: `Device ${deviceId} turned ${state} via MQTT`
      });

      websocketService.broadcast({
        type: 'device_state',
        device: deviceId,
        state: state,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error handling device state:', error);
    }
  },

  sendControlCommand(device, action) {
    if (!mqttClient || !mqttClient.connected) {
      throw new Error('MQTT client not connected');
    }

    const topic = `iot/control/${device}`;
    mqttClient.publish(topic, action, { retain: true }, (error) => {
      if (error) {
        console.error(`Failed to publish to ${topic}:`, error);
        throw error;
      }
      console.log(`Command sent: ${topic} -> ${action}`);
    });
  },

  isConnected() {
    return mqttClient && mqttClient.connected;
  }
};

module.exports = mqttService;
