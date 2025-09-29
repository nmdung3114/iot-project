const WebSocket = require('ws');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  initWebSocket(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws) => {
      console.log('New WebSocket connection');
      this.clients.add(ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to IoT WebSocket server',
        timestamp: new Date().toISOString()
      }));
    });

    console.log('WebSocket server initialized');
  }

  handleMessage(ws, data) {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      case 'subscribe':
        // Handle subscription to specific topics
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  broadcast(message) {
    if (!this.wss) return;

    const messageString = JSON.stringify(message);
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
  }

  getClientCount() {
    return this.clients.size;
  }

  broadcastSensorData(sensorData) {
  this.broadcast({
    type: 'sensor_data',
    timestamp: sensorData.timestamp,
    sensor: sensorData.sensor_name,
    value: sensorData.value,
    unit: sensorData.unit,
    status: sensorData.status
  });
}


}

module.exports = new WebSocketService();