import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import mqtt from 'mqtt'

const app = express()
const PORT = 3002
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://test.mosquitto.org:1883'
const MQTT_BASE_TOPIC = process.env.MQTT_BASE_TOPIC || 'smart-home-esp32'

app.use(cors())
app.use(express.json())

const demoUser = {
  email: 'admin@smarthome.com',
  password: '123456',
  name: 'Admin',
}

const devices = [
  { id: 1, name: 'Living Room Light', room: 'Living Room', type: 'light', pin: 18, isOn: false },
  { id: 2, name: 'Bedroom Fan', room: 'Bedroom', type: 'fan', pin: 19, isOn: false },
  { id: 3, name: 'Main Door Lock', room: 'Entrance', type: 'lock', pin: 21, isOn: false },
  { id: 4, name: 'Kitchen Light', room: 'Kitchen', type: 'light', pin: 22, isOn: false },
  { id: 5, name: 'Garden Pump', room: 'Outdoor', type: 'pump', pin: 23, isOn: false },
  { id: 6, name: 'Porch Camera', room: 'Entrance', type: 'camera', pin: 5, isOn: false },
]

let mqttStatus = {
  connected: false,
  broker: MQTT_BROKER_URL,
  baseTopic: MQTT_BASE_TOPIC,
  lastMessage: 'Waiting for MQTT connection',
}

let sensorState = {
  temperature: 0,
  humidity: 0,
  gas: 'Waiting',
  lastUpdated: 'Waiting for ESP32',
}

const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  reconnectPeriod: 3000,
})

mqttClient.on('connect', () => {
  mqttStatus = {
    ...mqttStatus,
    connected: true,
    lastMessage: 'MQTT connected',
  }
  mqttClient.subscribe(`${MQTT_BASE_TOPIC}/sensors`)
  mqttClient.subscribe(`${MQTT_BASE_TOPIC}/device/+/state`)
})

mqttClient.on('reconnect', () => {
  mqttStatus = {
    ...mqttStatus,
    connected: false,
    lastMessage: 'MQTT reconnecting',
  }
})

mqttClient.on('error', (error) => {
  mqttStatus = {
    ...mqttStatus,
    connected: false,
    lastMessage: error.message,
  }
})

mqttClient.on('message', (topic, payloadBuffer) => {
  const payload = payloadBuffer.toString()
  mqttStatus = {
    ...mqttStatus,
    lastMessage: `${topic}: ${payload}`,
  }

  if (topic === `${MQTT_BASE_TOPIC}/sensors`) {
    try {
      const sensorPayload = JSON.parse(payload)
      sensorState = {
        temperature: sensorPayload.temperature,
        humidity: sensorPayload.humidity,
        gas: sensorPayload.gas,
        lastUpdated: new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      }
    } catch {
      sensorState = {
        ...sensorState,
        gas: 'Bad sensor payload',
      }
    }
  }

  if (topic.startsWith(`${MQTT_BASE_TOPIC}/device/`) && topic.endsWith('/state')) {
    const deviceId = Number(topic.split('/')[2])
    const device = devices.find((item) => item.id === deviceId)

    if (device) {
      device.isOn = payload === 'ON'
    }
  }
})

function publishDeviceCommand(device) {
  return new Promise((resolve, reject) => {
    if (!mqttClient.connected) {
      reject(new Error('MQTT broker is not connected'))
      return
    }

    const commandTopic = `${MQTT_BASE_TOPIC}/device/${device.id}/set`
    const commandPayload = device.isOn ? 'ON' : 'OFF'

    mqttClient.publish(commandTopic, commandPayload, { qos: 1 }, (error) => {
      if (error) {
        reject(error)
        return
      }

      mqttStatus = {
        ...mqttStatus,
        lastMessage: `${commandTopic}: ${commandPayload}`,
      }
      resolve()
    })
  })
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Smart home backend is running' })
})

app.post('/api/login', (req, res) => {
  const { email, password } = req.body

  if (email !== demoUser.email || password !== demoUser.password) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  res.json({
    message: 'Login success',
    user: {
      name: demoUser.name,
      email: demoUser.email,
    },
  })
})

app.get('/api/devices', (req, res) => {
  res.json({ devices })
})

app.put('/api/devices/:id/toggle', async (req, res) => {
  const deviceId = Number(req.params.id)
  const device = devices.find((item) => item.id === deviceId)

  if (!device) {
    return res.status(404).json({ message: 'Device not found' })
  }

  device.isOn = !device.isOn

  try {
    await publishDeviceCommand(device)
    res.json({ message: 'Device updated and MQTT command sent', device, mqttStatus })
  } catch (error) {
    res.status(503).json({
      message: 'Device changed in dashboard, but MQTT command was not sent',
      device,
      mqttStatus: {
        ...mqttStatus,
        lastMessage: error.message,
      },
    })
  }
})

app.get('/api/sensors', (req, res) => {
  res.json({
    sensors: sensorState,
  })
})

app.get('/api/mqtt/status', (req, res) => {
  res.json({ mqttStatus })
})

app.listen(PORT, () => {
  console.log(`Smart home backend running on http://localhost:${PORT}`)
})
