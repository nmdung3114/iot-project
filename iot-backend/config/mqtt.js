const mqtt = require('mqtt');

const mqttConfig = {
  host: process.env.MQTT_HOST || '192.168.100.11',
  port: process.env.MQTT_PORT || 1883,
  username: process.env.MQTT_USERNAME || 'admin',
  password: process.env.MQTT_PASSWORD || '310104',
  clientId: `iot_backend_${Math.random().toString(16).substr(2, 8)}`
};

module.exports = mqttConfig;