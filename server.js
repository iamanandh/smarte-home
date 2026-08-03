import cors from 'cors'
import 'dotenv/config'
import { Aedes } from 'aedes'
import express from 'express'
import mqtt from 'mqtt'
import net from 'net'
import {
  addFunctionLog,
  addSensorLog,
  getFunctionLogs,
  getSensorLogs,
  setupDatabase,
} from './db.js'

const app = express()
const PORT = Number(process.env.PORT || 3002)
const MQTT_SERVER_PORT = Number(process.env.MQTT_SERVER_PORT || 1883)
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || `mqtt://127.0.0.1:${MQTT_SERVER_PORT}`
const MQTT_BASE_TOPIC = process.env.MQTT_BASE_TOPIC || 'smart-home-esp32'
const MQTT_USERNAME = process.env.MQTT_USERNAME
const MQTT_PASSWORD = process.env.MQTT_PASSWORD
const LOCAL_MQTT_BROKER_ENABLED = process.env.LOCAL_MQTT_BROKER_ENABLED
  ? process.env.LOCAL_MQTT_BROKER_ENABLED === 'true'
  : MQTT_BROKER_URL.includes('127.0.0.1') || MQTT_BROKER_URL.includes('localhost')

app.use(cors())
app.use(express.json())

if (LOCAL_MQTT_BROKER_ENABLED) {
  const localBroker = await Aedes.createBroker()
  const mqttServer = net.createServer(localBroker.handle)

  localBroker.on('client', (client) => {
    console.log(`MQTT client connected: ${client.id}`)
  })

  localBroker.on('clientDisconnect', (client) => {
    console.log(`MQTT client disconnected: ${client.id}`)
  })

  localBroker.on('clientError', (client, error) => {
    console.log(`MQTT client error ${client?.id || 'unknown'}: ${error.message}`)
  })

  localBroker.on('connectionError', (client, error) => {
    console.log(`MQTT connection error ${client?.id || 'unknown'}: ${error.message}`)
  })

  mqttServer.listen(MQTT_SERVER_PORT, '0.0.0.0', () => {
    console.log(`Local MQTT broker running on mqtt://0.0.0.0:${MQTT_SERVER_PORT}`)
  })
}

const demoUser = {
  email: 'admin@smarthome.com',
  password: '123456',
  name: 'Admin',
}

const devices = [
  { id: 1, name: 'Kitchen Light', room: 'Kitchen', type: 'light', pin: 11, isOn: false },
  { id: 2, name: 'Living Room Light', room: 'Living Room', type: 'light', pin: 12, isOn: false },
  { id: 3, name: 'Bedroom Light', room: 'Bedroom', type: 'light', pin: 10, isOn: false },
  { id: 4, name: 'Buzzer', room: 'Security', type: 'buzzer', pin: 16, isOn: false },
  { id: 5, name: 'Fan', room: 'Living Room', type: 'fan', pin: 36, isOn: false },
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

let lastEsp32SeenAt = null

let databaseStatus = {
  connected: false,
  message: 'Database not checked yet',
}

function getEsp32Status() {
  if (!lastEsp32SeenAt) {
    return {
      connected: false,
      lastSeen: 'Waiting for ESP32',
    }
  }

  const secondsSinceLastSeen = Math.round((Date.now() - lastEsp32SeenAt) / 1000)

  return {
    connected: secondsSinceLastSeen <= 15,
    lastSeen: `${secondsSinceLastSeen}s ago`,
  }
}

async function saveSensorLog(sensorPayload) {
  try {
    await addSensorLog(sensorPayload)
    databaseStatus = { connected: true, message: 'Sensor log saved' }
  } catch (error) {
    databaseStatus = { connected: false, message: error.message }
  }
}

async function saveFunctionLog(logDetails) {
  try {
    await addFunctionLog(logDetails)
    databaseStatus = { connected: true, message: 'Function log saved' }
  } catch (error) {
    databaseStatus = { connected: false, message: error.message }
  }
}

const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  reconnectPeriod: 3000,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
})

mqttClient.on('connect', () => {
  mqttStatus = {
    ...mqttStatus,
    connected: true,
    lastMessage: 'MQTT connected',
  }
  mqttClient.subscribe(`${MQTT_BASE_TOPIC}/sensors`)
  mqttClient.subscribe(`${MQTT_BASE_TOPIC}/device/+/state`)
  mqttClient.subscribe(`${MQTT_BASE_TOPIC}/#`)
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

  if (topic.startsWith(`${MQTT_BASE_TOPIC}/`)) {
    lastEsp32SeenAt = Date.now()
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
      lastEsp32SeenAt = Date.now()
      saveSensorLog(sensorPayload)
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
  const logDetails = {
    deviceId: device.id,
    deviceName: device.name,
    functionName: 'toggleDevice',
    result: device.isOn ? 'ON' : 'OFF',
  }

  try {
    await publishDeviceCommand(device)
    await saveFunctionLog(logDetails)
    res.json({ message: 'Device updated and MQTT command sent', device, mqttStatus })
  } catch (error) {
    await saveFunctionLog({ ...logDetails, result: `MQTT failed: ${error.message}` })
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

app.put('/api/devices/all/on', async (req, res) => {
  if (!mqttClient.connected) {
    return res.status(503).json({
      message: 'MQTT broker is not connected',
      devices,
      mqttStatus,
    })
  }

  try {
    for (const device of devices) {
      device.isOn = true
      await publishDeviceCommand(device)
      await saveFunctionLog({
        deviceId: device.id,
        deviceName: device.name,
        functionName: 'turnAllOn',
        result: 'ON',
      })
    }

    res.json({ message: 'All devices turned on', devices, mqttStatus })
  } catch (error) {
    res.status(503).json({
      message: `Some devices may not be updated: ${error.message}`,
      devices,
      mqttStatus: {
        ...mqttStatus,
        lastMessage: error.message,
      },
    })
  }
})

app.put('/api/devices/all/off', async (req, res) => {
  if (!mqttClient.connected) {
    return res.status(503).json({
      message: 'MQTT broker is not connected',
      devices,
      mqttStatus,
    })
  }

  try {
    for (const device of devices) {
      device.isOn = false
      await publishDeviceCommand(device)
      await saveFunctionLog({
        deviceId: device.id,
        deviceName: device.name,
        functionName: 'turnAllOff',
        result: 'OFF',
      })
    }

    res.json({ message: 'All devices turned off', devices, mqttStatus })
  } catch (error) {
    res.status(503).json({
      message: `Some devices may not be updated: ${error.message}`,
      devices,
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
  res.json({ mqttStatus, esp32Status: getEsp32Status() })
})

app.get('/api/logs/sensors', async (req, res) => {
  try {
    const logs = await getSensorLogs()
    res.json({ logs, databaseStatus })
  } catch (error) {
    res.status(500).json({ message: error.message, databaseStatus })
  }
})

app.get('/api/logs/functions', async (req, res) => {
  try {
    const logs = await getFunctionLogs()
    res.json({ logs, databaseStatus })
  } catch (error) {
    res.status(500).json({ message: error.message, databaseStatus })
  }
})

app.get('/api/database/status', (req, res) => {
  res.json({ databaseStatus })
})

setupDatabase()
  .then(() => {
    databaseStatus = {
      connected: true,
      message: 'Database tables are ready',
    }
  })
  .catch((error) => {
    databaseStatus = {
      connected: false,
      message: error.message,
    }
  })
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Smart home backend running on port ${PORT}`)
    })
  })
