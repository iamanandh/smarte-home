#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_SERVER = "test.mosquitto.org";
const int MQTT_PORT = 1883;
const char* BASE_TOPIC = "smart-home-esp32";

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

const int DEVICE_1_PIN = 18;
const int DEVICE_2_PIN = 19;
const int DEVICE_3_PIN = 21;
const int DEVICE_4_PIN = 22;
const int DEVICE_5_PIN = 23;
const int DEVICE_6_PIN = 5;

unsigned long lastSensorPublish = 0;

void setDeviceState(int deviceId, bool isOn) {
  int pin = -1;

  if (deviceId == 1) pin = DEVICE_1_PIN;
  if (deviceId == 2) pin = DEVICE_2_PIN;
  if (deviceId == 3) pin = DEVICE_3_PIN;
  if (deviceId == 4) pin = DEVICE_4_PIN;
  if (deviceId == 5) pin = DEVICE_5_PIN;
  if (deviceId == 6) pin = DEVICE_6_PIN;

  if (pin == -1) return;

  digitalWrite(pin, isOn ? HIGH : LOW);

  char stateTopic[64];
  snprintf(stateTopic, sizeof(stateTopic), "%s/device/%d/state", BASE_TOPIC, deviceId);
  mqttClient.publish(stateTopic, isOn ? "ON" : "OFF", true);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char message[8];
  unsigned int copyLength = min(length, sizeof(message) - 1);

  memcpy(message, payload, copyLength);
  message[copyLength] = '\0';

  int deviceId = 0;
  sscanf(topic, "smart-home-esp32/device/%d/set", &deviceId);

  if (strcmp(message, "ON") == 0) {
    setDeviceState(deviceId, true);
  }

  if (strcmp(message, "OFF") == 0) {
    setDeviceState(deviceId, false);
  }
}

void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    String clientId = "esp32-smart-home-" + String(random(0xffff), HEX);

    if (mqttClient.connect(clientId.c_str())) {
      mqttClient.subscribe("smart-home-esp32/device/+/set");
    } else {
      delay(2000);
    }
  }
}

void publishSensors() {
  int temperature = 27;
  int humidity = 62;
  const char* gas = "Normal";

  char payload[96];
  snprintf(
    payload,
    sizeof(payload),
    "{\"temperature\":%d,\"humidity\":%d,\"gas\":\"%s\"}",
    temperature,
    humidity,
    gas
  );

  mqttClient.publish("smart-home-esp32/sensors", payload);
}

void setup() {
  pinMode(DEVICE_1_PIN, OUTPUT);
  pinMode(DEVICE_2_PIN, OUTPUT);
  pinMode(DEVICE_3_PIN, OUTPUT);
  pinMode(DEVICE_4_PIN, OUTPUT);
  pinMode(DEVICE_5_PIN, OUTPUT);
  pinMode(DEVICE_6_PIN, OUTPUT);

  connectWifi();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (!mqttClient.connected()) {
    connectMqtt();
  }

  mqttClient.loop();

  if (millis() - lastSensorPublish > 5000) {
    publishSensors();
    lastSensorPublish = millis();
  }
}
