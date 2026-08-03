#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "Yuvabe";
const char* WIFI_PASSWORD = "Yuv@be_2022";

const char* MQTT_SERVER = "855ba1d761b246e69c9758865abefd52.s1.eu.hivemq.cloud:8883";
const int MQTT_PORT = 8883;
const char* MQTT_USERNAME = "smart_home";
const char* MQTT_PASSWORD = "Anandh@23";
const char* BASE_TOPIC = "smart-home-esp32";

WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);

const int DEVICE_1_PIN = 11; // Purple wire -> IN1
const int DEVICE_2_PIN = 12; // Blue wire -> IN2
const int DEVICE_3_PIN = 10; // Green wire -> IN3
const int DEVICE_4_PIN = 16; // Buzzer
const int DEVICE_5_PIN = 36; // Fan wire -> IN4
const int DEVICE_6_PIN = -1;
const int SWITCH_1_PIN = -1; // Kitchen physical switch disabled because GPIO36 is used for fan
const int SWITCH_2_PIN = 40; // Living room physical switch
const int SWITCH_3_PIN = 41; // Bedroom physical switch

unsigned long lastSensorPublish = 0;
unsigned long lastSwitchCheck = 0;
const unsigned long SWITCH_CHECK_INTERVAL = 100;
bool lastSwitch1On = false;
bool lastSwitch2On = false;
bool lastSwitch3On = false;

bool isActiveLowDevice(int deviceId) {
  return (deviceId >= 1 && deviceId <= 3) || deviceId == 5;
}

void writeDevicePin(int deviceId, int pin, bool isOn) {
  if (isActiveLowDevice(deviceId)) {
    digitalWrite(pin, isOn ? LOW : HIGH);
    return;
  }

  digitalWrite(pin, isOn ? HIGH : LOW);
}

void setDeviceState(int deviceId, bool isOn) {
  int pin = -1;

  if (deviceId == 1) pin = DEVICE_1_PIN;
  if (deviceId == 2) pin = DEVICE_2_PIN;
  if (deviceId == 3) pin = DEVICE_3_PIN;
  if (deviceId == 4) pin = DEVICE_4_PIN;
  if (deviceId == 5) pin = DEVICE_5_PIN;
  if (deviceId == 6) pin = DEVICE_6_PIN;

  if (pin == -1) return;

  writeDevicePin(deviceId, pin, isOn);

  char stateTopic[64];
  snprintf(stateTopic, sizeof(stateTopic), "%s/device/%d/state", BASE_TOPIC, deviceId);
  mqttClient.publish(stateTopic, isOn ? "ON" : "OFF", true);

  Serial.print("Device ");
  Serial.print(deviceId);
  Serial.print(" on GPIO");
  Serial.print(pin);
  Serial.print(" set to ");
  Serial.println(isOn ? "ON" : "OFF");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char message[8];
  unsigned int copyLength = length;

  if (copyLength > sizeof(message) - 1) {
    copyLength = sizeof(message) - 1;
  }

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
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  Serial.println();
  Serial.print("WiFi connected. IP: ");
  Serial.println(WiFi.localIP());
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    const char* clientId = "esp32-home";

    Serial.print("Connecting to MQTT...");

    if (mqttClient.connect(clientId, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("connected");
      mqttClient.subscribe("smart-home-esp32/device/+/set");
      Serial.println("Subscribed to device control topic");
      publishCurrentSwitchStates();
    } else {
      Serial.print("failed, rc=");
      Serial.println(mqttClient.state());
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
  Serial.print("Published sensors: ");
  Serial.println(payload);
}

bool readSwitchOn(int pin) {
  if (pin == -1) return false;
  return digitalRead(pin) == LOW;
}

void checkPhysicalSwitches() {
  if (millis() - lastSwitchCheck < SWITCH_CHECK_INTERVAL) {
    return;
  }

  bool switch1On = readSwitchOn(SWITCH_1_PIN);
  bool switch2On = readSwitchOn(SWITCH_2_PIN);
  bool switch3On = readSwitchOn(SWITCH_3_PIN);

  if (switch1On != lastSwitch1On) {
    setDeviceState(1, switch1On);
    lastSwitch1On = switch1On;
  }

  if (switch2On != lastSwitch2On) {
    setDeviceState(2, switch2On);
    lastSwitch2On = switch2On;
  }

  if (switch3On != lastSwitch3On) {
    setDeviceState(3, switch3On);
    lastSwitch3On = switch3On;
  }

  lastSwitchCheck = millis();
}

void publishCurrentSwitchStates() {
  setDeviceState(1, lastSwitch1On);
  setDeviceState(2, lastSwitch2On);
  setDeviceState(3, lastSwitch3On);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("ESP32 smart home starting...");

  pinMode(DEVICE_1_PIN, OUTPUT);
  pinMode(DEVICE_2_PIN, OUTPUT);
  pinMode(DEVICE_3_PIN, OUTPUT);
  if (DEVICE_4_PIN != -1) pinMode(DEVICE_4_PIN, OUTPUT);
  if (DEVICE_5_PIN != -1) pinMode(DEVICE_5_PIN, OUTPUT);
  if (DEVICE_6_PIN != -1) pinMode(DEVICE_6_PIN, OUTPUT);
  if (SWITCH_1_PIN != -1) pinMode(SWITCH_1_PIN, INPUT_PULLUP);
  pinMode(SWITCH_2_PIN, INPUT_PULLUP);
  pinMode(SWITCH_3_PIN, INPUT_PULLUP);

  digitalWrite(DEVICE_1_PIN, HIGH);
  digitalWrite(DEVICE_2_PIN, HIGH);
  digitalWrite(DEVICE_3_PIN, HIGH);
  if (DEVICE_4_PIN != -1) digitalWrite(DEVICE_4_PIN, LOW);
  if (DEVICE_5_PIN != -1) digitalWrite(DEVICE_5_PIN, HIGH);
  if (DEVICE_6_PIN != -1) digitalWrite(DEVICE_6_PIN, HIGH);

  connectWifi();
  wifiClient.setInsecure();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  lastSwitch1On = readSwitchOn(SWITCH_1_PIN);
  lastSwitch2On = readSwitchOn(SWITCH_2_PIN);
  lastSwitch3On = readSwitchOn(SWITCH_3_PIN);
  digitalWrite(DEVICE_1_PIN, lastSwitch1On ? LOW : HIGH);
  digitalWrite(DEVICE_2_PIN, lastSwitch2On ? LOW : HIGH);
  digitalWrite(DEVICE_3_PIN, lastSwitch3On ? LOW : HIGH);
}

void loop() {
  if (!mqttClient.connected()) {
    connectMqtt();
  }

  mqttClient.loop();
  checkPhysicalSwitches();

  if (millis() - lastSensorPublish > 5000) {
    publishSensors();
    lastSensorPublish = millis();
  }
}
