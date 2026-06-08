import { useEffect, useState } from 'react'
import {
  Bell,
  Camera,
  Fan,
  Gauge,
  Home,
  Lightbulb,
  Lock,
  LogIn,
  LogOut,
  Power,
  RefreshCw,
  ShieldCheck,
  ThermometerSun,
  Waves,
} from 'lucide-react'
import './App.css'

const API_URL = 'http://localhost:3002'

function App() {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ email: 'admin@smarthome.com', password: '123456' })
  const [devices, setDevices] = useState([])
  const [sensors, setSensors] = useState(null)
  const [mqttStatus, setMqttStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (!user) return

    loadDashboard()
    const timerId = setInterval(() => {
      loadSensors()
      loadMqttStatus()
    }, 5000)

    return () => clearInterval(timerId)
  }, [user])

  async function loadDashboard() {
    await Promise.all([loadDevices(), loadSensors(), loadMqttStatus()])
  }

  async function loadDevices() {
    try {
      const response = await fetch(`${API_URL}/api/devices`)
      const data = await response.json()
      setDevices(data.devices)
    } catch {
      setError('Backend is not connected. Start the server first.')
    }
  }

  async function loadSensors() {
    try {
      const response = await fetch(`${API_URL}/api/sensors`)
      const data = await response.json()
      setSensors(data.sensors)
    } catch {
      setError('Sensor API is not connected.')
    }
  }

  async function loadMqttStatus() {
    try {
      const response = await fetch(`${API_URL}/api/mqtt/status`)
      const data = await response.json()
      setMqttStatus(data.mqttStatus)
    } catch {
      setError('MQTT status API is not connected.')
    }
  }

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setMessage('Checking login...')

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage('')
        setError(data.message)
        return
      }

      setUser(data.user)
      setMessage('')
    } catch {
      setMessage('')
      setError('Cannot reach backend server.')
    }
  }

  async function toggleDevice(id) {
    try {
      const response = await fetch(`${API_URL}/api/devices/${id}/toggle`, {
        method: 'PUT',
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.message)
        setMqttStatus(data.mqttStatus)
        return
      }

      setError('')
      setMqttStatus(data.mqttStatus)
      setDevices((currentDevices) =>
        currentDevices.map((device) =>
          device.id === id ? data.device : device,
        ),
      )
    } catch {
      setError('Cannot update device.')
    }
  }

  async function refreshDashboard() {
    setIsRefreshing(true)
    await loadDashboard()
    setIsRefreshing(false)
  }

  function getDeviceIcon(type) {
    if (type === 'fan') return <Fan />
    if (type === 'lock') return <Lock />
    if (type === 'camera') return <Camera />
    if (type === 'pump') return <Waves />
    return <Lightbulb />
  }

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-visual">
          <div className="home-illustration">
            <Home />
            <span className="signal-ring ring-one"></span>
            <span className="signal-ring ring-two"></span>
          </div>
          <div className="floating-info temperature">
            <ThermometerSun />
            <span>27 C</span>
          </div>
          <div className="floating-info secure">
            <ShieldCheck />
            <span>Secure</span>
          </div>
        </section>

        <section className="login-panel">
          <div className="brand-line">
            <div className="brand-mark" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p className="eyebrow">ESP32 Smart E-Home</p>
          </div>

          <h1>Control your home from anywhere.</h1>
          <p className="intro">
            Login to view devices, sensors, and security status from one live
            dashboard.
          </p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Email
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
              />
            </label>

            <label>
              Password
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
              />
            </label>

            <button type="submit">
              <LogIn />
              Login
            </button>
          </form>

          {message && <p className="status-message">{message}</p>}
          {error && <p className="error-message">{error}</p>}

          <p className="hint">Demo login: admin@smarthome.com / 123456</p>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-page">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Smart E-Home</p>
          <h2>Dashboard</h2>
        </div>

        <nav>
          <button className="nav-button active">
            <Home />
            Overview
          </button>
          <button className="nav-button">
            <Lightbulb />
            Devices
          </button>
          <button className="nav-button">
            <Gauge />
            Sensors
          </button>
        </nav>

        <button className="logout-button" onClick={() => setUser(null)}>
          <LogOut />
          Logout
        </button>
      </aside>

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Welcome, {user.name}</p>
            <h1>Home control center</h1>
          </div>
          <div className="header-actions">
            <button className="refresh-button" onClick={refreshDashboard}>
              <RefreshCw className={isRefreshing ? 'spinning' : ''} />
              Refresh
            </button>
            <div className="connection-card">
              <span className="online-dot"></span>
              API online
            </div>
            <div
              className={
                mqttStatus?.connected
                  ? 'connection-card mqtt-online'
                  : 'connection-card mqtt-offline'
              }
            >
              <span className="online-dot"></span>
              MQTT {mqttStatus?.connected ? 'online' : 'offline'}
            </div>
          </div>
        </header>

        <section className="summary-grid">
          <div>
            <span>{devices.length}</span>
            <p>Total devices</p>
          </div>
          <div>
            <span>{devices.filter((device) => device.isOn).length}</span>
            <p>Running now</p>
          </div>
          <div>
            <span>{mqttStatus?.connected ? 'MQTT' : 'Wait'}</span>
            <p>ESP32 bridge</p>
          </div>
        </section>

        {error && <p className="dashboard-error">{error}</p>}

        <section className="device-grid">
          {devices.map((device) => (
            <article className="device-card" key={device.id}>
              <div className="device-top">
                <div className={device.isOn ? 'device-icon active' : 'device-icon'}>
                  {getDeviceIcon(device.type)}
                </div>
                <p className={device.isOn ? 'device-state on' : 'device-state'}>
                  {device.isOn ? 'ON' : 'OFF'}
                </p>
              </div>

              <div>
                <p className="room-name">{device.room}</p>
                <h3>{device.name}</h3>
              </div>

              <button className="device-action" onClick={() => toggleDevice(device.id)}>
                <Power />
                {device.isOn ? 'Turn off' : 'Turn on'}
              </button>
            </article>
          ))}
        </section>

        <section className="sensor-panel">
          <div>
            <p className="eyebrow">Live sensor sample</p>
            <h2>Room environment</h2>
          </div>
          <div className="sensor-values">
            <p>
              <ThermometerSun />
              <strong>{sensors ? `${sensors.temperature} C` : '--'}</strong>
              Temperature
            </p>
            <p>
              <Waves />
              <strong>{sensors ? `${sensors.humidity}%` : '--'}</strong>
              Humidity
            </p>
            <p>
              <Bell />
              <strong>{sensors ? sensors.gas : '--'}</strong>
              Gas sensor
            </p>
          </div>
          <p className="last-updated">
            Last updated: {sensors ? sensors.lastUpdated : 'Waiting...'}
          </p>
          <p className="last-updated">
            MQTT message: {mqttStatus ? mqttStatus.lastMessage : 'Waiting...'}
          </p>
        </section>
      </section>
    </main>
  )
}

export default App
