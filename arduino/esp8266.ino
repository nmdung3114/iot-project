#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include "DHT.h"
#include <EEPROM.h>

#define LED1 D5
#define LED2 D6
#define LED3 D7
#define FAN D8
#define AC D4
#define DHTPIN D1
#define DHTTYPE DHT11
#define LDR_PIN A0

const char *ssid = "Nha 46A T4";
const char *pass = "0974764566";
const char *mqtt_server = "192.168.100.8";
const char *mqtt_user = "admin";
const char *mqtt_pass = "310104";

DHT dht(DHTPIN, DHTTYPE);
WiFiClient wifiClient;
PubSubClient client(wifiClient);
String mqttClientID;

unsigned long lastPublish = 0;

void waitForWiFi()
{
    if (WiFi.status() != WL_CONNECTED)
    {
        WiFi.begin(ssid, pass);
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20)
        {
            delay(500);
            Serial.print(".");
            attempts++;
        }
        if (WiFi.status() == WL_CONNECTED)
        {
            Serial.println("\nWiFi connected!");
            Serial.print("ESP IP: ");
            Serial.println(WiFi.localIP());
        }
    }
}

void saveState()
{
    EEPROM.write(0, digitalRead(LED1));
    EEPROM.write(1, digitalRead(LED2));
    EEPROM.write(2, digitalRead(LED3));
    EEPROM.write(3, digitalRead(FAN));
    EEPROM.write(4, digitalRead(AC));
    EEPROM.commit();
}

void loadState()
{
    digitalWrite(LED1, EEPROM.read(0));
    digitalWrite(LED2, EEPROM.read(1));
    digitalWrite(LED3, EEPROM.read(2));
    digitalWrite(FAN, EEPROM.read(3));
    digitalWrite(AC, EEPROM.read(4));
}

void publishState(const char *device, int pin)
{
    String topic = String("iot/control/") + device + "/state";
    const char *state = digitalRead(pin) ? "on" : "off";
    client.publish(topic.c_str(), state, true);
    Serial.printf("Publish %s = %s\n", topic.c_str(), state);
}

void setDevice(int pin, const char *device, String msg)
{
    msg.toLowerCase(); // chuyển về chữ thường

    if (msg == "on")
        digitalWrite(pin, HIGH);
    else if (msg == "off")
        digitalWrite(pin, LOW);

    publishState(device, pin);
    saveState();
}

void callback(char *topic, byte *payload, unsigned int length)
{
    String msg;
    for (unsigned int i = 0; i < length; i++)
        msg += (char)payload[i];
    msg.trim();
    msg.toLowerCase(); // đảm bảo nhận đúng regardless "ON"/"OFF"

    Serial.printf("MQTT in: %s => %s\n", topic, msg.c_str());

    if (String(topic) == "iot/control/led1")
        setDevice(LED1, "led1", msg);
    else if (String(topic) == "iot/control/led2")
        setDevice(LED2, "led2", msg);
    else if (String(topic) == "iot/control/led3")
        setDevice(LED3, "led3", msg);
    else if (String(topic) == "iot/control/fan")
        setDevice(FAN, "fan", msg);
    else if (String(topic) == "iot/control/ac")
        setDevice(AC, "ac", msg);
}

void reconnectMQTT()
{
    while (!client.connected())
    {
        Serial.println("Connecting to MQTT...");
        uint8_t mac[6];
        WiFi.macAddress(mac);
        mqttClientID = "ESP_" + String(mac[0], HEX) + String(mac[1], HEX) +
                       String(mac[2], HEX) + String(mac[3], HEX) +
                       String(mac[4], HEX) + String(mac[5], HEX);

        if (client.connect(mqttClientID.c_str(), mqtt_user, mqtt_pass))
        {
            Serial.println("Connected!");

            client.subscribe("iot/control/led1");
            client.subscribe("iot/control/led2");
            client.subscribe("iot/control/led3");
            client.subscribe("iot/control/fan");
            client.subscribe("iot/control/ac");

            publishState("led1", LED1);
            publishState("led2", LED2);
            publishState("led3", LED3);
            publishState("fan", FAN);
            publishState("ac", AC);
        }
        else
        {
            Serial.print("Failed, rc=");
            Serial.println(client.state());
            delay(5000);
        }
    }
}

void pubDataSensor()
{
    int light = analogRead(LDR_PIN);
    float temp = dht.readTemperature();
    float humi = dht.readHumidity();

    char buffer[16];
    dtostrf(isnan(temp) ? 0 : temp, 1, 1, buffer);
    client.publish("iot/sensor/temp", buffer, true);

    dtostrf(isnan(humi) ? 0 : humi, 1, 1, buffer);
    client.publish("iot/sensor/humidity", buffer, true);

    itoa(light, buffer, 10);
    client.publish("iot/sensor/light", buffer, true);

    Serial.printf("Temp: %.1f, Hum: %.1f, Light: %d\n", temp, humi, light);
}

void setup()
{
    Serial.begin(115200);
    EEPROM.begin(512);

    pinMode(LED1, OUTPUT);
    pinMode(LED2, OUTPUT);
    pinMode(LED3, OUTPUT);
    pinMode(FAN, OUTPUT);
    pinMode(AC, OUTPUT);

    digitalWrite(LED1, LOW);
    digitalWrite(LED2, LOW);
    digitalWrite(LED3, LOW);
    digitalWrite(FAN, LOW);
    digitalWrite(AC, LOW);

    loadState();
    dht.begin();

    waitForWiFi();
    client.setServer(mqtt_server, 1883);
    client.setCallback(callback);
}

void loop()
{
    waitForWiFi();

    if (!client.connected())
        reconnectMQTT();
    client.loop();

    if (millis() - lastPublish > 5000)
    {
        pubDataSensor();
        lastPublish = millis();
    }
}
